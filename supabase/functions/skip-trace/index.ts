import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { requireUser } from '../_shared/edge-auth.ts'

/**
 * skip-trace — forwards Tracerfy lookups using the server-side TRACERFY_API_KEY.
 * Signed-in users only, daily-capped. Same request/response fields as before.
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const s = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const gate = await requireUser(req, 'skip-trace', corsHeaders)
  if (!gate.ok) return gate.response!

  const key = Deno.env.get('TRACERFY_API_KEY')
  if (!key) return json({ error: 'TRACERFY_API_KEY is not configured' }, 500)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  if (body?.action === 'balance') {
    const res = await fetch('https://www.tracerfy.com/v1/api/account/summary/', {
      headers: { 'Authorization': `Api-Key ${key}` },
    })
    return new Response(await res.text(), { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const address = s(body?.address)
  if (!address) return json({ error: 'address is required' }, 400)
  const res = await fetch('https://www.tracerfy.com/v1/api/lead-builder/lookup/', {
    method: 'POST',
    headers: { 'Authorization': `Api-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, city: s(body?.city), state: s(body?.state, 20), zip_code: s(body?.zip_code, 20) }),
  })
  return new Response(await res.text(), { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
