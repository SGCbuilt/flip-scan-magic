/**
 * Neighborhood Velocity Index
 *
 * Choropleth-style zip code map showing where to focus BEFORE the market does.
 * Green = opportunity now. Yellow = window closing. Red = already moved or avoid.
 *
 * This signal is 12-18 months ahead of any public "hot market" indicator.
 */
import { useState, useCallback, useEffect } from 'react'
import {
  buildVelocityMap, getCachedVelocityMap, cacheVelocityMap,
  VelocityMap, ZipSignal,
} from '../lib/neighborhoodVelocity'
import { fetchLeadRadar, RADAR_SOURCES } from '../lib/leadRadar'

const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n / 1000) + 'k' : '—'

const SIGNAL_CONFIG = {
  green:  { color: '#1A7A4A', bg: '#EDFAF3', border: '#1A7A4A40', dot: '#22C55E' },
  yellow: { color: '#8A5700', bg: '#FEF7EA', border: '#8A570040', dot: '#FBBF24' },
  red:    { color: '#C0341D', bg: '#FEF0ED', border: '#C0341D40', dot: '#EF4444' },
}

// ── Zip card ──────────────────────────────────────────────────────────────────
function ZipCard({ zip, rank }: { zip: ZipSignal; rank: number }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = SIGNAL_CONFIG[zip.signal]

  return (
    <div className="bg-white rounded-2xl border overflow-hidden"
      style={{ borderColor: cfg.border }}>
      {/* Signal stripe */}
      <div className="h-1.5" style={{ background: cfg.dot }}/>

      <div className="p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0"
            style={{ background: cfg.bg, color: cfg.color }}>
            #{rank}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold" style={{ color: 'var(--sgc-black)' }}>
              {zip.city}, {zip.state} — {zip.zip}
            </div>
            <div className="text-xs mt-0.5 font-semibold" style={{ color: cfg.color }}>
              {zip.signalLabel}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-2xl font-black" style={{ color: cfg.color }}>{zip.velocityScore}</div>
            <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>Velocity</div>
          </div>
        </div>

        {/* Signal bars */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { l: '📡 Distress',  v: zip.distressScore, count: zip.distressCount, unit: 'leads'   },
            { l: '🏗️ Permits',   v: zip.permitScore,   count: zip.permitCount,   unit: 'permits' },
            { l: '⚡ DOM',       v: zip.domScore,      count: zip.avgDom,         unit: 'days'    },
            { l: '📊 Comps',     v: zip.compScore,     count: zip.compsCount,     unit: 'sales'  },
          ].map(m => (
            <div key={m.l} className="text-center">
              <div className="text-[9px] mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
              <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: 'var(--sgc-gray-border)' }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${m.v}%`, background: m.v >= 70 ? '#1A7A4A' : m.v >= 50 ? '#C45E1A' : '#C0341D' }}/>
              </div>
              <div className="text-[9px] font-bold" style={{ color: m.v >= 70 ? '#1A7A4A' : m.v >= 50 ? '#C45E1A' : '#C0341D' }}>
                {m.v}
              </div>
              <div className="text-[8px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                {m.count}{m.unit === 'days' ? 'd' : ''}
              </div>
            </div>
          ))}
        </div>

        {/* Top insight + your deals */}
        <div className="flex items-center gap-2 flex-wrap">
          {zip.insights[0] && (
            <div className="text-[10px] flex-1" style={{ color: 'var(--sgc-gray-mid)' }}>
              {zip.insights[0]}
            </div>
          )}
          {zip.dealsInZip > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: '#EEF2FB', color: '#1B3A8C' }}>
              ✓ {zip.dealsInZip} deal{zip.dealsInZip > 1 ? 's' : ''} done
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t space-y-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          {/* All insights */}
          {zip.insights.length > 1 && (
            <div className="space-y-1.5">
              {zip.insights.slice(1).map((insight, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="flex-shrink-0 mt-0.5" style={{ color: cfg.color }}>•</span>
                  <span style={{ color: '#374151' }}>{insight}</span>
                </div>
              ))}
            </div>
          )}

          {/* Market data */}
          {zip.medianPrice > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: 'Median Price',    v: fmt$(zip.medianPrice) },
                { l: 'Avg DOM',         v: `${zip.avgDom}d` },
                { l: 'Price Change YoY',v: zip.priceChangePct !== 0 ? `${zip.priceChangePct > 0 ? '+' : ''}${zip.priceChangePct.toFixed(1)}%` : '—' },
              ].map(m => (
                <div key={m.l} className="text-center p-2 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
                  <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>{m.v}</div>
                </div>
              ))}
            </div>
          )}

          {/* Recommendation */}
          <div className="rounded-xl p-3" style={{ background: cfg.bg }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: cfg.color }}>
              Recommended Action
            </div>
            <div className="text-xs font-medium" style={{ color: cfg.color }}>
              → {zip.recommendation}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2">
            <a href={`https://maps.google.com/?q=${zip.zip}`} target="_blank" rel="noopener noreferrer"
              className="flex-1 text-center py-2 rounded-xl text-xs font-bold no-underline"
              style={{ background: '#EEF2FB', color: '#1B3A8C' }}>
              📍 View on Maps
            </a>
            <a href={`https://www.zillow.com/homes/${zip.zip}_rb/`} target="_blank" rel="noopener noreferrer"
              className="flex-1 text-center py-2 rounded-xl text-xs font-bold no-underline"
              style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
              🏠 Zillow
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Visual map (SVG dot map) ───────────────────────────────────────────────────
function DotMap({ zips, selected, onSelect }: {
  zips: ZipSignal[]
  selected: string | null
  onSelect: (zip: string) => void
}) {
  if (zips.length === 0) return null

  // Find bounds
  const lats = zips.map(z => z.lat)
  const lngs = zips.map(z => z.lng)
  const minLat = Math.min(...lats) - 0.3
  const maxLat = Math.max(...lats) + 0.3
  const minLng = Math.min(...lngs) - 0.3
  const maxLng = Math.max(...lngs) + 0.3

  const W = 700, H = 380

  const project = (lat: number, lng: number) => ({
    x: Math.round(((lng - minLng) / (maxLng - minLng)) * (W - 60) + 30),
    y: Math.round(((maxLat - lat) / (maxLat - minLat)) * (H - 60) + 30),
  })

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--sgc-gray-border)', background: 'var(--sgc-gray-light)' }}>
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>
          Neighborhood Velocity Map
        </div>
        <div className="flex items-center gap-3">
          {[
            { s: 'green',  l: 'Opportunity' },
            { s: 'yellow', l: 'Transitioning' },
            { s: 'red',    l: 'Caution' },
          ].map(({ s, l }) => (
            <div key={s} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full"
                style={{ background: SIGNAL_CONFIG[s as keyof typeof SIGNAL_CONFIG].dot }}/>
              <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480, height: 'auto' }}>
          {/* Background */}
          <rect width={W} height={H} fill="#f8fafc"/>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(t => (
            <g key={t}>
              <line x1={30 + t * (W-60)} y1={30} x2={30 + t * (W-60)} y2={H-30}
                stroke="#e2e8f0" strokeWidth="1"/>
              <line x1={30} y1={30 + t * (H-60)} x2={W-30} y2={30 + t * (H-60)}
                stroke="#e2e8f0" strokeWidth="1"/>
            </g>
          ))}
          {/* Zip dots */}
          {zips.map(z => {
            const { x, y } = project(z.lat, z.lng)
            const cfg      = SIGNAL_CONFIG[z.signal]
            const r        = selected === z.zip ? 10 : 7
            const opacity  = selected && selected !== z.zip ? 0.4 : 1
            return (
              <g key={z.zip} onClick={() => onSelect(z.zip)} style={{ cursor: 'pointer', opacity }}>
                {/* Pulse ring for green */}
                {z.signal === 'green' && (
                  <circle cx={x} cy={y} r={r + 5} fill="none" stroke={cfg.dot} strokeWidth="1.5" opacity={0.4}/>
                )}
                {/* Main dot */}
                <circle cx={x} cy={y} r={r} fill={cfg.dot}
                  stroke={selected === z.zip ? '#1B3A8C' : 'white'}
                  strokeWidth={selected === z.zip ? 2.5 : 1.5}/>
                {/* Velocity score label */}
                {(z.velocityScore >= 70 || selected === z.zip) && (
                  <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="middle"
                    fontSize="7" fontWeight="800" fill="white">
                    {z.velocityScore}
                  </text>
                )}
                {/* Zip label */}
                {selected === z.zip && (
                  <g>
                    <rect x={x - 22} y={y - r - 18} width={44} height={14} rx={4}
                      fill="#1B3A8C" opacity={0.9}/>
                    <text x={x} y={y - r - 8} textAnchor="middle"
                      fontSize="8" fontWeight="700" fill="white">
                      {z.city.split(' ')[0]} {z.zip}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function NeighborhoodVelocity() {
  const [map,       setMap]       = useState<VelocityMap | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [progress,  setProgress]  = useState('')
  const [filter,    setFilter]    = useState<'all' | 'green' | 'yellow' | 'red'>('all')
  const [selectedZip, setSelected] = useState<string | null>(null)
  const [days,      setDays]      = useState(60)

  // Load cache on mount
  useEffect(() => {
    const cached = getCachedVelocityMap()
    if (cached) setMap(cached)
  }, [])

  const handleBuild = useCallback(async () => {
    setLoading(true)
    setProgress('Scanning all lead sources...')

    try {
      // 1. Pull Lead Radar signals
      const result = await fetchLeadRadar(
        RADAR_SOURCES.map(s => s.id), days,
        (id, status) => setProgress(`${status === 'loading' ? '⟳' : status === 'loaded' ? '✓' : '✗'} ${id}`)
      )

      // 2. Pull RentCast market data for detected zips
      setProgress('Pulling market data per zip...')
      const detectedZips = [...new Set(result.leads.map(l => l.zip).filter(Boolean))]
      const rentcastData: Parameters<typeof buildVelocityMap>[1] = []

      // Batch fetch — max 8 at once to stay under rate limits
      const batchSize = 8
      for (let i = 0; i < detectedZips.length; i += batchSize) {
        const batch = detectedZips.slice(i, i + batchSize)
        const results = await Promise.allSettled(
          batch.map(async zip => {
            try {
              const { fetchMarketStats, buildLocationParams } = await import('../lib/rentcast')
              const locParams = buildLocationParams('zip', zip, 0)
              const mkt = await fetchMarketStats(locParams)
              if (!mkt) return null
              const saleData = mkt.saleData || mkt
              const avgDom       = saleData.averageDaysOnMarket || saleData.medianDaysOnMarket || 0
              const medianPrice  = saleData.medianSalePrice || saleData.averageSalePrice || 0
              const compsCount   = saleData.totalProperties || saleData.salesCount || 0
              const prices: number[] = saleData.recentSalePrices || []
              const arvSpreadPct = prices.length >= 2
                ? Math.round(((Math.max(...prices) - Math.min(...prices)) / (prices.reduce((a,b) => a+b,0)/prices.length)) * 100)
                : 20
              const priceChangePct = saleData.percentageChange || saleData.priceChangePercent || 0
              return { zip, avgDom, medianPrice, compsCount, arvSpreadPct, priceChangePct }
            } catch { return null }
          })
        )
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value) rentcastData.push(r.value)
        })
      }

      setProgress('Computing velocity signals...')
      const velocityMap = await buildVelocityMap(result.leads, rentcastData)
      cacheVelocityMap(velocityMap)
      setMap(velocityMap)
    } catch (e) {
      console.warn('[Velocity] build failed', e)
    }

    setLoading(false)
    setProgress('')
  }, [days])

  const displayed = map?.zips.filter(z => filter === 'all' || z.signal === filter) || []
  const selectedZipData = displayed.find(z => z.zip === selectedZip)

  const green  = map?.zips.filter(z => z.signal === 'green').length  || 0
  const yellow = map?.zips.filter(z => z.signal === 'yellow').length || 0
  const red    = map?.zips.filter(z => z.signal === 'red').length    || 0

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        {map && (
          <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(4,1fr)', borderColor: 'var(--sgc-gray-border)' }}>
            {[
              { l: '🟢 Opportunity',   v: green,         c: '#1A7A4A', f: 'green'  },
              { l: '🟡 Transitioning', v: yellow,        c: '#8A5700', f: 'yellow' },
              { l: '🔴 Caution',       v: red,           c: '#C0341D', f: 'red'    },
              { l: 'Total Zips',       v: map.zips.length, c: 'var(--sgc-navy)', f: 'all' },
            ].map((s, i) => (
              <button key={s.l}
                onClick={() => setFilter(s.f as any)}
                className={`p-3 text-left border-none cursor-pointer ${i < 3 ? 'border-r' : ''}`}
                style={{
                  borderColor: 'var(--sgc-gray-border)',
                  background: filter === s.f ? 'var(--sgc-navy-pale)' : 'white',
                }}>
                <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
                <div className="text-xl font-bold" style={{ color: s.c }}>{s.v}</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 px-5 py-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Window:</span>
            {[30, 60, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                style={days === d
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {d}d
              </button>
            ))}
          </div>
          {map && (
            <div className="flex gap-1">
              {(['all','green','yellow','red'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="text-[10px] px-2.5 py-1.5 rounded border cursor-pointer capitalize"
                  style={filter === f
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {f}
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            {map && (
              <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                Last scan: {new Date(map.generatedAt).toLocaleTimeString()} · {map.sourceCount} signals
              </div>
            )}
            <button onClick={handleBuild} disabled={loading}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: loading ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)' }}>
              {loading ? '⟳ Scanning...' : map ? '↻ Refresh' : '🗺️ Build Map'}
            </button>
          </div>
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
              Building velocity map...
            </div>
            <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>{progress}</div>
          </div>
        )}

        {/* Empty */}
        {!loading && !map && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto px-8">
            <div className="text-6xl mb-5">🗺️</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>
              Neighborhood Velocity Index
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--sgc-gray-mid)' }}>
              Shows where to focus 12-18 months before the market does. Combines your Lead Radar signals, permit activity, days on market, and comp confidence into one velocity score per zip code.
            </p>
            <div className="space-y-3 w-full mb-6 text-left">
              {[
                { dot: '#22C55E', t: 'Green — Opportunity Zone',    d: 'High distress density + good exit market. The sweet spot. Act now before prices catch up.' },
                { dot: '#FBBF24', t: 'Yellow — Transitioning',      d: 'Deals still available but window closing. Move quickly on any motivated seller you find.' },
                { dot: '#EF4444', t: 'Red — Caution',               d: 'Market peaked (no deals left) or soft exit (slow DOM). Redirect your scanning effort.' },
              ].map(s => (
                <div key={s.t} className="flex gap-3 bg-white rounded-xl border p-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5" style={{ background: s.dot }}/>
                  <div>
                    <div className="text-sm font-bold mb-0.5" style={{ color: 'var(--sgc-navy)' }}>{s.t}</div>
                    <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={handleBuild}
              className="px-8 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>
              🗺️ Build Map Now
            </button>
          </div>
        )}

        {/* Results */}
        {!loading && map && (
          <div className="space-y-5">
            {/* Top opportunity callout */}
            {map.topOpportunity && filter === 'all' && (
              <div className="rounded-2xl p-4 flex items-center gap-4"
                style={{ background: '#1A7A4A', color: 'white' }}>
                <div className="text-3xl">🟢</div>
                <div className="flex-1">
                  <div className="font-black text-base">Top Opportunity: {map.topOpportunity.city}, {map.topOpportunity.state} — {map.topOpportunity.zip}</div>
                  <div className="text-sm opacity-80 mt-0.5">{map.topOpportunity.recommendation}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-3xl font-black">{map.topOpportunity.velocityScore}</div>
                  <div className="text-xs opacity-70">Velocity</div>
                </div>
              </div>
            )}

            {/* Dot map */}
            <DotMap zips={map.zips} selected={selectedZip} onSelect={zip => setSelected(zip === selectedZip ? null : zip)} />

            {/* Selected zip detail */}
            {selectedZipData && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: SIGNAL_CONFIG[selectedZipData.signal].border }}>
                <div className="px-4 py-3 flex items-center justify-between"
                  style={{ background: SIGNAL_CONFIG[selectedZipData.signal].bg }}>
                  <div className="font-bold" style={{ color: SIGNAL_CONFIG[selectedZipData.signal].color }}>
                    {selectedZipData.signalLabel} — {selectedZipData.city}, {selectedZipData.state} {selectedZipData.zip}
                  </div>
                  <button onClick={() => setSelected(null)}
                    className="text-sm cursor-pointer bg-transparent border-none"
                    style={{ color: SIGNAL_CONFIG[selectedZipData.signal].color }}>✕</button>
                </div>
                <div className="bg-white p-4 space-y-2">
                  {selectedZipData.insights.map((ins, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span style={{ color: SIGNAL_CONFIG[selectedZipData.signal].color }}>•</span>
                      <span style={{ color: '#374151' }}>{ins}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t text-xs font-semibold" style={{ borderColor: 'var(--sgc-gray-border)', color: SIGNAL_CONFIG[selectedZipData.signal].color }}>
                    → {selectedZipData.recommendation}
                  </div>
                </div>
              </div>
            )}

            {/* Zip list */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>
                All Zip Codes — Ranked by Velocity Score
              </div>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px,1fr))' }}>
                {displayed.map((zip, i) => (
                  <ZipCard key={zip.zip} zip={zip} rank={i + 1} />
                ))}
              </div>
              {displayed.length === 0 && (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                  No {filter} signal zips in current scan
                </div>
              )}
            </div>

            <div className="text-[10px] text-center pb-2" style={{ color: 'var(--sgc-gray-mid)' }}>
              Velocity score = 30% distress density + 20% permit activity + 30% DOM speed + 20% comp confidence
              · Updates every 6 hours · {map.sourceCount} signals from {map.zips.length} zip codes
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
