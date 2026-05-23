/**
 * Supabase Edge Function — Government API Proxy
 *
 * Proxies requests to government APIs that block browser CORS:
 *   - Census ACS 5-year demographic data
 *   - FBI UCR crime statistics
 *   - BLS (Bureau of Labor Statistics) unemployment
 *
 * Deploy: supabase functions deploy market-proxy
 *
 * Set these secrets in Supabase dashboard → Edge Functions → Secrets:
 *   CENSUS_API_KEY  — get free at api.census.gov/data/key_signup.html
 *   FBI_API_KEY     — get free at api.usa.gov/crime/fbi/api
 *   (BLS is free, no key needed)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { source, endpoint, queryParams, url: rawUrl } = body

    let url: string
    let headers: Record<string, string> = {}

    if (rawUrl) {
      const parsed = new URL(String(rawUrl))
      const allowedHosts = new Set([
        'api.census.gov', 'api.usa.gov', 'api.bls.gov',
        'data.norfolk.gov', 'data.richmondgov.com', 'data.henrico.us',
        'services1.arcgis.com', 'services.arcgis.com', 'gis.charlottenc.gov',
        'gisservices.chathamcountync.gov', 'gisweb.durhamnc.gov', 'maps.wakegov.com',
        'gis.forsyth.cc', 'gis.chesterfield.gov',
      ])

      if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
        return new Response(
          JSON.stringify({ error: 'URL is not allowed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      url = parsed.toString()
      headers = { 'Accept': 'application/json' }
    } else {

      switch (source) {
        case 'census': {
          const key = Deno.env.get('CENSUS_API_KEY') || ''
          const qs  = new URLSearchParams({ ...queryParams, key }).toString()
          url = `https://api.census.gov/data${endpoint}?${qs}`
          break
        }
        case 'fbi': {
          const key = Deno.env.get('FBI_API_KEY') || ''
          const qs  = new URLSearchParams(queryParams).toString()
          url = `https://api.usa.gov/crime/fbi/api${endpoint}?${qs}`
          headers = { 'api-key': key }
          break
        }
        case 'bls': {
          const qs = new URLSearchParams(queryParams).toString()
          url = `https://api.bls.gov/publicAPI/v2${endpoint}?${qs}`
          break
        }
        default:
          return new Response(
            JSON.stringify({ error: `Unknown source: ${source}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
      }
    }

    let upstream: Response
    try {
      upstream = await fetch(url, { headers })
    } catch (fetchErr: any) {
      return new Response(
        JSON.stringify({ ok: false, error: fetchErr?.message || 'Upstream network error' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const contentType = upstream.headers.get('content-type') || 'application/json'
    const data = contentType.includes('json') ? await upstream.json() : { text: await upstream.text() }

    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
