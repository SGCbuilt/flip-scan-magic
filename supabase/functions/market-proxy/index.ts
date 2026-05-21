/**
 * Supabase Edge Function: market-proxy
 *
 * PURPOSE: Proxy calls to government APIs that don't support browser CORS.
 * This runs on Supabase servers (not the browser), so CORS is not an issue.
 *
 * APIs proxied:
 *   - api.census.gov  (Census ACS demographics)
 *   - api.usa.gov     (FBI UCR crime data)
 *   - api.bls.gov     (BLS unemployment)
 *
 * HOW TO DEPLOY IN LOVABLE:
 * Paste this into Lovable chat:
 * "Create a Supabase Edge Function called market-proxy that accepts a POST
 *  request with { url: string, headers?: Record<string,string> } and fetches
 *  that URL server-side, returning the JSON response. Add CORS headers."
 *
 * Then paste this file content when Lovable asks for the function code.
 *
 * ALLOWED URLS (whitelist for security):
 *   api.census.gov, api.usa.gov, api.bls.gov
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const ALLOWED_HOSTS = [
  'api.census.gov',
  'api.usa.gov',
  'api.bls.gov',
  'geocoding.geo.census.gov',
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { url, headers = {} } = await req.json()

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing url' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Security: only allow whitelisted government APIs
    const host = new URL(url).hostname
    if (!ALLOWED_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) {
      return new Response(JSON.stringify({ error: `Host not allowed: ${host}` }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const upstream = await fetch(url, {
      headers: { 'Accept': 'application/json', ...headers },
      signal: AbortSignal.timeout(15000),
    })

    const data = await upstream.json()

    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
