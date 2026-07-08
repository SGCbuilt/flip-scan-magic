import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface Body {
  prompt?: string
  provider?: 'claude' | 'gemini'
  system?: string
  mode?: 'text' | 'variants'
  deal?: Record<string, unknown>
}

const DEFAULT_SYSTEM = `You are a senior fix-and-flip acquisitions analyst for SGC General Contractors, operating in Virginia and North Carolina.
You think like an experienced investor: numbers first, risk second, exit third. Be direct, specific, and quantitative — never generic.
When given a deal, always tie every conclusion back to the actual figures provided (price, ARV, rehab, ROI, DOM, 70% rule).
Call out red flags (age, structural risk, thin margin, overpriced list, low DOM = weak leverage) and give a concrete recommended max offer.
Format output as tight bullet points. Do not hedge. Do not repeat the input data back verbatim.`

const VARIANTS_SYSTEM = `You are a senior real-estate investment strategist for SGC General Contractors (VA/NC).
Given a deal snapshot, return STRICT JSON only — no markdown, no prose outside the JSON.
Every dollar figure must be an integer (no $ signs, no commas). Be specific and grounded in the numbers provided.`

const VARIANTS_PROMPT_TEMPLATE = (d: Record<string, unknown>) => `DEAL:
${JSON.stringify(d, null, 2)}

Return JSON exactly matching this schema (no other keys, no text outside JSON):
{
  "flip": {
    "verdict": "Pursue" | "Negotiate" | "Pass",
    "maxOffer": <int>,
    "projectedProfit": <int>,
    "roiPct": <number>,
    "reasoning": "<one tight sentence tied to numbers>"
  },
  "wholesale": {
    "verdict": "Pursue" | "Negotiate" | "Pass",
    "assignmentFeeLow": <int>,
    "assignmentFeeHigh": <int>,
    "buyerProfile": "<who buys this — cash flipper, landlord, owner-occ>",
    "reasoning": "<one sentence>"
  },
  "rental": {
    "verdict": "Pursue" | "Negotiate" | "Pass",
    "monthlyRent": <int>,
    "monthlyCashflow": <int>,
    "capRatePct": <number>,
    "refiPotential": "<Strong | Moderate | Weak — one sentence why>",
    "reasoning": "<one sentence>"
  },
  "rehabTiers": {
    "light":  { "scope": "<one sentence>", "cost": <int>, "arvImpact": <int> },
    "medium": { "scope": "<one sentence>", "cost": <int>, "arvImpact": <int> },
    "heavy":  { "scope": "<one sentence>", "cost": <int>, "arvImpact": <int> }
  },
  "recommendedStrategy": "flip" | "wholesale" | "rental",
  "topRisk": "<single biggest risk in one sentence>"
}`

async function callClaude(prompt: string, system: string): Promise<string> {
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
      max_tokens: 1500,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 429) throw new Error('Claude rate limit exceeded. Try again shortly.')
    if (res.status === 401) throw new Error('Claude API key invalid — check ANTHROPIC_API_KEY secret.')
    throw new Error(`Claude ${res.status}: ${body}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text || 'No analysis returned.'
}

async function callGemini(prompt: string, system: string, jsonMode = false): Promise<string> {
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
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
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
    const body = await req.json() as Body
    const provider = body.provider || 'gemini'

    // ── VARIANTS mode: structured JSON with flip/wholesale/rental/rehab tiers
    if (body.mode === 'variants') {
      if (!body.deal || typeof body.deal !== 'object') {
        return new Response(JSON.stringify({ error: 'deal object is required for variants mode' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const prompt = VARIANTS_PROMPT_TEMPLATE(body.deal)
      const raw = provider === 'claude'
        ? await callClaude(prompt, VARIANTS_SYSTEM)
        : await callGemini(prompt, VARIANTS_SYSTEM, true)
      // Extract JSON from response (strip fences if any)
      let clean = raw.trim()
      const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fence) clean = fence[1].trim()
      let variants: unknown
      try { variants = JSON.parse(clean) } catch {
        return new Response(JSON.stringify({ error: 'AI returned malformed JSON', raw }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ variants, provider }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { prompt, system = DEFAULT_SYSTEM } = body
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const text = provider === 'claude'
      ? await callClaude(prompt, system)
      : await callGemini(prompt, system)
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