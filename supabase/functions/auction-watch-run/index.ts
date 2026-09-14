/**
 * auction-watch-run — runs saved Auction Radar watches and emails only the
 * listings that have never been reported for that watch before.
 *
 * Triggered daily by cron (service-role bearer) or manually from the UI
 * (user JWT — only that user's watches run).
 *
 * Additive: it INVOKES `auction-radar` and `send-transactional-email`;
 * neither function is modified.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const APP_URL = 'https://sgcflip.com'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const addrKey = (a: string) => (a || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function daysOut(iso: string | null): number | null {
  if (!iso) return null
  return Math.round((new Date(iso + 'T12:00:00Z').getTime() - Date.now()) / 86400000)
}

function dateLabel(iso: string | null, fallback?: string): string {
  if (!iso) return fallback || 'not scheduled'
  try {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    })
  } catch { return iso }
}

interface Watch {
  id: string
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

  // 1. Scan via the existing auction-radar function (unchanged).
  const scanRes = await fetch(`${SUPABASE_URL}/functions/v1/auction-radar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({
      city: w.city, state: w.state, county: w.county, zip: w.zip,
      daysAhead: w.days_ahead, maxPrice: w.max_price, nonce: Date.now(),
    }),
  })
  const scan = await scanRes.json().catch(() => ({}))
  if (!scanRes.ok || scan?.error) {
    const note = `scan failed: ${scan?.error || scanRes.status}`
    await admin.from('auction_watches').update({ last_run_at: new Date().toISOString(), last_run_note: note }).eq('id', w.id)
    return { watchId: w.id, areaLabel, scanned: 0, newCount: 0, emailed: false, note }
  }

  const records: any[] = Array.isArray(scan.records) ? scan.records : []

  // 2. Diff against what this watch has already reported.
  const { data: seenRows } = await admin.from('auction_seen').select('addr_key').eq('watch_id', w.id)
  const seen = new Set((seenRows || []).map((r: any) => r.addr_key))

  const fresh = records.filter(r => r.address && !seen.has(addrKey(r.address)))

  if (fresh.length) {
    await admin.from('auction_seen').upsert(
      fresh.map(r => ({
        watch_id: w.id,
        addr_key: addrKey(r.address),
        address: r.address,
        auction_date: r.auctionDate || null,
      })),
      { onConflict: 'watch_id,addr_key', ignoreDuplicates: true },
    )
  }

  const toSend = force && !fresh.length ? records.slice(0, 5) : fresh

  // 3. Email only when there is something new (or an explicit test run).
  let emailed = false
  let note = `${records.length} scanned · ${fresh.length} new`
  if (toSend.length) {
    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        templateName: 'auction-alert',
        recipientEmail: w.notify_email,
        idempotencyKey: `auction-alert-${w.id}-${new Date().toISOString().slice(0, 10)}-${toSend.length}${force ? '-test' : ''}`,
        templateData: {
          areaLabel,
          scannedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          appUrl: APP_URL,
          records: toSend.slice(0, 25).map(r => ({
            address: r.address, city: r.city, state: r.state,
            auctionDateLabel: dateLabel(r.auctionDate, r.auctionDateLabel),
            daysOut: daysOut(r.auctionDate),
            auctionType: r.auctionType, openingBid: r.openingBid,
            estimatedValue: r.estimatedValue, grade: r.grade,
            sourceUrl: r.sourceUrl, sourceLabel: r.sourceLabel,
          })),
        },
      }),
    })
    const sendBody = await sendRes.json().catch(() => ({}))
    emailed = sendRes.ok && sendBody?.success !== false
    if (!emailed) note += ` · email not sent (${sendBody?.error || sendBody?.reason || sendRes.status})`
  } else if (force) {
    note += ' · nothing to send'
  }

  await admin.from('auction_watches')
    .update({ last_run_at: new Date().toISOString(), last_run_note: note })
    .eq('id', w.id)

  return { watchId: w.id, areaLabel, scanned: records.length, newCount: fresh.length, emailed, note }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Server not configured' }, 500)

  const auth = req.headers.get('Authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  let body: any = {}
  try { body = await req.json() } catch { /* cron sends {} */ }

  const isSystem = token === SERVICE_KEY
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

  const results = []
  for (const w of watches as Watch[]) {
    try {
      results.push(await runWatch(admin, w, !!body.force))
    } catch (e) {
      results.push({ watchId: w.id, error: String((e as Error)?.message || e) })
    }
  }

  return json({ ran: results.length, results })
})
