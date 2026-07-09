import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface Body {
  address: string
  city?: string
  state?: string
  zip?: string
}

// ── Address matching helpers ─────────────────────────────────────────────
function normalizeAddr(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|boulevard|blvd|highway|hwy|place|pl|terrace|ter|circle|cir|way|parkway|pkwy|suite|ste|apt|unit)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
function streetNumber(s: string): string | null {
  const m = (s || '').trim().match(/^\d+/)
  return m ? m[0] : null
}
function addressMatches(requested: string, candidate: string, zip?: string): boolean {
  if (!requested || !candidate) return false
  const reqNum = streetNumber(requested)
  const candNum = streetNumber(candidate)
  if (reqNum && candNum && reqNum !== candNum) return false
  const r = normalizeAddr(requested)
  const c = normalizeAddr(candidate)
  // Require the street number + at least one street-name token to appear in the candidate
  const tokens = r.split(' ').filter(t => t.length > 2)
  const matches = tokens.filter(t => c.includes(t)).length
  if (matches < Math.min(2, tokens.length)) return false
  if (zip && !candidate.includes(zip)) {
    // zip mismatch is a hard reject when we have it
    const zipInCandidate = candidate.match(/\b\d{5}\b/)
    if (zipInCandidate && zipInCandidate[0] !== zip) return false
  }
  return true
}

// ── Try RentCast listing (sale + rental) for a photo array ───────────────
async function rentcastPhotos(fullAddress: string, zip?: string): Promise<{ photos: string[]; matchedAddress?: string }> {
  const key = Deno.env.get('RENTCAST_API_KEY')
  if (!key) return { photos: [] }
  const endpoints = ['/listings/sale', '/listings/rental/long-term']
  for (const ep of endpoints) {
    try {
      const url = `https://api.rentcast.io/v1${ep}?address=${encodeURIComponent(fullAddress)}&limit=1`
      const res = await fetch(url, { headers: { 'X-Api-Key': key, Accept: 'application/json' } })
      if (!res.ok) continue
      const data = await res.json()
      const arr = Array.isArray(data) ? data : (data.listings || data.data || [])
      const first = arr[0]
      if (!first) continue
      const candAddr: string = first.formattedAddress || first.address || [first.addressLine1, first.city, first.state, first.zipCode].filter(Boolean).join(', ')
      if (!addressMatches(fullAddress, candAddr, zip)) continue
      const photos: string[] = first.photos || first.images || first.media?.photos || []
      const clean = (photos || []).filter((u: any) => typeof u === 'string' && /^https?:\/\//i.test(u))
      if (clean.length) return { photos: clean, matchedAddress: candAddr }
    } catch { /* try next */ }
  }
  return { photos: [] }
}

// ── Firecrawl scrape fallback (Zillow → Realtor) ─────────────────────────
async function firecrawlPhotos(fullAddress: string, zip?: string): Promise<{ photos: string[]; matchedAddress?: string }> {
  const key = Deno.env.get('FIRECRAWL_API_KEY')
  if (!key) return { photos: [] }
  const q = encodeURIComponent(fullAddress)
  const targets = [
    `https://www.zillow.com/homes/${q}_rb/`,
    `https://www.realtor.com/realestateandhomes-search/${q}`,
  ]
  for (const target of targets) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: target,
          formats: ['html', 'links'],
          onlyMainContent: false,
          waitFor: 2500,
        }),
      })
      if (!res.ok) continue
      const data = await res.json()
      const html: string = data?.data?.html || data?.html || ''
      const links: string[] = data?.data?.links || data?.links || []

      // Verify the scraped page actually references the requested address.
      // Search-result pages can render OTHER nearby listings — never accept those.
      const reqNum = streetNumber(fullAddress)
      const streetTokens = normalizeAddr(fullAddress).split(' ').filter(t => t.length > 2).slice(0, 4)
      const htmlLower = html.toLowerCase()
      const numHits = reqNum ? (htmlLower.match(new RegExp(`\\b${reqNum}\\b`, 'g')) || []).length : 0
      const streetHit = streetTokens.some(t => htmlLower.includes(t))
      const zipHit = zip ? htmlLower.includes(zip) : true
      if (!reqNum || numHits < 1 || !streetHit || !zipHit) continue

      const urls = new Set<string>()
      // Extract from <img src=...>
      const imgRx = /<img[^>]+src=["']([^"']+)["']/gi
      let m
      while ((m = imgRx.exec(html)) !== null) urls.add(m[1])
      // Also scan links for image URLs
      for (const l of links) urls.add(l)
      // Filter to real listing photos
      const filtered = [...urls].filter(u => {
        if (!/^https?:\/\//i.test(u)) return false
        if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(u) && !/photos\.zillowstatic|rdcpix|ap\.rdcpix/i.test(u)) return false
        if (/sprite|logo|icon|avatar|profile|gravatar|badge|agent|broker|banner|ads?\/|advertis|placeholder|streetview|map|thumb/i.test(u)) return false
        // Only real listing-photo CDNs
        if (!/photos\.zillowstatic\.com|rdcpix\.com|ap\.rdcpix\.com|ssl\.cdn-redfin\.com/i.test(u)) return false
        return true
      })
      // Dedupe near-identical (same base name)
      const seen = new Set<string>()
      const out: string[] = []
      for (const u of filtered) {
        const base = u.split('?')[0].split('/').pop() || u
        if (seen.has(base)) continue
        seen.add(base)
        out.push(u)
        if (out.length >= 18) break
      }
      if (out.length) return { photos: out, matchedAddress: fullAddress }
    } catch { /* try next */ }
  }
  return { photos: [] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json() as Body
    const parts = [body.address, body.city, body.state, body.zip].filter(Boolean).join(', ')
    if (!parts) {
      return new Response(JSON.stringify({ error: 'address is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let result = await rentcastPhotos(parts, body.zip)
    let source: 'rentcast' | 'firecrawl' | 'none' = result.photos.length ? 'rentcast' : 'none'
    if (!result.photos.length) {
      const fc = await firecrawlPhotos(parts, body.zip)
      if (fc.photos.length) { result = fc; source = 'firecrawl' }
    }

    return new Response(JSON.stringify({
      photos: result.photos,
      source,
      count: result.photos.length,
      matchedAddress: result.matchedAddress || null,
      requestedAddress: parts,
      verified: result.photos.length > 0 && !!result.matchedAddress,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg, photos: [], source: 'none' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})