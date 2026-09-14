/**
 * research-agent-run — the closed-loop research agent.
 *
 * Same pattern as auction-watch-run (daily cron + on-demand, service-role or
 * user JWT, diff against a seen table). The upgrade: instead of only emailing
 * an alert, qualifying new hits are written straight into the user's Pipeline
 * and get a motivated_seller follow-up sequence started automatically.
 *
 * Additive: it INVOKES auction-radar / chatham-permits / deep-scan /
 * send-transactional-email. None of those functions are modified.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import {
  PIPELINE_KEY, DRIP_KEY, addrKey, readStore, writeStore,
  appendPipelineLead, buildDripSequence, isPrivilegedToken,
} from '../_shared/flipscan-store.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const APP_URL = 'https://sgcflip.com'

/** Grade B and up — the same 0-100 score auction-radar already assigns. */
const AUTO_ADD_SCORE = 62
const MAX_AUTO_ADD_PER_WATCH = 10
const MAX_ENRICH_PER_WATCH = 5
/** Second, wider discovery pass fires when the first pass came back thin. */
const THIN_RESULT_COUNT = 5
const WIDE_DAYS_AHEAD = 180


const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>(res => setTimeout(() => res(fallback), ms))])
}

async function callFn(name: string, body: unknown): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) return { error: out?.error || `${name} ${res.status}` }
  return out
}

function daysUntil(iso?: string | null): number {
  if (!iso) return 9999
  return Math.round((new Date(iso + 'T12:00:00Z').getTime() - Date.now()) / 86400000)
}

/**
 * Market read for the watch area — pulled from the existing rentcast proxy,
 * never a new service. Returns a short human label plus a −6…+8 adjustment
 * that nudges ranking toward markets that actually move.
 */
async function readMarket(zip: string): Promise<{ label: string; bonus: number } | null> {
  if (!/^\d{5}$/.test(zip || '')) return null
  const res = await withTimeout(
    callFn('rentcast', { endpoint: 'markets', params: { zipCode: zip, dataType: 'Sale' } }),
    25_000, null,
  )
  const sale = res?.saleData || res?.data?.saleData
  if (!sale) return null

  const dom = Number(sale.averageDaysOnMarket || 0)
  const psf = Number(sale.averagePricePerSquareFoot || 0)
  const price = Number(sale.averagePrice || 0)
  if (!dom && !price) return null

  let bonus = 0
  if (dom && dom <= 30) bonus += 8
  else if (dom && dom <= 60) bonus += 4
  else if (dom > 120) bonus -= 6
  if (price >= 200_000) bonus += 2

  const label = [
    price ? `avg sale $${Math.round(price / 1000)}K` : '',
    psf ? `$${Math.round(psf)}/sqft` : '',
    dom ? `${Math.round(dom)} days on market` : '',
  ].filter(Boolean).join(' · ')

  return { label, bonus }
}

/**
 * Composite deal score — the auction-radar score is the base (that scoring is
 * untouched); equity spread, sale urgency and market speed adjust the ranking
 * so the strongest deal in the strongest market rises to the top.
 */
function dealRank(r: any, marketBonus: number): number {
  const base = Number(r.score || 0)
  const value = Number(r.estimatedValue || 0)
  const bid = Number(r.openingBid || 0)
  const equityPct = value > 0 && bid > 0 ? ((value - bid) / value) * 100 : 0

  let bonus = marketBonus
  if (equityPct >= 40) bonus += 12
  else if (equityPct >= 25) bonus += 8
  else if (equityPct >= 12) bonus += 4
  else if (equityPct < 0) bonus -= 8

  const d = daysUntil(r.auctionDate)
  if (d <= 21) bonus += 6
  else if (d <= 45) bonus += 3

  return Math.max(0, Math.min(100, Math.round(base + bonus)))
}


interface Watch {
  id: string
  user_id: string
  label: string
  city: string
  state: string
  county: string
  zip: string
  days_ahead: number
  max_price: number
  notify_email: string
}

async function runWatch(admin: any, w: Watch, force: boolean) {
  const areaLabel = [w.county ? `${w.county} County` : w.city, w.state].filter(Boolean).join(', ')
  const notes: string[] = []

  // ── 1. Discovery — auction radar, plus county permits where they exist ──────
  const [auction, permits] = await Promise.all([
    withTimeout(
      callFn('auction-radar', {
        city: w.city, state: w.state, county: w.county, zip: w.zip,
        daysAhead: w.days_ahead, maxPrice: w.max_price, nonce: Date.now(),
      }),
      110_000, { error: 'auction-radar timed out' },
    ),
    /^chatham$/i.test((w.county || '').replace(/\s*county\s*/i, '').trim())
      ? withTimeout(callFn('chatham-permits', {}), 45_000, { error: 'permits timed out' })
      : Promise.resolve(null),
  ])

  if (auction?.error) notes.push(`auction scan: ${auction.error}`)
  if (permits?.error) notes.push(`permits: ${permits.error}`)

  let records: any[] = Array.isArray(auction?.records) ? auction.records : []

  // Thin first pass → one wider second pass, then dedupe so nothing is counted twice.
  if (records.length < THIN_RESULT_COUNT && (w.days_ahead || 0) < WIDE_DAYS_AHEAD) {
    const wide = await withTimeout(
      callFn('auction-radar', {
        city: w.city, state: w.state, county: w.county, zip: w.zip,
        daysAhead: WIDE_DAYS_AHEAD, maxPrice: w.max_price, nonce: Date.now() + 1,
      }),
      110_000, { error: 'wide auction scan timed out' },
    )
    if (Array.isArray(wide?.records)) {
      const byKey = new Map<string, any>()
      for (const r of [...records, ...wide.records]) {
        if (r?.address) byKey.set(addrKey(r.address), r)
      }
      records = [...byKey.values()]
      notes.push(`wide ${WIDE_DAYS_AHEAD}-day pass`)
    }
  }

  // ── 2. Diff against what this watch has already reported ────────────────────
  const { data: seenRows } = await admin
    .from('research_agent_seen').select('addr_key').eq('watch_id', w.id)
  const seen = new Set((seenRows || []).map((r: any) => r.addr_key))

  const fresh = records.filter(r => r.address && !seen.has(addrKey(r.address)))

  // ── 3. Read the market, then qualify + enrich ───────────────────────────────
  const marketZip = w.zip || fresh.find(r => /^\d{5}$/.test(r.zip || ''))?.zip || ''
  const market = await readMarket(marketZip)
  if (market) notes.push(`market: ${market.label}`)

  for (const r of fresh) r.__rank = dealRank(r, market?.bonus || 0)

  const qualifying = fresh
    .filter(r => (r.__rank || 0) >= AUTO_ADD_SCORE)
    .sort((a, b) => (b.__rank || 0) - (a.__rank || 0))
    .slice(0, MAX_AUTO_ADD_PER_WATCH)


  for (const r of qualifying.slice(0, MAX_ENRICH_PER_WATCH)) {
    const scan = await withTimeout(
      callFn('deep-scan', {
        address: r.address, city: r.city, state: r.state, zip: r.zip, mode: 'distress',
      }),
      45_000, null,
    )
    if (scan && !scan.error) r.__distress = scan
  }

  // ── 4. Auto-file into Pipeline + start the follow-up cadence ────────────────
  let addedCount = 0
  let sequencesStarted = 0

  if (qualifying.length) {
    try {
      const pipeline = await readStore(admin, w.user_id, PIPELINE_KEY)
      const drips = await readStore(admin, w.user_id, DRIP_KEY)
      let nextPipeline = pipeline
      const newDrips: any[] = []

      for (const r of qualifying) {
        const leadId = `auction-${addrKey(r.address)}`
        const distressNotes = (r.__distress?.items || r.__distress?.records || [])
          .slice(0, 4).map((d: any) => `• ${d.title || d.label || d.summary || ''}`).filter(Boolean)

        const appended = appendPipelineLead(nextPipeline, {
          id: leadId,
          stage: 'new',
          priority: r.__rank >= 78 ? 'hot' : r.__rank >= 62 ? 'warm' : 'cold',
          address: r.address, city: r.city || '', state: r.state || '',
          zip: r.zip || '', county: r.county || w.county || '',
          signalType: 'auction',
          signalLabel: `${r.auctionType || 'Auction'}${r.auctionDate ? ` · sale ${r.auctionDate}` : ''}`,
          investorScore: r.__rank || r.score || 0,
          severity: daysUntil(r.auctionDate) <= 21 ? 'high' : 'medium',
          source: r.sourceLabel || 'Research agent',
          estimatedARV: r.estimatedValue || 0,
          estimatedRehab: 0,
          estimatedProfit: r.equityDollars || 0,
          maxOffer: r.estimatedValue ? Math.round(r.estimatedValue * 0.7) : 0,
          notes: [
            'Found automatically by the research agent.',
            `Agent rank ${r.__rank || 0}/100 (source score ${r.score || 0}).`,
            market ? `Market here: ${market.label}.` : '',
            r.description, r.caseNumber && `Case #${r.caseNumber}`,
            r.trustee && `Trustee: ${r.trustee}`, r.sourceUrl,
            distressNotes.length ? `\nDistress signals:\n${distressNotes.join('\n')}` : '',
          ].filter(Boolean).join('\n'),
          tags: ['auction', 'agent', r.auctionType].filter(Boolean),

        })

        if (!appended) continue
        nextPipeline = appended
        addedCount++
        r.__autoAdded = true

        const hasSequence = drips.some((s: any) => s.leadId === leadId && s.status === 'active')
        if (!hasSequence) {
          newDrips.push(buildDripSequence({
            leadId, address: r.address, ownerName: '', templateId: 'motivated_seller',
          }))
          sequencesStarted++
          r.__sequenceStarted = true
        }
      }

      if (addedCount) await writeStore(admin, w.user_id, PIPELINE_KEY, nextPipeline)
      if (newDrips.length) await writeStore(admin, w.user_id, DRIP_KEY, [...newDrips, ...drips])
    } catch (e) {
      notes.push(`pipeline write: ${String((e as Error)?.message || e)}`)
      addedCount = 0
      sequencesStarted = 0
    }
  }

  // ── 5. Record what was seen so re-runs stay quiet ───────────────────────────
  if (fresh.length) {
    await admin.from('research_agent_seen').upsert(
      fresh.map(r => ({
        watch_id: w.id, addr_key: addrKey(r.address), address: r.address,
        source: 'auction-radar', score: r.__rank || r.score || 0, grade: r.grade || '',
        auto_added: !!r.__autoAdded,
      })),

      { onConflict: 'watch_id,addr_key', ignoreDuplicates: true },
    )
  }

  // ── 6. Tell the human what the agent did ────────────────────────────────────
  let emailed = false
  const toReport = force && !fresh.length ? records.slice(0, 5) : fresh
  if (toReport.length) {
    const send = await callFn('send-transactional-email', {
      templateName: 'agent-digest',
      recipientEmail: w.notify_email,
      idempotencyKey: `agent-digest-${w.id}-${new Date().toISOString().slice(0, 10)}-${toReport.length}${force ? `-test-${Date.now()}` : ''}`,
      templateData: {
        areaLabel, appUrl: APP_URL,
        scannedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        scanned: records.length, newCount: fresh.length, addedCount,
        records: toReport.slice(0, 20).map(r => ({
          address: r.address, city: r.city, state: r.state,
          grade: r.grade, score: r.score,
          signal: `${r.auctionType || 'Auction'}${r.auctionDate ? ` · sale ${r.auctionDate}` : ''}`,
          autoAdded: !!r.__autoAdded, sequenceStarted: !!r.__sequenceStarted,
          sourceUrl: r.sourceUrl,
        })),
      },
    })
    emailed = !send?.error && send?.success !== false
    if (!emailed) notes.push(`digest not sent (${send?.error || send?.reason || 'unknown'})`)
  }

  const note = [
    `${records.length} scanned · ${fresh.length} new · ${addedCount} auto-added · ${sequencesStarted} sequences`,
    ...notes,
  ].join(' · ')

  await admin.from('auction_watches')
    .update({ last_run_at: new Date().toISOString(), last_run_note: `agent: ${note}` })
    .eq('id', w.id)

  return {
    watchId: w.id, areaLabel, scanned: records.length, newCount: fresh.length,
    addedCount, sequencesStarted, emailed, note,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Server not configured' }, 500)

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  let body: any = {}
  try { body = await req.json() } catch { /* cron sends {} */ }

  const isSystem = await isPrivilegedToken(createClient, SUPABASE_URL, SERVICE_KEY, token)
  let userId: string | null = null
  if (!isSystem) {
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data?.user) return json({ error: 'Unauthorized' }, 401)
    userId = data.user.id
  }

  let q = admin.from('auction_watches').select('*').eq('active', true)
  if (userId) q = q.eq('user_id', userId)
  if (body.watchId) q = q.eq('id', body.watchId)
  const { data: watches, error } = await q
  if (error) return json({ error: error.message }, 500)
  if (!watches?.length) return json({ ran: 0, results: [], note: 'No active watches' })

  // Manual override — a user who paused the agent is skipped entirely.
  const { data: paused } = await admin
    .from('agent_settings').select('user_id').eq('paused', true)
  const pausedUsers = new Set((paused || []).map((r: any) => r.user_id))
  const active = (watches as Watch[]).filter(w => !pausedUsers.has(w.user_id))
  if (!active.length) return json({ ran: 0, results: [], paused: true, note: 'Agent is paused' })

  const results: any[] = []
  for (const w of active) {
    try { results.push(await runWatch(admin, w, !!body.force)) }
    catch (e) { results.push({ watchId: w.id, error: String((e as Error)?.message || e) }) }
  }

  return json({
    ran: results.length,
    addedTotal: results.reduce((s, r) => s + (r.addedCount || 0), 0),
    results,
  })
})
