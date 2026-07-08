// IndexedDB-backed offline queue for the mobile "Add Property" flow.
// Each entry holds address + notes + transcript + photos (as data URLs) and a status.

export type QueueStatus = 'queued' | 'syncing' | 'synced' | 'error'

export interface QueuedProperty {
  id: string
  createdAt: number
  address: string
  city: string
  state: string
  zip: string
  lat?: number
  lng?: number
  notes: string
  transcript: string
  photos: string[] // data URLs (base64)
  status: QueueStatus
  error?: string
  syncedAt?: number
}

const DB_NAME = 'flipscan_d4d_queue'
const STORE = 'properties'
const VERSION = 1

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueue(item: Omit<QueuedProperty, 'id' | 'createdAt' | 'status'>): Promise<QueuedProperty> {
  const full: QueuedProperty = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: 'queued',
    ...item,
  }
  await tx('readwrite', s => s.put(full))
  notify()
  return full
}

export async function listQueue(): Promise<QueuedProperty[]> {
  const items = await tx<QueuedProperty[]>('readonly', s => s.getAll() as IDBRequest<QueuedProperty[]>)
  return items.sort((a, b) => b.createdAt - a.createdAt)
}

export async function updateItem(id: string, patch: Partial<QueuedProperty>): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite')
    const s = t.objectStore(STORE)
    const g = s.get(id)
    g.onsuccess = () => {
      const cur = g.result as QueuedProperty | undefined
      if (!cur) return resolve()
      s.put({ ...cur, ...patch })
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    }
    g.onerror = () => reject(g.error)
  })
  notify()
}

export async function removeItem(id: string): Promise<void> {
  await tx('readwrite', s => s.delete(id))
  notify()
}

export async function pendingCount(): Promise<number> {
  const all = await listQueue()
  return all.filter(i => i.status === 'queued' || i.status === 'error').length
}

// ── Change notifications (cross-component) ────────────────────────────────
const listeners = new Set<() => void>()
export function onQueueChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function notify() {
  listeners.forEach(l => { try { l() } catch { /* ignore */ } })
}

// ── Sync ──────────────────────────────────────────────────────────────────
// Merges the queue into the existing D4D localStorage store so it appears
// in the Drive-for-Dollars screen. Additive only — never mutates protected libs.
const D4D_STORAGE_KEY = 'flipscan_d4d_v1'

function mergeIntoD4D(item: QueuedProperty) {
  try {
    const cur = JSON.parse(localStorage.getItem(D4D_STORAGE_KEY) || '[]')
    cur.unshift({
      id: item.id,
      address: item.address,
      city: item.city,
      state: item.state,
      zip: item.zip,
      capturedAt: new Date(item.createdAt).toISOString(),
      notes: [item.notes, item.transcript && `🎤 ${item.transcript}`].filter(Boolean).join('\n\n'),
      photoDataUrl: item.photos[0], // primary photo for the D4D card
      inPipeline: false,
    })
    localStorage.setItem(D4D_STORAGE_KEY, JSON.stringify(cur))
  } catch { /* ignore */ }
}

export async function syncQueue(): Promise<{ ok: number; failed: number }> {
  if (!navigator.onLine) return { ok: 0, failed: 0 }
  const all = await listQueue()
  const pending = all.filter(i => i.status === 'queued' || i.status === 'error')
  let ok = 0, failed = 0
  for (const item of pending) {
    try {
      await updateItem(item.id, { status: 'syncing', error: undefined })
      mergeIntoD4D(item)
      await updateItem(item.id, { status: 'synced', syncedAt: Date.now() })
      ok++
    } catch (e: any) {
      await updateItem(item.id, { status: 'error', error: e?.message || 'Sync failed' })
      failed++
    }
  }
  return { ok, failed }
}

// Auto-sync when the browser comes online
let onlineHooked = false
export function initAutoSync() {
  if (onlineHooked) return
  onlineHooked = true
  window.addEventListener('online', () => { syncQueue() })
  if (navigator.onLine) setTimeout(() => syncQueue(), 500)
}