import { AnalyzedProperty, MarketStats, SortKey, ViewMode } from '../types'
import { SearchParams } from '../types'
import { fmt$ } from '../lib/utils'
import { AppState } from '../App'

interface Props {
  appState: AppState
  results: AnalyzedProperty[]
  allAnalyzed: AnalyzedProperty[]
  marketStats: MarketStats | null
  apiErrors: string[]
  loadingMsg: string
  sortKey: SortKey
  viewMode: ViewMode
  onSort: (k: SortKey) => void
  onViewMode: (v: ViewMode) => void
  onSelect: (p: AnalyzedProperty) => void
  searchMeta: { time: number; raw: number; sources: number } | null
  params: SearchParams
}

const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: 'score',  label: 'Score'  },
  { key: 'profit', label: 'Profit' },
  { key: 'roi',    label: 'ROI'    },
  { key: 'equity', label: 'Equity' },
  { key: 'price',  label: 'Price ↑'},
  { key: 'dom',    label: 'DOM'    },
]

const SOURCE_META: Record<string, { label: string; color: string; dot: string }> = {
  active_mls:      { label: 'Active MLS',    color: 'text-blue-400',   dot: 'bg-blue-400'   },
  foreclosure:     { label: 'Foreclosure',   color: 'text-red-400',    dot: 'bg-red-400'    },
  short_sale:      { label: 'Short Sale',    color: 'text-orange-400', dot: 'bg-orange-400' },
  off_market:      { label: 'Off-Market',    color: 'text-purple-400', dot: 'bg-purple-400' },
  property_record: { label: 'Prop Record',   color: 'text-green-400',  dot: 'bg-green-400'  },
  corporate_owned: { label: 'Corporate',     color: 'text-amber-400',  dot: 'bg-amber-400'  },
}

function StatTile({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="text-[10px] tracking-[2px] uppercase text-zinc-600 mb-1">{label}</div>
      <div className={`text-2xl font-bold leading-none ${accent ? 'text-[#4a6fd8]' : 'text-white'}`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-600 mt-1">{sub}</div>}
    </div>
  )
}

function DealCard({ p, onSelect }: { p: AnalyzedProperty; onSelect: () => void }) {
  const isHot = p.flipScore >= 70
  const src = SOURCE_META[p.source] || SOURCE_META.active_mls

  return (
    <div
      onClick={onSelect}
      className={`group rounded-xl border cursor-pointer transition-all duration-200 overflow-hidden
        ${isHot
          ? 'border-emerald-700/50 bg-emerald-950/20 hover:border-emerald-500/60 hover:bg-emerald-950/30'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/80'}`}
    >
      {/* Top accent bar */}
      <div className={`h-0.5 w-full ${isHot ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-[#1a3a8f]/60 to-[#1a3a8f]/20'}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            {/* Badges */}
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${src.color} border-current/30`}>
                {p.sourceLabel.replace(/^[^\s]+\s/, '')}
              </span>
              {isHot && <span className="text-[9px] bg-emerald-500 text-zinc-950 font-bold px-2 py-0.5 rounded-full">🔥 HOT</span>}
              {p.underMoms && <span className="text-[9px] border border-emerald-500/40 text-emerald-400 px-2 py-0.5 rounded-full">70% ✓</span>}
              {p.priceReduced && <span className="text-[9px] border border-violet-500/40 text-violet-400 px-2 py-0.5 rounded-full">Price ↓</span>}
            </div>
            <div className="text-sm font-semibold text-white leading-tight truncate">{p.addr}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {p.city}{p.state ? `, ${p.state}` : ''} {p.zip}
              {p.beds ? ` · ${p.beds}bd/${p.baths}ba` : ''}
              {p.sqft ? ` · ${p.sqft.toLocaleString()} sf` : ''}
            </div>
          </div>

          {/* Score badge */}
          <div className={`flex-shrink-0 w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center
            ${p.flipScore >= 80 ? 'border-emerald-500 bg-emerald-950/60' : p.flipScore >= 65 ? 'border-amber-500 bg-amber-950/50' : p.flipScore >= 50 ? 'border-orange-500 bg-orange-950/40' : 'border-zinc-600 bg-zinc-800/60'}`}>
            <span className={`text-base font-bold leading-none ${p.scoreClass}`}>{p.flipScore}</span>
            <span className={`text-[8px] font-bold ${p.scoreClass}`}>{p.scoreGrade}</span>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { l: 'Price',    v: fmt$(p.price),  c: 'text-zinc-200' },
            { l: 'ARV',      v: fmt$(p.arv),    c: 'text-amber-400' },
            { l: 'Profit',   v: fmt$(p.profit), c: p.profit >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { l: 'ROI',      v: p.roi.toFixed(1)+'%', c: p.roi >= 0 ? 'text-emerald-400' : 'text-red-400' },
          ].map(m => (
            <div key={m.l} className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">{m.l}</div>
              <div className={`text-xs font-bold ${m.c}`}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Profit bar */}
        <div className="mb-3">
          <div className="flex justify-between text-[9px] text-zinc-600 mb-1">
            <span>Profit margin</span>
            <span className={p.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {p.arv > 0 ? Math.max(0, (p.profit / p.arv) * 100).toFixed(1) : 0}%
            </span>
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${p.profit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, Math.max(0, p.arv > 0 ? (p.profit / p.arv) * 100 : 0))}%` }} />
          </div>
        </div>

        {/* Secondary metrics */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-3 text-zinc-600">
            <span>Rehab <span className="text-orange-400 font-medium">{fmt$(p.rehabCost)}</span></span>
            <span>Cash <span className="text-zinc-400 font-medium">{fmt$(p.totalCash)}</span></span>
            {p.dom > 0 && <span>DOM <span className={`font-medium ${p.dom > 60 ? 'text-amber-400' : 'text-zinc-400'}`}>{p.dom}d</span></span>}
          </div>
          <div className="flex gap-1">
            {p.signals.slice(0, 2).map((s, i) => (
              <span key={i} className="text-[9px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{s.replace(/^[^\s]+ /, '')}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TableRow({ p, onSelect }: { p: AnalyzedProperty; onSelect: () => void }) {
  const src = SOURCE_META[p.source] || SOURCE_META.active_mls
  return (
    <tr onClick={onSelect} className="border-b border-zinc-800/60 hover:bg-zinc-800/40 cursor-pointer transition-colors group">
      <td className="py-2.5 pl-5 pr-3">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${src.dot}`} />
          <div>
            <div className="text-xs text-zinc-200 font-medium truncate max-w-[180px]">{p.addr}</div>
            <div className="text-[10px] text-zinc-600">{p.city}, {p.state}</div>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-3 text-[10px]">
        <span className={`px-2 py-0.5 rounded-full border ${src.color} border-current/20 bg-current/5`}>
          {p.sourceLabel.replace(/^[^\s]+\s/, '')}
        </span>
      </td>
      <td className="py-2.5 px-3 text-xs text-zinc-300">{fmt$(p.price)}</td>
      <td className="py-2.5 px-3 text-xs text-amber-400">{fmt$(p.arv)}</td>
      <td className={`py-2.5 px-3 text-xs font-semibold ${p.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt$(p.profit)}</td>
      <td className={`py-2.5 px-3 text-xs ${p.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.roi.toFixed(1)}%</td>
      <td className="py-2.5 px-3 text-xs text-zinc-500">{p.dom || '—'}</td>
      <td className="py-2.5 px-3">
        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full border text-xs font-bold
          ${p.flipScore >= 80 ? 'border-emerald-500 text-emerald-400' : p.flipScore >= 65 ? 'border-amber-500 text-amber-400' : 'border-zinc-600 text-zinc-400'}`}>
          {p.flipScore}
        </div>
      </td>
      <td className="py-2.5 px-3 pr-5">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[#4a6fd8] font-medium">View →</div>
      </td>
    </tr>
  )
}

export default function Dashboard(props: Props) {
  const { appState, results, allAnalyzed, marketStats, apiErrors, loadingMsg,
          sortKey, viewMode, onSort, onViewMode, onSelect, searchMeta } = props

  const avg = (arr: number[]) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0

  // ── IDLE ──
  if (appState === 'idle') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-12">
        <div className="mb-8">
          <svg viewBox="0 0 80 80" className="w-20 h-20 mx-auto mb-6 opacity-20">
            <polyline points="40,8 72,32 72,72 8,72 8,32" fill="none" stroke="currentColor" strokeWidth="3"/>
            <line x1="40" y1="8" x2="8" y2="32" stroke="currentColor" strokeWidth="3"/>
            <rect x="30" y="50" width="20" height="22" fill="none" stroke="currentColor" strokeWidth="2.5"/>
          </svg>
          <h2 className="text-xl font-bold text-white mb-2">FlipScan Pro</h2>
          <p className="text-sm text-zinc-500 max-w-sm">Multi-source real estate deal intelligence. Configure your search on the left and scan.</p>
        </div>

        <div className="grid grid-cols-3 gap-4 max-w-xl w-full text-left">
          {[
            { icon: '🏠', t: 'Active Listings', d: 'All current MLS listings with Foreclosure & Short Sale filtering' },
            { icon: '🔒', t: 'Off-Market Deals', d: 'Recently delisted, property records, and corporate-owned' },
            { icon: '🤖', t: 'AI Deal Analysis', d: 'Deep deal analysis and strategy recommendations per property' },
          ].map(({ icon, t, d }) => (
            <div key={t} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-2xl mb-2">{icon}</div>
              <div className="text-sm font-semibold text-white mb-1">{t}</div>
              <div className="text-[11px] text-zinc-600 leading-relaxed">{d}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── LOADING ──
  if (appState === 'loading') {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-2 border-zinc-700 border-t-[#1a3a8f] rounded-full spin mb-5" />
        <div className="text-sm font-semibold text-white mb-1">{loadingMsg}</div>
        <div className="text-xs text-zinc-600">Pulling live data · Running deal analysis</div>
      </div>
    )
  }

  // ── ERROR ──
  if (appState === 'error') {
    return (
      <div className="p-8">
        <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-5 max-w-lg">
          <div className="text-sm font-semibold text-red-400 mb-3">⚠️ Search Failed</div>
          {apiErrors.map((e, i) => <div key={i} className="text-xs text-red-400/80 font-mono mb-1">{e}</div>)}
          <div className="text-[11px] text-zinc-600 mt-3 space-y-1">
            <div>City: "Norfolk, VA" · State: "Virginia" or "VA" · Zip: "23501"</div>
          </div>
        </div>
      </div>
    )
  }

  // ── RESULTS ──
  const hot = results.filter(r => r.flipScore >= 70).length
  const totalProfit = results.reduce((s, r) => s + Math.max(0, r.profit), 0)

  // Source breakdown
  const sourceGroups: Record<string, number> = {}
  allAnalyzed.forEach(r => { sourceGroups[r.source] = (sourceGroups[r.source] || 0) + 1 })

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── STATS BAR ── */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4">
        <div className="grid grid-cols-6 gap-3">
          <StatTile label="Properties" value={String(results.length)} sub={searchMeta ? `of ${searchMeta.raw} scanned` : ''} />
          <StatTile label="Hot Deals 🔥" value={String(hot)} sub="score ≥ 70" accent />
          <StatTile label="Avg Score" value={results.length ? String(Math.round(avg(results.map(r => r.flipScore)))) : '—'} />
          <StatTile label="Avg Profit" value={results.length ? fmt$(avg(results.map(r => r.profit))) : '—'} />
          <StatTile label="Best ROI" value={results.length ? results.reduce((b, r) => r.roi > b ? r.roi : b, 0).toFixed(1) + '%' : '—'} />
          <StatTile label="Total Potential" value={fmt$(totalProfit)} sub="sum if all closed" />
        </div>

        {/* Source pills + sort/view controls */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.entries(sourceGroups).map(([src, count]) => {
              const meta = SOURCE_META[src]
              if (!meta || !count) return null
              return (
                <span key={src} className={`text-[10px] px-2.5 py-1 rounded-full border border-current/20 bg-current/5 ${meta.color}`}>
                  {meta.label} <span className="font-bold">{count}</span>
                </span>
              )
            })}
            {apiErrors.length > 0 && (
              <span className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full" title={apiErrors.join('\n')}>
                ⚠ {apiErrors.length} warning{apiErrors.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-600">Sort:</span>
            {SORT_KEYS.map(({ key, label }) => (
              <button key={key} onClick={() => onSort(key)}
                className={`px-2 py-1 rounded text-[10px] border cursor-pointer transition-colors
                  ${sortKey === key ? 'bg-[#1a3a8f]/30 border-[#1a3a8f]/60 text-[#7a9fe8]' : 'bg-transparent border-zinc-800 text-zinc-600 hover:text-zinc-400'}`}>
                {label}
              </button>
            ))}
            <div className="ml-2 flex border border-zinc-800 rounded overflow-hidden">
              {(['cards', 'table'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => onViewMode(v)}
                  className={`px-2.5 py-1 text-xs cursor-pointer transition-colors
                    ${viewMode === v ? 'bg-zinc-700 text-white' : 'bg-transparent text-zinc-600 hover:text-zinc-400'}`}>
                  {v === 'cards' ? '⊞' : '≡'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-4xl mb-3 opacity-20">🔍</div>
            <div className="text-sm text-zinc-400 mb-1">No deals match this filter</div>
            <div className="text-xs text-zinc-600">Try a different strategy tab or lower your thresholds</div>
          </div>
        ) : viewMode === 'table' ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  {['Property','Source','Price','ARV','Profit','ROI','DOM','Score',''].map(h => (
                    <th key={h} className="text-left text-[10px] uppercase tracking-widest text-zinc-600 py-3 px-3 font-normal first:pl-5 last:pr-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map(p => <TableRow key={p.id} p={p} onSelect={() => onSelect(p)} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
            {results.map(p => <DealCard key={p.id} p={p} onSelect={() => onSelect(p)} />)}
          </div>
        )}
      </div>
    </div>
  )
}
