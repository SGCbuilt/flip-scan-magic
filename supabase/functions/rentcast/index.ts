import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const BASE = 'https://api.rentcast.io/v1'

const ENDPOINTS = {
  listings: '/listings/sale',
  markets: '/markets',
  comparables: '/properties/comparables/sale',
} as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const key = Deno.env.get('RENTCAST_API_KEY')
    if (!key) throw new Error('RENTCAST_API_KEY is not configured')

    const { endpoint, params } = await req.json() as {
      endpoint: keyof typeof ENDPOINTS
      params: Record<string, string>
    }
    const path = ENDPOINTS[endpoint]
    if (!path) throw new Error(`Unknown endpoint: ${endpoint}`)

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