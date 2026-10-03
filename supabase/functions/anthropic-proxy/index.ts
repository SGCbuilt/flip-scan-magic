import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { requireUser } from '../_shared/edge-auth.ts'

/**
 * anthropic-proxy — forwards a Messages API payload to Anthropic using the
 * server-side ANTHROPIC_API_KEY. Signed-in users only, daily-capped.
 */
const ALLOWED_MODELS = new Set(['claude-sonnet-4-20250514', 'claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'])
const MAX_TOKENS = 4000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const gate = await requireUser(req, 'anthropic-proxy', corsHeaders)
  if (!gate.ok) return gate.response!

  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ error: 'ANTHROPIC_API_KEY is not configured' }, 500)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const p = body?.payload
  if (!p || typeof p !== 'object' || !Array.isArray(p.messages) || p.messages.length === 0) {
    return json({ error: 'payload.messages is required' }, 400)
  }
  const model = typeof p.model === 'string' && ALLOWED_MODELS.has(p.model) ? p.model : 'claude-sonnet-4-20250514'
  const payload: Record<string, unknown> = {
    model,
    max_tokens: Math.min(Math.max(Number(p.max_tokens) || 1000, 1), MAX_TOKENS),
    messages: p.messages,
  }
  if (typeof p.temperature === 'number') payload.temperature = p.temperature
  if (typeof p.system === 'string') payload.system = p.system

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  return new Response(text, { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
