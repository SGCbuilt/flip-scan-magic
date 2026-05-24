/**
 * FlipScan Pro — API Proxy (Netlify Functions version)
 * Same logic as /api/proxy.js but packaged for Netlify
 *
 * Deploy: this file auto-detected by Netlify at netlify/functions/proxy.js
 * Invoke: POST /.netlify/functions/proxy
 */

const PROVIDERS = {
  attom:      { base: 'https://api.gateway.attomdata.com/propertyapi/v1.0.0', keyEnv: 'ATTOM_API_KEY',      keyHeader: 'apikey' },
  batchleads: { base: 'https://api.batchleads.io/v1',                          keyEnv: 'BATCHLEADS_API_KEY', keyHeader: 'Authorization', keyPrefix: 'Bearer ' },
  propstream: { base: 'https://api.propstream.com/v1',                          keyEnv: 'PROPSTREAM_API_KEY', keyHeader: 'Authorization', keyPrefix: 'Bearer ' },
  resimpli:   { base: 'https://api.resimpli.com/v1',                            keyEnv: 'RESIMPLI_API_KEY',   keyHeader: 'Authorization', keyPrefix: 'Bearer ' },
  dealmachine:{ base: 'https://api.dealmachine.com/v1',                         keyEnv: 'DEALMACHINE_API_KEY',keyHeader: 'Authorization', keyPrefix: 'Bearer ' },
  rentcast:   { base: 'https://api.rentcast.io/v1',                             keyEnv: 'RENTCAST_API_KEY',   keyHeader: 'X-Api-Key' },
  custom:     { base: '', keyEnv: 'CUSTOM_API_KEY', keyHeader: 'Authorization', keyPrefix: 'Bearer ' },
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Use POST' }) }

  let parsed
  try { parsed = JSON.parse(event.body || '{}') } catch { parsed = {} }

  const { provider, endpoint, params = {}, body, method = 'GET', customBase, customKey } = parsed
  if (!provider || !endpoint) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Need provider + endpoint' }) }

  const cfg = PROVIDERS[provider]
  if (!cfg) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: `Unknown provider: ${provider}` }) }

  const apiKey = customKey || process.env[cfg.keyEnv]
  if (!apiKey) {
    return {
      statusCode: 401, headers: cors,
      body: JSON.stringify({
        error: `No API key for ${provider}`,
        setup: `Add ${cfg.keyEnv} to Netlify environment variables`,
        netlifyDocs: 'https://docs.netlify.com/environment-variables/overview/',
      })
    }
  }

  const base = customBase || cfg.base
  const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
  const url = `${base}${endpoint}${qs}`
  const headers = {
    [cfg.keyHeader]: `${cfg.keyPrefix || ''}${apiKey}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }

  try {
    const upstream = await fetch(url, {
      method,
      headers,
      ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    })
    const data = await upstream.json().catch(() => ({}))
    return {
      statusCode: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, status: upstream.ok ? 'ok' : 'error', data }),
    }
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) }
  }
}
