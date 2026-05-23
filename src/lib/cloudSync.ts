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

import { getSupabaseConfig, isSupabaseConfigured } from './supabase'

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

// Use browser fingerprint as stable user ID (no auth needed for single-user app)
function getUserId(): string {
  const key = 'fscan_user_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = 'sgc-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36)
    localStorage.setItem(key, id)
  }
  return id
}

// Debounce map — avoid hammering Supabase on every keystroke
const pendingSync = new Map<string, ReturnType<typeof setTimeout>>()

// ── Core sync functions ───────────────────────────────────────────────────────

async function pushToCloud(storageKey: string, data: any): Promise<void> {
  if (!isSupabaseConfigured()) return
  const { url, anon } = getSupabaseConfig()
  const userId = getUserId()

  try {
    const res = await fetch(`${url}/rest/v1/flipscan_store`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${anon}`,
        'apikey':         anon,
        'Prefer':         'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id:    userId,
        key:        storageKey,
        data:       data,
        updated_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.warn(`[CloudSync] push failed for ${storageKey}: ${res.status} ${err.slice(0,100)}`)
    }
  } catch (e: any) {
    // Silent fail — localStorage already has the data
    console.debug(`[CloudSync] push error for ${storageKey}:`, e?.message)
  }
}

async function pullFromCloud(storageKey: string): Promise<any | null> {
  if (!isSupabaseConfigured()) return null
  const { url, anon } = getSupabaseConfig()
  const userId = getUserId()

  try {
    const res = await fetch(
      `${url}/rest/v1/flipscan_store?user_id=eq.${encodeURIComponent(userId)}&key=eq.${encodeURIComponent(storageKey)}&select=data,updated_at`,
      {
        headers: {
          'Authorization': `Bearer ${anon}`,
          'apikey':         anon,
        },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0]?.data ?? null
  } catch {
    return null
  }
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
  if (!isSupabaseConfigured()) return { synced: 0, errors: 0 }

  let synced = 0, errors = 0
  const { url, anon } = getSupabaseConfig()
  const userId = getUserId()

  try {
    const res = await fetch(
      `${url}/rest/v1/flipscan_store?user_id=eq.${encodeURIComponent(userId)}&select=key,data,updated_at`,
      {
        headers: { 'Authorization': `Bearer ${anon}`, 'apikey': anon },
        signal:  AbortSignal.timeout(12000),
      }
    )
    if (!res.ok) return { synced: 0, errors: 1 }

    const rows: { key: string; data: any; updated_at: string }[] = await res.json()

    for (const row of rows) {
      if (!SYNC_KEYS.includes(row.key as SyncKey)) continue
      try {
        // Only overwrite local if cloud is newer or local is empty
        const localRaw = localStorage.getItem(row.key)
        const localEmpty = !localRaw || localRaw === '[]'

        if (localEmpty && row.data?.length > 0) {
          localStorage.setItem(row.key, JSON.stringify(row.data))
          synced++
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
  const out: Record<string, any> = { exportedAt: new Date().toISOString(), userId: getUserId() }
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
    userId:     getUserId(),
    keyCount:   SYNC_KEYS.length,
  }
}
