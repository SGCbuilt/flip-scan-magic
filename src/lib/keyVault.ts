/**
 * keyVault — syncs API keys between localStorage and Supabase per logged-in user.
 * All existing code keeps reading localStorage.getItem('fscan_*'); this just keeps
 * the cloud row and localStorage in sync.
 */
import { supabase } from '@/integrations/supabase/client'

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

/** Pull the user's keys from the cloud → write into localStorage. */
export async function hydrateKeysFromCloud(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return
  for (const [ls, col] of Object.entries(KEY_MAP)) {
    const val = (data as any)[col]
    if (val) {
      try { localStorage.setItem(ls, val) } catch {}
    }
  }
}

/** Push current localStorage keys → cloud (upsert). Call after a key is saved. */
export async function pushKeysToCloud(userId: string): Promise<void> {
  const row: Record<string, any> = { user_id: userId }
  for (const [ls, col] of Object.entries(KEY_MAP)) {
    row[col] = localStorage.getItem(ls) || null
  }
  await supabase.from('user_api_keys').upsert(row, { onConflict: 'user_id' })
}

/** Save one key both locally and to the cloud. */
export async function saveKey(lsKey: string, value: string, userId?: string | null): Promise<void> {
  try { localStorage.setItem(lsKey, value) } catch {}
  if (userId && KEY_MAP[lsKey]) {
    const row: any = { user_id: userId, [KEY_MAP[lsKey]]: value }
    await supabase.from('user_api_keys').upsert(row, { onConflict: 'user_id' })
  }
}

/** Clear key entries from localStorage (e.g. on sign out). */
export function clearLocalKeys(): void {
  for (const k of LS_KEYS) {
    try { localStorage.removeItem(k) } catch {}
  }
}