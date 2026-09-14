/**
 * Auction search log — saves a completed Auction Radar scan (records, stats,
 * sources and any Deep Scan memos already generated) so it can be reopened
 * later without re-running a paid scan.
 *
 * Stored locally first (instant), then mirrored to the user's cloud row in
 * `flipscan_store` so the log follows them across devices. Cloud failures are
 * non-fatal — the local copy is the source of truth for the session.
 */
import { supabase } from '../integrations/supabase/client'

const LS_KEY = 'fscan_auction_searches'
const CLOUD_KEY = 'auction_searches'
const MAX_ENTRIES = 40

export interface SavedAuctionSearch {
  id: string
  label: string
  savedAt: string
  scannedAt: string
  count: number
  query: { city: string; state: string; county: string; zip: string; daysAhead: number; maxPrice: number }
  result: any
  memos?: Record<string, any>
}

export function loadSearchLog(): SavedAuctionSearch[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function persist(list: SavedAuctionSearch[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES))) } catch {}
  void pushCloud(list.slice(0, MAX_ENTRIES))
}

export function saveSearch(entry: SavedAuctionSearch): SavedAuctionSearch[] {
  const list = [entry, ...loadSearchLog().filter(e => e.id !== entry.id)].slice(0, MAX_ENTRIES)
  persist(list)
  return list
}

export function deleteSearch(id: string): SavedAuctionSearch[] {
  const list = loadSearchLog().filter(e => e.id !== id)
  persist(list)
  return list
}

export function clearSearchLog(): SavedAuctionSearch[] {
  persist([])
  return []
}

// ── Cloud mirror (best effort) ───────────────────────────────────────────────
async function pushCloud(list: SavedAuctionSearch[]) {
  try {
    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    if (!uid) return
    const { data: existing } = await supabase.from('flipscan_store')
      .select('id').eq('user_id', uid).eq('key', CLOUD_KEY).maybeSingle()
    if (existing?.id) {
      await supabase.from('flipscan_store')
        .update({ data: list as any, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('flipscan_store').insert({ user_id: uid, key: CLOUD_KEY, data: list as any })
    }
  } catch { /* offline / signed out — local copy still holds */ }
}

/** Pull the cloud copy and merge it into local storage. Returns merged list. */
export async function syncSearchLog(): Promise<SavedAuctionSearch[]> {
  const local = loadSearchLog()
  try {
    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    if (!uid) return local
    const { data } = await supabase.from('flipscan_store')
      .select('data').eq('user_id', uid).eq('key', CLOUD_KEY).maybeSingle()
    const cloud = Array.isArray(data?.data) ? (data!.data as unknown as SavedAuctionSearch[]) : []
    const byId = new Map<string, SavedAuctionSearch>()
    ;[...cloud, ...local].forEach(e => { if (e?.id) byId.set(e.id, e) })
    const merged = [...byId.values()].sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || '')).slice(0, MAX_ENTRIES)
    try { localStorage.setItem(LS_KEY, JSON.stringify(merged)) } catch {}
    return merged
  } catch { return local }
}
