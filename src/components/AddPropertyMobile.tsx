import { useEffect, useRef, useState } from 'react'
import { suggestAddresses, reverseGeocode, type AddressSuggestion } from '../lib/addressAutocomplete'
import { enqueue, listQueue, syncQueue, removeItem, onQueueChange, type QueuedProperty } from '../lib/addPropertyQueue'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '../lib/toast'

interface Props { onClose: () => void }

type Step = 'address' | 'photos' | 'notes' | 'review'

// Convert File to base64 string (no data: prefix)
function fileToB64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

// Compress photo to keep IndexedDB size sane
async function compressPhoto(file: File, maxDim = 1400, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

export default function AddPropertyMobile({ onClose }: Props) {
  const [step, setStep] = useState<Step>('address')
  const [online, setOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState<QueuedProperty[]>([])

  // Address state
  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [picked, setPicked] = useState<AddressSuggestion | null>(null)
  const [loadingGeo, setLoadingGeo] = useState(false)

  // Photos & notes
  const [photos, setPhotos] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [transcript, setTranscript] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    const unsub = onQueueChange(() => { listQueue().then(setQueue) })
    listQueue().then(setQueue)
    return () => {
      window.removeEventListener('online', on); window.removeEventListener('offline', off); unsub()
    }
  }, [])

  // Debounced address suggestions
  useEffect(() => {
    if (picked && q === picked.label) return
    const t = setTimeout(async () => {
      const s = await suggestAddresses(q)
      setSuggestions(s)
    }, 350)
    return () => clearTimeout(t)
  }, [q, picked])

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.warning('Geolocation not available'); return }
    setLoadingGeo(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const s = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        setLoadingGeo(false)
        if (s) { setPicked(s); setQ(s.label); setStep('photos') }
        else toast.error('Could not resolve address')
      },
      err => { setLoadingGeo(false); toast.error('Location denied: ' + err.message) },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  const onPhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    for (const f of files) {
      try {
        const url = await compressPhoto(f)
        setPhotos(p => [...p, url])
      } catch { toast.error(`Failed to load ${f.name}`) }
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  // ── Voice note recording ────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mime })
        if (blob.size < 1024) { toast.warning('Recording too short'); return }
        setTranscribing(true)
        try {
          const b64 = await fileToB64(blob)
          const { data, error } = await supabase.functions.invoke('transcribe-audio', {
            body: { audio: b64, mime },
          })
          if (error) throw new Error(error.message)
          if (data?.error) throw new Error(data.error)
          setTranscript(prev => (prev ? prev + ' ' : '') + (data?.text || ''))
        } catch (e: any) {
          toast.error(e.message || 'Transcription failed')
        } finally {
          setTranscribing(false)
        }
      }
      rec.start()
      recRef.current = rec
      setRecording(true)
    } catch (e: any) {
      toast.error('Mic access denied: ' + (e.message || 'unknown'))
    }
  }
  const stopRecording = () => {
    recRef.current?.stop()
    setRecording(false)
  }

  const canSave = !!picked || q.trim().length > 4

  const save = async () => {
    const addr = picked || {
      address: q, city: '', state: '', zip: '', lat: undefined as any, lng: undefined as any, label: q,
    }
    await enqueue({
      address: addr.address,
      city: addr.city, state: addr.state, zip: addr.zip,
      lat: (addr as any).lat, lng: (addr as any).lng,
      notes, transcript, photos,
    })
    toast.success(online ? 'Saved · syncing…' : 'Saved offline · will sync when online')
    if (online) await syncQueue()
    // Reset for next capture
    setStep('address'); setQ(''); setPicked(null); setSuggestions([])
    setPhotos([]); setNotes(''); setTranscript('')
  }

  const pendingCount = queue.filter(q => q.status === 'queued' || q.status === 'syncing' || q.status === 'error').length

  return (
    <div className="fixed inset-0 z-[300] bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Header */}
      <div className="flex-shrink-0 bg-[#0F2460] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-lg bg-transparent border-none text-white cursor-pointer p-1">✕</button>
        <div className="flex-1">
          <div className="text-sm font-bold">Add Property</div>
          <div className="text-[10px] opacity-70 flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {online ? 'Online' : 'Offline · queued locally'}
            {pendingCount > 0 && ` · ${pendingCount} pending`}
          </div>
        </div>
        {online && pendingCount > 0 && (
          <button onClick={() => syncQueue()} className="text-[10px] bg-white/15 border border-white/30 text-white px-2 py-1 rounded cursor-pointer">Sync</button>
        )}
      </div>

      {/* Stepper */}
      <div className="flex-shrink-0 flex border-b border-zinc-200 bg-zinc-50">
        {(['address','photos','notes','review'] as Step[]).map((s, i) => (
          <button key={s} onClick={() => setStep(s)}
            className={`flex-1 py-2 text-[10px] uppercase tracking-wider font-semibold border-b-2 cursor-pointer bg-transparent ${
              step === s ? 'border-[#0F2460] text-[#0F2460]' : 'border-transparent text-zinc-400'
            }`}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {step === 'address' && (
          <div className="space-y-3">
            <button onClick={useMyLocation} disabled={loadingGeo}
              className="w-full py-3 bg-[#0F2460] text-white rounded-xl text-sm font-bold cursor-pointer border-none disabled:opacity-50">
              {loadingGeo ? '📍 Locating…' : '📍 Use my current location'}
            </button>
            <div className="text-center text-[10px] uppercase tracking-widest text-zinc-400">or search</div>
            <input
              value={q} onChange={e => { setQ(e.target.value); setPicked(null) }}
              placeholder="Start typing an address…"
              autoComplete="off"
              className="w-full px-4 py-3 border border-zinc-300 rounded-xl text-sm outline-none focus:border-[#0F2460]"
            />
            {suggestions.length > 0 && !picked && (
              <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => { setPicked(s); setQ(s.label); setSuggestions([]); setStep('photos') }}
                    className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 cursor-pointer bg-white border-none">
                    <div className="text-sm font-semibold text-zinc-900">{s.address || '—'}</div>
                    <div className="text-[11px] text-zinc-500">{[s.city, s.state, s.zip].filter(Boolean).join(', ')}</div>
                  </button>
                ))}
              </div>
            )}
            {picked && (
              <div className="p-3 border border-emerald-200 bg-emerald-50 rounded-xl">
                <div className="text-sm font-semibold text-emerald-900">{picked.address}</div>
                <div className="text-[11px] text-emerald-700">{[picked.city, picked.state, picked.zip].filter(Boolean).join(', ')}</div>
                <button onClick={() => setStep('photos')} className="mt-2 text-xs font-bold text-[#0F2460] bg-transparent border-none cursor-pointer">Continue →</button>
              </div>
            )}
          </div>
        )}

        {step === 'photos' && (
          <div className="space-y-3">
            <div className="text-[11px] text-zinc-500">Snap curb appeal, damage, boarded windows — anything the AI should see later.</div>
            <button onClick={() => fileInput.current?.click()}
              className="w-full py-4 bg-[#0F2460] text-white rounded-xl text-sm font-bold cursor-pointer border-none">
              📷 Take photo
            </button>
            <input ref={fileInput} type="file" accept="image/*" capture="environment" multiple onChange={onPhotoPick} className="hidden" />
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200">
                    <img src={p} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setPhotos(arr => arr.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/70 text-white rounded-full text-xs border-none cursor-pointer">✕</button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setStep('notes')} className="w-full py-3 border border-[#0F2460] text-[#0F2460] rounded-xl text-sm font-bold cursor-pointer bg-white">Next: Notes →</button>
          </div>
        )}

        {step === 'notes' && (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Voice note</div>
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={transcribing}
                className={`w-full py-4 rounded-xl text-sm font-bold cursor-pointer border-none text-white ${recording ? 'bg-red-600 animate-pulse' : 'bg-[#0F2460]'} disabled:opacity-50`}>
                {transcribing ? '⏳ Transcribing…' : recording ? '⏹ Stop recording' : '🎤 Hold thoughts — record'}
              </button>
              {transcript && (
                <div className="mt-2 p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 leading-relaxed">
                  <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Transcript</div>
                  {transcript}
                  <button onClick={() => setTranscript('')} className="ml-2 text-[10px] text-red-600 bg-transparent border-none cursor-pointer">clear</button>
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Typed notes</div>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                rows={4} placeholder="Boarded windows, tall grass, out-of-state plates…"
                className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm outline-none focus:border-[#0F2460] resize-none"
              />
            </div>

            <button onClick={() => setStep('review')} className="w-full py-3 bg-[#0F2460] text-white rounded-xl text-sm font-bold cursor-pointer border-none">Review →</button>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            <div className="p-3 border border-zinc-200 rounded-xl">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Address</div>
              <div className="text-sm font-semibold">{picked?.address || q || '—'}</div>
              <div className="text-[11px] text-zinc-500">{[picked?.city, picked?.state, picked?.zip].filter(Boolean).join(', ')}</div>
            </div>
            <div className="p-3 border border-zinc-200 rounded-xl">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Photos ({photos.length})</div>
              {photos.length === 0 ? <div className="text-xs text-zinc-400">None</div>
                : <div className="grid grid-cols-4 gap-1">{photos.map((p, i) => <img key={i} src={p} className="aspect-square object-cover rounded" alt="" />)}</div>}
            </div>
            {(notes || transcript) && (
              <div className="p-3 border border-zinc-200 rounded-xl">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Notes</div>
                {transcript && <div className="text-xs text-zinc-800 mb-1">🎤 {transcript}</div>}
                {notes && <div className="text-xs text-zinc-800 whitespace-pre-wrap">{notes}</div>}
              </div>
            )}
            <button onClick={save} disabled={!canSave}
              className="w-full py-4 bg-emerald-600 text-white rounded-xl text-sm font-bold cursor-pointer border-none disabled:opacity-40">
              {online ? '✓ Save & sync' : '✓ Save offline'}
            </button>
          </div>
        )}

        {/* Recent queue */}
        {queue.length > 0 && (
          <div className="mt-6">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Recent captures</div>
            <ul className="space-y-1.5">
              {queue.slice(0, 5).map(item => (
                <li key={item.id} className="flex items-center gap-2 p-2 bg-zinc-50 border border-zinc-200 rounded-lg">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    item.status === 'synced' ? 'bg-emerald-500'
                    : item.status === 'error' ? 'bg-red-500'
                    : item.status === 'syncing' ? 'bg-amber-500 animate-pulse' : 'bg-zinc-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold truncate">{item.address || '(no address)'}</div>
                    <div className="text-[10px] text-zinc-500">{item.photos.length} photo{item.photos.length !== 1 ? 's' : ''} · {item.status}{item.error ? ` · ${item.error}` : ''}</div>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="text-[10px] text-red-600 bg-transparent border-none cursor-pointer">✕</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}