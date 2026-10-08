import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireUser } from '../_shared/edge-auth.ts'
import { CIVILVIEW_COUNTIES } from './sources.ts'

/**
 * auction-collect — builds the SGC Auction Database from free public sources.
 * No paid services: plain HTTP reads only (Firecrawl / RentCast never called).
 *
 * Parsers:
 *   civilview   — county sheriff sale tables (structured, deterministic)
 *   notice_text — any readable public notice page; Lovable AI extracts records (temp 0)
 *
 * Evidence rule: a record is saved only with a street address AND a sale date.
 * Records missing from their source after a good run are marked "no longer listed".
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'
const MAX_DETAILS_PER_RUN = 80
const DEADLINE_MS = 130_000

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const addrKey = (a: string) => (a || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const decode = (s: string) => (s || '')
  .replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"')
  .replace(/&colon;/g, ':').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

function toIsoDate(s: string): string | null {
  const m = (s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
const looksLikeAddress = (s: string) => /^\s*\d{1,6}[A-Z]?\s+\S+/i.test(s || '')

async function get(url: string, cookie?: string): Promise<{ ok: boolean; status: number; html: string; cookie?: string }> {
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 20000)
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', ...(cookie ? { Cookie: cookie } : {}) },
      redirect: 'follow', signal: ctrl.signal,
    })
    clearTimeout(to)
    const html = await res.text()
    const sc = res.headers.get('set-cookie') || ''
    const ck = sc.split(/,(?=[^;]+=)/).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')
    return { ok: res.ok, status: res.status, html, cookie: ck || cookie }
  } catch (e) {
    return { ok: false, status: 0, html: String(e) }
  }
}

interface Rec {
  address: string; city?: string; state: string; zip?: string; county: string
  auction_type: string; sale_date: string; opening_bid?: number | null
  case_number?: string; plaintiff?: string; defendant?: string
  source_url: string; detail_url?: string
}

// ── Parser: CivilView sheriff sale tables ─────────────────────────────────
function parseCivilView(html: string, src: any): Rec[] {
  const out: Rec[] = []
  const table = html.slice(html.indexOf('Sheriff #'))
  const rows = table.match(/<tr[\s\S]*?<\/tr>/g) || []
  for (const r of rows) {
    const cells = (r.match(/<td[\s\S]*?<\/td>/g) || []).map(strip)
    if (cells.length < 6) continue
    const link = r.match(/href="([^"]*SaleDetails\?PropertyId=\d+)"/)
    const [, caseNo, date, plaintiff, defendant, address] = cells
    const iso = toIsoDate(date)
    if (!iso || !looksLikeAddress(address)) continue
    const zip = (address.match(/\b(\d{5})(?:-\d{4})?\s*$/) || [])[1] || ''
    out.push({
      address, state: src.state, county: src.county, zip,
      auction_type: src.auction_type, sale_date: iso,
      case_number: caseNo, plaintiff, defendant,
      source_url: src.url,
      detail_url: link ? `https://salesweb.civilview.com${link[1]}` : undefined,
    })
  }
  return out
}

function parseCivilViewDetail(html: string): { opening_bid: number | null; status: string | null } {
  const text = strip(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ''))
  const bid = text.match(/(?:upset (?:bid|price)|judgment(?: amount)?|approx(?:imate)? judgment|amount due|minimum bid|opening bid)[^$]{0,80}\$\s?([\d,]+(?:\.\d{2})?)/i)
  const status = text.match(/Status(?:&colon;|:)\s*([A-Za-z ]{3,30}?)(?:\s{2}|\s[A-Z][a-z]+:|$)/)
  return { opening_bid: bid ? Number(bid[1].replace(/,/g, '')) : null, status: status ? status[1].trim() : null }
}

// ── Parser: generic public-notice page (AI extraction, temp 0) ────────────
async function parseNoticeText(html: string, src: any): Promise<Rec[]> {
  const key = Deno.env.get('LOVABLE_API_KEY')
  if (!key) return []
  const text = strip(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')).slice(0, 24000)
  if (text.length < 200) return []
  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash', temperature: 0,
      messages: [
        { role: 'system', content: 'Extract real-estate foreclosure, trustee, sheriff, tax or pre-foreclosure sale notices from the page text. Only include items that literally appear in the text. Never invent. Return JSON {"records":[{"address","city","state","zip","sale_date":"YYYY-MM-DD","opening_bid":number|null,"case_number","auction_type"}]}. auction_type one of: Trustee Sale, Sheriff Sale, Tax Foreclosure, Judicial Sale, Bank / REO Auction, Pre-Foreclosure. Omit items with no street address or no date.' },
        { role: 'user', content: `Source: ${src.name} (${src.county} ${src.state})\n\n${text}` },
      ],
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) throw new Error(`extract ${res.status}`)
  const data = await res.json()
  let parsed: any = {}
  try { parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}') } catch { /* empty */ }
  const recs: Rec[] = []
  for (const r of parsed.records || []) {
    const iso = toIsoDate(String(r.sale_date || ''))
    const address = String(r.address || '').trim()
    if (!iso || !looksLikeAddress(address)) continue
    // Evidence check: the street number + first word must appear in the page.
    const probe = address.split(/\s+/).slice(0, 2).join(' ').toLowerCase()
    if (!text.toLowerCase().includes(probe)) continue
    recs.push({
      address, city: r.city || '', state: (r.state || src.state || '').toUpperCase().slice(0, 2),
      zip: String(r.zip || ''), county: src.county, auction_type: r.auction_type || src.auction_type,
      sale_date: iso, opening_bid: typeof r.opening_bid === 'number' ? r.opening_bid : null,
      case_number: r.case_number || '', source_url: src.url,
    })
  }
  return recs
}

// ── Save records (upsert by address, with status history) ─────────────────
async function saveRecords(admin: any, src: any, recs: Rec[]) {
  let added = 0
  const now = new Date().toISOString()
  const seen = new Map<string, Rec>()
  for (const r of recs) seen.set(addrKey(`${r.address} ${r.state}`), r)
  const keys = [...seen.keys()]
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200)
    const { data: existing } = await admin.from('auction_records')
      .select('id, addr_key, sale_date, status, sources').in('addr_key', chunk)
    const byKey = new Map((existing || []).map((e: any) => [e.addr_key, e]))
    const events: any[] = []
    const inserts: any[] = []
    for (const k of chunk) {
      const r = seen.get(k)!
      const ex: any = byKey.get(k)
      const srcEntry = { id: src.id, name: src.name, url: r.detail_url || r.source_url }
      if (!ex) {
        inserts.push({
          addr_key: k, address: r.address, city: r.city || '', state: r.state, zip: r.zip || '',
          county: r.county, auction_type: r.auction_type, status: 'scheduled', sale_date: r.sale_date,
          opening_bid: r.opening_bid ?? null, case_number: r.case_number || null,
          plaintiff: r.plaintiff || null, defendant: r.defendant || null,
          source_id: src.id, source_url: r.source_url, detail_url: r.detail_url || null,
          sources: [srcEntry], first_seen_at: now, last_seen_at: now,
        })
      } else {
        const sources = Array.isArray(ex.sources) ? ex.sources : []
        if (!sources.some((s: any) => s.id === src.id)) sources.push(srcEntry)
        const patch: any = { last_seen_at: now, sources }
        if (ex.sale_date && ex.sale_date !== r.sale_date) {
          patch.sale_date = r.sale_date
          patch.status = r.sale_date > ex.sale_date ? 'postponed' : 'scheduled'
          events.push({ record_id: ex.id, event: patch.status === 'postponed' ? 'Postponed' : 'Sale date changed', detail: `${ex.sale_date} → ${r.sale_date}`, sale_date: r.sale_date })
        } else if (ex.status === 'no longer listed') {
          patch.status = 'scheduled'
          events.push({ record_id: ex.id, event: 'Listed again', sale_date: r.sale_date })
        }
        if (r.opening_bid) patch.opening_bid = r.opening_bid
        await admin.from('auction_records').update(patch).eq('id', ex.id)
      }
    }
    if (inserts.length) {
      const { data: ins, error } = await admin.from('auction_records').insert(inserts).select('id, sale_date')
      if (error) throw new Error(error.message)
      added += ins?.length || 0
      for (const x of ins || []) events.push({ record_id: x.id, event: 'First seen', detail: src.name, sale_date: x.sale_date })
    }
    if (events.length) await admin.from('auction_record_events').insert(events)
  }
  return { added, keys }
}

async function markDelisted(admin: any, src: any, runStart: string) {
  const { data } = await admin.from('auction_records').select('id, sale_date')
    .eq('source_id', src.id).lt('last_seen_at', runStart).in('status', ['scheduled', 'postponed'])
  const ids = (data || []).map((d: any) => d.id)
  if (!ids.length) return 0
  const today = new Date().toISOString().slice(0, 10)
  for (const d of data) {
    const status = d.sale_date && d.sale_date < today ? 'sale date passed' : 'no longer listed'
    await admin.from('auction_records').update({ status }).eq('id', d.id)
    await admin.from('auction_record_events').insert({ record_id: d.id, event: status === 'sale date passed' ? 'Sale date passed' : 'No longer listed', sale_date: d.sale_date })
  }
  return ids.length
}

async function ensureRegistry(admin: any) {
  const rows = CIVILVIEW_COUNTIES.map(c => ({
    name: c.name, state: c.state, county: c.county, auction_type: c.type, parser: 'civilview',
    url: `https://salesweb.civilview.com/Sales/SalesSearch?countyId=${c.id}`,
  }))
  await admin.from('auction_sources').upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const gate = await requireUser(req, 'auction-collect', corsHeaders)
  if (!gate.ok) return gate.response!

  const t0 = Date.now()
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  let body: any = {}
  try { body = await req.json() } catch { /* cron sends {} */ }
  const onlyState = typeof body.state === 'string' ? body.state.toUpperCase().slice(0, 2) : ''
  const onlySource = typeof body.sourceId === 'string' ? body.sourceId : ''

  await ensureRegistry(admin)

  let q = admin.from('auction_sources').select('*').eq('enabled', true)
  if (onlyState) q = q.eq('state', onlyState)
  if (onlySource) q = q.eq('id', onlySource)
  const { data: sources } = await q.order('last_run_at', { ascending: true, nullsFirst: true })

  const summary: any[] = []
  const cookies: Record<string, string> = {}
  const list = sources || []

  // Concurrency-limited pass over every enabled source.
  let idx = 0
  const worker = async () => {
    while (idx < list.length && Date.now() - t0 < DEADLINE_MS) {
      const src = list[idx++]
      const runStart = new Date().toISOString()
      let found = 0, added = 0, note = '', ok = false
      try {
        const page = await get(src.url)
        if (!page.ok) throw new Error(`HTTP ${page.status}`)
        if (src.parser === 'civilview' && page.cookie) cookies.civilview = page.cookie
        const recs = src.parser === 'civilview' ? parseCivilView(page.html, src) : await parseNoticeText(page.html, src)
        found = recs.length
        const saved = await saveRecords(admin, src, recs)
        added = saved.added
        const gone = found > 0 || src.parser === 'civilview' ? await markDelisted(admin, src, runStart) : 0
        ok = true
        note = `${found} listed, ${added} new${gone ? `, ${gone} dropped off` : ''}`
      } catch (e) {
        note = String((e as Error)?.message || e).slice(0, 200)
      }
      await admin.from('auction_sources').update({
        last_run_at: runStart, last_count: found, last_error: ok ? null : note,
        status: ok ? (found ? 'working' : 'no listings') : 'broken',
        ...(ok ? { last_ok_at: runStart } : {}),
      }).eq('id', src.id)
      await admin.from('auction_source_runs').insert({ source_id: src.id, ok, found, added, note })
      summary.push({ source: src.name, ok, found, added, note })
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))

  // Detail enrichment: opening bid / upset amount for CivilView records missing it.
  let enriched = 0
  if (Date.now() - t0 < DEADLINE_MS) {
    const { data: todo } = await admin.from('auction_records').select('id, detail_url')
      .is('opening_bid', null).not('detail_url', 'is', null).in('status', ['scheduled', 'postponed'])
      .order('sale_date', { ascending: true }).limit(MAX_DETAILS_PER_RUN)
    let j = 0
    const dw = async () => {
      while (j < (todo || []).length && Date.now() - t0 < DEADLINE_MS) {
        const t = todo![j++]
        const page = await get(t.detail_url, cookies.civilview)
        if (!page.ok) continue
        const d = parseCivilViewDetail(page.html)
        if (d.opening_bid) {
          await admin.from('auction_records').update({ opening_bid: d.opening_bid }).eq('id', t.id)
          enriched++
        }
      }
    }
    await Promise.all(Array.from({ length: 5 }, dw))
  }

  return json({
    ranSources: summary.length, totalSources: list.length,
    found: summary.reduce((a, s) => a + s.found, 0),
    added: summary.reduce((a, s) => a + s.added, 0),
    broken: summary.filter(s => !s.ok).length,
    enriched, seconds: Math.round((Date.now() - t0) / 1000),
    summary,
  })
})
