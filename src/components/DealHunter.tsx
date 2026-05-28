import { useState, useMemo } from 'react'
import { apiCall } from '../lib/proxyClient'
import { fuse, FuseResult, FusedLead, FuseInput } from '../lib/dataFusion'

// ── Provider config ───────────────────────────────────────────────────────────
interface PaidProvider {
  id: string; name: string; icon: string; description: string
  status: 'unconfigured' | 'ready' | 'fetching' | 'loaded' | 'error'
  apiKeyPlaceholder: string; endpointPlaceholder: string
  docsUrl: string; priceNote: string; color: string; bg: string
  apiKey?: string; endpoint?: string; rawData?: any; count?: number
}

const INIT_PROVIDERS: PaidProvider[] = [
  {
    id: 'attom', name: 'ATTOM Data', icon: '🏦',
    description: 'Foreclosure pipeline · NOD → Auction → REO · 158M properties · Equity data · Auction dates',
    status: 'unconfigured', priceNote: '$150–500/mo · 30-day free trial',
    apiKeyPlaceholder: 'Your ATTOM API Key',
    endpointPlaceholder: '/property/snapshot',
    docsUrl: 'https://api.developer.attomdata.com/docs', color: '#854F0B', bg: '#FAEEDA',
  },
  {
    id: 'batchleads', name: 'BatchLeads', icon: '📋',
    description: 'Best skip tracing · Owner phone + email · Pre-foreclosure · Tax delinquent · Absentee owner',
    status: 'unconfigured', priceNote: '$119–749/mo · Free trial',
    apiKeyPlaceholder: 'Your BatchLeads API Key',
    endpointPlaceholder: '/properties',
    docsUrl: 'https://developer.batchleads.io', color: '#185FA5', bg: '#E6F1FB',
  },
  {
    id: 'propstream', name: 'PropStream', icon: '⭐',
    description: '160M+ properties · 165+ filters · NOD lists · Tax liens · Absentee · MLS comps',
    status: 'unconfigured', priceNote: '$99/mo · 7-day free trial',
    apiKeyPlaceholder: 'Your PropStream API Key',
    endpointPlaceholder: '/properties/search',
    docsUrl: 'https://www.propstream.com/api', color: '#1A7A4A', bg: '#EDFAF3',
  },
  {
    id: 'resimpli', name: 'REsimpli', icon: '🎯',
    description: 'All-in-one CRM · Skip trace built in · AI follow-up · Full contact data',
    status: 'unconfigured', priceNote: '$149/mo · 30-day free trial',
    apiKeyPlaceholder: 'Your REsimpli API Key',
    endpointPlaceholder: '/leads',
    docsUrl: 'https://help.resimpli.com/api', color: '#534AB7', bg: '#EEEDFE',
  },
  {
    id: 'dealmachine', name: 'DealMachine', icon: '📱',
    description: 'Driving for dollars data · Distressed property records · Owner lookup',
    status: 'unconfigured', priceNote: '$49–99/mo · 7-day free trial',
    apiKeyPlaceholder: 'Your DealMachine API Key',
    endpointPlaceholder: '/properties',
    docsUrl: 'https://developer.dealmachine.com', color: '#C45E1A', bg: '#FEF3EA',
  },
  {
    id: 'custom', name: 'Custom Provider', icon: '🔌',
    description: 'Any real estate API — PropWire, PropertyRadar, ListSource, Goliath, or your own',
    status: 'unconfigured', priceNote: 'Bring your own',
    apiKeyPlaceholder: 'Your API Key',
    endpointPlaceholder: 'https://your-api.com/v1/properties',
    docsUrl: '', color: '#6B3FAD', bg: '#F3EDFE',
  },
]

const fmt$ = (n?: number) => n && n > 0 ? '$' + Math.round(n).toLocaleString() : '—'

// ── Fusion Score ring ─────────────────────────────────────────────────────────
function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const c = score >= 80 ? '#1A7A4A' : score >= 65 ? '#8A5700' : score >= 50 ? '#C45E1A' : '#C0341D'
  const bg = score >= 80 ? '#EDFAF3' : score >= 65 ? '#FEF7EA' : score >= 50 ? '#FEF3EA' : '#FEF0ED'
  return (
    <div className="flex-shrink-0 rounded-full border-2 flex flex-col items-center justify-center text-center"
      style={{ width: size, height: size, borderColor: c + '60', background: bg }}>
      <span className="font-bold leading-none" style={{ fontSize: size * 0.28, color: c }}>{score}</span>
      <span style={{ fontSize: size * 0.16, color: c, fontWeight: 600 }}>fuse</span>
    </div>
  )
}

// ── Fused Lead Card ───────────────────────────────────────────────────────────
function FusedCard({ lead, onExpand, expanded }: { lead: FusedLead; onExpand: () => void; expanded: boolean }) {
  const addrEnc = encodeURIComponent(lead.addrFull)
  const isHot = lead.fusionScore >= 70
  const multiSource = lead.sourcesCount >= 2

  return (
    <div onClick={onExpand}
      className="bg-white rounded-xl border cursor-pointer hover:shadow-md transition-all overflow-hidden"
      style={{
        borderColor: isHot ? '#1A7A4A50' : multiSource ? '#1B3A8C30' : 'var(--sgc-gray-border)',
        boxShadow: isHot ? '0 0 0 1px #1A7A4A15' : 'none',
      }}>

      {/* Top bar */}
      <div className="h-1 w-full" style={{
        background: lead.sourcesCount >= 3
          ? 'linear-gradient(90deg, #1A7A4A, #1B3A8C, #854F0B)'
          : lead.sourcesCount === 2
            ? 'linear-gradient(90deg, #1B3A8C, #185FA5)'
            : 'var(--sgc-gray-border)'
      }} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            {/* Source badges + hot label */}
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              {isHot && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: '#1A7A4A' }}>
                  🔥 Hot Lead
                </span>
              )}
              {multiSource && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#EEF2FB', color: '#1B3A8C' }}>
                  ✓ {lead.sourcesCount} sources agree
                </span>
              )}
              {lead.sourcesCount === 1 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                  {lead.sourceLabels[0]}
                </span>
              )}
            </div>

            {/* Address */}
            <div className="font-bold text-sm leading-tight mb-0.5" style={{ color: 'var(--sgc-black)' }}>
              {lead.addr || lead.addrFull || 'Address pending'}
            </div>
            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
              {[lead.city, lead.state, lead.zip].filter(Boolean).join(', ')}
              {lead.beds > 0 && ` · ${lead.beds}bd/${lead.baths}ba`}
              {lead.sqft > 0 && ` · ${lead.sqft.toLocaleString()} sf`}
              {lead.yearBuilt && ` · ${lead.yearBuilt}`}
            </div>
          </div>
          <ScoreRing score={lead.fusionScore} />
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { l: 'Price',      v: fmt$(lead.price),     c: 'var(--sgc-navy)' },
            { l: 'Est Value',  v: fmt$(lead.estimatedValue || lead.price), c: '#8A5700' },
            { l: 'Equity',     v: lead.equityPct ? `${Math.round(lead.equityPct)}%` : fmt$(lead.equity), c: '#1A7A4A' },
            { l: 'Tax Owed',   v: fmt$(lead.taxOwed),   c: '#C0341D' },
          ].map(m => (
            <div key={m.l} className="rounded-lg p-2 text-center" style={{ background: 'var(--sgc-gray-light)' }}>
              <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
              <div className="text-xs font-bold" style={{ color: m.v === '—' ? 'var(--sgc-gray-mid)' : m.c }}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Owner contact preview */}
        {(lead.ownerName || lead.ownerPhone || lead.ownerEmail) && (
          <div className="mb-3 px-3 py-2 rounded-lg flex items-center gap-3" style={{ background: 'var(--sgc-navy-pale)' }}>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--sgc-navy)' }}>Owner</div>
              {lead.ownerName && <div className="text-xs font-semibold truncate" style={{ color: 'var(--sgc-black)' }}>{lead.ownerName}</div>}
              <div className="flex gap-2 flex-wrap mt-0.5">
                {lead.ownerPhone && (
                  <a href={`tel:${lead.ownerPhone}`} className="text-[11px] font-medium"
                    style={{ color: 'var(--sgc-navy)' }} onClick={e => e.stopPropagation()}>
                    📞 {lead.ownerPhone}
                  </a>
                )}
                {lead.ownerEmail && (
                  <a href={`mailto:${lead.ownerEmail}`} className="text-[11px] font-medium"
                    style={{ color: 'var(--sgc-navy)' }} onClick={e => e.stopPropagation()}>
                    ✉️ {lead.ownerEmail}
                  </a>
                )}
              </div>
            </div>
            {lead.contactInfoComplete && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
                ✓ Full Contact
              </span>
            )}
          </div>
        )}

        {/* Distress signals */}
        {lead.signals.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {lead.signals.slice(0, 4).map((s, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>{s}</span>
            ))}
            {lead.signals.length > 4 && (
              <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>+{lead.signals.length - 4} more</span>
            )}
          </div>
        )}

        {/* Conflict warning */}
        {lead.conflictsDetected.length > 0 && (
          <div className="text-[10px] px-2 py-1 rounded" style={{ background: '#FEF7EA', color: '#8A5700' }}>
            ⚠ Data conflict: {lead.conflictsDetected[0]}
          </div>
        )}

        {/* Expanded content */}
        {expanded && (
          <div className="border-t pt-3 mt-3 space-y-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            {/* Map */}
            {(lead.addr || lead.addrFull) && (
              <div className="rounded-xl overflow-hidden h-40">
                <iframe
                  src={`https://maps.google.com/maps?q=${addrEnc}&output=embed&z=17`}
                  className="w-full h-full border-0" loading="lazy" title="Property map" />
              </div>
            )}

            {/* Sources that confirmed */}
            {lead.sourcesCount > 1 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-navy)' }}>
                  Confirmed by {lead.sourcesCount} Sources
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {lead.sourceLabels.map((l, i) => (
                    <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>{l}</span>
                  ))}
                </div>
              </div>
            )}

            {/* All signals */}
            {lead.signals.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-navy)' }}>All Signals</div>
                <div className="flex flex-wrap gap-1">
                  {lead.signals.map((s, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-black)' }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Additional details */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { l: 'Assessed Value',  v: fmt$(lead.assessedValue) },
                { l: 'Last Sale Price', v: fmt$(lead.lastSalePrice) },
                { l: 'Last Sale Date',  v: lead.lastSaleDate ? new Date(lead.lastSaleDate).toLocaleDateString() : '—' },
                { l: 'Days on Market',  v: lead.daysOnMarket ? `${lead.daysOnMarket}d` : '—' },
                { l: 'MLS Number',      v: lead.mlsNumber || '—' },
                { l: 'County',          v: lead.county || '—' },
                { l: 'Listing Type',    v: lead.listingType || '—' },
                { l: 'Years Owned',     v: lead.yearsOwned ? `${lead.yearsOwned} yrs` : '—' },
              ].filter(d => d.v !== '—').map(d => (
                <div key={d.l} className="flex justify-between border-b py-1" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <span style={{ color: 'var(--sgc-gray-mid)' }}>{d.l}</span>
                  <span style={{ color: 'var(--sgc-black)', fontWeight: 600 }}>{d.v}</span>
                </div>
              ))}
            </div>

            {/* Quick links */}
            <div className="flex gap-2 flex-wrap pt-1">
              {[
                { l: 'Zillow',      u: `https://www.zillow.com/homes/${addrEnc}` },
                { l: 'Redfin',      u: `https://www.redfin.com/query/${addrEnc}` },
                { l: 'Google Maps', u: `https://maps.google.com/?q=${addrEnc}` },
              ].map(lk => (
                <a key={lk.l} href={lk.u} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                  style={{ color: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy-mid)', background: 'var(--sgc-navy-pale)' }}>
                  {lk.l} ↗
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="text-[10px] text-right mt-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>
          {expanded ? 'Click to collapse ▲' : 'Click to expand ▼'}
        </div>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function DealHunter() {
  const [providers, setProviders] = useState<PaidProvider[]>(INIT_PROVIDERS)
  const [configuring, setConfiguring] = useState<string | null>(null)
  const [draftKey, setDraftKey] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [fuseResult, setFuseResult] = useState<FuseResult | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchLog, setFetchLog] = useState<string[]>([])
  const [filterScore, setFilterScore] = useState(0)
  const [filterSources, setFilterSources] = useState(0)
  const [sortBy, setSortBy] = useState<'score' | 'sources' | 'distress' | 'equity'>('score')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const readyProviders = providers.filter(p => p.status !== 'unconfigured' && p.status !== 'error')
  const loadedProviders = providers.filter(p => p.status === 'loaded')

  const saveConfig = (id: string) => {
    if (!draftKey.trim()) return
    setProviders(prev => prev.map(p => p.id === id
      ? { ...p, apiKey: draftKey.trim(), endpoint: draftUrl.trim() || p.endpointPlaceholder, status: 'ready' }
      : p
    ))
    setConfiguring(null); setDraftKey(''); setDraftUrl('')
  }

  const clearConfig = (id: string) => {
    setProviders(prev => prev.map(p => p.id === id
      ? { ...p, apiKey: undefined, endpoint: undefined, status: 'unconfigured', rawData: undefined, count: undefined }
      : p
    ))
  }

  // ── Fetch all configured providers, then fuse ──────────────────────────────
  const runFusion = async () => {
    if (!readyProviders.length) return
    setFetching(true); setFetchLog([]); setFuseResult(null)

    const log = (msg: string) => setFetchLog(prev => [...prev, msg])
    const fuseInputs: FuseInput[] = []
    const updatedProviders = [...providers]

    await Promise.allSettled(readyProviders.map(async provider => {
      const pi = updatedProviders.findIndex(p => p.id === provider.id)
      log(`⟳ Fetching ${provider.name}...`)
      updatedProviders[pi] = { ...updatedProviders[pi], status: 'fetching' }
      setProviders([...updatedProviders])

      const result = await apiCall({
        provider: provider.id,
        endpoint: provider.endpoint || provider.endpointPlaceholder,
        customKey: provider.apiKey,
      })

      if (result.ok && result.data) {
        const arr = Array.isArray(result.data) ? result.data
          : result.data.leads || result.data.properties || result.data.results || result.data.data || []
        updatedProviders[pi] = { ...updatedProviders[pi], status: 'loaded', rawData: result.data, count: arr.length }
        setProviders([...updatedProviders])
        fuseInputs.push({ source: provider.id, sourceLabel: provider.name, data: result.data })
        log(`✓ ${provider.name}: ${arr.length} records`)
      } else {
        updatedProviders[pi] = { ...updatedProviders[pi], status: 'error' }
        setProviders([...updatedProviders])
        log(`✗ ${provider.name}: ${result.error}`)
      }
    }))

    if (fuseInputs.length > 0) {
      log(`⚙ Fusing ${fuseInputs.length} sources...`)
      const result = fuse(fuseInputs)
      setFuseResult(result)
      log(`✓ Done — ${result.stats.totalUnique} unique properties, ${result.stats.multiSourceMatches} multi-source matches`)
    } else {
      log('✗ No data fetched — check API keys and endpoints')
    }
    setFetching(false)
  }

  // ── Sorted + filtered leads ────────────────────────────────────────────────
  const displayLeads = useMemo(() => {
    if (!fuseResult) return []
    let leads = fuseResult.leads
      .filter(l => l.fusionScore >= filterScore)
      .filter(l => l.sourcesCount >= filterSources)

    switch (sortBy) {
      case 'sources':  return [...leads].sort((a, b) => b.sourcesCount - a.sourcesCount || b.fusionScore - a.fusionScore)
      case 'distress': return [...leads].sort((a, b) => b.distressSignalCount - a.distressSignalCount || b.fusionScore - a.fusionScore)
      case 'equity':   return [...leads].sort((a, b) => (b.equityPct || 0) - (a.equityPct || 0))
      default:         return leads  // already sorted by score
    }
  }, [fuseResult, filterScore, filterSources, sortBy])

  const ic = `w-full rounded-lg border text-sm px-3 py-2 outline-none bg-white transition-colors
    border-[var(--sgc-gray-border)] focus:border-[var(--sgc-navy)] placeholder:text-gray-400`

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>🔀 Data Fusion Engine</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
            Connect providers → fetch → auto-merge → one ranked list
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
          {providers.map(p => (
            <div key={p.id} className="rounded-xl border overflow-hidden"
              style={{ borderColor: p.status === 'loaded' ? p.color + '50' : p.status === 'error' ? '#C0341D40' : 'var(--sgc-gray-border)' }}>

              <div className="flex items-center gap-2.5 p-2.5"
                style={{ background: p.status !== 'unconfigured' ? p.bg : 'white' }}>
                <span className="text-lg flex-shrink-0">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold" style={{ color: p.status !== 'unconfigured' ? p.color : 'var(--sgc-black)' }}>{p.name}</div>
                  <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                    {p.status === 'loaded'    ? `✓ ${p.count} records loaded` :
                     p.status === 'fetching'  ? '⟳ Fetching...' :
                     p.status === 'error'     ? '✗ Error — check key' :
                     p.status === 'ready'     ? '○ Ready to fetch' :
                     p.priceNote}
                  </div>
                </div>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{
                  background: p.status === 'loaded'   ? '#1A7A4A' :
                              p.status === 'fetching' ? '#8A5700' :
                              p.status === 'error'    ? '#C0341D' :
                              p.status === 'ready'    ? '#185FA5' : 'var(--sgc-gray-border)'
                }} />
              </div>

              {configuring === p.id ? (
                <div className="px-3 pb-3 border-t space-y-2 pt-2.5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <div>
                    <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>API KEY *</div>
                    <input className={ic} type="password" value={draftKey}
                      onChange={e => setDraftKey(e.target.value)}
                      placeholder={p.apiKeyPlaceholder}
                      onKeyDown={e => e.key === 'Enter' && saveConfig(p.id)} />
                  </div>
                  <div>
                    <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>ENDPOINT (optional)</div>
                    <input className={ic} value={draftUrl} onChange={e => setDraftUrl(e.target.value)}
                      placeholder={p.endpointPlaceholder} />
                  </div>
                  {p.docsUrl && (
                    <a href={p.docsUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[10px]" style={{ color: 'var(--sgc-navy)' }}>
                      📖 API Docs ↗
                    </a>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => saveConfig(p.id)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white border-none cursor-pointer"
                      style={{ background: 'var(--sgc-navy)' }}>Save</button>
                    <button onClick={() => { setConfiguring(null); setDraftKey(''); setDraftUrl('') }}
                      className="px-3 py-1.5 rounded-lg text-xs border-none cursor-pointer"
                      style={{ background: 'var(--sgc-gray-border)', color: 'var(--sgc-black)' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="px-3 pb-2.5">
                  <div className="text-[10px] mb-2 leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>
                    {p.description}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {p.status === 'unconfigured' ? (
                      <button onClick={() => { setConfiguring(p.id); setDraftKey(''); setDraftUrl('') }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer text-white"
                        style={{ background: p.color }}>
                        + Connect
                      </button>
                    ) : (
                      <>
                        <button onClick={() => { setConfiguring(p.id); setDraftKey(p.apiKey || ''); setDraftUrl(p.endpoint || '') }}
                          className="text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer"
                          style={{ borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)', background: 'transparent' }}>
                          Edit Key
                        </button>
                        <button onClick={() => clearConfig(p.id)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer"
                          style={{ borderColor: '#C0341D30', color: '#C0341D', background: 'transparent' }}>
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Run fusion button */}
        <div className="p-4 border-t space-y-2" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          {readyProviders.length === 0 ? (
            <div className="text-xs text-center p-3 rounded-xl" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
              Connect at least one provider above to start
            </div>
          ) : (
            <>
              <div className="text-xs text-center mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                {readyProviders.length} provider{readyProviders.length > 1 ? 's' : ''} ready
                {readyProviders.length > 1 && <span style={{ color: 'var(--sgc-navy)', fontWeight: 600 }}> — fusion active</span>}
              </div>
              <button onClick={runFusion} disabled={fetching}
                className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                style={{ background: fetching ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)' }}>
                {fetching
                  ? <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin inline-block" />
                      Fetching & Fusing...
                    </span>
                  : readyProviders.length >= 2
                    ? `🔀 Fetch + Fuse ${readyProviders.length} Sources`
                    : `⬡ Fetch Leads`}
              </button>
            </>
          )}

          {/* Live log */}
          {fetchLog.length > 0 && (
            <div className="rounded-lg p-2 max-h-28 overflow-y-auto" style={{ background: 'var(--sgc-gray-light)' }}>
              {fetchLog.map((line, i) => (
                <div key={i} className="text-[10px] font-mono" style={{
                  color: line.startsWith('✓') ? '#1A7A4A' : line.startsWith('✗') ? '#C0341D' : 'var(--sgc-gray-mid)'
                }}>{line}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Stats + filter bar */}
        {fuseResult && (
          <div className="flex-shrink-0 border-b bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            {/* Stats strip */}
            <div className="grid grid-cols-6 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              {[
                { l: 'Total Unique', v: fuseResult.stats.totalUnique, c: 'var(--sgc-navy)' },
                { l: '2+ Source Match', v: fuseResult.stats.multiSourceMatches, c: '#1B3A8C' },
                { l: '3+ Source Match', v: fuseResult.stats.tripleSourceMatches, c: '#1A7A4A' },
                { l: 'With Phone', v: fuseResult.stats.withPhoneNumber, c: '#1A7A4A' },
                { l: 'With Email', v: fuseResult.stats.withEmailAddress, c: '#185FA5' },
                { l: 'High Confidence', v: fuseResult.stats.highConfidence, c: '#854F0B' },
              ].map(s => (
                <div key={s.l} className="p-3 border-r last:border-0" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
                  <div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Filters + sort */}
            <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Min Score:</span>
                {[0, 40, 60, 70, 80].map(v => (
                  <button key={v} onClick={() => setFilterScore(v)}
                    className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                    style={filterScore === v
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {v === 0 ? 'All' : `${v}+`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 ml-3">
                <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Sources:</span>
                {[0, 2, 3].map(v => (
                  <button key={v} onClick={() => setFilterSources(v)}
                    className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                    style={filterSources === v
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {v === 0 ? 'Any' : `${v}+`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 ml-3">
                <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Sort:</span>
                {(['score','sources','distress','equity'] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className="text-[10px] px-2 py-1 rounded border cursor-pointer capitalize"
                    style={sortBy === s
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="ml-auto text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                {displayLeads.length} leads shown
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">

          {/* Empty state */}
          {!fuseResult && !fetching && (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-2xl mx-auto px-8">
              <svg viewBox="0 0 140 100" className="w-32 h-24 mb-6 opacity-15">
                <circle cx="35" cy="50" r="25" fill="none" stroke="var(--sgc-navy)" strokeWidth="3"/>
                <circle cx="70" cy="30" r="25" fill="none" stroke="#854F0B" strokeWidth="3"/>
                <circle cx="105" cy="50" r="25" fill="none" stroke="#185FA5" strokeWidth="3"/>
                <text x="70" y="75" textAnchor="middle" fill="var(--sgc-navy)" fontSize="8" fontWeight="700">FUSION</text>
              </svg>
              <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Data Fusion Engine</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--sgc-gray-mid)' }}>
                Connect 2–3 providers on the left. One click fetches all of them simultaneously,
                deduplicates by address, merges every data point, and ranks by confidence.
              </p>
              <div className="grid grid-cols-3 gap-4 text-left w-full">
                {[
                  { n: '1', t: 'Multi-Source Fetch', d: 'Calls all connected providers in parallel — takes the same time as one.' },
                  { n: '2', t: 'Smart Deduplication', d: 'Matches addresses across providers including fuzzy matching for abbreviations.' },
                  { n: '3', t: 'Data Layering', d: 'Merges best data from each source: equity from ATTOM, phone from BatchLeads, price from MLS.' },
                  { n: '4', t: 'Conflict Detection', d: 'Flags when providers disagree on price or status — you see the discrepancy.' },
                  { n: '5', t: 'Fusion Scoring', d: 'Properties confirmed by 3 sources score highest. More agreement = more confidence.' },
                  { n: '6', t: 'One Ranked List', d: 'All leads from all providers in one sorted list. Best deals first.' },
                ].map(s => (
                  <div key={s.n} className="rounded-xl border p-3 bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white mb-2"
                      style={{ background: 'var(--sgc-navy)' }}>{s.n}</div>
                    <div className="text-sm font-semibold mb-1" style={{ color: 'var(--sgc-navy)' }}>{s.t}</div>
                    <div className="text-xs leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>{s.d}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {fetching && (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-12 h-12 border-2 rounded-full spin mb-4"
                style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }} />
              <div className="text-base font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>Fetching & Fusing...</div>
              <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                Calling {readyProviders.length} providers simultaneously
              </div>
            </div>
          )}

          {/* Results */}
          {fuseResult && !fetching && (
            <>
              {displayLeads.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🔍</div>
                  <div className="text-sm font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>No leads match filters</div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Lower the minimum score or source count filter</div>
                </div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
                  {displayLeads.map(lead => (
                    <FusedCard
                      key={lead.fusionId}
                      lead={lead}
                      expanded={expandedId === lead.fusionId}
                      onExpand={() => setExpandedId(expandedId === lead.fusionId ? null : lead.fusionId)}
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
