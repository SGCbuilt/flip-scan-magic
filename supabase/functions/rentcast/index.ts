import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const BASE = 'https://api.rentcast.io/v1'

const ENDPOINTS = {
  listings: '/listings/sale',
  markets: '/markets',
  comparables: '/properties/comparables/sale',
  properties: '/properties',
  avm: '/avm/value',
} as const

// Whitelist of full paths the client may request directly via `path`
const ALLOWED_PATHS = new Set<string>(Object.values(ENDPOINTS))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const key = Deno.env.get('RENTCAST_API_KEY')
    if (!key) throw new Error('RENTCAST_API_KEY is not configured')

    const body = await req.json() as {
      endpoint?: keyof typeof ENDPOINTS
      path?: string
      params: Record<string, string>
    }
    const { endpoint, path: rawPath, params } = body
    const path = endpoint ? ENDPOINTS[endpoint] : rawPath
    if (!path) throw new Error('endpoint or path is required')
    if (!ALLOWED_PATHS.has(path)) throw new Error(`Path not allowed: ${path}`)

    const qs = new URLSearchParams(params || {})
    const res = await fetch(`${BASE}${path}?${qs}`, {
      headers: { 'X-Api-Key': key },
    })
    const text = await res.text()
    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})