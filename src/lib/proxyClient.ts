/**
 * proxyClient.ts — Universal API caller for FlipScan Pro
 *
 * In development (localhost):   calls provider API directly
 * In production (Vercel/Netlify): routes through /api/proxy (no CORS issues, keys stay secret)
 */

// Detect if we're running on Vercel or Netlify deployment
const isProduction = typeof window !== 'undefined' &&
  !window.location.hostname.includes('localhost') &&
  !window.location.hostname.includes('127.0.0.1')

const PROXY_URL = '/api/proxy'

export interface ProxyRequest {
  provider: string
  endpoint: string
  params?: Record<string, string | number>
  body?: any
  method?: 'GET' | 'POST'
  customBase?: string
  customKey?: string
}

export interface ProxyResponse<T = any> {
  ok: boolean
  data: T | null
  error?: string
  raw?: any
}

/**
 * Call any real estate API — works in browser with no CORS issues.
 * In development: calls provider directly (key in browser, fine for local testing)
 * In production:  routes through Vercel/Netlify serverless proxy
 */
export async function apiCall<T = any>(
  request: ProxyRequest,
  directHeaders?: Record<string, string>
): Promise<ProxyResponse<T>> {

  try {
    if (isProduction) {
      // ── Production: go through proxy ──────────────────────────────────────
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        return { ok: false, data: null, error: json.error || `HTTP ${res.status}`, raw: json }
      }

      return { ok: true, data: json.data as T, raw: json }

    } else {
      // ── Development: call provider directly ────────────────────────────────
      const cfg = DEV_CONFIGS[request.provider]
      if (!cfg && !request.customBase) {
        return { ok: false, data: null, error: `No dev config for provider: ${request.provider}. Add it to DEV_CONFIGS in proxyClient.ts` }
      }

      const base = request.customBase || cfg?.base || ''
      const qs = request.params ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(request.params).map(([k, v]) => [k, String(v)]))
      ).toString() : ''
      const url = `${base}${request.endpoint}${qs}`

      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...directHeaders,
        ...(cfg?.getHeaders(request.customKey) || {}),
      }

      const res = await fetch(url, {
        method: request.method || 'GET',
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      })

      const data = await res.json()
      if (!res.ok) return { ok: false, data: null, error: `${request.provider} API: HTTP ${res.status}`, raw: data }

      return { ok: true, data: data as T, raw: data }
    }
  } catch (err: any) {
    return { ok: false, data: null, error: err.message }
  }
}

/**
 * Development-only direct configs
 * Keys here are exposed in the browser — fine for local dev, NOT for production.
 * Production always uses the proxy where keys are stored as env variables.
 */
const DEV_CONFIGS: Record<string, { base: string; getHeaders: (customKey?: string) => Record<string, string> }> = {
  rentcast: {
    base: 'https://api.rentcast.io/v1',
    getHeaders: () => ({ 'X-Api-Key': (import.meta.env.VITE_RENTCAST_KEY as string) || localStorage.getItem('fscan_rentcast') || '' }),
  },
  attom: {
    base: 'https://api.gateway.attomdata.com/propertyapi/v1.0.0',
    getHeaders: (key) => ({ apikey: key || '' }),
  },
  batchleads: {
    base: 'https://api.batchleads.io/v1',
    getHeaders: (key) => ({ Authorization: `Bearer ${key || ''}` }),
  },
  propstream: {
    base: 'https://api.propstream.com/v1',
    getHeaders: (key) => ({ Authorization: `Bearer ${key || ''}` }),
  },
  resimpli: {
    base: 'https://api.resimpli.com/v1',
    getHeaders: (key) => ({ Authorization: `Bearer ${key || ''}` }),
  },
  dealmachine: {
    base: 'https://api.dealmachine.com/v1',
    getHeaders: (key) => ({ Authorization: `Bearer ${key || ''}` }),
  },
  custom: {
    base: '',
    getHeaders: (key) => ({ Authorization: `Bearer ${key || ''}`, 'X-Api-Key': key || '' }),
  },
}

/**
 * Pre-built queries for known providers
 * These are the exact endpoints that return motivated seller / distressed leads
 */
export const PROVIDER_QUERIES = {

  attom: {
    // Pre-foreclosure / distressed properties
    distressed: (state: string, months = 3) => ({
      provider: 'attom',
      endpoint: '/sale/snapshot',
      params: { state, startyear: new Date().getFullYear(), startmonth: new Date().getMonth() + 1 - months },
    }),
    // Property search by city
    byCity: (city: string, state: string, minEq = 30) => ({
      provider: 'attom',
      endpoint: '/property/snapshot',
      params: { city, state, minEquity: minEq },
    }),
    // Foreclosure auction data
    foreclosureAuctions: (state: string) => ({
      provider: 'attom',
      endpoint: '/property/foreclosureauction',
      params: { state, recordType: 'P' },  // P = pre-foreclosure
    }),
  },

  batchleads: {
    // Motivated sellers — absentee + high equity
    motivatedSellers: (city: string, state: string) => ({
      provider: 'batchleads',
      endpoint: '/properties',
      params: { city, state, absenteeOwner: 'true', minEquityPercent: 30, limit: 100 },
    }),
    // Pre-foreclosure list
    preForeclosure: (state: string, zip?: string) => ({
      provider: 'batchleads',
      endpoint: '/properties',
      params: { state, ...(zip ? { zip } : {}), preForeclosure: 'true', limit: 100 },
    }),
    // Tax delinquent
    taxDelinquent: (state: string) => ({
      provider: 'batchleads',
      endpoint: '/properties',
      params: { state, taxDelinquent: 'true', limit: 100 },
    }),
    // Skip trace a list of addresses
    skipTrace: (addresses: string[]) => ({
      provider: 'batchleads',
      endpoint: '/skiptrace',
      method: 'POST' as const,
      body: { addresses },
    }),
  },

  propstream: {
    distressedList: (city: string, state: string) => ({
      provider: 'propstream',
      endpoint: '/properties/search',
      params: { city, state, foreclosure: 'true', absentee: 'true', limit: 100 },
    }),
  },

  resimpli: {
    leads: (city: string, state: string) => ({
      provider: 'resimpli',
      endpoint: '/leads',
      params: { city, state, status: 'new', limit: 100 },
    }),
  },
}
