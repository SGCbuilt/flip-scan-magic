import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface Body {
  address: string
  city?: string
  state?: string
  zip?: string
}

// ── Try RentCast listing (sale + rental) for a photo array ───────────────
async function rentcastPhotos(fullAddress: string): Promise<string[]> {
  const key = Deno.env.get('RENTCAST_API_KEY')
  if (!key) return []
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
      const photos: string[] = first.photos || first.images || first.media?.photos || []
      if (photos.length) return photos.filter((u: any) => typeof u === 'string')
    } catch { /* try next */ }
  }
  return []
}

// ── Firecrawl scrape fallback (Zillow → Realtor) ─────────────────────────
async function firecrawlPhotos(fullAddress: string): Promise<string[]> {
  const key = Deno.env.get('FIRECRAWL_API_KEY')
  if (!key) return []
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
        if (/sprite|logo|icon|avatar|profile|gravatar|badge/i.test(u)) return false
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
        if (out.length >= 24) break
      }
      if (out.length) return out
    } catch { /* try next */ }
  }
  return []
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

    let photos = await rentcastPhotos(parts)
    let source: 'rentcast' | 'firecrawl' | 'none' = photos.length ? 'rentcast' : 'none'
    if (!photos.length) {
      photos = await firecrawlPhotos(parts)
      if (photos.length) source = 'firecrawl'
    }

    return new Response(JSON.stringify({ photos, source, count: photos.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg, photos: [], source: 'none' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})