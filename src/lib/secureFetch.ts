/**
 * secureFetch — browser-side helpers that route paid APIs through our
 * signed-in edge functions. No API keys ever live in the browser.
 */
import { supabase } from '@/integrations/supabase/client'

/** Minimal Response-like object so existing call sites keep their shape. */
export interface LiteResponse {
  ok: boolean
  status: number
  json: () => Promise<any>
  text: () => Promise<string>
}

function lite(ok: boolean, status: number, data: any): LiteResponse {
  return {
    ok, status,
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data ?? {})),
  }
}

async function invoke(fn: string, body: unknown): Promise<LiteResponse> {
  try {
    const { data, error } = await supabase.functions.invoke(fn, { body })
    if (error) {
      const status = (error as any)?.context?.status ?? 500
      let payload: any = { error: error.message }
      try { payload = await (error as any).context.json() } catch { /* keep message */ }
      return lite(false, status, payload)
    }
    return lite(true, 200, data)
  } catch (e: any) {
    return lite(false, 0, { error: e?.message || 'Network error' })
  }
}

/** RentCast GET via the `rentcast` edge function (server-side key). */
export function rentcastFetch(path: string, params: Record<string, string>): Promise<LiteResponse> {
  return invoke('rentcast', { path, params })
}

/** Anthropic Messages API via the `anthropic-proxy` edge function (server-side key). */
export function anthropicFetch(payload: Record<string, unknown>): Promise<LiteResponse> {
  return invoke('anthropic-proxy', { payload })
}

/** Tracerfy via the `skip-trace` edge function (server-side key). */
export function skipTraceFetch(action: 'lookup' | 'balance', body?: Record<string, unknown>): Promise<LiteResponse> {
  return invoke('skip-trace', { action, ...(body || {}) })
}

/** One-time cleanup of legacy browser-stored keys (server holds them now). */
export function purgeLegacyBrowserKeys(): void {
  for (const k of ['fscan_rentcast', 'fscan_anthropic', 'fscan_tracer', 'fscan_attom', 'fscan_supabase_url', 'fscan_supabase_anon']) {
    try { localStorage.removeItem(k) } catch { /* ignore */ }
  }
}
