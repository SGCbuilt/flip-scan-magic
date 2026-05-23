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
    const { source, endpoint, queryParams } = await req.json()

    let url: string
    let headers: Record<string, string> = {}

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

    const upstream = await fetch(url, { headers })
    const data = await upstream.json()

    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
