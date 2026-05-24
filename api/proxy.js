/**
 * FlipScan Pro — Universal API Proxy (Vercel Serverless)
 * Handles: real estate APIs + Anthropic AI calls
 * All API keys live here as env vars — never in the browser
 */

const PROVIDERS = {
  attom:       { base: 'https://api.gateway.attomdata.com/propertyapi/v1.0.0', keyHeader: 'apikey',         envKey: 'ATTOM_API_KEY' },
  batchleads:  { base: 'https://api.batchleads.io/v1',                          keyHeader: 'Authorization', envKey: 'BATCHLEADS_API_KEY',  prefix: 'Bearer ' },
  propstream:  { base: 'https://api.propstream.com/v1',                          keyHeader: 'Authorization', envKey: 'PROPSTREAM_API_KEY',   prefix: 'Bearer ' },
  resimpli:    { base: 'https://api.resimpli.com/v1',                            keyHeader: 'Authorization', envKey: 'RESIMPLI_API_KEY',     prefix: 'Bearer ' },
  dealmachine: { base: 'https://api.dealmachine.com/v1',                         keyHeader: 'Authorization', envKey: 'DEALMACHINE_API_KEY',  prefix: 'Bearer ' },
  rentcast:    { base: 'https://api.rentcast.io/v1',                             keyHeader: 'X-Api-Key',     envKey: 'RENTCAST_API_KEY' },
  custom:      { base: '',                                                        keyHeader: 'Authorization', envKey: 'CUSTOM_API_KEY',       prefix: 'Bearer ' },
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const body = req.body || {}
  const { provider, endpoint, params = {}, method = 'GET', customBase, customKey } = body

  // ── Anthropic AI call ────────────────────────────────────────────────────────
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY || customKey
    if (!key) return res.status(401).json({
      error: 'No Anthropic API key configured',
      setup: 'Add ANTHROPIC_API_KEY to Vercel environment variables',
    })

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body.payload),
    })

    const data = await upstream.json().catch(() => ({}))
    return res.status(upstream.status).json(data)
  }

  // ── Real estate data providers ───────────────────────────────────────────────
  if (!provider || !endpoint) return res.status(400).json({ error: 'Missing provider + endpoint' })

  const cfg = PROVIDERS[provider]
  if (!cfg) return res.status(400).json({ error: `Unknown provider: ${provider}` })

  const apiKey = customKey || process.env[cfg.envKey]
  if (!apiKey) return res.status(401).json({
    error: `No API key for ${provider}`,
    setup: `Add ${cfg.envKey} to Vercel environment variables`,
  })

  const base = customBase || cfg.base
  const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
  const url = `${base}${endpoint}${qs}`

  try {
    const upstream = await fetch(url, {
      method,
      headers: {
        [cfg.keyHeader]: `${cfg.prefix || ''}${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      ...(body.body && method !== 'GET' ? { body: JSON.stringify(body.body) } : {}),
    })

    const data = await upstream.json().catch(() => ({}))
    return res.status(upstream.status).json({ provider, status: upstream.ok ? 'ok' : 'error', data })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
