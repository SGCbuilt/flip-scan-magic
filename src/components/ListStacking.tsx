import { toast } from '../lib/toast'
/**
 * List Stacking — Cross-Source Signal Intelligence
 *
 * Finds properties appearing in multiple sources simultaneously.
 * The more signals stacked on one address, the higher the motivation.
 *
 * How to use:
 *   1. Run a Lead Radar scan first (or use existing results)
 *   2. Open List Stacking — it cross-references all your data
 *   3. Properties with multiple signals rise to the top
 *   4. One click → skip trace → pipeline
 */
import { useState, useCallback } from 'react'
import { stackLeads, StackedLead } from '../lib/listStacking'
import { fetchLeadRadar, RADAR_SOURCES, Lead } from '../lib/leadRadar'
import { skipTrace, SkipTraceResult } from '../lib/skipTrace'
import { addToPipeline, isInPipeline } from '../lib/pipeline'
import { computeMotivationScore, MotivationScore } from '../lib/motivationScore'

const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'

const TIER_CONFIG = {
  'triple+': { label: '🔥🔥🔥 Triple Signal',  color: '#C0341D', bg: '#FEF0ED', border: '#C0341D' },
  'double':  { label: '⚡⚡ Double Signal',    color: '#C45E1A', bg: '#FEF3EA', border: '#C45E1A' },
  'single':  { label: '→ Single Signal',       color: '#1B3A8C', bg: '#EEF2FB', border: '#1B3A8C' },
}

const SEV_COLOR: Record<string, string> = {
  critical: '#C0341D', high: '#C45E1A', medium: '#534AB7', low: 'var(--sgc-gray-mid)'
}

// ── Stacked Lead Card ─────────────────────────────────────────────────────────
function StackedCard({ lead, tracerKey, onAdded }: {
  lead: StackedLead
  tracerKey: string
  onAdded: () => void
}) {
  const tc = TIER_CONFIG[lead.tier]
  const [expanded,    setExpanded]    = useState(false)
  const [tracing,     setTracing]     = useState(false)
  const [trace,       setTrace]       = useState<SkipTraceResult | null>(null)
  const [motivation,  setMotivation]  = useState<MotivationScore | null>(null)
  const [motivLoading,setMotivLoad]   = useState(false)
  const [inPipeline,  setInPipeline]  = useState(() => isInPipeline(lead.id))

  const handleTrace = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!tracerKey) { toast.error('Tracerfy API key missing — add it in Settings → API Keys'); return }
    setTracing(true)
    const r = await skipTrace(lead.address, lead.city, lead.state, lead.zip, tracerKey)
    setTrace(r)
    setTracing(false)
    if (r?.hit) {
      setMotivLoad(true)
      const synLead = {
        id: lead.id, address: lead.address, city: lead.city, state: lead.state,
        zip: lead.zip, county: lead.county, lat: lead.lat, lng: lead.lng,
        signalType: lead.signals[0]?.signalType as any || 'code_violation',
        signalLabel: lead.distressSummary,
        description: lead.distressSummary,
        caseNumber: '', status: 'Open',
        filedDate: lead.firstSeen,
        severity: (lead.signals[0]?.severity || 'medium') as any,
        source: lead.signals.map(s => s.sourceName).join(' + '),
        sourceUrl: '', rawData: null,
        investorScore: lead.stackScore,
      }
      const m = await computeMotivationScore(synLead, r)
      if (m) setMotivation(m)
      setMotivLoad(false)
    }
  }

  const handleAddPipeline = (e: React.MouseEvent) => {
    e.stopPropagation()
    addToPipeline({
      id: lead.id,
      stage: 'new',
      priority: lead.tier === 'triple+' ? 'hot' : lead.tier === 'double' ? 'hot' : 'warm',
      address: lead.address, city: lead.city, state: lead.state,
      zip: lead.zip, county: lead.county,
      signalType: lead.signals[0]?.signalType || 'code_violation',
      signalLabel: `List Stack (${lead.signalCount} signals): ${lead.distressSummary.slice(0, 60)}`,
      investorScore: lead.stackScore,
      severity: lead.signals[0]?.severity || 'medium',
      source: `List Stack — ${lead.signals.map(s => s.sourceName).join(' + ')}`,
      ownerName:  trace?.owner?.name   || '',
      phones:     trace?.phones        || [],
      emails:     trace?.emails        || [],
      mailingAddr:trace?.owner?.mailingAddr || '',
      estimatedARV:    trace?.property?.estimatedValue || 0,
      estimatedRehab:  0,
      estimatedProfit: 0,
      maxOffer:        0,
      notes: `Stack: ${lead.distressSummary}\n${lead.investorNotes.join('\n')}`,
      tags: ['list-stack', lead.tier],
      assignedTo: 'Albert',
    })
    setInPipeline(true)
    onAdded()
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden border"
      style={{ borderColor: tc.border + '50' }}>

      {/* Tier stripe */}
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${tc.color}, ${tc.color}88)` }}/>

      <div className="p-4" onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}>
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          {/* Stack score */}
          <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
            style={{ background: tc.bg, border: `2px solid ${tc.color}40` }}>
            <div className="text-base font-black leading-none" style={{ color: tc.color }}>
              {lead.stackScore}
            </div>
            <div className="text-[8px] font-bold" style={{ color: tc.color }}>STACK</div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm leading-tight" style={{ color: 'var(--sgc-black)' }}>
              {lead.address}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              {lead.city}, {lead.state} {lead.zip}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                style={{ background: tc.bg, color: tc.color }}>
                {tc.label}
              </span>
              {lead.signals.map((s, i) => (
                <span key={i} className="text-[9px] px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--sgc-gray-light)', color: SEV_COLOR[s.severity] || 'var(--sgc-gray-mid)' }}>
                  {s.signalType.replace('_',' ')}
                </span>
              ))}
            </div>
          </div>

          <div className="text-xs flex-shrink-0" style={{ color: 'var(--sgc-gray-mid)' }}>
            {expanded ? '▲' : '▼'}
          </div>
        </div>

        {/* Signal summary */}
        <div className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>
          {lead.distressSummary}
        </div>

        {/* Investor notes */}
        {lead.investorNotes.length > 0 && (
          <div className="space-y-1 mb-3">
            {lead.investorNotes.map((note, i) => (
              <div key={i} className="text-xs px-2.5 py-1 rounded-lg"
                style={{ background: tc.bg, color: tc.color }}>
                {note}
              </div>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <button onClick={handleTrace} disabled={tracing || !!trace}
            className="text-xs font-bold px-3 py-1.5 rounded-lg border-none cursor-pointer"
            style={{ background: trace ? '#EDFAF3' : tracing ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)', color: trace ? '#1A7A4A' : 'white' }}>
            {tracing ? '⟳' : trace ? '✓ Traced' : '🔍 Skip Trace'}
          </button>
          <button onClick={handleAddPipeline} disabled={inPipeline}
            className="text-xs font-bold px-3 py-1.5 rounded-lg border-none cursor-pointer"
            style={{ background: inPipeline ? '#EDFAF3' : '#1A7A4A', color: inPipeline ? '#1A7A4A' : 'white' }}>
            {inPipeline ? '✓ In Pipeline' : '+ Pipeline'}
          </button>
          <a href={`https://maps.google.com/?q=${encodeURIComponent(lead.address + ' ' + lead.city + ' ' + lead.state)}`}
            target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border no-underline"
            style={{ color: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)30', background: 'var(--sgc-navy-pale)' }}>
            📍
          </a>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t space-y-4" style={{ borderColor: 'var(--sgc-gray-border)' }}>

          {/* All signals */}
          <div className="pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>
              All Signals ({lead.signals.length})
            </div>
            <div className="space-y-2">
              {lead.signals.map((sig, i) => (
                <div key={i} className="rounded-xl border p-3"
                  style={{ borderColor: SEV_COLOR[sig.severity] + '30', background: 'var(--sgc-gray-light)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-bold" style={{ color: SEV_COLOR[sig.severity] }}>
                      {sig.signalLabel}
                    </div>
                    <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                      {sig.filedDate} · {sig.sourceName}
                    </div>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{sig.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Skip trace result */}
          {trace?.hit && (
            <div className="rounded-xl border p-3" style={{ background: '#EDFAF3', borderColor: '#1A7A4A40' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#1A7A4A' }}>
                ✓ Owner Found
              </div>
              {trace.owner?.name && (
                <div className="font-bold text-sm mb-1.5" style={{ color: 'var(--sgc-black)' }}>
                  👤 {trace.owner.name}
                </div>
              )}
              {trace.phones.filter(p => !p.litigator).map((p, i) => (
                <a key={i} href={`tel:${p.number}`}
                  onClick={e => { if (p.dnc) { e.preventDefault(); toast.warning('⛔ DNC — Do Not Call. TCPA violation risk.') } }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl mb-1 no-underline"
                  style={{ background: p.dnc ? '#FEF0ED' : '#EDFAF3', color: p.dnc ? '#C0341D' : '#1A7A4A' }}>
                  <span>{p.dnc ? '⛔' : '📞'}</span>
                  <span className="font-mono font-bold text-sm">{p.number}</span>
                  <span className="text-[10px] capitalize">{p.type}</span>
                  {p.dnc && <span className="text-[10px] font-black ml-auto">DNC</span>}
                </a>
              ))}
              {trace.property && (
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t" style={{ borderColor: '#1A7A4A20' }}>
                  {[
                    { l: 'Value', v: trace.property.estimatedValue > 0 ? fmt$(trace.property.estimatedValue) : '—' },
                    { l: 'Equity', v: trace.property.equityPct > 0 ? `${trace.property.equityPct.toFixed(0)}%` : '—' },
                    { l: 'Tax', v: trace.property.taxStatus || '—' },
                  ].map(m => (
                    <div key={m.l} className="text-center">
                      <div className="text-[9px]" style={{ color: '#1A7A4A' }}>{m.l}</div>
                      <div className="text-xs font-bold" style={{ color: 'var(--sgc-black)' }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Motivation Score */}
          {(motivation || motivLoading) && (
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#534AB740' }}>
              <div className="px-3 py-2 flex items-center justify-between" style={{ background: '#534AB7' }}>
                <span className="text-xs font-bold text-white">🧠 AI Motivation Score</span>
                {motivation && <span className="text-2xl font-black text-white">{motivation.score}</span>}
                {motivLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin"/>}
              </div>
              {motivation && (
                <div className="p-3 space-y-2">
                  <div className="text-xs font-semibold" style={{ color: 'var(--sgc-black)' }}>{motivation.primaryDriver}</div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{motivation.explanation}</div>
                  <div className="text-xs p-2 rounded-lg" style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
                    → {motivation.recommendedAction}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ListStacking() {
  const [stacked,    setStacked]    = useState<StackedLead[]>([])
  const [loading,    setLoading]    = useState(false)
  const [progress,   setProgress]   = useState('')
  const [scanned,    setScanned]    = useState(false)
  const [filterTier, setFilterTier] = useState<'all' | 'triple+' | 'double' | 'single'>('all')
  const [filterMin,  setFilterMin]  = useState(0)
  const [days,       setDays]       = useState(30)
  const [refresh,    setRefresh]    = useState(0)

  const tracerKey = (() => { try { return localStorage.getItem('fscan_tracer') || '' } catch { return '' } })()

  const handleScan = useCallback(async () => {
    setLoading(true)
    setProgress('Scanning all lead sources...')

    // Pull fresh radar leads from all enabled sources
    const enabledIds = RADAR_SOURCES.map(s => s.id)
    let radarLeads: Lead[] = []

    try {
      setProgress('Pulling government API data...')
      const result = await fetchLeadRadar(enabledIds, days,
        (sourceId, status) => setProgress(`${status === 'loading' ? '⟳' : status === 'loaded' ? '✓' : '✗'} ${sourceId}`)
      )
      radarLeads = result.leads
    } catch (e) {
      console.warn('[ListStacking] radar fetch failed', e)
    }

    setProgress('Cross-referencing signals...')
    const results = stackLeads(radarLeads)
    setStacked(results)
    setScanned(true)
    setLoading(false)
    setProgress('')
  }, [days])

  const displayed = stacked
    .filter(l => filterTier === 'all' || l.tier === filterTier)
    .filter(l => l.stackScore >= filterMin)

  const tripleCount = stacked.filter(l => l.tier === 'triple+').length
  const doubleCount = stacked.filter(l => l.tier === 'double').length
  const singleCount = stacked.filter(l => l.tier === 'single').length

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>

        {scanned && (
          <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(4,1fr)', borderColor: 'var(--sgc-gray-border)' }}>
            {[
              { l: '🔥 Triple+ Signal', v: tripleCount, c: '#C0341D', f: 'triple+' as const },
              { l: '⚡ Double Signal',  v: doubleCount, c: '#C45E1A', f: 'double'  as const },
              { l: '→ Single Signal',   v: singleCount, c: '#1B3A8C', f: 'single'  as const },
              { l: 'Total Properties',  v: stacked.length, c: 'var(--sgc-navy)', f: 'all' as const },
            ].map((s, i) => (
              <button key={s.l}
                onClick={() => setFilterTier(s.f)}
                className={`p-3 text-left border-none cursor-pointer ${i < 3 ? 'border-r' : ''}`}
                style={{
                  borderColor: 'var(--sgc-gray-border)',
                  background: filterTier === s.f ? 'var(--sgc-navy-pale)' : 'white'
                }}>
                <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
                <div className="text-xl font-bold" style={{ color: s.c }}>{s.v}</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 px-5 py-3 flex-wrap">
          {/* Days */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Window:</span>
            {[7, 14, 30, 60, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                style={days === d
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {d}d
              </button>
            ))}
          </div>

          {/* Min score */}
          {scanned && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Min score:</span>
              {[0, 60, 75, 90].map(v => (
                <button key={v} onClick={() => setFilterMin(v)}
                  className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                  style={filterMin === v
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {v === 0 ? 'All' : `${v}+`}
                </button>
              ))}
            </div>
          )}

          <button onClick={handleScan} disabled={loading}
            className="ml-auto px-5 py-2 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: loading ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)' }}>
            {loading ? '⟳ Scanning...' : scanned ? '↻ Re-Scan' : '🔍 Stack All Sources'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-12 h-12 border-2 rounded-full spin mb-5"
              style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }}/>
            <div className="text-base font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>
              Cross-referencing all sources...
            </div>
            <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>{progress}</div>
          </div>
        )}

        {/* Idle */}
        {!loading && !scanned && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto px-8">
            <div className="text-6xl mb-5">⚡</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>List Stacking</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--sgc-gray-mid)' }}>
              Pulls all lead sources simultaneously and cross-references every address.
              Properties with multiple distress signals are exponentially more motivated sellers.
            </p>
            <div className="space-y-3 w-full mb-6 text-left">
              {[
                { icon: '🔥', t: 'Triple+ Signal (3 sources)', d: 'Code violation + below-assessed sale + Drive for Dollars observation. Near certainty of motivated seller. Call immediately.' },
                { icon: '⚡', t: 'Double Signal (2 sources)',   d: 'Two independent data sources flagging the same address. Strong motivation indicator. High priority contact.' },
                { icon: '→', t: 'Single Signal (1 source)',    d: 'Standard lead. Worth pursuing but lower priority than stacked leads.' },
              ].map(s => (
                <div key={s.t} className="flex gap-3 bg-white rounded-xl border p-3"
                  style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <span className="text-2xl flex-shrink-0">{s.icon}</span>
                  <div>
                    <div className="text-sm font-bold mb-0.5" style={{ color: 'var(--sgc-navy)' }}>{s.t}</div>
                    <div className="text-xs leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs mb-4 p-3 rounded-xl w-full text-left" style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
              📡 Sources included: Norfolk violations + permits, Virginia Beach, Richmond, Charlotte, Raleigh, Chatham CAMA, all your Drive for Dollars captures
            </div>
            <button onClick={handleScan}
              className="px-8 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>
              🔍 Stack All Sources Now
            </button>
          </div>
        )}

        {/* Results */}
        {!loading && scanned && (
          <>
            {displayed.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">👍</div>
                <div className="text-sm font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>
                  No stacked leads match your filters
                </div>
                <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                  Try lowering the min score or widening the time window
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--sgc-navy)' }}>
                    {filterTier === 'all' ? 'All' : TIER_CONFIG[filterTier].label} — {displayed.length} properties
                  </div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                    Sorted by stack score · Triple signals first
                  </div>
                </div>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))' }}>
                  {displayed.map(lead => (
                    <StackedCard
                      key={lead.id}
                      lead={lead}
                      tracerKey={tracerKey}
                      onAdded={() => setRefresh(r => r + 1)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
