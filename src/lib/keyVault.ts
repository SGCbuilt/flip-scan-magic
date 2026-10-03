/**
 * keyVault — syncs API keys between localStorage and Supabase per logged-in user.
 * All existing code keeps reading localStorage.getItem('fscan_*'); this just keeps
 * the cloud row and localStorage in sync.
 */

// localStorage key  →  DB column
export const KEY_MAP: Record<string, string> = {
  fscan_rentcast:      'rentcast',
  fscan_anthropic:     'anthropic',
  fscan_tracer:        'tracerfy',
  fscan_attom:         'attom',
  fscan_supabase_url:  'supabase_url',
  fscan_supabase_anon: 'supabase_anon',
}

const LS_KEYS = Object.keys(KEY_MAP)

/**
 * Paid-API keys (RentCast, Anthropic, Tracerfy, Attom) now live server-side.
 * On sign-in we only purge any legacy copies from the browser. The cloud
 * user_api_keys rows are left untouched.
 */
export async function hydrateKeysFromCloud(userId: string): Promise<void> {
  void userId
  clearLocalKeys()
}

/** No-op: keys are no longer pushed from the browser (avoids overwriting cloud rows). */
export async function pushKeysToCloud(userId: string): Promise<void> {
  void userId
}

/** Server-managed keys are never stored in the browser; other keys keep local storage. */
export async function saveKey(lsKey: string, value: string, userId?: string | null): Promise<void> {
  void userId
  if (KEY_MAP[lsKey]) return
  try { localStorage.setItem(lsKey, value) } catch {}
}

/** Clear key entries from localStorage (e.g. on sign out). */
export function clearLocalKeys(): void {
  for (const k of LS_KEYS) {
    try { localStorage.removeItem(k) } catch {}
  }
}