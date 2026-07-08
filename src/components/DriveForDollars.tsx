import { toast } from '../lib/toast'
/**
 * Drive for Dollars — Mobile-Optimized Quick Capture
 *
 * You're on a job site. You drive past a boarded window, a neglected yard,
 * a house that hasn't been touched in years. You have 60 seconds.
 *
 * This screen lets you:
 *   1. Type or speak an address
 *   2. Get instant data: owner, assessed value, last sale, violations, equity
 *   3. One tap → add to pipeline
 *   4. Snap a photo note
 *   5. Everything saved — review later from desktop
 *
 * All data sources:
 *   - Skip trace (Tracerfy) → owner name + phone
 *   - Chatham/Norfolk/Charlotte CAMA → assessed value
 *   - RentCast AVM → estimated value + comps
 *   - AI Motivation Score → should you call this one first?
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { skipTrace, SkipTraceResult } from '../lib/skipTrace'
import { pullComps, CompResult } from '../lib/compPull'
import { computeMotivationScore, MotivationScore } from '../lib/motivationScore'
import { addToPipeline, isInPipeline } from '../lib/pipeline'
import { supabase } from '@/integrations/supabase/client'

// ── Deep Scan types (lightweight, no coupling to protected engines) ───────
interface DeepScanData {
  photos?: { list: string[]; source: string; count: number }
  permits?: { permits: Array<{ title?: string; url?: string; description?: string }>; violations: Array<{ title?: string; url?: string; description?: string }>; source: string }
  distress?: { signals: Array<{ title?: string; url?: string; description?: string; flags: string[] }>; source: string }
  summary?: string
  generatedAt?: string
}

const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'

interface Capture {
  id:          string
  address:     string
  city:        string
  state:       string
  zip:         string
  capturedAt:  string
  notes:       string
  photoDataUrl?: string
  // Results
  trace?:      SkipTraceResult
  comps?:      CompResult
  motivation?: MotivationScore
  inPipeline:  boolean
}

const STORAGE_KEY = 'flipscan_d4d_v1'

function loadCaptures(): Capture[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveCaptures(c: Capture[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
    import('../lib/cloudSync').then(({ syncWrite }) => syncWrite('flipscan_d4d_v1', c)).catch(() => {})
  } catch {}
}

function getTracerKey() {
  try { return localStorage.getItem('fscan_tracer') || '' } catch { return '' }
}
function getAnthropicKey() {
  try { return localStorage.getItem('fscan_anthropic') || '' } catch { return '' }
}

// ── Address input with speech recognition ─────────────────────────────────────
function AddressInput({ onSearch }: { onSearch: (addr: string, city: string, state: string, zip: string) => void }) {
  const [raw,       setRaw]       = useState('')
  const [city,      setCity]      = useState('')
  const [state,     setState]     = useState('VA')
  const [zip,       setZip]       = useState('')
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { toast.warning('Speech recognition not supported in this browser. Try Chrome on Android.'); return }
    const rec = new SpeechRecognition()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript
      setRaw(text)
      setListening(false)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  const handleSearch = () => {
    const addr = raw.trim()
    if (!addr) return
    onSearch(addr, city.trim(), state.trim(), zip.trim())
  }

  return (
    <div className="space-y-3">
      {/* Address field with mic */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-navy)' }}>
          Street Address
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={raw}
            onChange={e => setRaw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="123 Oak Street"
            className="flex-1 rounded-xl border text-base px-4 py-3 outline-none"
            style={{ borderColor: 'var(--sgc-gray-border)', fontSize: 16 }}
            autoFocus
            autoComplete="street-address"
          />
          {/* Mic button */}
          <button
            onClick={listening ? stopListening : startListening}
            className="w-12 h-12 rounded-xl flex items-center justify-center border-none cursor-pointer flex-shrink-0"
            style={{ background: listening ? '#C0341D' : 'var(--sgc-navy)', color: 'white' }}>
            {listening
              ? <span className="animate-pulse text-lg">⏹</span>
              : <span className="text-lg">🎤</span>}
          </button>
        </div>
        {listening && (
          <div className="text-xs mt-1 flex items-center gap-1" style={{ color: '#C0341D' }}>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block"/>
            Listening... speak the address clearly
          </div>
        )}
      </div>

      {/* City / State / Zip */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>City</div>
          <input type="text" value={city} onChange={e => setCity(e.target.value)}
            placeholder="Norfolk"
            className="w-full rounded-xl border text-sm px-3 py-2.5 outline-none"
            style={{ borderColor: 'var(--sgc-gray-border)', fontSize: 16 }} />
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>State</div>
          <div className="grid grid-cols-2 gap-1">
            {['VA','NC'].map(s => (
              <button key={s} onClick={() => setState(s)}
                className="py-2.5 rounded-xl border text-sm font-bold cursor-pointer"
                style={state === s
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Zip</div>
          <input type="text" value={zip} onChange={e => setZip(e.target.value.replace(/\D/,'').slice(0,5))}
            placeholder="23501"
            className="w-full rounded-xl border text-sm px-3 py-2.5 outline-none"
            style={{ borderColor: 'var(--sgc-gray-border)', fontSize: 16 }}
            inputMode="numeric" />
        </div>
      </div>

      {/* Search button */}
      <button onClick={handleSearch}
        className="w-full py-4 rounded-2xl text-base font-black text-white border-none cursor-pointer"
        style={{ background: 'var(--sgc-navy)', fontSize: 17 }}>
        🔍 Analyze This Property
      </button>
    </div>
  )
}

// ── Result card ───────────────────────────────────────────────────────────────
function ResultCard({ capture, onAddPipeline }: {
  capture: Capture
  onAddPipeline: (id: string) => void
}) {
  const trace = capture.trace
  const comps  = capture.comps
  const motiv  = capture.motivation
  const inPipe = capture.inPipeline

  // Deep Scan state — scoped to this card
  const [dsRunning, setDsRunning] = useState(false)
  const [dsData, setDsData] = useState<DeepScanData | null>(null)
  const [dsError, setDsError] = useState<string | null>(null)
  const [dsStep, setDsStep] = useState<string>('')

  const runDeepScan = async () => {
    setDsRunning(true); setDsError(null); setDsData({}); setDsStep('Fetching photos…')
    const base = { address: capture.address, city: capture.city, state: capture.state, zip: capture.zip }
    try {
      // Photos (piggyback on full-mode call would be heavy; call property-photos directly)
      try {
        const { data } = await supabase.functions.invoke('property-photos', { body: base })
        setDsData(d => ({ ...(d || {}), photos: { list: data?.photos || [], source: data?.source || 'none', count: data?.count || 0 } }))
      } catch {}

      setDsStep('Scanning permits & violations…')
      const permitsRes = await supabase.functions.invoke('deep-scan', { body: { ...base, mode: 'permits' } })
      if (permitsRes.data) setDsData(d => ({ ...(d || {}), permits: permitsRes.data }))

      setDsStep('Searching distress signals…')
      const distressRes = await supabase.functions.invoke('deep-scan', { body: { ...base, mode: 'distress' } })
      if (distressRes.data) setDsData(d => ({ ...(d || {}), distress: distressRes.data }))

      setDsStep('Generating AI summary…')
      const context = {
        ownerName: trace?.owner?.name,
        equityPct: trace?.property?.equityPct,
        taxStatus: trace?.property?.taxStatus,
        estValue: trace?.property?.estimatedValue,
        vacant: trace?.property?.vacant,
        absentee: trace?.property?.absenteeOwner,
        arvSuggestion: comps?.arvSuggestion,
        motivationTier: motiv?.tier,
        motivationScore: motiv?.score,
        permits: (permitsRes.data?.permits || []).slice(0, 3),
        violations: (permitsRes.data?.violations || []).slice(0, 3),
        distress: (distressRes.data?.signals || []).slice(0, 3),
      }
      const sumRes = await supabase.functions.invoke('deep-scan', { body: { ...base, mode: 'summary', context } })
      if (sumRes.data) setDsData(d => ({ ...(d || {}), summary: sumRes.data?.summary || '', generatedAt: new Date().toISOString() }))
      setDsStep('')
    } catch (e: any) {
      setDsError(e?.message || 'Deep Scan failed')
    } finally {
      setDsRunning(false)
    }
  }

  const safePct = (n?: number) => (n != null && isFinite(n) && n > 0 && n < 100) ? `${n.toFixed(0)}%` : '—'

  const motivColor = motiv
    ? motiv.tier === 'critical' ? '#C0341D'
    : motiv.tier === 'hot'      ? '#C45E1A'
    : motiv.tier === 'warm'     ? '#8A5700'
    : 'var(--sgc-gray-mid)' : 'var(--sgc-gray-mid)'

  return (
    <div className="rounded-2xl border overflow-hidden bg-white"
      style={{ borderColor: motiv?.tier === 'critical' ? '#C0341D40' : motiv?.tier === 'hot' ? '#C45E1A40' : 'var(--sgc-gray-border)' }}>

      {/* Address header */}
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="font-black text-lg leading-tight" style={{ color: 'var(--sgc-navy)' }}>
          {capture.address}
        </div>
        <div className="text-sm mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
          {capture.city}, {capture.state} {capture.zip}
        </div>
        <div className="text-[10px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>
          Captured {new Date(capture.capturedAt).toLocaleString()}
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* AI Motivation Score */}
        {motiv && (
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: motivColor + '40' }}>
            <div className="px-3 py-2 flex items-center justify-between"
              style={{ background: motivColor }}>
              <div className="flex items-center gap-2">
                <span className="text-sm">🧠</span>
                <span className="text-xs font-bold text-white uppercase tracking-wide">AI Motivation Score</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-white">{motiv.score}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full uppercase"
                  style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                  {motiv.tier}
                </span>
              </div>
            </div>
            <div className="p-3 space-y-2">
              <div className="text-xs font-semibold" style={{ color: 'var(--sgc-black)' }}>{motiv.primaryDriver}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>{motiv.explanation}</div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{
                    background: motiv.urgency === 'immediate' ? '#FEF0ED' : '#FEF7EA',
                    color: motiv.urgency === 'immediate' ? '#C0341D' : '#8A5700',
                  }}>
                  {motiv.urgency === 'immediate' ? '🔥 Call Today' : motiv.urgency === 'this_week' ? '📅 This Week' : '📆 This Month'}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>📞 {motiv.bestCallTime}</span>
              </div>
              <div className="text-[10px] p-2 rounded-lg" style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
                → {motiv.recommendedAction}
              </div>
            </div>
          </div>
        )}

        {/* Owner contact */}
        {trace?.hit && trace.owner && (
          <div className="rounded-xl border p-3" style={{ background: 'var(--sgc-navy-pale)', borderColor: 'var(--sgc-navy)20' }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>Owner Contact</div>
            <div className="font-bold text-sm mb-2" style={{ color: 'var(--sgc-black)' }}>
              👤 {trace.owner.name || 'Name not found'}
            </div>
            {trace.phones.filter(p => !p.litigator).map((p, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <a href={`tel:${p.number}`}
                  onClick={e => { if (p.dnc) { e.preventDefault(); toast.warning('⛔ DNC — Do Not Call. TCPA violation risk.') } }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 no-underline"
                  style={{ background: p.dnc ? '#FEF0ED' : '#EDFAF3', color: p.dnc ? '#C0341D' : '#1A7A4A' }}>
                  <span className="text-base">{p.dnc ? '⛔' : '📞'}</span>
                  <span className="font-mono font-bold text-sm">{p.number}</span>
                  <span className="text-[10px] capitalize">{p.type}</span>
                  {p.dnc && <span className="text-[10px] font-black ml-auto">DNC</span>}
                </a>
              </div>
            ))}
            {trace.emails.slice(0, 2).map((e, i) => (
              <a key={i} href={`mailto:${e.address}`}
                className="flex items-center gap-2 px-3 py-2 rounded-xl mb-1 no-underline"
                style={{ background: '#EEF2FB', color: 'var(--sgc-navy)' }}>
                <span>✉️</span>
                <span className="text-sm">{e.address}</span>
              </a>
            ))}
            {trace.owner.mailingAddr && (
              <div className="text-xs mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                📬 {trace.owner.mailingAddr}
              </div>
            )}
          </div>
        )}

        {trace?.hit && trace.property && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { l: 'Est. Value', v: fmt$(trace.property.estimatedValue), c: 'var(--sgc-navy)' },
              { l: 'Equity', v: safePct(trace.property.equityPct), c: '#1A7A4A' },
              { l: 'Tax Status', v: trace.property.taxStatus || '—', c: trace.property.taxStatus === 'delinquent' ? '#C0341D' : '#1A7A4A' },
              { l: 'Last Sale', v: trace.property.lastSalePrice > 0 ? fmt$(trace.property.lastSalePrice) : '—', c: 'var(--sgc-black)' },
              { l: 'Absentee', v: trace.property.absenteeOwner ? 'Yes 🎯' : 'No', c: trace.property.absenteeOwner ? '#C45E1A' : 'var(--sgc-gray-mid)' },
              { l: 'Vacant', v: trace.property.vacant ? 'Yes 🏚️' : 'No', c: trace.property.vacant ? '#C0341D' : 'var(--sgc-gray-mid)' },
            ].map(m => (
              <div key={m.l} className="text-center p-2.5 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
                <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                <div className="text-sm font-bold" style={{ color: m.c }}>{m.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* RentCast comps */}
        {comps && (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="px-3 py-2 flex items-center justify-between"
              style={{ background: 'var(--sgc-navy)' }}>
              <span className="text-xs font-bold text-white">🏠 RentCast Comps</span>
              <span className="text-[10px] text-white/70">{comps.confidence} confidence</span>
            </div>
            <div className="p-3 grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-[9px] mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Est Value</div>
                <div className="text-base font-black" style={{ color: 'var(--sgc-navy)' }}>${Math.round(comps.estimatedValue/1000)}k</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Suggested ARV</div>
                <div className="text-base font-black" style={{ color: '#1A7A4A' }}>${Math.round(comps.arvSuggestion/1000)}k</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>70% MAO</div>
                <div className="text-base font-black" style={{ color: '#C45E1A' }}>${Math.round(comps.arvSuggestion*0.7/1000)}k</div>
              </div>
            </div>
            {comps.comps.slice(0,3).map((c, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 border-t text-xs"
                style={{ borderColor: 'var(--sgc-gray-border)' }}>
                <span className="truncate flex-1 mr-2" style={{ color: 'var(--sgc-gray-mid)' }}>{c.address}</span>
                <span className="font-bold flex-shrink-0" style={{ color: 'var(--sgc-navy)' }}>${Math.round(c.price/1000)}k</span>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        {capture.notes && (
          <div className="rounded-xl p-3 text-sm" style={{ background: '#FEF7EA', color: '#8A5700' }}>
            📝 {capture.notes}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => !inPipe && onAddPipeline(capture.id)}
            disabled={inPipe}
            className="flex-1 py-3 rounded-xl text-sm font-bold border-none cursor-pointer"
            style={{ background: inPipe ? '#EDFAF3' : '#1A7A4A', color: inPipe ? '#1A7A4A' : 'white' }}>
            {inPipe ? '✓ In Pipeline' : '+ Add to Pipeline'}
          </button>
          <a href={`https://maps.google.com/?q=${encodeURIComponent(capture.address + ' ' + capture.city + ' ' + capture.state)}`}
            target="_blank" rel="noopener noreferrer"
            className="px-4 py-3 rounded-xl text-sm font-bold border-none no-underline flex items-center"
            style={{ background: '#EEF2FB', color: 'var(--sgc-navy)' }}>
            📍
          </a>
          {trace?.phones.find(p => !p.dnc && !p.litigator) && (
            <a href={`tel:${trace.phones.find(p => !p.dnc && !p.litigator)?.number}`}
              className="px-4 py-3 rounded-xl text-sm font-bold border-none no-underline flex items-center"
              style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
              📞
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DriveForDollars() {
  const [captures,   setCaptures]   = useState<Capture[]>(loadCaptures)
  const [analyzing,  setAnalyzing]  = useState(false)
  const [progress,   setProgress]   = useState<string[]>([])
  const [notes,      setNotes]      = useState('')
  const [view,       setView]       = useState<'capture'|'history'>('capture')
  const [filterDate, setFilterDate] = useState<'today'|'week'|'all'>('today')

  const saveAndRefresh = (updated: Capture[]) => {
    saveCaptures(updated)
    setCaptures(updated)
  }

  const handleSearch = useCallback(async (address: string, city: string, state: string, zip: string) => {
    if (!address) return

    setAnalyzing(true)
    setProgress(['🔍 Looking up property...'])

    const tracerKey   = getTracerKey()
    const anthropicKey= getAnthropicKey()
    const captureId   = `d4d-${Date.now()}`

    const newCapture: Capture = {
      id: captureId,
      address, city, state, zip,
      notes,
      capturedAt: new Date().toISOString(),
      inPipeline: false,
    }

    // Run skip trace + comps in parallel
    const [traceResult, compsResult] = await Promise.allSettled([
      tracerKey
        ? (setProgress(p => [...p, '👤 Skip tracing owner...']),
           skipTrace(address, city, state, zip, tracerKey))
        : Promise.resolve(null),
      (setProgress(p => [...p, '🏠 Pulling comps...']),
       pullComps(address, city, state, zip)),
    ])

    const trace = traceResult.status === 'fulfilled' ? traceResult.value : null
    const comps = compsResult.status === 'fulfilled' ? compsResult.value : null

    if (trace) newCapture.trace = trace
    if (comps) newCapture.comps = comps

    // AI motivation score
    if (anthropicKey && (trace?.hit || comps)) {
      setProgress(p => [...p, '🧠 Computing motivation score...'])
      // Build a synthetic lead for motivation scoring
      const syntheticLead = {
        id:           captureId,
        address, city, state, zip,
        county:       '',
        lat:          null, lng: null,
        signalType:   'code_violation' as any,
        signalLabel:  'Drive for Dollars — Field Capture',
        description:  notes || 'Property flagged while driving — visual distress signals observed',
        caseNumber:   '',
        status:       'Open',
        filedDate:    new Date().toISOString().split('T')[0],
        severity:     'medium' as any,
        source:       'Drive for Dollars',
        sourceUrl:    '',
        rawData:      null,
        investorScore: 50,
      }
      const motivation = await computeMotivationScore(syntheticLead, trace)
      if (motivation) newCapture.motivation = motivation
    }

    setProgress(p => [...p, '✓ Done!'])

    const all = loadCaptures()
    const updated = [newCapture, ...all]
    saveAndRefresh(updated)
    setAnalyzing(false)
    setProgress([])
    setNotes('')
    setView('history')
  }, [notes])

  const handleAddPipeline = (captureId: string) => {
    const all = loadCaptures()
    const cap = all.find(c => c.id === captureId)
    if (!cap) return

    addToPipeline({
      id:            cap.id,
      stage:         'new',
      priority:      cap.motivation?.tier === 'critical' || cap.motivation?.tier === 'hot' ? 'hot' : 'warm',
      address:       cap.address,
      city:          cap.city,
      state:         cap.state,
      zip:           cap.zip,
      county:        '',
      signalType:    'code_violation',
      signalLabel:   'Drive for Dollars — Field Capture',
      investorScore: cap.motivation?.score || 50,
      severity:      cap.motivation?.tier === 'critical' ? 'critical' : 'medium',
      source:        'Drive for Dollars',
      ownerName:     cap.trace?.owner?.name || '',
      phones:        cap.trace?.phones || [],
      emails:        cap.trace?.emails || [],
      mailingAddr:   cap.trace?.owner?.mailingAddr || '',
      estimatedARV:  cap.comps?.arvSuggestion || cap.trace?.property?.estimatedValue || 0,
      estimatedRehab:0,
      estimatedProfit:0,
      maxOffer:      cap.comps ? Math.round(cap.comps.arvSuggestion * 0.70) : 0,
      notes:         cap.notes || '',
      tags:          ['drive-for-dollars'],
      assignedTo:    'Albert',
    })

    const updated = all.map(c => c.id === captureId ? { ...c, inPipeline: true } : c)
    saveAndRefresh(updated)
  }

  // Filter captures for history view
  const now = new Date()
  const filteredCaptures = captures.filter(c => {
    const d = new Date(c.capturedAt)
    if (filterDate === 'today') {
      return d.toDateString() === now.toDateString()
    } else if (filterDate === 'week') {
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate()-7)
      return d >= weekAgo
    }
    return true
  })

  const todayCount = captures.filter(c => new Date(c.capturedAt).toDateString() === now.toDateString()).length
  const pipelineCount = captures.filter(c => c.inPipeline).length

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-bold text-base" style={{ color: 'var(--sgc-navy)' }}>🚗 Drive for Dollars</div>
            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
              {todayCount} captured today · {pipelineCount} in pipeline · {captures.length} total
            </div>
          </div>
          <div className="flex gap-1">
            {(['capture','history'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer capitalize"
                style={view === v
                  ? { background: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                {v === 'capture' ? '📍 Capture' : `📋 History (${captures.length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── CAPTURE VIEW ── */}
        {view === 'capture' && (
          <div className="p-4 max-w-lg mx-auto space-y-4">

            {analyzing ? (
              /* Loading state */
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="w-14 h-14 border-3 rounded-full spin"
                  style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)', borderWidth: 3 }}/>
                <div className="text-center space-y-2">
                  {progress.map((p, i) => (
                    <div key={i} className="text-sm font-medium"
                      style={{ color: i === progress.length - 1 ? 'var(--sgc-navy)' : 'var(--sgc-gray-mid)' }}>
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Instruction */}
                <div className="rounded-2xl p-4 text-center"
                  style={{ background: 'var(--sgc-navy)', color: 'white' }}>
                  <div className="text-xl mb-1">🚗</div>
                  <div className="text-sm font-bold mb-1">You're at the curb.</div>
                  <div className="text-xs opacity-80">Type or speak the address. Get owner info in 10 seconds.</div>
                </div>

                <AddressInput onSearch={handleSearch} />

                {/* Quick notes */}
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-navy)' }}>
                    Quick Notes (optional)
                  </div>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Boarded windows, overgrown yard, tarped roof, mail piling up, no vehicles..."
                    className="w-full rounded-xl border text-sm px-4 py-3 outline-none resize-none"
                    style={{ borderColor: 'var(--sgc-gray-border)', minHeight: 80, fontSize: 16 }}
                  />
                </div>

                {/* How it works */}
                <div className="rounded-2xl p-4 space-y-2"
                  style={{ background: 'var(--sgc-gray-light)' }}>
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>
                    What you get in ~10 seconds
                  </div>
                  {[
                    { icon: '👤', t: 'Owner name + phone + email (Tracerfy)' },
                    { icon: '🏠', t: 'Estimated value + 3 sold comps (RentCast)' },
                    { icon: '💰', t: 'Equity %, tax status, absentee flag' },
                    { icon: '🧠', t: 'AI Motivation Score — call this one first?' },
                    { icon: '🎯', t: 'One tap to add to your Pipeline CRM' },
                  ].map(s => (
                    <div key={s.t} className="flex items-center gap-2 text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                      <span>{s.icon}</span> {s.t}
                    </div>
                  ))}
                  {!getTracerKey() && (
                    <div className="text-[10px] mt-2 p-2 rounded-lg" style={{ background: '#FEF7EA', color: '#8A5700' }}>
                      ⚠ Add your Tracerfy key in Lead Radar settings to enable owner lookup
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── HISTORY VIEW ── */}
        {view === 'history' && (
          <div className="p-4 space-y-4 max-w-2xl mx-auto">
            {/* Filter */}
            <div className="flex items-center gap-2">
              {(['today','week','all'] as const).map(f => (
                <button key={f} onClick={() => setFilterDate(f)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer capitalize"
                  style={filterDate === f
                    ? { background: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                  {f === 'today' ? `Today (${todayCount})` : f === 'week' ? 'This Week' : `All (${captures.length})`}
                </button>
              ))}
              {captures.length > 0 && (
                <button onClick={() => { if (confirm('Clear all captures?')) { saveCaptures([]); setCaptures([]) } }}
                  className="ml-auto px-2.5 py-1.5 rounded-lg text-xs border-none cursor-pointer"
                  style={{ background: 'var(--sgc-gray-light)', color: '#C0341D' }}>
                  Clear All
                </button>
              )}
            </div>

            {filteredCaptures.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🚗</div>
                <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                  No captures yet{filterDate !== 'all' ? ' for this period' : ''}.
                </div>
                <button onClick={() => setView('capture')}
                  className="mt-3 px-4 py-2 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                  style={{ background: 'var(--sgc-navy)' }}>
                  Start Capturing →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCaptures.map(cap => (
                  <ResultCard
                    key={cap.id}
                    capture={cap}
                    onAddPipeline={handleAddPipeline}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
