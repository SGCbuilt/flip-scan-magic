import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// ── Owner Lookup: layered public-record fallback ──────────────────────────
// Ladder (first hit wins):
//   1. RentCast /properties
//   2. RentCast /avm/value
//   3. RentCast /listings/sale
//   4. Firecrawl search of assessor/register-of-deeds/tax/GIS sites,
//      then a small Lovable-AI extraction pass to pull owner name.
// Returns a unified record with a `source` label the UI displays as a badge.

const RENTCAST_BASE = 'https://api.rentcast.io/v1'

type OwnerHit = {
  hit: true
  name: string
  mailingAddr: string
  absenteeOwner: boolean
  ownerType: 'Individual' | 'Organization' | ''
  source: 'rentcast_property' | 'rentcast_avm' | 'rentcast_listing' | 'firecrawl_county'
  sourceLabel: string
  sourceUrl?: string
  raw?: unknown
}

const MISS = { hit: false as const, name: '', mailingAddr: '', absenteeOwner: false, ownerType: '' as const, source: 'none' as const, sourceLabel: '' }

function joinName(o: any): string {
  if (!o) return ''
  if (typeof o.names === 'string' && o.names.trim()) return o.names.trim()
  if (Array.isArray(o.names) && o.names.length) return o.names.filter(Boolean).join(' & ')
  if (typeof o.ownerNames === 'string' && o.ownerNames.trim()) return o.ownerNames.trim()
  if (Array.isArray(o.ownerNames) && o.ownerNames.length) return o.ownerNames.filter(Boolean).join(' & ')
  if (typeof o.ownerName === 'string' && o.ownerName.trim()) return o.ownerName.trim()
  const parts = [o.firstName, o.middleName, o.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  if (typeof o.name === 'string') return o.name.trim()
  return ''
}

function joinMailing(m: any): string {
  if (!m) return ''
  if (typeof m === 'string') return m
  const line = [m.addressLine1 || m.streetAddress || m.address, m.addressLine2].filter(Boolean).join(' ')
  const city = [m.city, m.state].filter(Boolean).join(', ')
  return [line, city, m.zipCode || m.zip].filter(Boolean).join(', ')
}

function normalizeZip(zip: string) { return String(zip || '').match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || '' }
function normalizeState(state: string) { const s = String(state || '').trim().toUpperCase(); return /^[A-Z]{2}$/.test(s) ? s : '' }

async function rentcastCall(key: string, path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${RENTCAST_BASE}${path}?${qs}`, { headers: { 'X-Api-Key': key } })
  if (!res.ok) { await res.text().catch(() => ''); return null }
  try { return await res.json() } catch { return null }
}

function extractOwnerFromRecord(rec: any): { name: string; mailingAddr: string; absentee: boolean; ownerType: '' | 'Individual' | 'Organization' } | null {
  if (!rec) return null
  const owner = rec.owner || rec.ownerInfo || {}
  const name = joinName(owner) || joinName(rec)
  const mailingAddr = joinMailing(owner.mailingAddress || rec.ownerMailingAddress || rec.mailingAddress)
  if (!name && !mailingAddr) return null
  const absentee = !!(owner.ownerOccupied === false || rec.ownerOccupied === false)
  const ownerType = (owner.type === 'Organization' || owner.type === 'Individual') ? owner.type : ''
  return { name, mailingAddr, absentee, ownerType }
}

function buildAttempts(address: string, city: string, state: string, zip: string) {
  const full = [address, city, state, zip].map(x => String(x || '').trim()).filter(Boolean).join(', ')
  const split = { address: String(address || '').trim(), city: String(city || '').trim(), state: normalizeState(state), zipCode: normalizeZip(zip) }
  const attempts: Record<string, string>[] = []
  const seen = new Set<string>()
  const push = (p: Record<string, string>) => {
    const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v)) as Record<string, string>
    if (!Object.keys(clean).length) return
    const k = JSON.stringify(clean)
    if (seen.has(k)) return
    seen.add(k); attempts.push(clean)
  }
  push({ address: full })
  push(split)
  push({ address: split.address })
  return attempts
}

async function tryRentcast(key: string, attempts: Record<string, string>[], path: string, source: OwnerHit['source'], sourceLabel: string): Promise<OwnerHit | null> {
  for (const params of attempts) {
    const data = await rentcastCall(key, path, params)
    if (!data) continue
    const arr: any[] = Array.isArray(data) ? data : (data.properties || data.data || (data.owner ? [data] : []))
    for (const rec of arr) {
      const info = extractOwnerFromRecord(rec)
      if (info?.name) return { hit: true, name: info.name, mailingAddr: info.mailingAddr, absenteeOwner: info.absentee, ownerType: info.ownerType, source, sourceLabel, raw: rec }
    }
  }
  return null
}

// ── Firecrawl + AI county-record fallback ─────────────────────────────────
async function tryFirecrawlCounty(fullAddr: string, city: string, state: string): Promise<OwnerHit | null> {
  const fcKey = Deno.env.get('FIRECRAWL_API_KEY')
  const aiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!fcKey) return null

  const query = `"${fullAddr}" ${city} ${state} (owner OR "owner of record" OR "property owner") (assessor OR "tax records" OR "register of deeds" OR gis OR parcel)`
  const searchRes = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${fcKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 5 }),
  }).catch(() => null)
  if (!searchRes || !searchRes.ok) return null
  const searchData = await searchRes.json().catch(() => null)
  const results: any[] = searchData?.data?.web || searchData?.data || []
  if (!results.length) return null

  // Simple heuristic pass first: look for "Owner: NAME" or "Owner Name: NAME"
  for (const r of results) {
    const blob = `${r.title || ''} \n ${r.description || ''}`
    const m = blob.match(/(?:owner(?:\s*name)?|owned by|owner of record)\s*[:\-]?\s*([A-Z][A-Z .,'&/-]{4,80})/i)
    if (m) {
      const raw = m[1].replace(/\s{2,}/g, ' ').trim().replace(/[.,;]+$/, '')
      // reject obvious non-names
      if (!/^(the|a|an|and|of|county|city|records?|search)$/i.test(raw) && raw.length >= 4) {
        return {
          hit: true, name: raw, mailingAddr: '', absenteeOwner: false, ownerType: '',
          source: 'firecrawl_county', sourceLabel: 'County web record — verify',
          sourceUrl: r.url, raw: r,
        }
      }
    }
  }

  // AI extraction fallback across top 3 snippets
  if (!aiKey) return null
  const context = results.slice(0, 3).map((r, i) => `[${i + 1}] ${r.title || ''} — ${r.url || ''}\n${r.description || ''}`).join('\n\n')
  const prompt = `Public-record search results for the property "${fullAddr}". Extract the owner-of-record name and mailing address IF and ONLY IF a source clearly states it for THIS specific property. Do not guess. If nothing verifiable is present, return {"hit": false}.

Return STRICT JSON only:
{ "hit": true|false, "name": "<owner name>", "mailingAddr": "<mailing address or ''>", "sourceIndex": <1-based index of the result that contained it> }

RESULTS:
${context}`
  try {
    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You extract public-record owner data. You never invent names. Return strict JSON.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    })
    if (!aiRes.ok) return null
    const aiData = await aiRes.json()
    const raw = aiData.choices?.[0]?.message?.content || ''
    let clean = String(raw).trim()
    const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) clean = fence[1].trim()
    const parsed = JSON.parse(clean)
    if (!parsed?.hit || !parsed?.name) return null
    const idx = Math.max(0, Math.min((parsed.sourceIndex || 1) - 1, results.length - 1))
    return {
      hit: true,
      name: String(parsed.name).trim(),
      mailingAddr: String(parsed.mailingAddr || '').trim(),
      absenteeOwner: false, ownerType: '',
      source: 'firecrawl_county',
      sourceLabel: 'County web record — verify',
      sourceUrl: results[idx]?.url,
      raw: results[idx],
    }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { address, city, state, zip } = await req.json() as { address?: string; city?: string; state?: string; zip?: string }
    if (!address || !String(address).trim()) {
      return new Response(JSON.stringify({ error: 'address is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const attempts = buildAttempts(address, city || '', state || '', zip || '')
    const fullAddr = [address, city, state, zip].filter(Boolean).join(', ')
    const rcKey = Deno.env.get('RENTCAST_API_KEY') || ''

    const ladder: Array<() => Promise<OwnerHit | null>> = []
    if (rcKey) {
      ladder.push(() => tryRentcast(rcKey, attempts, '/properties',       'rentcast_property', 'RentCast records'))
      ladder.push(() => tryRentcast(rcKey, attempts, '/avm/value',        'rentcast_avm',      'RentCast AVM'))
      ladder.push(() => tryRentcast(rcKey, attempts, '/listings/sale',    'rentcast_listing',  'Active listing record'))
    }
    ladder.push(() => tryFirecrawlCounty(fullAddr, city || '', state || ''))

    for (const step of ladder) {
      try { const hit = await step(); if (hit) return new Response(JSON.stringify(hit), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) } catch {}
    }
    return new Response(JSON.stringify(MISS), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})