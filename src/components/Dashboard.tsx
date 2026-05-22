import { AnalyzedProperty, MarketStats, SortKey, ViewMode, SearchParams } from '../types'
import { fmt$ } from '../lib/utils'
import { AppState } from '../App'

interface Props {
  appState: AppState; results: AnalyzedProperty[]; allAnalyzed: AnalyzedProperty[]
  marketStats: MarketStats | null; apiErrors: string[]; loadingMsg: string
  sortKey: SortKey; viewMode: ViewMode; onSort: (k: SortKey) => void
  onViewMode: (v: ViewMode) => void; onSelect: (p: AnalyzedProperty) => void
  searchMeta: { time: number; raw: number } | null; params: SearchParams
  onRunFinancials: (p: AnalyzedProperty) => void
}

const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Score' }, { key: 'profit', label: 'Profit' },
  { key: 'roi', label: 'ROI' }, { key: 'equity', label: 'Equity' },
  { key: 'price', label: 'Price' }, { key: 'dom', label: 'DOM' },
]

const SOURCE_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  active_mls:      { label: 'MLS',        color: '#1B3A8C', bg: '#EEF2FB' },
  foreclosure:     { label: 'Foreclosure',color: '#C0341D', bg: '#FEF0ED' },
  short_sale:      { label: 'Short Sale', color: '#C45E1A', bg: '#FEF3EA' },
  off_market:      { label: 'Off-Market', color: '#6B3FAD', bg: '#F3EDFE' },
  property_record: { label: 'Record',     color: '#1A7A4A', bg: '#EDFAF3' },
  corporate_owned: { label: 'Corporate',  color: '#8A5700', bg: '#FEF7EA' },
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: 'white', borderColor: 'var(--sgc-gray-border)' }}>
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: accent || 'var(--sgc-black)' }}>{value}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{sub}</div>}
    </div>
  )
}

function DealCard({ p, onSelect, onRunFinancials }: { p: AnalyzedProperty; onSelect: () => void; onRunFinancials: () => void }) {
  const isHot = p.flipScore >= 70
  const src = SOURCE_COLORS[p.source] || SOURCE_COLORS.active_mls
  const profitPct = p.arv > 0 ? Math.min(100, Math.max(0, (p.profit / p.arv) * 100)) : 0
  const fullAddr = `${p.addr}, ${p.city}, ${p.state} ${p.zip}`.replace(/,\s*,/g, ',')

  const scoreBg = p.flipScore >= 80 ? '#EDFAF3' : p.flipScore >= 65 ? '#FEF7EA' : p.flipScore >= 50 ? '#FEF3EA' : '#FEF0ED'
  const scoreColor = p.flipScore >= 80 ? '#1A7A4A' : p.flipScore >= 65 ? '#8A5700' : p.flipScore >= 50 ? '#C45E1A' : '#C0341D'

  return (
    <div onClick={onSelect}
      className="rounded-xl border cursor-pointer transition-all hover:-translate-y-0.5 overflow-hidden group fade-up"
      style={{
        background: 'white',
        borderColor: isHot ? '#1A7A4A40' : 'var(--sgc-gray-border)',
        boxShadow: isHot ? '0 0 0 1px #1A7A4A20' : 'none',
      }}>

      {/* Top accent bar */}
      <div className="h-1 w-full" style={{ background: isHot ? '#1A7A4A' : 'var(--sgc-navy)' }} />

      {/* Map */}
      <div className="relative h-32 overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>
        <iframe src={`https://maps.google.com/maps?q=${encodeURIComponent(fullAddr)}&output=embed&z=17`}
          className="w-full h-full border-0 pointer-events-none" loading="lazy" title={fullAddr} />
        {/* Score overlay */}
        <div className="absolute top-2 right-2 w-10 h-10 rounded-full flex flex-col items-center justify-center text-center shadow-sm"
          style={{ background: scoreBg, border: `1.5px solid ${scoreColor}40` }}>
          <span className="text-sm font-bold leading-none" style={{ color: scoreColor }}>{p.flipScore}</span>
          <span className="text-[8px] font-bold" style={{ color: scoreColor }}>{p.scoreGrade}</span>
        </div>
        {/* Source pill */}
        <div className="absolute top-2 left-2">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: src.bg, color: src.color, border: `1px solid ${src.color}30` }}>
            {src.label}
          </span>
        </div>
        {isHot && (
          <div className="absolute bottom-2 left-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: '#1A7A4A', color: 'white' }}>🔥 Hot Deal</span>
          </div>
        )}
      </div>

      <div className="p-4">
        {/* Address */}
        <div className="mb-3">
          <div className="font-semibold text-sm leading-tight mb-0.5" style={{ color: 'var(--sgc-black)' }}>{p.addr}</div>
          <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
            {p.city}{p.state ? `, ${p.state}` : ''} {p.zip}
            {p.beds > 0 && ` · ${p.beds}bd/${p.baths}ba`}
            {p.sqft > 0 && ` · ${p.sqft.toLocaleString()} sf`}
          </div>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {p.underMoms && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#EDFAF3', color: '#1A7A4A', border: '1px solid #1A7A4A30' }}>70% Rule ✓</span>}
            {p.priceReduced && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#F3EDFE', color: '#6B3FAD', border: '1px solid #6B3FAD30' }}>Price ↓</span>}
            {p.dom > 60 && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--sgc-warn-bg)', color: 'var(--sgc-warn)', border: '1px solid #8A570030' }}>{p.dom}d on market</span>}
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { l: 'Price',  v: fmt$(p.price),  c: 'var(--sgc-black)' },
            { l: 'ARV',    v: fmt$(p.arv),    c: 'var(--sgc-navy)' },
            { l: 'Profit', v: fmt$(p.profit), c: p.profit >= 0 ? 'var(--sgc-success)' : 'var(--sgc-danger)' },
            { l: 'ROI',    v: p.roi.toFixed(1)+'%', c: p.roi >= 0 ? 'var(--sgc-success)' : 'var(--sgc-danger)' },
          ].map(m => (
            <div key={m.l} className="rounded-lg p-2 text-center" style={{ background: 'var(--sgc-gray-light)' }}>
              <div className="text-[9px] uppercase tracking-wide mb-0.5 font-medium" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
              <div className="text-xs font-bold" style={{ color: m.c }}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Profit bar */}
        <div>
          <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>
            <span>Profit margin</span>
            <span style={{ color: p.profit >= 0 ? 'var(--sgc-success)' : 'var(--sgc-danger)', fontWeight: 600 }}>{profitPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${profitPct}%`, background: p.profit >= 0 ? 'var(--sgc-success)' : 'var(--sgc-danger)' }} />
          </div>
        </div>

        {/* Signals preview */}
        {p.signals.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {p.signals.slice(0, 3).map((s, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded"
                style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                {s.replace(/^[^\s]+\s/, '')}
              </span>
            ))}
          </div>
        )}

        {/* Run Financials CTA */}
        <button
          onClick={(e) => { e.stopPropagation(); onRunFinancials() }}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer border"
          style={{ background: 'var(--sgc-navy)', color: 'white', borderColor: 'var(--sgc-navy-dark)' }}>
          💹 Run Financials
        </button>
      </div>
    </div>
  )
}

function TableRow({ p, onSelect, onRunFinancials }: { p: AnalyzedProperty; onSelect: () => void; onRunFinancials: () => void }) {
  const src = SOURCE_COLORS[p.source] || SOURCE_COLORS.active_mls
  const scoreColor = p.flipScore >= 80 ? 'var(--sgc-success)' : p.flipScore >= 65 ? 'var(--sgc-warn)' : p.flipScore >= 50 ? 'var(--sgc-orange)' : 'var(--sgc-danger)'
  return (
    <tr onClick={onSelect}
      className="border-b cursor-pointer transition-colors group hover:bg-[var(--sgc-navy-pale)]"
      style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <td className="py-3 pl-5 pr-3">
        <div className="font-medium text-sm" style={{ color: 'var(--sgc-black)' }}>{p.addr}</div>
        <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{p.city}, {p.state} · {p.beds}bd/{p.baths}ba</div>
      </td>
      <td className="py-3 px-3">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: src.bg, color: src.color }}>
          {src.label}
        </span>
      </td>
      <td className="py-3 px-3 text-sm font-medium" style={{ color: 'var(--sgc-black)' }}>{fmt$(p.price)}</td>
      <td className="py-3 px-3 text-sm font-medium" style={{ color: 'var(--sgc-navy)' }}>{fmt$(p.arv)}</td>
      <td className="py-3 px-3 text-sm font-bold" style={{ color: p.profit >= 0 ? 'var(--sgc-success)' : 'var(--sgc-danger)' }}>{fmt$(p.profit)}</td>
      <td className="py-3 px-3 text-sm" style={{ color: p.roi >= 0 ? 'var(--sgc-success)' : 'var(--sgc-danger)' }}>{p.roi.toFixed(1)}%</td>
      <td className="py-3 px-3 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>{p.dom || '—'}</td>
      <td className="py-3 px-3 pr-5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: p.flipScore >= 65 ? '#EDFAF3' : 'var(--sgc-gray-light)', color: scoreColor, border: `1.5px solid ${scoreColor}40` }}>
          {p.flipScore}
        </div>
      </td>
      <td className="py-3 px-3 pr-5">
        <button onClick={(e) => { e.stopPropagation(); onRunFinancials() }}
          className="text-[10px] font-semibold px-2.5 py-1.5 rounded-md cursor-pointer border"
          style={{ background: 'var(--sgc-navy)', color: 'white', borderColor: 'var(--sgc-navy-dark)' }}>
          💹 Financials
        </button>
      </td>
    </tr>
  )
}

export default function Dashboard({ appState, results, allAnalyzed, apiErrors, loadingMsg,
  sortKey, viewMode, onSort, onViewMode, onSelect, searchMeta, onRunFinancials }: Props) {

  const avg = (arr: number[]) => arr.length ? arr.reduce((s,n) => s+n,0) / arr.length : 0

  if (appState === 'idle') return (
    <div className="h-full flex flex-col items-center justify-center text-center p-12">
      {/* SGC house graphic */}
      <svg viewBox="0 0 120 100" className="w-28 h-24 mb-6 opacity-20">
        <polyline points="60,8 108,44 108,95 12,95 12,44" fill="none" stroke="var(--sgc-navy)" strokeWidth="3.5" strokeLinejoin="round"/>
        <line x1="60" y1="8" x2="12" y2="44" stroke="var(--sgc-navy)" strokeWidth="3.5" strokeLinecap="round"/>
        <rect x="45" y="68" width="30" height="27" rx="1" fill="none" stroke="var(--sgc-navy)" strokeWidth="3"/>
      </svg>
      <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>FlipScan Pro</h2>
      <p className="text-sm mb-8 max-w-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
        Configure your search parameters on the left and scan for deals.
      </p>
      <div className="grid grid-cols-3 gap-4 max-w-lg w-full">
        {[
          { t: 'Active Listings', d: 'Live MLS with Foreclosure & Short Sale' },
          { t: 'Off-Market Deals', d: 'Property records, corporate-owned, delisted' },
          { t: 'AI Deal Analysis', d: 'Deep analysis and strategy per property' },
        ].map(({ t, d }) => (
          <div key={t} className="rounded-xl border p-4 text-left" style={{ background: 'white', borderColor: 'var(--sgc-gray-border)' }}>
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--sgc-navy)' }}>{t}</div>
            <div className="text-xs leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  )

  if (appState === 'loading') return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="w-10 h-10 border-2 border-t-[var(--sgc-navy)] rounded-full spin mb-4" style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }} />
      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--sgc-navy)' }}>{loadingMsg}</div>
      <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Pulling live data · Scoring deals</div>
    </div>
  )

  if (appState === 'error') return (
    <div className="p-8">
      <div className="rounded-xl border p-5 max-w-md" style={{ background: 'var(--sgc-danger-bg)', borderColor: 'var(--sgc-danger)' + '40' }}>
        <div className="text-sm font-bold mb-2" style={{ color: 'var(--sgc-danger)' }}>Search Failed</div>
        {apiErrors.map((e, i) => <div key={i} className="text-xs mb-1 font-mono" style={{ color: 'var(--sgc-danger)' }}>{e}</div>)}
        <div className="text-xs mt-2" style={{ color: 'var(--sgc-gray-mid)' }}>Try: "Norfolk, VA" · "Virginia" · "23501"</div>
      </div>
    </div>
  )

  // Results
  const sourceGroups: Record<string, number> = {}
  allAnalyzed.forEach(r => { sourceGroups[r.source] = (sourceGroups[r.source] || 0) + 1 })
  const hot = results.filter(r => r.flipScore >= 70).length

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Stats bar */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4" style={{ background: 'var(--sgc-gray-light)' }}>
        <div className="grid grid-cols-6 gap-3 mb-3">
          <StatCard label="Deals Found"    value={String(results.length)} sub={searchMeta ? `of ${searchMeta.raw} scanned` : ''} />
          <StatCard label="Hot Deals 🔥"   value={String(hot)} sub="score ≥ 70" accent="var(--sgc-success)" />
          <StatCard label="Avg Score"      value={results.length ? String(Math.round(avg(results.map(r => r.flipScore)))) : '—'} accent="var(--sgc-navy)" />
          <StatCard label="Avg Profit"     value={results.length ? fmt$(avg(results.map(r => r.profit))) : '—'} accent={avg(results.map(r => r.profit)) >= 0 ? 'var(--sgc-success)' : 'var(--sgc-danger)'} />
          <StatCard label="Best ROI"       value={results.length ? results.reduce((b,r) => r.roi > b ? r.roi : b, 0).toFixed(1) + '%' : '—'} accent="var(--sgc-success)" />
          <StatCard label="Avg Price"      value={results.length ? fmt$(avg(results.map(r => r.price))) : '—'} />
        </div>

        {/* Source pills + controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.entries(sourceGroups).map(([src, count]) => {
              const meta = SOURCE_COLORS[src]; if (!meta) return null
              return (
                <span key={src} className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }}>
                  {meta.label} {count}
                </span>
              )
            })}
            {apiErrors.length > 0 && (
              <span className="text-[10px] font-medium px-2.5 py-1 rounded-full cursor-help"
                style={{ background: 'var(--sgc-warn-bg)', color: 'var(--sgc-warn)', border: '1px solid var(--sgc-warn)30' }}
                title={apiErrors.join('\n')}>
                ⚠ {apiErrors.length} warning{apiErrors.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Sort:</span>
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              {SORT_KEYS.map(({ key, label }) => (
                <button key={key} onClick={() => onSort(key)}
                  className="px-2.5 py-1.5 text-xs font-medium cursor-pointer border-none transition-colors"
                  style={sortKey === key
                    ? { background: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', color: 'var(--sgc-gray-mid)' }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              {(['cards','table'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => onViewMode(v)}
                  className="px-2.5 py-1.5 text-xs cursor-pointer border-none transition-colors"
                  style={viewMode === v
                    ? { background: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', color: 'var(--sgc-gray-mid)' }}>
                  {v === 'cards' ? '⊞' : '≡'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ background: viewMode === 'table' ? 'white' : 'var(--sgc-gray-light)', padding: viewMode === 'table' ? '0' : '0 20px 20px' }}>
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-8">
            <div className="text-3xl mb-3 opacity-30">⬡</div>
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--sgc-navy)' }}>No deals match this filter</div>
            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Try a different strategy tab or lower thresholds</div>
          </div>
        ) : viewMode === 'table' ? (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: `1px solid var(--sgc-gray-border)`, background: 'var(--sgc-gray-light)' }}>
                {['Property','Source','Price','ARV','Profit','ROI','DOM','Score',''].map(h => (
                  <th key={h} className="text-left text-[10px] uppercase tracking-wider py-3 px-3 font-semibold first:pl-5 last:pr-5"
                    style={{ color: 'var(--sgc-gray-mid)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(p => <TableRow key={p.id} p={p} onSelect={() => onSelect(p)} onRunFinancials={() => onRunFinancials(p)} />)}
            </tbody>
          </table>
        ) : (
          <div className="grid gap-4 pt-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {results.map(p => <DealCard key={p.id} p={p} onSelect={() => onSelect(p)} onRunFinancials={() => onRunFinancials(p)} />)}
          </div>
        )}
      </div>
    </div>
  )
}
