/**
 * Supabase Client — FlipScan Pro
 *
 * Used for:
 *   1. Edge Function proxy — routes government API calls through Supabase
 *      so Census/FBI/BLS work from the browser without CORS issues
 *   2. Future: cloud sync for pipeline + tasks (currently localStorage only)
 *
 * Setup in Lovable:
 *   1. Go to lovable.dev → your project → Settings → Integrations → Supabase
 *   2. Click "Connect Supabase" — Lovable handles the env vars automatically
 *   3. Your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env
 *
 * Manual setup (if not using Lovable's integration):
 *   Create .env in project root:
 *     VITE_SUPABASE_URL=https://your-project.supabase.co
 *     VITE_SUPABASE_ANON_KEY=your-anon-key
 *
 * Edge function for government API proxy lives at:
 *   supabase/functions/market-proxy/index.ts
 */

// ── Config ────────────────────────────────────────────────────────────────────
// Reads from Vite env vars (set by Lovable automatically, or manually in .env)
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string | undefined
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Also allow runtime keys stored in localStorage (from Configure panel in app)
function getUrl():  string { return SUPABASE_URL  || (typeof localStorage !== 'undefined' ? localStorage.getItem('fscan_supabase_url')  || '' : '') }
function getAnon(): string { return SUPABASE_ANON || (typeof localStorage !== 'undefined' ? localStorage.getItem('fscan_supabase_anon') || '' : '') }

export function isSupabaseConfigured(): boolean {
  return !!(getUrl() && getAnon())
}

export function getSupabaseConfig() {
  return { url: getUrl(), anon: getAnon() }
}

// ── Edge Function caller ───────────────────────────────────────────────────────
/**
 * Call a Supabase Edge Function.
 * Used to proxy government API calls that have CORS issues in the browser.
 */
export async function callEdgeFunction<T = any>(
  fnName: string,
  body: Record<string, any>
): Promise<T | null> {
  const url  = getUrl()
  const anon = getAnon()
  if (!url || !anon) {
    console.warn('[Supabase] Not configured — connect Supabase in Lovable Settings → Integrations')
    return null
  }

  try {
    const res = await fetch(`${url}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${anon}`,
        'apikey':         anon,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.warn(`[Supabase] Edge function ${fnName} failed: ${res.status} ${err.slice(0,200)}`)
      return null
    }

    return await res.json() as T
  } catch (e: any) {
    console.warn(`[Supabase] Edge function ${fnName} error:`, e?.message)
    return null
  }
}

// ── Government API proxy via Edge Function ────────────────────────────────────
/**
 * Calls the market-proxy edge function which handles:
 *   - Census ACS 5-year demographic data
 *   - FBI UCR crime rates
 *   - BLS unemployment
 *
 * These APIs block browser requests due to CORS — Supabase edge function
 * acts as a server-side proxy.
 */
export async function proxyGovApi(params: {
  source: 'census' | 'fbi' | 'bls'
  endpoint: string
  queryParams: Record<string, string>
}): Promise<any> {
  return callEdgeFunction('market-proxy', params)
}

// ── Supabase Edge Function source (deploy to supabase/functions/market-proxy/index.ts) ──
// The actual edge function code is in /supabase/functions/market-proxy/index.ts
// It's included in the project root so you can deploy it with: supabase deploy

// ── Send Daily Digest Email ───────────────────────────────────────────────────
/**
 * Triggers the daily-digest edge function which scans lead sources
 * and emails the morning brief to projects@sgcbuilt.com
 *
 * Called automatically by pg_cron at 6 AM ET.
 * Can also be triggered manually from the Morning Brief tab.
 */
export async function sendDailyDigest(taskCount: number, overdueCount: number): Promise<{
  success: boolean; leadsFound?: number; error?: string
}> {
  const result = await callEdgeFunction<{ success: boolean; leadsFound: number; error?: string }>(
    'daily-digest',
    { source: 'manual', taskCount, overdueCount }
  )

  if (!result) {
    return { success: false, error: 'Supabase not configured or edge function failed' }
  }

  return result
}
