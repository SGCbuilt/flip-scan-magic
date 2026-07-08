// ── Date extractor: pulls the most plausible date from title/description/url
function extractDate(text: string): { iso: string; label: string } | null {
  if (!text) return null
  const patterns: RegExp[] = [
    // 2024-05-13 or 2024/05/13
    /\b(20\d{2})[-\/](0?[1-9]|1[0-2])[-\/](0?[1-9]|[12]\d|3[01])\b/,
    // 05/13/2024 or 5-13-24
    /\b(0?[1-9]|1[0-2])[-\/](0?[1-9]|[12]\d|3[01])[-\/](20\d{2}|\d{2})\b/,
    // May 13, 2024  or  May 2024
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2},?\s+)?(20\d{2})\b/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (!m) continue
    const raw = m[0]
    const d = new Date(raw.replace(/-/g, '/'))
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= new Date().getFullYear() + 1) {
      return { iso: d.toISOString().slice(0, 10), label: raw }
    }
  }
  return null
}

function classifyPermitType(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('electric')) return 'Electrical'
  if (t.includes('plumb')) return 'Plumbing'
  if (t.includes('mechanical') || t.includes('hvac')) return 'Mechanical/HVAC'
  if (t.includes('roof')) return 'Roofing'
  if (t.includes('demo')) return 'Demolition'
  if (t.includes('addition')) return 'Addition'
  if (t.includes('renov') || t.includes('remodel') || t.includes('alteration')) return 'Renovation'
  if (t.includes('new construction') || t.includes('new build')) return 'New Construction'
  if (t.includes('fence')) return 'Fence'
  if (t.includes('deck')) return 'Deck'
  if (t.includes('pool')) return 'Pool'
  if (t.includes('sign')) return 'Sign'
  if (t.includes('inspection')) return 'Inspection'
  if (t.includes('violation') || t.includes('code enforcement')) return 'Violation'
  return 'Building'
}

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface Body {
  address: string
  city?: string
  state?: string
  zip?: string
  ownerName?: string
  parcelId?: string
  deal?: Record<string, unknown>
  mode?: 'full' | 'permits' | 'distress' | 'summary'
  context?: Record<string, unknown>
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function invoke(fn: string, body: unknown): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { error: text } }
}

// ── PERMITS / VIOLATIONS via Firecrawl (multi-query, portal-aware) ────────
// ── OPEN DATA (Socrata) permit registry lookup ────────────────────────────
// Maps VA/NC cities SGC works in to their open-data portal domain.
// The dataset id is discovered dynamically via Socrata's Discovery API so
// we don't have to hardcode brittle resource IDs.
const OPEN_DATA_DOMAINS: Record<string, string[]> = {
  // North Carolina
  'raleigh':       ['data.raleighnc.gov'],
  'charlotte':     ['data.charlottenc.gov'],
  'cary':          ['data.townofcary.org'],
  'durham':        ['opendata.durhamnc.gov'],
  'greensboro':    ['data.greensboro-nc.gov'],
  'winston-salem': ['data.cityofws.org'],
  'asheville':     ['data-avl.opendata.arcgis.com'],
  'wake county':   ['data.wake.gov', 'data.wakegov.com'],
  // Virginia
  'norfolk':          ['data.norfolk.gov'],
  'virginia beach':   ['data.vbgov.com'],
  'chesapeake':       ['data.cityofchesapeake.net'],
  'richmond':         ['data.richmondgov.com'],
  'newport news':     ['data.nnva.gov'],
  'hampton':          ['data.hampton.gov'],
  'portsmouth':       ['data.portsmouthva.gov'],
  'suffolk':          ['data.suffolkva.us'],
  'alexandria':       ['data.alexandriava.gov'],
  'arlington':        ['data.arlingtonva.us'],
  'fairfax county':   ['data.fairfaxcountygis.opendata.arcgis.com'],
  'loudoun county':   ['data.loudoun.gov'],
  'prince william':   ['data.pwcva.gov'],
}

async function socrataDiscoverDataset(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.us.socrata.com/api/catalog/v1?domains=${encodeURIComponent(domain)}&q=${encodeURIComponent('building permits issued')}&limit=6`)
    if (!res.ok) return null
    const data = await res.json()
    const results = data?.results || []
    // Prefer datasets whose name contains both "permit" and either "building" or "issued"
    const ranked = results
      .map((r: any) => r.resource)
      .filter((r: any) => r && (r.type === 'dataset' || !r.type))
      .sort((a: any, b: any) => {
        const score = (r: any) => {
          const n = (r.name || '').toLowerCase()
          let s = 0
          if (n.includes('permit')) s += 3
          if (n.includes('building')) s += 2
          if (n.includes('issued')) s += 2
          if (n.includes('trade')) s -= 1 // sub-type dataset
          if (n.includes('violation')) s -= 2
          if (n.includes('archive') || n.includes('historic')) s -= 1
          return s
        }
        return score(b) - score(a)
      })
    return ranked[0]?.id || null
  } catch {
    return null
  }
}

async function fetchPermitsFromSocrata(street: string, city: string, state: string, zip: string) {
  const cityKey = (city || '').toLowerCase().trim()
  const domains = OPEN_DATA_DOMAINS[cityKey]
  if (!domains || domains.length === 0) return null

  const streetOnly = (street || '').split(',')[0].trim()
  const streetNumber = (streetOnly.match(/^\s*(\d+)/) || [])[1] || ''
  const streetNameToken = streetOnly.replace(/^\s*\d+\s*/, '').replace(/\s+(st|street|rd|road|ave|avenue|dr|drive|ln|lane|ct|court|blvd|way|pl|place|ter|terrace|cir|circle|hwy|highway|pkwy|parkway)\.?$/i, '').trim()
  if (!streetNumber || !streetNameToken) return null

  const allRows: any[] = []
  let usedDomain = ''
  let usedDataset = ''

  for (const domain of domains) {
    // ArcGIS Hub domains use a different API — skip Socrata Discovery for them here
    if (domain.includes('arcgis') || domain.includes('opendata.durhamnc.gov')) continue
    const datasetId = await socrataDiscoverDataset(domain)
    if (!datasetId) continue
    // Free-text search — Socrata's $q searches all indexed columns
    const q = `${streetNumber} ${streetNameToken}`
    try {
      const res = await fetch(`https://${domain}/resource/${datasetId}.json?$q=${encodeURIComponent(q)}&$limit=30`)
      if (!res.ok) continue
      const rows = await res.json()
      if (!Array.isArray(rows) || rows.length === 0) continue
      usedDomain = domain
      usedDataset = datasetId
      allRows.push(...rows)
      break
    } catch { /* try next */ }
  }

  if (allRows.length === 0) return { permits: [], violations: [], domain: '', dataset: '', matched: 0, checked: domains }

  // Filter for rows whose address fields include our street number + name
  const nameLower = streetNameToken.toLowerCase()
  const matched = allRows.filter(row => {
    const blob = JSON.stringify(row).toLowerCase()
    return blob.includes(streetNumber) && blob.includes(nameLower)
  })

  const pick = (row: any, keys: string[]): string | null => {
    for (const k of keys) {
      // Case-insensitive key match
      const foundKey = Object.keys(row).find(rk => rk.toLowerCase() === k.toLowerCase())
      if (foundKey && row[foundKey] != null && String(row[foundKey]).trim() !== '') return String(row[foundKey])
    }
    return null
  }

  const toIso = (s: string | null): string | null => {
    if (!s) return null
    // Socrata returns dates as ISO strings usually
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    const ex = extractDate(s)
    return ex?.iso || null
  }

  const permits: any[] = []
  const violations: any[] = []

  for (const row of matched) {
    const issued = toIso(pick(row, ['issued_date', 'issue_date', 'issueddate', 'date_issued', 'permit_issue_date']))
    const applied = toIso(pick(row, ['applied_date', 'application_date', 'applieddate', 'applied']))
    const date = issued || applied
    const workDesc = pick(row, ['proposed_work_description', 'work_description', 'description', 'proposed_use', 'project_name', 'landuse_description'])
    const permitType = pick(row, ['permit_type', 'permit_type_mapped', 'work_class', 'work_class_mapped', 'permit_class'])
    const permitNumber = pick(row, ['permit_number', 'permitnumber', 'permit_num', 'permit_id', 'objectid'])
    const status = pick(row, ['current_status', 'current_status_mapped', 'status', 'permit_status'])
    const contractor = pick(row, ['contractor_company_name', 'contractor_doing_business_as', 'contractor', 'contractor_name'])
    const cost = pick(row, ['estimated_project_cost', 'project_cost', 'estimated_cost', 'valuation', 'fee'])
    const originalAddr = pick(row, ['original_address_1', 'address', 'site_address', 'full_address'])

    const isViolation = (permitType || '').toLowerCase().includes('violation') || (workDesc || '').toLowerCase().includes('violation')

    const rec = {
      title: [permitType, workDesc].filter(Boolean).join(' — ').slice(0, 180) || `Permit ${permitNumber || ''}`.trim(),
      description: [
        originalAddr ? `📍 ${originalAddr}` : '',
        permitNumber ? `# ${permitNumber}` : '',
        status ? `Status: ${status}` : '',
        contractor ? `Contractor: ${contractor}` : '',
        cost && Number(cost) > 0 ? `Est. cost: $${Math.round(Number(cost)).toLocaleString()}` : '',
        applied && applied !== issued ? `Applied ${applied}` : '',
      ].filter(Boolean).join(' · '),
      url: `https://${usedDomain}/resource/${usedDataset}.json?$q=${encodeURIComponent(`${streetNumber} ${streetNameToken}`)}`,
      date,
      dateLabel: date,
      permitType: permitType || classifyPermitType(workDesc || ''),
      confidence: 'high' as const,
      matchReasons: ['Official open-data registry', `# ${streetNumber}`, `Street ${streetNameToken}`],
      source: usedDomain,
      permitNumber,
      status,
      contractor,
      cost,
    }
    if (isViolation) violations.push(rec)
    else permits.push(rec)
  }

  permits.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  violations.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return {
    permits, violations,
    domain: usedDomain, dataset: usedDataset,
    matched: matched.length,
    totalRowsScanned: allRows.length,
    checked: domains,
  }
}

// ── AI extraction of permits/violations from search results ───────────────
async function extractPermitsWithAI(fullAddr: string, rawResults: Array<{ title?: string; description?: string; url?: string }>) {
  const key = Deno.env.get('LOVABLE_API_KEY')
  if (!key || rawResults.length === 0) return { permits: [], violations: [], aiUsed: false }
  const system = `You extract building permits, inspections, and code-enforcement violations from raw web search results.
ONLY include records that are clearly for the target property address. Reject unrelated results.
For each record, extract: date (ISO YYYY-MM-DD if possible), permitType (Electrical/Plumbing/Mechanical-HVAC/Roofing/Renovation/Addition/New Construction/Demolition/Inspection/Fence/Deck/Pool/Sign/Violation/Building), title, description, url, and confidence (high/medium/low).
High = record explicitly lists the target street number + street name.
Medium = street name matches and city/zip matches.
Low = weak signals only.
Return {} if no relevant records are found. Do not invent dates.`

  const user = `TARGET ADDRESS: ${fullAddr}

RAW SEARCH RESULTS (JSON):
${JSON.stringify(rawResults.slice(0, 25), null, 2)}`

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user + '\n\nRespond ONLY with JSON: {"permits":[{...}],"violations":[{...}]}' },
        ],
      }),
    })
    if (!res.ok) return { permits: [], violations: [], aiUsed: false, aiError: `AI ${res.status}` }
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || '{}'
    let parsed: any = {}
    try { parsed = JSON.parse(content) } catch {
      const m = content.match(/\{[\s\S]*\}/)
      if (m) { try { parsed = JSON.parse(m[0]) } catch { parsed = {} } }
    }
    const norm = (arr: any[]) => (Array.isArray(arr) ? arr : []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      description: r.description || '',
      date: r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : (extractDate(`${r.title || ''} ${r.description || ''} ${r.date || ''}`)?.iso || null),
      dateLabel: r.date || null,
      permitType: r.permitType || classifyPermitType(`${r.title || ''} ${r.description || ''}`),
      confidence: (r.confidence === 'high' || r.confidence === 'medium' || r.confidence === 'low') ? r.confidence : 'medium',
      matchReasons: r.matchReasons || ['AI-verified for address'],
      source: (() => { try { return new URL(r.url).hostname.replace(/^www\./, '') } catch { return 'web' } })(),
    }))
    return { permits: norm(parsed.permits), violations: norm(parsed.violations), aiUsed: true }
  } catch (e) {
    return { permits: [], violations: [], aiUsed: false, aiError: String(e) }
  }
}

async function fetchPermitsViaFirecrawl(street: string, city: string, state: string, zip: string, ownerName?: string, parcelId?: string) {
  const key = Deno.env.get('FIRECRAWL_API_KEY')
  if (!key) return { permits: [], violations: [], source: 'unavailable' as const, debug: { reason: 'FIRECRAWL_API_KEY missing' } }

  const streetOnly = (street || '').split(',')[0].trim()
  const streetNoSuffix = streetOnly.replace(/\s+(st|street|rd|road|ave|avenue|dr|drive|ln|lane|ct|court|blvd|way|pl|place|ter|terrace|cir|circle|hwy|highway|pkwy|parkway)\.?$/i, '').trim()
  const cityLower = (city || '').toLowerCase().replace(/\s+/g, '')
  const stateLower = (state || '').toLowerCase()
  const streetNumber = (streetOnly.match(/^\s*(\d+)/) || [])[1] || ''

  const portalSites = [
    `${cityLower}.gov`, `${cityLower}${stateLower}.gov`, `city${cityLower}.gov`,
    `${cityLower}va.gov`, `${cityLower}nc.gov`, `${stateLower}.gov`,
    'accela.com', 'aca-prod.accela.com', 'energovweb.tylertech.com', 'viewpointcloud.com',
    'opengov.com', 'permits.com', 'buildingeye.com', 'citizenserve.com', 'cloudpermit.com',
    'openpermit.co', 'permitsearch.com', 'shovels.ai', 'bldrs.com', 'buildzoom.com',
    'buildfax.com', 'housinginsights.com',
  ]
  const siteFilter = portalSites.map(s => `site:${s}`).join(' OR ')

  const queries = [
    `"${streetOnly}" ${city} ${state} permit`,
    `"${streetOnly}" ${city} ${state} building permit history`,
    `"${streetOnly}" ${city} ${state} inspection OR "code enforcement" OR violation`,
    `${streetNumber} "${streetNoSuffix}" ${city} ${state} (permit OR inspection) (${siteFilter})`,
    `"${streetOnly}" ${zip || city} (permit OR violation)`,
    `site:shovels.ai "${streetOnly}" ${city}`,
    `site:buildzoom.com "${streetOnly}" ${city}`,
  ]

  const rawAll: any[] = []
  const seen = new Set<string>()
  let queriesOk = 0

  await Promise.all(queries.map(async q => {
    try {
      const res = await fetch('https://api.firecrawl.dev/v2/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 8 }),
      })
      if (!res.ok) return
      queriesOk++
      const data = await res.json()
      const results = data?.data?.web || data?.data || []
      for (const r of results) {
        const url = r.url || ''
        if (!url || seen.has(url)) continue
        seen.add(url)
        rawAll.push({ title: r.title || '', description: r.description || '', url })
      }
    } catch { /* swallow */ }
  }))

  // Ask AI to extract structured permits/violations for THIS address
  const fullAddr = [streetOnly, city, state, zip].filter(Boolean).join(', ')
  const ai = await extractPermitsWithAI(fullAddr, rawAll)

  // Fallback heuristic pass (keeps low-conf portal hits so user sees something)
  const heuristic: any[] = []
  if (ai.permits.length + ai.violations.length === 0 && rawAll.length > 0) {
    for (const r of rawAll.slice(0, 12)) {
      const combined = `${r.title || ''} ${r.description || ''} ${r.url}`
      const portalHit = portalSites.some(p => (r.url || '').toLowerCase().includes(p))
      const numberHit = streetNumber && new RegExp(`\\b${streetNumber}\\b`).test(combined)
      const streetNameHit = streetNoSuffix.length >= 3 && combined.toLowerCase().includes(streetNoSuffix.toLowerCase())
      if (!portalHit && !numberHit && !streetNameHit) continue
      const dateInfo = extractDate(combined)
      heuristic.push({
        title: r.title,
        url: r.url,
        description: r.description,
        date: dateInfo?.iso || null,
        dateLabel: dateInfo?.label || null,
        permitType: classifyPermitType(combined),
        confidence: numberHit && streetNameHit ? 'medium' : 'low',
        matchReasons: [portalHit ? 'Permit portal' : '', numberHit ? `Street # ${streetNumber}` : '', streetNameHit ? 'Street name' : ''].filter(Boolean),
        source: (() => { try { return new URL(r.url).hostname.replace(/^www\./, '') } catch { return 'web' } })(),
      })
    }
  }

  const byDateDesc = (a: any, b: any) => (b.date || '').localeCompare(a.date || '')
  const outPermits = [...ai.permits, ...heuristic.filter(h => h.permitType !== 'Violation')].sort(byDateDesc).slice(0, 15)
  const outViolations = [...ai.violations, ...heuristic.filter(h => h.permitType === 'Violation')].sort(byDateDesc).slice(0, 10)

  return {
    permits: outPermits,
    violations: outViolations,
    source: 'firecrawl' as const,
    debug: {
      queriesRun: queries.length,
      queriesOk,
      rawHits: rawAll.length,
      aiUsed: ai.aiUsed,
      aiError: (ai as any).aiError || null,
      note: outPermits.length + outViolations.length === 0
        ? (rawAll.length === 0 ? 'No web results returned. Portals may not be indexed publicly for this address.'
                               : 'Web results found but none matched this address. Try the record links below.')
        : null,
      rawSample: rawAll.slice(0, 5).map(r => ({ title: r.title, url: r.url })),
    },
  }
}

// ── ORCHESTRATOR: Official open-data first, Firecrawl fallback ────────────
async function fetchPermits(street: string, city: string, state: string, zip: string, ownerName?: string, parcelId?: string) {
  const [socrata, firecrawl] = await Promise.all([
    fetchPermitsFromSocrata(street, city, state, zip).catch(() => null),
    fetchPermitsViaFirecrawl(street, city, state, zip, ownerName, parcelId).catch(() => null),
  ])

  const officialPermits = socrata?.permits || []
  const officialViolations = socrata?.violations || []
  const webPermits = firecrawl?.permits || []
  const webViolations = firecrawl?.violations || []

  // Dedupe web results against official (skip web if same date+type already covered)
  const officialSig = new Set([...officialPermits, ...officialViolations].map(p => `${p.date}|${(p.permitType || '').toLowerCase()}`))
  const filteredWebP = webPermits.filter(p => !officialSig.has(`${p.date}|${(p.permitType || '').toLowerCase()}`))
  const filteredWebV = webViolations.filter(p => !officialSig.has(`${p.date}|${(p.permitType || '').toLowerCase()}`))

  const byDateDesc = (a: any, b: any) => (b.date || '').localeCompare(a.date || '')
  const permits = [...officialPermits, ...filteredWebP].sort(byDateDesc).slice(0, 20)
  const violations = [...officialViolations, ...filteredWebV].sort(byDateDesc).slice(0, 15)

  const sources: string[] = []
  if (socrata?.domain) sources.push(`Official: ${socrata.domain}`)
  if (firecrawl?.debug?.rawHits) sources.push(`Web: ${firecrawl.debug.rawHits} hits`)

  return {
    permits,
    violations,
    source: socrata?.domain ? 'open-data+web' : 'firecrawl',
    debug: {
      openData: socrata ? {
        domain: socrata.domain || null,
        dataset: socrata.dataset || null,
        matched: socrata.matched || 0,
        totalRowsScanned: socrata.totalRowsScanned || 0,
        checkedDomains: socrata.checked || [],
        available: !!socrata.domain,
      } : { available: false, note: 'City not in open-data registry map' },
      web: firecrawl?.debug || null,
      sources,
      totalRecords: permits.length + violations.length,
    },
  }
}

// ── DISTRESS SIGNALS via Firecrawl web search ─────────────────────────────
async function fetchDistressSignals(fullAddr: string) {
  const key = Deno.env.get('FIRECRAWL_API_KEY')
  if (!key) return { signals: [], source: 'unavailable' as const }
  const query = `"${fullAddr}" foreclosure OR "tax delinquent" OR probate OR "lis pendens" OR eviction`
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 5 }),
    })
    if (!res.ok) return { signals: [], source: 'error' as const }
    const data = await res.json()
    const results = data?.data?.web || data?.data || []
    const signals = results.map((r: any) => {
      const t = `${r.title || ''} ${r.description || ''}`.toLowerCase()
      const flags: string[] = []
      if (t.includes('foreclos')) flags.push('foreclosure')
      if (t.includes('tax')) flags.push('tax')
      if (t.includes('probate')) flags.push('probate')
      if (t.includes('lis pendens')) flags.push('lis-pendens')
      if (t.includes('evict')) flags.push('eviction')
      return { title: r.title, url: r.url, description: r.description, flags }
    }).filter((s: any) => s.flags.length > 0)
    return { signals, source: 'firecrawl' as const }
  } catch {
    return { signals: [], source: 'error' as const }
  }
}

// ── EXECUTIVE SUMMARY via AI gateway ──────────────────────────────────────
async function execSummary(context: Record<string, unknown>): Promise<string> {
  const key = Deno.env.get('LOVABLE_API_KEY')
  if (!key) return ''
  const system = `You are a senior real-estate acquisitions analyst for SGC General Contractors (VA/NC). Produce a professional, concise executive summary for a driving-for-dollars deep scan. Numbers first, risk second, exit third. No hedging.`
  const prompt = `Write a professional Deep Scan Executive Summary for this property. Structure it in short labeled sections:

**Bottom Line** — 2 sentence verdict.
**Why This Deal** — 3 bullets.
**Red Flags** — 3 bullets.
**Recommended Play** — flip, wholesale, or BRRRR with a target offer.
**Seller Approach Script** — 3-4 sentences you would say at the door.

DATA:
${JSON.stringify(context, null, 2)}`
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) return `AI summary unavailable (${res.status}).`
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  } catch {
    return ''
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json() as Body
    if (!body.address) {
      return new Response(JSON.stringify({ error: 'address is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const fullAddr = [body.address, body.city, body.state, body.zip].filter(Boolean).join(', ')
    const city = body.city || ''
    const state = body.state || ''

    // ── Per-step modes for client-side step-by-step UI ──────────────────
    if (body.mode === 'permits') {
      const r = await fetchPermitsViaFirecrawl(body.address, city, state, body.zip || '', body.ownerName, body.parcelId)
      return new Response(JSON.stringify(r), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (body.mode === 'distress') {
      const r = await fetchDistressSignals(fullAddr)
      return new Response(JSON.stringify(r), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (body.mode === 'summary') {
      const summary = await execSummary({ address: fullAddr, ...(body.context || {}) })
      return new Response(JSON.stringify({ summary }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Run everything in parallel
    const [photos, permits, distress, variants] = await Promise.all([
      invoke('property-photos', { address: body.address, city, state, zip: body.zip }).catch(e => ({ error: String(e) })),
      fetchPermitsViaFirecrawl(body.address, city, state, body.zip || '', body.ownerName, body.parcelId),
      fetchDistressSignals(fullAddr),
      body.deal
        ? invoke('ai-analysis', { mode: 'variants', deal: body.deal, provider: 'gemini' }).catch(e => ({ error: String(e) }))
        : Promise.resolve(null),
    ])

    const summary = await execSummary({
      address: fullAddr,
      deal: body.deal || null,
      permitsFound: permits.permits.length,
      violationsFound: permits.violations.length,
      distressSignals: distress.signals.map((s: any) => s.flags).flat(),
      photosFound: photos?.count || 0,
      recommendedStrategy: variants?.variants?.recommendedStrategy || null,
      topRisk: variants?.variants?.topRisk || null,
    })

    return new Response(JSON.stringify({
      address: fullAddr,
      generatedAt: new Date().toISOString(),
      photos: { list: photos?.photos || [], source: photos?.source || 'none', count: photos?.count || 0 },
      permits: { permits: permits.permits, violations: permits.violations, source: permits.source },
      distress,
      variants: variants?.variants || null,
      summary,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})