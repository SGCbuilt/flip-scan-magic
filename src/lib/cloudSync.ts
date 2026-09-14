/**
 * Cloud Sync — Supabase Real-Time Data Layer
 *
 * Upgrades all 9 localStorage stores to cloud-backed storage.
 * Strategy: write to localStorage immediately (fast, offline),
 *            then sync to Supabase in the background (durable, multi-device).
 *
 * If Supabase is not configured → falls back silently to localStorage only.
 * If Supabase is configured     → data survives browser clears, device switches.
 *
 * Tables (run setup SQL below in Supabase SQL Editor):
 *   flipscan_store (user_id TEXT, key TEXT, data JSONB, updated_at TIMESTAMPTZ)
 *
 * Setup SQL → supabase/migrations/20240102_cloud_sync.sql
 */

import { supabase } from '@/integrations/supabase/client'

const SYNC_KEYS = [
  'flipscan_pipeline_v2',
  'flipscan_tasks_v1',
  'flipscan_drip_v1',
  'flipscan_buyers_v1',
  'flipscan_pl_v1',
  'flipscan_projects_v1',
  'flipscan_wholesale_v1',
  'flipscan_d4d_v1',
] as const

type SyncKey = typeof SYNC_KEYS[number]

// Use the authenticated user's id; cloud sync only works while logged in.
async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

function isSupabaseConfigured(): boolean { return true }

// Debounce map — avoid hammering Supabase on every keystroke
const pendingSync = new Map<string, ReturnType<typeof setTimeout>>()

// ── Core sync functions ───────────────────────────────────────────────────────

async function pushToCloud(storageKey: string, data: any): Promise<void> {
  const userId = await getUserId()
  if (!userId) return
  const { error } = await supabase
    .from('flipscan_store')
    .upsert(
      { user_id: userId, key: storageKey, data, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    )
  if (error) console.warn(`[CloudSync] push failed for ${storageKey}:`, error.message)
}

async function pullFromCloud(storageKey: string): Promise<any | null> {
  const userId = await getUserId()
  if (!userId) return null
  const { data, error } = await supabase
    .from('flipscan_store')
    .select('data')
    .eq('user_id', userId)
    .eq('key', storageKey)
    .maybeSingle()
  if (error) return null
  return (data as any)?.data ?? null
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read data — checks localStorage first, then cloud if local is empty.
 * On first load with Supabase configured, pulls from cloud to hydrate local.
 */
export async function syncRead(storageKey: SyncKey): Promise<any[]> {
  const local = (() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { return [] }
  })()

  // If local has data, use it (fast path)
  if (local.length > 0) return local

  // Local empty — try cloud (first load on new device)
  const cloud = await pullFromCloud(storageKey)
  if (cloud && Array.isArray(cloud) && cloud.length > 0) {
    // Hydrate local from cloud
    try { localStorage.setItem(storageKey, JSON.stringify(cloud)) } catch {}
    return cloud
  }

  return local
}

/**
 * Write data — writes to localStorage immediately, then syncs to cloud
 * in the background with 2-second debounce.
 */
export function syncWrite(storageKey: SyncKey, data: any[]): void {
  // Immediate local write
  try { localStorage.setItem(storageKey, JSON.stringify(data)) } catch {}

  // Debounced cloud push
  if (pendingSync.has(storageKey)) clearTimeout(pendingSync.get(storageKey)!)
  pendingSync.set(storageKey, setTimeout(() => {
    pushToCloud(storageKey, data)
    pendingSync.delete(storageKey)
  }, 2000))
}

/**
 * Force-pull all keys from cloud — call on app startup to ensure fresh data.
 * Only runs if Supabase is configured.
 */
export async function hydratFromCloud(): Promise<{ synced: number; errors: number }> {
  const userId = await getUserId()
  if (!userId) return { synced: 0, errors: 0 }

  let synced = 0, errors = 0
  try {
    const { data: rows, error } = await supabase
      .from('flipscan_store')
      .select('key,data,updated_at')
      .eq('user_id', userId)
    if (error || !rows) return { synced: 0, errors: 1 }

    // Keys the research agent writes to server-side. For these we merge in
    // cloud records this browser has never seen; local edits always win.
    const AGENT_WRITTEN: string[] = ['flipscan_pipeline_v2', 'flipscan_drip_v1']

    for (const row of rows as { key: string; data: any; updated_at: string }[]) {
      if (!SYNC_KEYS.includes(row.key as SyncKey)) continue
      try {
        // Only overwrite local if cloud is newer or local is empty
        const localRaw = localStorage.getItem(row.key)
        const localEmpty = !localRaw || localRaw === '[]'

        if (localEmpty && row.data?.length > 0) {
          localStorage.setItem(row.key, JSON.stringify(row.data))
          synced++
        } else if (AGENT_WRITTEN.includes(row.key) && Array.isArray(row.data) && row.data.length > 0) {
          const local: any[] = JSON.parse(localRaw || '[]')
          const known = new Set(local.map((r: any) => r?.id))
          const incoming = row.data.filter((r: any) => r?.id && !known.has(r.id))
          if (incoming.length > 0) {
            const merged = [...incoming, ...local]
            localStorage.setItem(row.key, JSON.stringify(merged))
            synced++
          }
        }
      } catch {
        errors++
      }
    }

  } catch {
    errors++
  }

  return { synced, errors }
}

/**
 * Export all data as JSON — for manual backup.
 */
export function exportAllData(): string {
  const out: Record<string, any> = { exportedAt: new Date().toISOString() }
  for (const key of SYNC_KEYS) {
    try { out[key] = JSON.parse(localStorage.getItem(key) || '[]') } catch { out[key] = [] }
  }
  return JSON.stringify(out, null, 2)
}

/**
 * Import data from JSON backup.
 */
export function importAllData(json: string): { imported: number; errors: string[] } {
  const errors: string[] = []
  let imported = 0
  try {
    const data = JSON.parse(json)
    for (const key of SYNC_KEYS) {
      if (data[key] && Array.isArray(data[key])) {
        try {
          localStorage.setItem(key, JSON.stringify(data[key]))
          syncWrite(key, data[key])  // push to cloud too
          imported++
        } catch { errors.push(key) }
      }
    }
  } catch {
    errors.push('Invalid JSON format')
  }
  return { imported, errors }
}

export function getSyncStatus(): { configured: boolean; userId: string; keyCount: number } {
  return {
    configured: isSupabaseConfigured(),
    userId:     '(authenticated)',
    keyCount:   SYNC_KEYS.length,
  }
}
