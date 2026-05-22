/**
 * Lead Radar — Motivated Seller Early Warning System
 * Pulls real public records from VA + NC government APIs
 */
import { useState, useCallback } from 'react'
import {
  fetchLeadRadar, RADAR_SOURCES,
  Lead, RadarResult, RadarSource, Severity, SignalType
} from '../lib/leadRadar'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: 'Critical',  color: '#C0341D', bg: '#FEF0ED', dot: '#C0341D' },
  high:     { label: 'High',      color: '#8A5700', bg: '#FEF7EA', dot: '#C45E1A' },
  medium:   { label: 'Medium',    color: '#534AB7', bg: '#EEEDFE', dot: '#534AB7' },
  low:      { label: 'Low',       color: 'var(--sgc-gray-mid)', bg: 'var(--sgc-gray-light)', dot: 'var(--sgc-gray-mid)' },
}

const SIGNAL_CONFIG: Record<SignalType, { icon: string; label: string }> = {
  code_violation:  { icon: '🚧', label: 'Code Violation'  },
  building_permit: { icon: '🏗️', label: 'Building Permit' },
  fire_damage:     { icon: '🔥', label: 'Fire Damage'     },
  tax_delinquent:  { icon: '💸', label: 'Tax Delinquent'  },
  probate:         { icon: '⚖️', label: 'Probate'         },
  foreclosure:     { icon: '🏚️', label: 'Foreclosure'     },
  eviction:        { icon: '📄', label: 'Eviction'        },
  vacant:          { icon: '🪟', label: 'Vacant Property' },
}

function ScoreBadge({ score }: { score: number }) {
  const c = score >= 80 ? '#1A7A4A' : score >= 60 ? '#C45E1A' : '#534AB7'
  const bg = score >= 80 ? '#EDFAF3' : score >= 60 ? '#FEF3EA' : '#EEEDFE'
  return (
    <div className="flex items-center justify-center w-10 h-10 rounded-full font-black text-sm flex-shrink-0"
      style={{ background: bg, color: c, border: `2px solid ${c}30` }}>
      {score}
    </div>
  )
}

function SeverityPill({ severity }: { severity: Severity }) {
  const c = SEVERITY_CONFIG[severity]
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.color }}>
      {c.label.toUpperCase()}
    </span>
  )
}

// ─── Lead Card ────────────────────────────────────────────────────────────────
function LeadCard({ lead, onExpand, expanded }: { lead: Lead; onExpand: () => void; expanded: boolean }) {
  const sc  = SEVERITY_CONFIG[lead.severity]
  const sig = SIGNAL_CONFIG[lead.signalType]
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(lead.address + ', ' + lead.city + ', ' + lead.state)}`

  return (
    <div onClick={onExpand} className="bg-white rounded-xl border cursor-pointer hover:shadow-md transition-all overflow-hidden"
      style={{ borderColor: lead.severity === 'critical' || lead.severity === 'high' ? sc.color + '40' : 'var(--sgc-gray-border)' }}>
      {/* Severity stripe */}
      <div className="h-1 w-full" style={{ background: sc.dot }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-2">
          <ScoreBadge score={lead.investorScore} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-base leading-none">{sig.icon}</span>
              <SeverityPill severity={lead.severity} />
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
                {lead.city}, {lead.state}
              </span>
              {lead.filedDate && (
                <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {new Date(lead.filedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
            <div className="font-bold text-sm leading-tight" style={{ color: 'var(--sgc-black)' }}>
              {lead.address}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              {lead.signalLabel}
            </div>
          </div>
        </div>

        {/* Description preview */}
        <div className="text-xs mb-2 line-clamp-2 leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>
          {lead.description}
        </div>

        {/* Status pill */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] px-2 py-0.5 rounded-full"
            style={{
              background: lead.status.toLowerCase().includes('open') ? '#FEF0ED' : 'var(--sgc-gray-light)',
              color: lead.status.toLowerCase().includes('open') ? '#C0341D' : 'var(--sgc-gray-mid)',
            }}>
            {lead.status}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
            {expanded ? '▲ less' : '▼ more'}
          </span>
        </div>

        {/* Expanded */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            {/* Map */}
            {lead.lat && lead.lng && (
              <div className="rounded-xl overflow-hidden" style={{ height: 140 }}>
                <iframe
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(lead.address + ', ' + lead.city + ', ' + lead.state)}&output=embed&z=17`}
                  className="w-full h-full border-0" loading="lazy" title="Property location"
                />
              </div>
            )}

            {/* Full details */}
            <div className="space-y-1 text-xs">
              {lead.caseNumber && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--sgc-gray-mid)' }}>Case #</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--sgc-black)' }}>{lead.caseNumber}</span>
                </div>
              )}
              {lead.county && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--sgc-gray-mid)' }}>County</span>
                  <span style={{ color: 'var(--sgc-black)' }}>{lead.county}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: 'var(--sgc-gray-mid)' }}>Investor Score</span>
                <span className="font-bold" style={{ color: '#1A7A4A' }}>{lead.investorScore}/100</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--sgc-gray-mid)' }}>Data Source</span>
                <span style={{ color: 'var(--sgc-black)' }}>{lead.source}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                style={{ color: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)30', background: 'var(--sgc-navy-pale)' }}>
                📍 Maps
              </a>
              <a href={`https://www.zillow.com/homes/${encodeURIComponent(lead.address + ' ' + lead.city + ' ' + lead.state)}`}
                target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                style={{ color: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)30', background: 'var(--sgc-navy-pale)' }}>
                🏠 Zillow
              </a>
              <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                style={{ color: 'var(--sgc-gray-mid)', borderColor: 'var(--sgc-gray-border)', background: 'white' }}>
                📋 Source
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Source Toggle ────────────────────────────────────────────────────────────
function SourceToggle({ source, enabled, onToggle }: { source: RadarSource; enabled: boolean; onToggle: () => void }) {
  const statusDot = source.status === 'loaded' ? '#1A7A4A'
    : source.status === 'loading' ? '#C45E1A'
    : source.status === 'error' ? '#C0341D'
    : 'var(--sgc-gray-border)'

  return (
    <div
      onClick={onToggle}
      className="flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all"
      style={{
        borderColor: enabled ? 'var(--sgc-navy)40' : 'var(--sgc-gray-border)',
        background: enabled ? 'var(--sgc-navy-pale)' : 'white',
        opacity: enabled ? 1 : 0.6,
      }}>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold leading-tight truncate" style={{ color: enabled ? 'var(--sgc-navy)' : 'var(--sgc-gray-mid)' }}>
          {source.name}
        </div>
        <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
          {source.state} · {source.signalTypes.map(t => SIGNAL_CONFIG[t].icon).join(' ')}
          {source.status === 'loaded' && source.count > 0 && ` · ${source.count} leads`}
          {source.status === 'error' && ' · failed'}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full" style={{ background: statusDot }} />
        <div className="w-9 h-5 rounded-full relative transition-all" style={{ background: enabled ? 'var(--sgc-navy)' : 'var(--sgc-gray-border)' }}>
          <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
            style={{ left: enabled ? 'calc(100% - 1.125rem)' : '0.125rem' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
const DAYS_OPTIONS = [
  { v: 1,  l: '24h'   },
  { v: 7,  l: '7 days' },
  { v: 14, l: '14 days' },
  { v: 30, l: '30 days' },
  { v: 60, l: '60 days' },
  { v: 90, l: '90 days' },
]

export default function LeadRadar() {
  const [enabledSources, setEnabledSources] = useState<Set<string>>(
    new Set(RADAR_SOURCES.filter(s => s.enabled).map(s => s.id))
  )
  const [days,       setDays]       = useState(30)
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<RadarResult | null>(null)
  const [expandedId, setExpanded]   = useState<string | null>(null)
  const [sources,    setSources]    = useState(RADAR_SOURCES.map(s => ({ ...s })))
  const [progress,   setProgress]   = useState<Record<string, string>>({})

  // Filters
  const [filterState,    setFilterState]    = useState<'all' | 'VA' | 'NC'>('all')
  const [filterSeverity, setFilterSeverity] = useState<'all' | Severity>('all')
  const [filterType,     setFilterType]     = useState<'all' | SignalType>('all')
  const [filterMinScore, setFilterMinScore] = useState(0)
  const [sortBy,         setSortBy]         = useState<'score' | 'date' | 'severity'>('score')
  const [searchText,     setSearchText]     = useState('')

  const toggleSource = (id: string) => {
    setEnabledSources(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleFetch = useCallback(async () => {
    if (!enabledSources.size) return
    setLoading(true)
    setResult(null)
    setProgress({})
    setSources(RADAR_SOURCES.map(s => ({ ...s, status: enabledSources.has(s.id) ? 'loading' : 'idle' as any })))

    const r = await fetchLeadRadar(
      Array.from(enabledSources),
      days,
      (sourceId, status, count) => {
        setSources(prev => prev.map(s =>
          s.id === sourceId ? { ...s, status: status as any, count: count ?? s.count } : s
        ))
        setProgress(prev => ({ ...prev, [sourceId]: status }))
      }
    )

    setResult(r)
    setSources(r.sources)
    setLoading(false)
  }, [enabledSources, days])

  // Filtered + sorted leads
  const displayLeads = (result?.leads || [])
    .filter(l => filterState === 'all' || l.state === filterState)
    .filter(l => filterSeverity === 'all' || l.severity === filterSeverity)
    .filter(l => filterType === 'all' || l.signalType === filterType)
    .filter(l => l.investorScore >= filterMinScore)
    .filter(l => !searchText || l.address.toLowerCase().includes(searchText.toLowerCase()) ||
                 l.description.toLowerCase().includes(searchText.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'score')    return b.investorScore - a.investorScore
      if (sortBy === 'date')     return b.filedDate.localeCompare(a.filedDate)
      if (sortBy === 'severity') {
        const order = { critical: 0, high: 1, medium: 2, low: 3 }
        return order[a.severity] - order[b.severity]
      }
      return 0
    })

  const vaCount = displayLeads.filter(l => l.state === 'VA').length
  const ncCount = displayLeads.filter(l => l.state === 'NC').length

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* LEFT PANEL */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>📡 Lead Radar</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
            Real public records · VA + NC · Live government APIs
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

          {/* Time window */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>
              Time Window
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {DAYS_OPTIONS.map(opt => (
                <button key={opt.v} onClick={() => setDays(opt.v)}
                  className="py-1.5 rounded-lg border text-xs font-medium cursor-pointer"
                  style={days === opt.v
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {/* Sources */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>
                Data Sources
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEnabledSources(new Set(RADAR_SOURCES.map(s => s.id)))}
                  className="text-[10px] cursor-pointer bg-transparent border-none font-semibold"
                  style={{ color: 'var(--sgc-navy)' }}>All</button>
                <button onClick={() => setEnabledSources(new Set())}
                  className="text-[10px] cursor-pointer bg-transparent border-none font-semibold"
                  style={{ color: 'var(--sgc-gray-mid)' }}>None</button>
              </div>
            </div>

            {/* VA sources */}
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              Virginia
            </div>
            <div className="space-y-1.5 mb-3">
              {sources.filter(s => s.state === 'VA').map(s => (
                <SourceToggle key={s.id} source={s} enabled={enabledSources.has(s.id)} onToggle={() => toggleSource(s.id)} />
              ))}
            </div>

            {/* NC sources */}
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              North Carolina
            </div>
            <div className="space-y-1.5 mb-3">
              {sources.filter(s => s.state === 'NC' && s.county !== 'Chatham').map(s => (
                <SourceToggle key={s.id} source={s} enabled={enabledSources.has(s.id)} onToggle={() => toggleSource(s.id)} />
              ))}
            </div>

            {/* Chatham County specific */}
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              Chatham County, NC
            </div>
            <div className="space-y-1.5">
              {sources.filter(s => s.county === 'Chatham').map(s => (
                <SourceToggle key={s.id} source={s} enabled={enabledSources.has(s.id)} onToggle={() => toggleSource(s.id)} />
              ))}
            </div>
          </div>

          {/* Legal notice */}
          <div className="rounded-xl p-3 text-[10px]" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
            <div className="font-semibold mb-1" style={{ color: 'var(--sgc-navy)' }}>Legal Data Sources</div>
            All data is public record under Virginia Public Records Act (Va. Code §42.1-76) and NC Public Records Law (NCGS Ch. 132). Direct government API access — no scraping.
          </div>
        </div>

        {/* Scan button */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <button onClick={handleFetch} disabled={loading || !enabledSources.size}
            className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: loading ? 'var(--sgc-gray-mid)' : enabledSources.size ? 'var(--sgc-navy)' : 'var(--sgc-gray-mid)' }}>
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin inline-block" />
                  Scanning {enabledSources.size} sources...
                </span>
              : `📡 Scan ${enabledSources.size} Sources · Last ${days} Days`}
          </button>
          {/* Live progress */}
          {loading && Object.entries(progress).length > 0 && (
            <div className="mt-2 space-y-1">
              {Object.entries(progress).map(([id, status]) => {
                const src = RADAR_SOURCES.find(s => s.id === id)
                return (
                  <div key={id} className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{
                      background: status === 'loaded' ? '#1A7A4A' : status === 'error' ? '#C0341D' : '#C45E1A'
                    }} />
                    {src?.name} — {status === 'loading' ? '⟳ fetching...' : status === 'loaded' ? '✓ done' : '✗ error'}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Filter bar — only when results exist */}
        {result && (
          <div className="flex-shrink-0 border-b bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            {/* Stats strip */}
            <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(6, 1fr)', borderColor: 'var(--sgc-gray-border)' }}>
              {[
                { l: 'Total Leads',  v: result.stats.total,    c: 'var(--sgc-navy)'  },
                { l: 'Critical',     v: result.stats.critical, c: '#C0341D'          },
                { l: 'High',         v: result.stats.high,     c: '#C45E1A'          },
                { l: 'Virginia',     v: vaCount,               c: '#1B3A8C'          },
                { l: 'N. Carolina',  v: ncCount,               c: '#1A7A4A'          },
                { l: 'New Today',    v: result.stats.newToday, c: '#534AB7'          },
              ].map((s, i) => (
                <div key={s.l} className={`p-3 ${i < 5 ? 'border-r' : ''}`} style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
                  <div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
              {/* Search */}
              <input
                className="text-xs px-3 py-1.5 rounded-lg border outline-none bg-white w-40"
                style={{ borderColor: 'var(--sgc-gray-border)' }}
                placeholder="Search address..."
                value={searchText} onChange={e => setSearchText(e.target.value)}
              />

              <div className="flex items-center gap-1">
                {(['all', 'VA', 'NC'] as const).map(s => (
                  <button key={s} onClick={() => setFilterState(s)}
                    className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                    style={filterState === s
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {s === 'all' ? 'All States' : s}
                  </button>
                ))}
              </div>

              {/* Severity */}
              <div className="flex items-center gap-1">
                {(['all', 'critical', 'high', 'medium'] as const).map(s => (
                  <button key={s} onClick={() => setFilterSeverity(s)}
                    className="text-[10px] px-2 py-1 rounded border cursor-pointer capitalize"
                    style={filterSeverity === s
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {s === 'all' ? 'All Severity' : s}
                  </button>
                ))}
              </div>

              {/* Min score */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>Min Score:</span>
                {[0, 50, 65, 80].map(v => (
                  <button key={v} onClick={() => setFilterMinScore(v)}
                    className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                    style={filterMinScore === v
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {v === 0 ? 'All' : `${v}+`}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>Sort:</span>
                {(['score', 'date', 'severity'] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className="text-[10px] px-2 py-1 rounded border cursor-pointer capitalize"
                    style={sortBy === s
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {s}
                  </button>
                ))}
                <span className="text-[10px] ml-2" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {displayLeads.length} leads shown
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Idle state */}
          {!loading && !result && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-8">
              <div className="text-6xl mb-4">📡</div>
              <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Lead Radar</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--sgc-gray-mid)' }}>
                Pulls real-time motivated seller signals from public government APIs across Virginia and North Carolina. You see these leads the same day they're filed — before any national data broker picks them up.
              </p>
              <div className="grid grid-cols-2 gap-4 text-left w-full mb-6">
                {[
                  { icon: '🚧', t: 'Code Violations',   d: 'Structural, electrical, plumbing issues — owners who can\'t afford to fix' },
                  { icon: '🏗️', t: 'Building Permits',  d: 'Distressed rehab signals — owners starting work they may not finish' },
                  { icon: '🔥', t: 'Fire Damage',        d: 'Immediate distressed seller signal — insurance complications' },
                  { icon: '💸', t: 'Tax Delinquent',    d: 'Owners behind on taxes — highest motivation to sell quickly' },
                ].map(s => (
                  <div key={s.t} className="rounded-xl border p-3 bg-white flex gap-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <span className="text-2xl flex-shrink-0">{s.icon}</span>
                    <div>
                      <div className="text-sm font-bold mb-0.5" style={{ color: 'var(--sgc-navy)' }}>{s.t}</div>
                      <div className="text-xs leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>{s.d}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={handleFetch}
                className="px-8 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                style={{ background: 'var(--sgc-navy)' }}>
                📡 Start Scanning
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-2 rounded-full spin mb-5"
                style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }} />
              <div className="text-base font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>
                Scanning {enabledSources.size} government data sources...
              </div>
              <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                Pulling real public records from VA + NC APIs
              </div>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <>
              {displayLeads.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🔍</div>
                  <div className="text-sm font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>No leads match your filters</div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                    Try widening the time window, lowering the score filter, or enabling more sources
                  </div>
                </div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                  {displayLeads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      expanded={expandedId === lead.id}
                      onExpand={() => setExpanded(expandedId === lead.id ? null : lead.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
