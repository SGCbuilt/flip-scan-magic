import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface Body {
  address: string
  city?: string
  state?: string
  zip?: string
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
async function fetchPermitsViaFirecrawl(street: string, city: string, state: string, zip: string) {
  const key = Deno.env.get('FIRECRAWL_API_KEY')
  if (!key) return { permits: [], violations: [], source: 'unavailable' as const, queriesRun: 0 }

  // Normalize street: strip unit and trailing state/zip if the caller passed a full string
  const streetOnly = (street || '').split(',')[0].trim()
  const streetNoSuffix = streetOnly.replace(/\s+(st|street|rd|road|ave|avenue|dr|drive|ln|lane|ct|court|blvd|way|pl|place|ter|terrace|cir|circle|hwy|highway|pkwy|parkway)\.?$/i, '').trim()
  const cityLower = (city || '').toLowerCase().replace(/\s+/g, '')
  const stateLower = (state || '').toLowerCase()

  // Known permit portals in VA/NC + common national platforms
  const portalSites = [
    `${cityLower}.gov`,
    `${cityLower}${stateLower}.gov`,
    `city${cityLower}.gov`,
    `${cityLower}va.gov`,
    `${cityLower}nc.gov`,
    `${stateLower}.gov`,
    'accela.com',
    'aca-prod.accela.com',
    'energovweb.tylertech.com',
    'viewpointcloud.com',
    'opengov.com',
    'permits.com',
    'buildingeye.com',
    'citizenserve.com',
    'cloudpermit.com',
    'openpermit.co',
    'permitsearch.com',
    'shovels.ai',
    'bldrs.com',
  ]
  const siteFilter = portalSites.map(s => `site:${s}`).join(' OR ')

  // Multi-query: portal-scoped, unscoped, violations-only
  const queries = [
    `"${streetOnly}" ${city} ${state} (permit OR inspection OR "building permit" OR "trade permit" OR "electrical permit" OR "mechanical permit" OR "plumbing permit") (${siteFilter})`,
    `"${streetOnly}" ${city} ${state} permit history`,
    `"${streetNoSuffix}" ${city} ${state} permit`,
    `"${streetOnly}" ${zip || city} (violation OR "code enforcement" OR condemn OR "notice of violation" OR "unsafe structure")`,
  ]

  const permits: any[] = []
  const violations: any[] = []
  const seen = new Set<string>()

  await Promise.all(queries.map(async q => {
    try {
      const res = await fetch('https://api.firecrawl.dev/v2/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 8 }),
      })
      if (!res.ok) return
      const data = await res.json()
      const results = data?.data?.web || data?.data || []
      for (const r of results) {
        const url = r.url || ''
        if (!url || seen.has(url)) continue
        seen.add(url)
        const t = `${r.title || ''} ${r.description || ''}`.toLowerCase()
        // Loose relevance check: address token must appear somewhere OR result comes from a permit portal
        const streetHit = streetNoSuffix && (t.includes(streetNoSuffix.toLowerCase()) || url.toLowerCase().includes(streetNoSuffix.toLowerCase().replace(/\s+/g, '')))
        const portalHit = portalSites.some(p => url.toLowerCase().includes(p))
        if (!streetHit && !portalHit) continue
        const item = { title: r.title, url, description: r.description }
        if (t.includes('violation') || t.includes('condemn') || t.includes('code enforcement') || t.includes('unsafe')) violations.push(item)
        else if (t.includes('permit') || t.includes('inspection') || t.includes('license') || portalHit) permits.push(item)
      }
    } catch { /* swallow */ }
  }))

  return { permits: permits.slice(0, 12), violations: violations.slice(0, 8), source: 'firecrawl' as const, queriesRun: queries.length }
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
      const r = await fetchPermitsViaFirecrawl(body.address, city, state, body.zip || '')
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
      fetchPermitsViaFirecrawl(body.address, city, state, body.zip || ''),
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