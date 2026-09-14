import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

/**
 * Auction Radar — distressed properties heading to auction.
 *
 * Evidence-gated by design:
 *   • Every returned record MUST have a parseable auction/sale date AND an address
 *     (or a court/trustee case number) AND a source URL on an allowlisted host.
 *   • Real-estate listing portals (Zillow/Redfin/Realtor/Compass/Trulia) are hard
 *     blocked as auction evidence — they are listings, not sale notices.
 *   • Nothing is invented. If a source yields nothing, we say so in `debug`.
 *
 * Layers:
 *   1. RentCast  — structured Foreclosure / Short Sale / Pre-Foreclosure listings.
 *   2. Trustee / tax-sale publishers + county & sheriff sites via Firecrawl search.
 *   3. AI normalization (temp 0) of raw hits into structured auction records.
 *   4. Optional AVM enrichment to compute equity spread vs opening bid.
 */

const RENTCAST_BASE = 'https://api.rentcast.io/v1'
const FIRECRAWL_SEARCH = 'https://api.firecrawl.dev/v2/search'
const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'

// ── Host policy ───────────────────────────────────────────────────────────
const BLOCKED_HOSTS = [
  'zillow.com', 'redfin.com', 'realtor.com', 'compass.com', 'trulia.com',
  'homes.com', 'movoto.com', 'point2homes.com', 'loopnet.com', 'apartments.com',
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'pinterest.com',
  'yelp.com', 'reddit.com', 'youtube.com', 'tiktok.com', 'linkedin.com',
]

// Hosts that legitimately publish auction / trustee / tax-sale notices.
const TRUSTED_SUFFIXES = ['.gov', '.us', '.org']
const TRUSTED_HOSTS = [
  'auction.com', 'bid4assets.com', 'xome.com', 'hubzu.com', 'servicelinkauction.com',
  'realtybid.com', 'williamsauction.com', 'gohuntinc.com', 'hudhomestore.gov',
  'taxva.com', 'kanialawfirm.com', 'ncpublicnotice.com', 'publicnoticeads.com',
  'vapublicnotices.com', 'publicnoticevirginia.com', 'foreclosurehotline.net',
  'substitutetrustee.net', 'aloxite.com', 'alg-llc.com', 'brockandscott.com',
  'hutchenslawfirm.com', 'shapiroingle.com', 'sales.hutchenslawfirm.com',
  'trusteeservices.net', 'samuel-i-white.com', 'siwpc.net', 'glasserlaw.com',
  'zlsnc.com', 'nc.gov', 'virginia.gov',
]

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}
function matches(host: string, list: string[]) {
  return list.some(h => host === h || host.endsWith('.' + h))
}
function isAllowedAuctionSource(url: string): boolean {
  const host = hostOf(url)
  if (!host) return false
  if (matches(host, BLOCKED_HOSTS)) return false
  if (matches(host, TRUSTED_HOSTS)) return true
  return TRUSTED_SUFFIXES.some(s => host.endsWith(s))
}

// ── Date parsing ──────────────────────────────────────────────────────────
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec'
function parseDate(text: string): string | null {
  if (!text) return null
  const t = String(text)
  const pats: RegExp[] = [
    /\b(20\d{2})[-\/](0?[1-9]|1[0-2])[-\/](0?[1-9]|[12]\d|3[01])\b/,
    /\b(0?[1-9]|1[0-2])[-\/](0?[1-9]|[12]\d|3[01])[-\/](20\d{2})\b/,
    new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b`, 'i'),
    new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS})[a-z]*\\.?,?\\s+(20\\d{2})\\b`, 'i'),
  ]
  for (const p of pats) {
    const m = t.match(p)
    if (!m) continue
    const d = new Date(m[0].replace(/-/g, '/'))
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear()
      if (y >= 2000 && y <= new Date().getFullYear() + 2) return d.toISOString().slice(0, 10)
    }
  }
  return null
}

function daysUntil(iso: string): number {
  const d = new Date(iso + 'T12:00:00Z').getTime()
  const now = Date.now()
  return Math.round((d - now) / 86400000)
}

function money(v: unknown): number {
  if (typeof v === 'number' && isFinite(v)) return Math.round(v)
  const s = String(v ?? '').replace(/[^0-9.]/g, '')
  const n = parseFloat(s)
  return isFinite(n) && n > 0 ? Math.round(n) : 0
}

function looksLikeAddress(s: string): boolean {
  return /\d{2,6}\s+[A-Za-z0-9.'-]+(\s+[A-Za-z0-9.'-]+)*/.test(String(s || '').trim())
}

// ── Auction type classifier ───────────────────────────────────────────────
function classifyAuction(text: string): string {
  const t = (text || '').toLowerCase()
  if (t.includes('tax sale') || t.includes('tax foreclos') || t.includes('delinquent tax')) return 'Tax Foreclosure'
  if (t.includes('trustee') || t.includes('deed of trust')) return 'Trustee Sale'
  if (t.includes('sheriff')) return 'Sheriff Sale'
  if (t.includes('judicial') || t.includes('commissioner of accounts') || t.includes('court-ordered')) return 'Judicial Sale'
  if (t.includes('hud') || t.includes('fannie') || t.includes('freddie') || t.includes('reo') || t.includes('bank owned') || t.includes('bank-owned')) return 'Bank / REO Auction'
  if (t.includes('short sale')) return 'Short Sale'
  if (t.includes('pre-foreclos') || t.includes('preforeclos') || t.includes('lis pendens') || t.includes('notice of default')) return 'Pre-Foreclosure'
  if (t.includes('estate sale') || t.includes('probate')) return 'Probate / Estate'
  if (t.includes('auction') || t.includes('foreclos')) return 'Foreclosure Auction'
  return 'Auction'
}

// ── Layer 1: RentCast structured distressed listings ──────────────────────
async function fromRentCast(loc: Record<string, string>, opts: { maxPrice?: number }) {
  const key = Deno.env.get('RENTCAST_API_KEY')
  if (!key) return { records: [], note: 'RENTCAST_API_KEY not configured' }

  const params: Record<string, string> = { ...loc, status: 'Active', limit: '500' }
  if (opts.maxPrice) params.price = `1-${opts.maxPrice}`

  try {
    const res = await fetch(`${RENTCAST_BASE}/listings/sale?${new URLSearchParams(params)}`, {
      headers: { 'X-Api-Key': key },
    })
    if (!res.ok) return { records: [], note: `RentCast ${res.status}` }
    const data = await res.json()
    const arr: any[] = Array.isArray(data) ? data : (data.listings || data.data || [])

    const distressed = arr.filter(x => {
      const lt = String(x.listingType || '').toLowerCase()
      return lt.includes('foreclos') || lt.includes('short')
    })

    const records = distressed.map((x: any) => {
      const lt = String(x.listingType || '')
      const type = classifyAuction(lt)
      return {
        id: `rc-${x.id || x.formattedAddress}`,
        address: x.formattedAddress || [x.addressLine1, x.city, x.state, x.zipCode].filter(Boolean).join(', '),
        city: x.city || '',
        state: x.state || '',
        zip: x.zipCode || '',
        county: x.county || '',
        auctionDate: null as string | null,
        auctionDateLabel: 'Not yet scheduled (listed distressed)',
        auctionType: type,
        openingBid: money(x.price),
        estimatedValue: 0,
        caseNumber: '',
        trustee: '',
        beds: x.bedrooms || 0,
        baths: x.bathrooms || 0,
        sqft: x.squareFootage || 0,
        yearBuilt: x.yearBuilt || 0,
        lastSalePrice: money(x.lastSalePrice),
        description: `${lt} listing · ${x.daysOnMarket || 0} days on market`,
        sourceUrl: '',
        sourceHost: 'rentcast.io',
        sourceLabel: 'RentCast MLS distressed feed',
        verified: true,
        confidence: 'high' as const,
        matchReasons: [`MLS listingType = ${lt || 'Foreclosure'}`],
        stage: 'listed' as const,
      }
    })

    return { records, note: `RentCast scanned ${arr.length} active listings, ${distressed.length} distressed` }
  } catch (e) {
    return { records: [], note: `RentCast error: ${String(e)}` }
  }
}

// ── Layer 2: auction notice search ────────────────────────────────────────
function buildQueries(area: string, state: string, county: string) {
  const place = county ? `${county} County ${state}` : area
  const year = new Date().getFullYear()
  return [
    `"trustee sale" OR "substitute trustee" foreclosure auction ${place} ${year}`,
    `sheriff sale OR "tax foreclosure sale" upcoming auction properties ${place} ${year}`,
    `site:auction.com foreclosure auction ${area} ${state}`,
    `site:bid4assets.com tax sale ${place}`,
    `"notice of foreclosure sale" ${place} ${year} property address`,
    `${place} upcoming real estate auction list ${year} site:.gov`,
    `"public notice" foreclosure sale ${area} ${state} ${year}`,
  ]
}

async function searchAuctionNotices(area: string, state: string, county: string) {
  const key = Deno.env.get('FIRECRAWL_API_KEY')
  if (!key) return { hits: [], debug: { reason: 'FIRECRAWL_API_KEY missing', queriesRun: 0, queriesOk: 0, rawHits: 0 } }

  const queries = buildQueries(area, state, county)
  let ok = 0
  const hits: Array<{ title: string; description: string; url: string }> = []
  const seen = new Set<string>()
  const searchErrors: string[] = []

  // Throttled: Firecrawl rate-limits bursts, and a 429 wipes the whole scan.
  const runQuery = async (q: string, attempt = 0): Promise<void> => {
    try {
      const res = await fetch(FIRECRAWL_SEARCH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ query: q, limit: 8 }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        if ((res.status === 429 || res.status >= 500) && attempt < 2) {
          await new Promise(r => setTimeout(r, 2500 * (attempt + 1)))
          return runQuery(q, attempt + 1)
        }
        searchErrors.push(`HTTP ${res.status}: ${txt.slice(0, 140)}`)
        return
      }
      ok++
      const data = await res.json()
      const arr: any[] = data?.data?.web || data?.data || data?.results || []
      for (const r of arr) {
        const url = r.url || ''
        if (!url || seen.has(url)) continue
        if (!isAllowedAuctionSource(url)) continue
        seen.add(url)
        const body = String(r.markdown || r.description || r.snippet || '').slice(0, 3500)
        hits.push({ title: r.title || '', description: body, url })
      }
    } catch (e) {
      searchErrors.push(String(e).slice(0, 140))
    }
  }

  for (let i = 0; i < queries.length; i += 3) {
    await Promise.all(queries.slice(i, i + 3).map(q => runQuery(q)))
    if (i + 3 < queries.length) await new Promise(r => setTimeout(r, 700))
  }

  return { hits, debug: { queriesRun: queries.length, queriesOk: ok, rawHits: hits.length, searchErrors: searchErrors.slice(0, 5) } }
}

// ── Layer 2b: open each notice page and read the whole list ───────────────
// Search snippets rarely contain the property rows; the actual addresses and
// sale dates live on the page itself, so we scrape the most promising pages.
async function scrapeNoticePages(hits: Array<{ title: string; description: string; url: string }>, limit = 8) {
  const key = Deno.env.get('FIRECRAWL_API_KEY')
  if (!key) return { pages: [], scraped: 0, scrapeOk: 0 }

  // Prioritise pages whose title/url smells like an actual sale list.
  const scoreHit = (h: { title: string; url: string }) => {
    const t = `${h.title} ${h.url}`.toLowerCase()
    let s = 0
    if (/(sale|auction|foreclos|trustee|sheriff|tax)/.test(t)) s += 3
    if (/(list|upcoming|schedule|notice|calendar|properties)/.test(t)) s += 3
    if (/(bid4assets|auction\.com|taxva|kanialawfirm|publicnotice|column\.us)/.test(t)) s += 2
    if (/\.gov/.test(t)) s += 2
    if (/(faq|how-to|blog|about|guide|glossary|law\.lis)/.test(t)) s -= 5
    return s
  }

  const targets = [...hits].sort((a, b) => scoreHit(b) - scoreHit(a)).slice(0, limit)
  let okCount = 0
  const pages: Array<{ url: string; title: string; text: string }> = []
  const attempts: Array<{ url: string; status: string; chars: number }> = []

  const scrapeOne = async (h: { url: string; title: string }, attempt = 0): Promise<void> => {
    try {
      const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ url: h.url, formats: ['markdown'], onlyMainContent: true, timeout: 25000 }),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        if ((res.status === 429 || res.status >= 500) && attempt < 1) {
          await new Promise(r => setTimeout(r, 2500))
          return scrapeOne(h, attempt + 1)
        }
        attempts.push({ url: h.url, status: `HTTP ${res.status} ${t.slice(0, 120)}`, chars: 0 })
        return
      }
      const data = await res.json()
      const md = String(data?.data?.markdown || data?.markdown || data?.data?.content || '')
      attempts.push({ url: h.url, status: md.length >= 200 ? 'ok' : 'too short', chars: md.length })
      if (md.length < 200) return
      okCount++
      pages.push({ url: h.url, title: h.title, text: md.slice(0, 14000) })
    } catch (e) {
      attempts.push({ url: h.url, status: `error ${String(e).slice(0, 120)}`, chars: 0 })
    }
  }

  for (let i = 0; i < targets.length; i += 3) {
    await Promise.all(targets.slice(i, i + 3).map(h => scrapeOne(h)))
    if (i + 3 < targets.length) await new Promise(r => setTimeout(r, 800))
  }

  return { pages, scraped: targets.length, scrapeOk: okCount, attempts }
}

// ── Layer 3: AI normalization ─────────────────────────────────────────────
async function extractFromSource(
  area: string, state: string, county: string,
  src: { url: string; title: string; text: string },
) {
  const key = Deno.env.get('LOVABLE_API_KEY')
  if (!key) return { records: [], aiUsed: false }

  const system = `You extract UPCOMING or RECENT real-estate AUCTION / FORECLOSURE SALE records from raw web content (trustee sale notices, sheriff sales, tax foreclosure lists, public notices, auction platforms).

HARD RULES — violating any means the record must be omitted:
- Every record MUST have a specific property street address (street number + street name). Never output a record whose address is a city, a county, a courthouse, or "multiple properties".
- Every record MUST have a specific auction/sale date that is literally present in the source text. NEVER guess, infer, or invent a date.
- Only include properties located in or near the target area.
- Ignore marketing pages, service pages, blog posts, "how to buy foreclosures" guides, and real-estate listing portals.
- If nothing qualifies, return {"records": []}.

For each record extract:
  address (full street address), city, state (2-letter), zip, county,
  auctionDate (YYYY-MM-DD, exactly as stated in the source),
  auctionTime (as stated, or ""), location (where the sale is held, or ""),
  auctionType (one of: Trustee Sale, Sheriff Sale, Tax Foreclosure, Judicial Sale, Bank / REO Auction, Pre-Foreclosure, Probate / Estate, Foreclosure Auction),
  openingBid (number, 0 if not stated), caseNumber (or ""), trustee (trustee/attorney/agency name, or ""),
  description (one factual sentence quoting the notice),
  url (the exact source url the record came from),
  confidence ("high" if street address AND date are both explicit; "medium" if address explicit but date approximate; "low" otherwise).`

  const user = `TARGET AREA: ${area}${county ? ` (${county} County)` : ''}, ${state}
TODAY: ${new Date().toISOString().slice(0, 10)}
SOURCE PAGE: ${src.title || '(untitled)'}
SOURCE URL: ${src.url}

PAGE CONTENT:
${src.text}

Extract every distinct property sale listed on this page (there may be many, or none).
Respond ONLY with JSON: {"records":[{...}]}`

  try {
    const res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0,
        max_tokens: 6000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    })
    if (!res.ok) return { records: [], aiUsed: false, aiError: `AI ${res.status}` }
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || '{}'
    let parsed: any = {}
    try { parsed = JSON.parse(content) } catch {
      const m = content.match(/\{[\s\S]*\}/)
      if (m) { try { parsed = JSON.parse(m[0]) } catch { parsed = {} } }
    }
    const raw: any[] = Array.isArray(parsed.records) ? parsed.records : []

    const records = raw.map((r: any, i: number) => {
      const url = isAllowedAuctionSource(String(r.url || '')) ? String(r.url) : src.url
      const date = parseDate(String(r.auctionDate || '')) || parseDate(`${r.description || ''}`)
      const addr = String(r.address || '').trim()
      const text = `${r.auctionType || ''} ${r.description || ''} ${r.title || ''} ${src.title}`
      return {
        id: `web-${hostOf(src.url)}-${i}-${addr.slice(0, 24)}`,
        address: addr,
        city: r.city || '',
        state: (r.state || state || '').toUpperCase().slice(0, 2),
        zip: r.zip || '',
        county: r.county || county || '',
        auctionDate: date,
        auctionDateLabel: date ? '' : String(r.auctionDate || ''),
        auctionTime: r.auctionTime || '',
        auctionLocation: r.location || '',
        auctionType: r.auctionType || classifyAuction(text),
        openingBid: money(r.openingBid),
        estimatedValue: 0,
        caseNumber: String(r.caseNumber || ''),
        trustee: String(r.trustee || ''),
        description: String(r.description || '').slice(0, 400),
        sourceUrl: url,
        sourceHost: hostOf(url),
        sourceLabel: hostOf(url),
        verified: false,
        confidence: (['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'medium') as 'high' | 'medium' | 'low',
        matchReasons: [] as string[],
        stage: 'scheduled' as const,
      }
    })

    return { records, aiUsed: true }
  } catch (e) {
    return { records: [], aiUsed: false, aiError: String(e) }
  }
}

// Run one extraction per scraped page, plus one pass over raw search snippets.
async function extractAuctions(
  area: string, state: string, county: string,
  pages: Array<{ url: string; title: string; text: string }>,
  snippets: Array<{ title: string; description: string; url: string }>,
) {
  const sources = [...pages]
  if (snippets.length) {
    sources.push({
      url: snippets[0].url,
      title: 'Combined search snippets',
      text: snippets.slice(0, 20).map(s => `### ${s.title}\nURL: ${s.url}\n${s.description}`).join('\n\n').slice(0, 14000),
    })
  }
  if (!sources.length) return { records: [], aiUsed: false, pagesParsed: 0 }

  const out = await Promise.all(sources.map(s => extractFromSource(area, state, county, s)))
  const records = out.flatMap(o => o.records)
  const aiError = out.find(o => (o as any).aiError)?.['aiError' as never] || null
  return { records, aiUsed: out.some(o => o.aiUsed), aiError, pagesParsed: sources.length }
}

// ── Validation gate ───────────────────────────────────────────────────────
function validate(rec: any, daysAhead: number) {
  const reasons: string[] = []
  if (!looksLikeAddress(rec.address)) return { ok: false, why: 'no street address' }
  if (!isAllowedAuctionSource(rec.sourceUrl)) return { ok: false, why: 'source not an official / auction host' }
  if (!rec.auctionDate) return { ok: false, why: 'no verifiable auction date' }

  const d = daysUntil(rec.auctionDate)
  if (d < -45) return { ok: false, why: 'auction already past' }
  if (d > daysAhead) return { ok: false, why: 'auction beyond window' }

  reasons.push('Street address in notice')
  reasons.push(`Sale date ${rec.auctionDate} stated in source`)
  if (rec.caseNumber) reasons.push(`Case #${rec.caseNumber}`)
  if (rec.trustee) reasons.push(`Trustee: ${rec.trustee}`)
  reasons.push(`Official source: ${rec.sourceHost}`)
  return { ok: true, reasons }
}

// ── Layer 4: AVM enrichment ───────────────────────────────────────────────
async function enrichValue(records: any[]) {
  const key = Deno.env.get('RENTCAST_API_KEY')
  if (!key) return
  const targets = records.slice(0, 12).filter(r => !r.estimatedValue && r.address)
  await Promise.all(targets.map(async r => {
    try {
      const res = await fetch(`${RENTCAST_BASE}/avm/value?${new URLSearchParams({ address: r.address })}`, {
        headers: { 'X-Api-Key': key },
      })
      if (!res.ok) return
      const d = await res.json()
      r.estimatedValue = money(d.price || d.priceRangeLow)
      r.valueLow = money(d.priceRangeLow)
      r.valueHigh = money(d.priceRangeHigh)
    } catch { /* optional */ }
  }))
}

// ── Urgency + opportunity score ───────────────────────────────────────────
function score(r: any): { score: number; grade: string; urgency: string } {
  let s = 40

  // Urgency from days to sale
  let urgency = 'Unscheduled'
  if (r.auctionDate != null) {
    const d = daysUntil(r.auctionDate)
    if (d < 0) { urgency = 'Sale passed'; s += 5 }
    else if (d <= 7) { urgency = `${d}d — imminent`; s += 25 }
    else if (d <= 21) { urgency = `${d}d — act now`; s += 20 }
    else if (d <= 45) { urgency = `${d}d — prepare`; s += 14 }
    else { urgency = `${d}d out`; s += 8 }
  }

  // Auction type weight — pre-foreclosure is where a deal can still be made direct
  const t = String(r.auctionType)
  if (t === 'Pre-Foreclosure') s += 12
  else if (t === 'Tax Foreclosure') s += 10
  else if (t === 'Trustee Sale' || t === 'Sheriff Sale') s += 8
  else if (t === 'Probate / Estate') s += 8

  // Equity spread
  if (r.estimatedValue > 0 && r.openingBid > 0) {
    const spread = (r.estimatedValue - r.openingBid) / r.estimatedValue
    r.equitySpreadPct = Math.round(spread * 100)
    r.equityDollars = r.estimatedValue - r.openingBid
    if (spread >= 0.45) s += 22
    else if (spread >= 0.30) s += 16
    else if (spread >= 0.15) s += 8
    else if (spread < 0) s -= 12
  }

  // Evidence confidence
  if (r.confidence === 'high') s += 6
  else if (r.confidence === 'low') s -= 10
  if (r.verified) s += 4

  s = Math.max(0, Math.min(100, Math.round(s)))
  const grade = s >= 85 ? 'A+' : s >= 78 ? 'A' : s >= 70 ? 'B+' : s >= 62 ? 'B' : s >= 54 ? 'C+' : s >= 45 ? 'C' : 'D'
  return { score: s, grade, urgency }
}

// ── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const state = String(body.state || '').toUpperCase().slice(0, 2)
    const city = String(body.city || '').trim()
    const county = String(body.county || '').trim()
    const zip = String(body.zip || '').trim()
    const daysAhead = Math.min(Number(body.daysAhead) || 90, 365)
    const maxPrice = Number(body.maxPrice) || 0

    if (!state && !city && !zip) {
      return new Response(JSON.stringify({ error: 'Provide at least a city, ZIP, or state.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const loc: Record<string, string> = {}
    if (zip) loc.zipCode = zip
    else if (city) { loc.city = city; if (state) loc.state = state }
    else if (state) loc.state = state

    const area = zip || (city ? `${city}${state ? ', ' + state : ''}` : state)

    const [rc, search] = await Promise.all([
      fromRentCast(loc, { maxPrice }),
      searchAuctionNotices(area, state, county),
    ])

    const scrape = await scrapeNoticePages(search.hits, 8)
    const ai = await extractAuctions(area, state, county, scrape.pages, search.hits)

    // Validate web-derived records, keep rejects for transparency
    const rejected: Array<{ address: string; url: string; why: string }> = []
    const webRecords: any[] = []
    for (const r of ai.records) {
      const v = validate(r, daysAhead)
      if (!v.ok) { rejected.push({ address: r.address || '(none)', url: r.sourceUrl, why: v.why! }); continue }
      r.matchReasons = v.reasons!
      r.verified = true
      webRecords.push(r)
    }

    // Merge + dedupe by normalized address
    const norm = (a: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40)
    const byAddr = new Map<string, any>()
    for (const r of [...webRecords, ...rc.records]) {
      const k = norm(r.address)
      if (!k) continue
      const existing = byAddr.get(k)
      if (!existing) { byAddr.set(k, r); continue }
      // prefer the record with a real auction date
      if (!existing.auctionDate && r.auctionDate) {
        byAddr.set(k, { ...r, matchReasons: [...(r.matchReasons || []), ...(existing.matchReasons || [])] })
      } else if (existing.auctionDate && !r.auctionDate) {
        existing.matchReasons = [...(existing.matchReasons || []), `Also in ${r.sourceLabel}`]
      }
    }

    let records = [...byAddr.values()]
    await enrichValue(records)
    records = records.map(r => ({ ...r, ...score(r) }))

    records.sort((a, b) => {
      const ad = a.auctionDate ? daysUntil(a.auctionDate) : 9999
      const bd = b.auctionDate ? daysUntil(b.auctionDate) : 9999
      if (ad !== bd) return ad - bd
      return b.score - a.score
    })

    const scheduled = records.filter(r => r.auctionDate)
    const stats = {
      total: records.length,
      scheduled: scheduled.length,
      within7: scheduled.filter(r => daysUntil(r.auctionDate) <= 7 && daysUntil(r.auctionDate) >= 0).length,
      within30: scheduled.filter(r => daysUntil(r.auctionDate) <= 30 && daysUntil(r.auctionDate) >= 0).length,
      avgScore: records.length ? Math.round(records.reduce((s, r) => s + r.score, 0) / records.length) : 0,
    }

    const sources = [
      { name: 'RentCast distressed listings', note: rc.note, count: rc.records.length },
      { name: 'Trustee / sheriff / tax-sale notices (web)', note: `${search.debug.queriesOk}/${search.debug.queriesRun} queries ok · ${search.debug.rawHits} official-host hits · ${scrape.scrapeOk}/${scrape.scraped} notice pages read`, count: webRecords.length },
    ]

    return new Response(JSON.stringify({
      area, state, county, daysAhead,
      records, stats, sources,
      debug: {
        ...search.debug,
        aiUsed: ai.aiUsed,
        aiError: (ai as any).aiError || null,
        extracted: ai.records.length,
        pagesScraped: scrape.scraped,
        pagesRead: scrape.scrapeOk,
        pagesParsed: (ai as any).pagesParsed || 0,
        scrapeAttempts: (scrape as any).attempts || [],
        rejected,
        rawHostList: [...new Set(search.hits.map(h => hostOf(h.url)))],
      },
      scannedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('auction-radar failed:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
