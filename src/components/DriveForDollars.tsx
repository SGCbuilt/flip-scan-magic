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
  permits?: {
    permits: Array<{ title?: string; url?: string; description?: string; date?: string | null; dateLabel?: string | null; permitType?: string; source?: string; confidence?: 'high' | 'medium' | 'low'; matchReasons?: string[]; matchScore?: number }>;
    violations: Array<{ title?: string; url?: string; description?: string; date?: string | null; dateLabel?: string | null; permitType?: string; source?: string; confidence?: 'high' | 'medium' | 'low'; matchReasons?: string[]; matchScore?: number }>;
    source: string;
    debug?: {
      queriesRun?: number;
      queriesOk?: number;
      rawHits?: number;
      aiUsed?: boolean;
      aiError?: string | null;
      note?: string | null;
      rawSample?: Array<{ title?: string; url?: string }>;
    };
  }
  distress?: { signals: Array<{ title?: string; url?: string; description?: string; flags: string[] }>; source: string }
  summary?: string
  generatedAt?: string
  errors?: string[]
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
  deepScan?:   DeepScanData
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

async function runDeepScanForCapture(capture: Capture, onStep?: (step: string) => void): Promise<DeepScanData> {
  const scan: DeepScanData = { errors: [] }
  const base = { address: capture.address, city: capture.city, state: capture.state, zip: capture.zip }

  onStep?.('photos · checking property imagery')
  try {
    const { data, error } = await supabase.functions.invoke('property-photos', { body: base })
    if (error) throw error
    scan.photos = { list: data?.photos || [], source: data?.source || 'none', count: data?.count || 0 }
  } catch (e: any) {
    scan.errors?.push(`Photos unavailable: ${e?.message || 'source failed'}`)
  }

  onStep?.('permits · scanning building records')
  let permitsData: any = null
  try {
    const permitBody: any = { ...base, mode: 'permits' }
    if (capture.trace?.owner?.name) permitBody.ownerName = capture.trace.owner.name
    const parcelId = (capture.trace?.property as any)?.parcelId || (capture.trace?.property as any)?.parcel
    if (parcelId) permitBody.parcelId = parcelId
    const { data, error } = await supabase.functions.invoke('deep-scan', { body: permitBody })
    if (error) throw error
    permitsData = data || { permits: [], violations: [], source: 'none' }
    scan.permits = permitsData
  } catch (e: any) {
    scan.errors?.push(`Permits unavailable: ${e?.message || 'source failed'}`)
    scan.permits = { permits: [], violations: [], source: 'unavailable' }
  }

  onStep?.('distress · searching risk signals')
  let distressData: any = null
  try {
    const { data, error } = await supabase.functions.invoke('deep-scan', { body: { ...base, mode: 'distress' } })
    if (error) throw error
    distressData = data || { signals: [], source: 'none' }
    scan.distress = distressData
  } catch (e: any) {
    scan.errors?.push(`Distress search unavailable: ${e?.message || 'source failed'}`)
    scan.distress = { signals: [], source: 'unavailable' }
  }

  onStep?.('AI summary · building investor brief')
  try {
    const context = {
      ownerName: capture.trace?.owner?.name,
      equityPct: capture.trace?.property?.equityPct,
      taxStatus: capture.trace?.property?.taxStatus,
      estValue: capture.trace?.property?.estimatedValue,
      vacant: capture.trace?.property?.vacant,
      absentee: capture.trace?.property?.absenteeOwner,
      arvSuggestion: capture.comps?.arvSuggestion,
      motivationTier: capture.motivation?.tier,
      motivationScore: capture.motivation?.score,
      permits: (permitsData?.permits || []).slice(0, 3),
      violations: (permitsData?.violations || []).slice(0, 3),
      distress: (distressData?.signals || []).slice(0, 3),
    }
    const { data, error } = await supabase.functions.invoke('deep-scan', { body: { ...base, mode: 'summary', context } })
    if (error) throw error
    scan.summary = data?.summary || ''
  } catch (e: any) {
    scan.errors?.push(`AI summary unavailable: ${e?.message || 'source failed'}`)
  }

  scan.generatedAt = new Date().toISOString()
  return scan
}

function buildAnalysis(capture: Capture, deepScan?: DeepScanData | null) {
  const comps = capture.comps
  const trace = capture.trace
  const motiv = capture.motivation
  const violations = deepScan?.permits?.violations?.length || 0
  const permits = deepScan?.permits?.permits?.length || 0
  const distress = deepScan?.distress?.signals?.length || 0
  const photos = deepScan?.photos?.count || 0
  const leadSignals = [
    trace?.property?.absenteeOwner,
    trace?.property?.vacant,
    trace?.property?.taxStatus === 'delinquent',
    violations > 0,
    distress > 0,
    (trace?.property?.equityPct || 0) >= 35,
  ].filter(Boolean).length

  const score = motiv?.score || Math.min(95, 45 + leadSignals * 9 + (comps ? 8 : 0))
  const tier = score >= 75 ? 'High Priority' : score >= 60 ? 'Worth Pursuing' : score >= 45 ? 'Research Further' : 'Low Signal'
  const confidence = motiv ? 'AI scored' : comps && trace?.hit ? 'Strong' : comps ? 'Comps only' : 'Preliminary'
  const maxOffer = comps?.arvSuggestion ? Math.round(comps.arvSuggestion * 0.7) : 0

  const reasons = [
    comps?.arvSuggestion ? `Suggested ARV ${fmt$(comps.arvSuggestion)} with ${comps.confidence} comp confidence.` : 'Comp data did not return enough support for ARV yet.',
    maxOffer ? `70% MAO target is ${fmt$(maxOffer)} before rehab, holding costs, and assignment margin.` : 'Max offer needs ARV support before using it for negotiation.',
    trace?.hit && trace.owner?.name ? `Owner found: ${trace.owner.name}${trace.phones?.length ? ` · ${trace.phones.length} phone record${trace.phones.length === 1 ? '' : 's'}` : ''}.` : 'Owner/contact data is not available from the current lookup.',
    trace?.property?.equityPct ? `Estimated equity is ${trace.property.equityPct.toFixed(0)}%.` : 'Equity could not be verified from the current data.',
    violations || permits ? `${violations} violation record${violations === 1 ? '' : 's'} and ${permits} permit record${permits === 1 ? '' : 's'} found.` : 'No permit or violation records found in the scan.',
    distress ? `${distress} distress signal${distress === 1 ? '' : 's'} detected from public-source search.` : 'No public distress signals detected yet.',
    photos ? `${photos} property image${photos === 1 ? '' : 's'} available for visual review.` : 'No property photos returned from imagery sources.',
  ]

  const nextAction = score >= 75
    ? 'Call owner today, verify condition, then underwrite rehab before making an offer.'
    : score >= 60
      ? 'Save to pipeline and confirm owner motivation, property condition, and repair spread.'
      : 'Do not chase yet — gather stronger distress, contact, or equity evidence first.'

  // Letter grade
  const grade = score >= 90 ? 'A+' : score >= 82 ? 'A' : score >= 75 ? 'A-' : score >= 68 ? 'B+' : score >= 60 ? 'B' : score >= 52 ? 'C+' : score >= 45 ? 'C' : score >= 35 ? 'D' : 'F'
  const gradeColor = score >= 75 ? '#1A7A4A' : score >= 60 ? '#C45E1A' : score >= 45 ? '#8A5700' : '#C0341D'

  // Strengths & red flags (concise, tag-style)
  const strengths: string[] = []
  const redFlags: string[] = []
  if ((trace?.property?.equityPct || 0) >= 50) strengths.push(`${Math.round(trace!.property!.equityPct!)}% equity`)
  else if ((trace?.property?.equityPct || 0) >= 30) strengths.push(`${Math.round(trace!.property!.equityPct!)}% equity`)
  if (trace?.property?.absenteeOwner) strengths.push('Absentee owner')
  if (trace?.property?.vacant) redFlags.push('Vacant')
  if (trace?.property?.taxStatus === 'delinquent') redFlags.push('Tax delinquent')
  if (violations > 0) redFlags.push(`${violations} violation${violations === 1 ? '' : 's'}`)
  if (permits > 0) strengths.push(`${permits} permit record${permits === 1 ? '' : 's'}`)
  if (distress > 0) redFlags.push(`${distress} distress signal${distress === 1 ? '' : 's'}`)
  if (comps?.arvSuggestion) strengths.push(`ARV ${fmt$(comps.arvSuggestion)}`)
  if (trace?.phones?.length) strengths.push(`${trace.phones.length} phone${trace.phones.length === 1 ? '' : 's'}`)

  return { score, grade, gradeColor, tier, confidence, maxOffer, leadSignals, reasons, nextAction, strengths, redFlags }
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
function ResultCard({ capture, onAddPipeline, onDeepScanComplete }: {
  capture: Capture
  onAddPipeline: (id: string) => void
  onDeepScanComplete: (id: string, deepScan: DeepScanData) => void
}) {
  const trace = capture.trace
  const comps  = capture.comps
  const motiv  = capture.motivation
  const inPipe = capture.inPipeline

  // Deep Scan state — scoped to this card
  const [dsRunning, setDsRunning] = useState(false)
  const [dsData, setDsData] = useState<DeepScanData | null>(capture.deepScan || null)
  const [dsError, setDsError] = useState<string | null>(null)
  const [dsStep, setDsStep] = useState<string>('')
  const analysis = buildAnalysis(capture, dsData)

  const runDeepScan = async () => {
    setDsRunning(true); setDsError(null); setDsData({}); setDsStep('photos · checking property imagery')
    try {
      const scan = await runDeepScanForCapture(capture, step => setDsStep(step))
      setDsData(scan)
      onDeepScanComplete(capture.id, scan)
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

        {/* Professional Analysis */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: analysis.gradeColor + '55' }}>
          {/* Header band */}
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: 'var(--sgc-navy)' }}>
            <span className="text-[11px] font-black text-white uppercase tracking-wider">📊 Deal Analysis</span>
            <span className="text-[10px] font-bold text-white/70 uppercase tracking-wide">{analysis.confidence}</span>
          </div>

          {/* Hero rating */}
          <div className="p-4 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${analysis.gradeColor}12, transparent)` }}>
            <div className="flex-shrink-0 rounded-2xl flex flex-col items-center justify-center"
              style={{ width: 82, height: 82, background: analysis.gradeColor, boxShadow: `0 8px 20px -8px ${analysis.gradeColor}` }}>
              <div className="text-3xl font-black leading-none text-white">{analysis.grade}</div>
              <div className="text-[9px] font-bold text-white/80 uppercase tracking-wider mt-1">Grade</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black leading-none" style={{ color: analysis.gradeColor }}>{analysis.score}</span>
                <span className="text-xs font-bold" style={{ color: 'var(--sgc-gray-mid)' }}>/100</span>
              </div>
              <div className="text-xs font-black uppercase tracking-wide mt-0.5" style={{ color: analysis.gradeColor }}>{analysis.tier}</div>
              <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, analysis.score)}%`, background: analysis.gradeColor }} />
              </div>
            </div>
          </div>

          {/* Key numbers */}
          <div className="grid grid-cols-3 border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="p-3 text-center border-r" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>Max Offer</div>
              <div className="text-sm font-black mt-0.5" style={{ color: '#1A7A4A' }}>{analysis.maxOffer ? fmt$(analysis.maxOffer) : '—'}</div>
            </div>
            <div className="p-3 text-center border-r" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>Signals</div>
              <div className="text-sm font-black mt-0.5" style={{ color: 'var(--sgc-navy)' }}>{analysis.leadSignals} / 6</div>
            </div>
            <div className="p-3 text-center">
              <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>Priority</div>
              <div className="text-[11px] font-black mt-0.5 leading-tight" style={{ color: analysis.gradeColor }}>{analysis.tier}</div>
            </div>
          </div>

          {/* Permit Activity strip (surfaced from Deep Scan) */}
          {dsData?.permits && (() => {
            const p = dsData.permits.permits || []
            const v = dsData.permits.violations || []
            const all = [
              ...v.map(x => ({ ...x, type: 'violation' as const })),
              ...p.map(x => ({ ...x, type: 'permit' as const })),
            ].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            const latest = all.find(i => i.date)?.date
            const total = all.length
            return (
              <div className="border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                <div className="px-3 py-2.5 flex items-center justify-between" style={{ background: '#F7F9FC' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🏗️</span>
                    <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>Permit Activity</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'white', color: 'var(--sgc-navy)', border: '1px solid var(--sgc-gray-border)' }}>
                      {p.length} permit{p.length === 1 ? '' : 's'} · {v.length} violation{v.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {latest && (
                    <span className="text-[9px] font-bold" style={{ color: 'var(--sgc-gray-mid)' }}>
                      Latest {new Date(latest).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>

                {total === 0 ? (
                  <div className="px-3 py-2.5 space-y-2">
                    <div className="text-[11px] font-semibold" style={{ color: 'var(--sgc-gray-mid)' }}>
                      {dsData.permits.debug?.note || 'No matched permits or violations for this address.'}
                    </div>
                    <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>
                      Scan: {dsData.permits.debug?.queriesOk || 0}/{dsData.permits.debug?.queriesRun || 0} queries · {dsData.permits.debug?.rawHits || 0} raw web hits {dsData.permits.debug?.aiUsed ? '· AI verified' : ''}
                    </div>
                    {dsData.permits.debug?.rawSample && dsData.permits.debug.rawSample.length > 0 && (
                      <div className="rounded-md p-2 space-y-1" style={{ background: '#F7F9FC' }}>
                        <div className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>Manual sources to check</div>
                        {dsData.permits.debug.rawSample.slice(0, 4).map((r, i) => (
                          <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                            className="block text-[10px] no-underline truncate" style={{ color: 'var(--sgc-navy)' }}>
                            → {r.title || r.url}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2 space-y-1.5">
                    {all.slice(0, 3).map((it, i) => {
                      const isV = it.type === 'violation'
                      const color = isV ? '#C0341D' : 'var(--sgc-navy)'
                      const conf = it.confidence || 'low'
                      const confBg = conf === 'high' ? '#1A7A4A' : conf === 'medium' ? '#C45E1A' : '#8892A6'
                      const dateText = it.date
                        ? new Date(it.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : (it.dateLabel || 'undated')
                      return (
                        <a key={i} href={it.url} target={it.url ? '_blank' : undefined} rel="noopener noreferrer"
                          className="flex items-center gap-2 text-[11px] no-underline py-1 px-1.5 rounded-md hover:bg-black/5 transition-colors"
                          style={{ color: 'var(--sgc-black)' }}>
                          <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                          <span className="font-mono font-bold flex-shrink-0" style={{ color, minWidth: 78 }}>{dateText}</span>
                          <span className="flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase" style={{ background: '#EEF2FB', color }}>
                            {isV ? 'Violation' : (it.permitType || 'Permit')}
                          </span>
                          <span className="truncate flex-1 font-semibold">{it.title || it.url || 'record'}</span>
                          <span className="flex-shrink-0 text-[8px] font-black px-1 py-0.5 rounded uppercase text-white" style={{ background: confBg }}
                            title={it.matchReasons?.join(' · ') || 'match confidence'}>
                            {conf}
                          </span>
                        </a>
                      )
                    })}
                    {total > 3 && (
                      <div className="text-[10px] pt-1 font-semibold" style={{ color: 'var(--sgc-gray-mid)' }}>
                        + {total - 3} more in full timeline below ↓
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* No-permits-yet nudge when Deep Scan hasn't been run */}
          {!dsData?.permits && !dsRunning && (
            <div className="border-t px-3 py-2.5 flex items-center justify-between gap-2" style={{ borderColor: 'var(--sgc-gray-border)', background: '#FEF7EA' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span>🏗️</span>
                <span className="text-[11px] font-bold truncate" style={{ color: '#8A5700' }}>Permit history not scanned yet</span>
              </div>
              <button onClick={runDeepScan}
                className="text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full border-none cursor-pointer text-white flex-shrink-0"
                style={{ background: '#0F2460' }}>
                ⚡ Run Deep Scan
              </button>
            </div>
          )}

          {/* Strengths + Red flags */}
          {(analysis.strengths.length > 0 || analysis.redFlags.length > 0) && (
            <div className="px-3 pt-3 pb-1 border-t space-y-2" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              {analysis.strengths.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#1A7A4A' }}>✓ Strengths</div>
                  <div className="flex flex-wrap gap-1">
                    {analysis.strengths.map((s, i) => (
                      <span key={i} className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: '#EDFAF3', color: '#1A7A4A' }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {analysis.redFlags.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#C0341D' }}>⚠ Red Flags</div>
                  <div className="flex flex-wrap gap-1">
                    {analysis.redFlags.map((s, i) => (
                      <span key={i} className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: '#FEF0ED', color: '#C0341D' }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Next move */}
          <div className="px-3 py-3 border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="rounded-xl p-3" style={{ background: analysis.gradeColor + '12', borderLeft: `3px solid ${analysis.gradeColor}` }}>
              <div className="text-[9px] font-black uppercase tracking-wider mb-1" style={{ color: analysis.gradeColor }}>▶ Recommended Next Move</div>
              <div className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--sgc-black)' }}>{analysis.nextAction}</div>
            </div>
          </div>

          {/* Detail reasons (collapsible via <details>) */}
          <details className="border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <summary className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none" style={{ color: 'var(--sgc-gray-mid)' }}>
              Show analysis details
            </summary>
            <div className="px-3 pb-3 space-y-1.5">
              {analysis.reasons.map((reason, i) => (
                <div key={i} className="flex gap-2 text-[11px] leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>
                  <span style={{ color: analysis.gradeColor }}>•</span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </details>
        </div>

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
          <button
            onClick={runDeepScan}
            disabled={dsRunning}
            className="px-3 py-3 rounded-xl text-sm font-bold border-none cursor-pointer flex items-center gap-1"
            style={{ background: dsRunning ? '#EEF2FB' : '#0F2460', color: dsRunning ? 'var(--sgc-navy)' : 'white' }}
            title="Deep Scan — photos, permits, violations, distress signals, AI summary">
            {dsRunning ? '⏳' : dsData?.generatedAt ? '✓' : '⚡'} <span className="hidden sm:inline">Deep Scan</span>
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

        {/* Deep Scan panel */}
        {(dsRunning || dsData || dsError) && (
          <div className="rounded-xl border overflow-hidden mt-2" style={{ borderColor: 'var(--sgc-navy)40' }}>
            <div className="px-3 py-2 flex items-center justify-between" style={{ background: '#0F2460' }}>
              <span className="text-xs font-bold text-white">⚡ Deep Scan</span>
              {dsRunning && <span className="text-[10px] text-white/80">{dsStep} · ~45 sec</span>}
              {!dsRunning && dsData?.generatedAt && <span className="text-[10px] text-white/60">✓ complete</span>}
            </div>
            <div className="p-3 space-y-3">
              {dsError && <div className="text-xs p-2 rounded bg-red-50 text-red-700">{dsError}</div>}

              {dsRunning && (
                <div className="space-y-2">
                  {['photos', 'permits', 'distress', 'AI summary'].map(step => {
                    const active = dsStep.toLowerCase().includes(step === 'AI summary' ? 'ai summary' : step)
                    return (
                      <div key={step} className="flex items-center gap-2 text-xs" style={{ color: active ? 'var(--sgc-navy)' : 'var(--sgc-gray-mid)' }}>
                        <span>{active ? '⏳' : '○'}</span>
                        <span className="font-semibold capitalize">{step}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Photos */}
              {dsData?.photos && dsData.photos.list.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-navy)' }}>📸 Photos ({dsData.photos.count})</div>
                  <div className="flex gap-1.5 overflow-x-auto">
                    {dsData.photos.list.slice(0, 6).map((src, i) => (
                      <img key={i} src={src} alt="" className="h-16 w-20 object-cover rounded flex-shrink-0" />
                    ))}
                  </div>
                </div>
              )}

              {/* Permit Timeline */}
              {dsData?.permits && (() => {
                const items = [
                  ...dsData.permits.violations.map(v => ({ ...v, type: 'violation' as const })),
                  ...dsData.permits.permits.map(p => ({ ...p, type: 'permit' as const })),
                ]
                // Sort by date desc, undated last
                items.sort((a, b) => {
                  if (!a.date && !b.date) return 0
                  if (!a.date) return 1
                  if (!b.date) return -1
                  return b.date.localeCompare(a.date)
                })
                const dated = items.filter(i => i.date)
                const undated = items.filter(i => !i.date)
                const total = items.length
                const latest = dated[0]?.date
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>
                        🏗️ Permit Timeline ({total})
                      </div>
                      {latest && (
                        <div className="text-[9px] font-bold" style={{ color: 'var(--sgc-gray-mid)' }}>
                          Latest: {new Date(latest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </div>

                    {total === 0 && (
                      <div className="text-[11px] p-3 rounded-lg text-center" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                        No permit or violation records found
                      </div>
                    )}

                    {total > 0 && (
                      <div className="relative pl-4">
                        {/* Vertical rail */}
                        <div className="absolute left-1.5 top-1 bottom-1 w-px" style={{ background: 'var(--sgc-gray-border)' }} />
                        {items.slice(0, 8).map((it, i) => {
                          const isViolation = it.type === 'violation'
                          const dotColor = isViolation ? '#C0341D' : 'var(--sgc-navy)'
                          const bgColor = isViolation ? '#FEF0ED' : '#EEF2FB'
                          const dateText = it.date
                            ? new Date(it.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : (it.dateLabel || 'Date unknown')
                          const conf = it.confidence || 'low'
                          const confMeta = conf === 'high'
                            ? { label: 'High match', bg: '#1A7A4A', dotBg: '#EDFAF3', text: '#1A7A4A' }
                            : conf === 'medium'
                              ? { label: 'Medium match', bg: '#C45E1A', dotBg: '#FEF7EA', text: '#8A5700' }
                              : { label: 'Low match', bg: '#8892A6', dotBg: '#F1F3F7', text: '#5C6473' }
                          return (
                            <div key={i} className="relative mb-2 last:mb-0">
                              {/* Dot */}
                              <div className="absolute -left-[13px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white"
                                style={{ background: dotColor }} />
                              <div className="rounded-lg p-2" style={{ background: bgColor }}>
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: dotColor }}>
                                    {it.date ? dateText : '⏱ ' + dateText}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span
                                      className="text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide text-white"
                                      style={{ background: confMeta.bg }}
                                      title={`${confMeta.label} — ${it.matchReasons?.join(' · ') || 'no signals'}`}>
                                      {conf === 'high' ? '●●●' : conf === 'medium' ? '●●○' : '●○○'} {conf}
                                    </span>
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'white', color: dotColor }}>
                                      {isViolation ? 'Violation' : (it.permitType || 'Permit')}
                                    </span>
                                  </div>
                                </div>
                                {it.title && (
                                  <div className="text-[11px] font-semibold leading-snug" style={{ color: 'var(--sgc-black)' }}>
                                    {it.title}
                                  </div>
                                )}
                                {it.description && (
                                  <div className="text-[10px] leading-snug mt-0.5 line-clamp-2" style={{ color: 'var(--sgc-gray-mid)' }}>
                                    {it.description}
                                  </div>
                                )}
                                {it.matchReasons && it.matchReasons.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {it.matchReasons.map((r, ri) => (
                                      <span key={ri} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                                        style={{ background: confMeta.dotBg, color: confMeta.text }}>
                                        ✓ {r}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                                    {it.source || 'source'}
                                  </span>
                                  {it.url && (
                                    <a href={it.url} target="_blank" rel="noopener noreferrer"
                                      className="text-[9px] font-bold no-underline"
                                      style={{ color: dotColor }}>
                                      Open record →
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {undated.length > 0 && dated.length > 0 && (
                          <div className="text-[9px] mt-1 pl-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                            {undated.length} additional record{undated.length === 1 ? '' : 's'} without dates
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Distress */}
              {dsData?.distress && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-navy)' }}>
                    🚨 Distress signals ({dsData.distress.signals.length})
                  </div>
                  {dsData.distress.signals.slice(0, 4).map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                       className="block text-xs py-1 no-underline" style={{ color: '#C45E1A' }}>
                      • {s.title || s.url}
                      {s.flags?.length ? <span className="ml-1 text-[9px] uppercase" style={{ color: '#8A5700' }}>[{s.flags.join(', ')}]</span> : null}
                    </a>
                  ))}
                  {dsData.distress.signals.length === 0 && (
                    <div className="text-[11px]" style={{ color: 'var(--sgc-gray-mid)' }}>No distress signals detected</div>
                  )}
                </div>
              )}

              {/* AI Summary */}
              {dsData?.summary && (
                <div className="rounded-lg p-2.5" style={{ background: '#EEF2FB' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-navy)' }}>🧠 AI Summary</div>
                  <div className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--sgc-black)' }}>{dsData.summary}</div>
                </div>
              )}

              {!dsRunning && dsData?.errors?.length ? (
                <div className="text-[10px] leading-relaxed p-2 rounded" style={{ background: '#FEF7EA', color: '#8A5700' }}>
                  Partial scan: {dsData.errors.slice(0, 2).join(' · ')}
                </div>
              ) : null}
            </div>
          </div>
        )}
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

    setProgress(p => [...p, '⚡ Deep Scan: photos · checking property imagery'])
    try {
      const deepScan = await runDeepScanForCapture(newCapture, step => {
        setProgress(p => [...p.filter(item => !item.startsWith('⚡ Deep Scan:')), `⚡ Deep Scan: ${step}`])
      })
      newCapture.deepScan = deepScan
    } catch {}

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

  const handleDeepScanComplete = (captureId: string, deepScan: DeepScanData) => {
    const all = loadCaptures()
    const updated = all.map(c => c.id === captureId ? { ...c, deepScan } : c)
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
                    { icon: '⚡', t: 'Deep Scan — photos, permits, distress, investor summary' },
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
                    onDeepScanComplete={handleDeepScanComplete}
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
