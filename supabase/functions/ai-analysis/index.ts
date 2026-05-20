import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface Body {
  prompt: string
  provider?: 'claude' | 'gemini'
}

async function callClaude(prompt: string): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.content?.[0]?.text || 'No analysis returned.'
}

async function callGemini(prompt: string): Promise<string> {
  const key = Deno.env.get('LOVABLE_API_KEY')
  if (!key) throw new Error('LOVABLE_API_KEY is not configured')
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro',
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limit exceeded. Please try again shortly.')
    if (res.status === 402) throw new Error('AI credits exhausted. Add credits in Settings → Workspace → Usage.')
    throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || 'No analysis returned.'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { prompt, provider = 'claude' } = await req.json() as Body
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const text = provider === 'gemini' ? await callGemini(prompt) : await callClaude(prompt)
    return new Response(JSON.stringify({ text, provider }), {
      status: 200,
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