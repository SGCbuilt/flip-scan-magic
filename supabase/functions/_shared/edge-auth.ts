/**
 * edge-auth — shared gate for paid/proxy edge functions.
 *
 * Passes:  service-role key or cron secret (via isPrivilegedToken) — uncapped.
 *          a real signed-in user (auth.getUser) — counted against a daily cap.
 * Rejects: no token, the bare anon key, invalid/expired JWTs, over-cap users.
 *
 * legacyAnonLimit: LEGACY_ANON_UNTIL_PUBLISH — temporarily accepts the bare
 * anon key (shared daily cap) for callers still on the old published frontend.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { isPrivilegedToken } from './flipscan-store.ts'

export const DAILY_CAPS: Record<string, number> = {
  'rentcast': 400,
  'market-proxy': 500,
  'ai-analysis': 150,
  'anthropic-proxy': 200,
  'deep-scan': 100,
  'property-photos': 150,
  'owner-lookup': 200,
  'chatham-permits': 200,
  'transcribe-audio': 200,
  'skip-trace': 200,
  'daily-digest': 10,
}

export interface GateResult {
  ok: boolean
  response?: Response
  system?: boolean
  userId?: string
}

export async function requireUser(
  req: Request,
  fn: string,
  corsHeaders: Record<string, string>,
  opts: { legacyAnonLimit?: number } = {},
): Promise<GateResult> {
  const deny = (status: number, error: string): GateResult => ({
    ok: false,
    response: new Response(JSON.stringify({ error }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }),
  })

  const url = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  if (!url || !serviceKey) return deny(500, 'Server not configured')

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return deny(401, 'Sign in required')

  if (await isPrivilegedToken(createClient, url, serviceKey, token)) return { ok: true, system: true }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const cap = DAILY_CAPS[fn] ?? 100

  const consume = async (key: string, limit: number): Promise<boolean> => {
    const { data, error } = await admin.rpc('consume_edge_quota', { _user_key: key, _fn: fn, _limit: limit })
    if (error) { console.error('quota check failed', error.message); return true } // fail open on counter error only
    return data === true
  }

  // LEGACY_ANON_UNTIL_PUBLISH — remove this block after the new frontend is published.
  if (opts.legacyAnonLimit && isProjectAnonKey(token, anonKey, url)) {
    if (!(await consume('legacy-anon', opts.legacyAnonLimit))) return deny(429, 'Daily limit reached')
    return { ok: true }
  }

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return deny(401, 'Sign in required')

  if (!(await consume(data.user.id, cap))) {
    return deny(429, `Daily limit reached for ${fn} (${cap}/day). Try again tomorrow.`)
  }
  return { ok: true, userId: data.user.id }
}

// LEGACY_ANON_UNTIL_PUBLISH — the old frontend sends this project's public anon
// JWT. Matches the env anon key, or a JWT whose claims are role=anon for this
// project ref. Shared daily cap applies. Remove with the legacy block.
function isProjectAnonKey(token: string, anonKey: string, url: string): boolean {
  if (anonKey && token === anonKey) return true
  try {
    const ref = new URL(url).hostname.split('.')[0]
    const part = token.split('.')[1]
    if (!part) return false
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return claims?.role === 'anon' && claims?.ref === ref
  } catch { return false }
}
