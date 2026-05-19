import { AnalyzedProperty } from '@/types'
import { useFavorites } from '@/context/FavoritesContext'
import { fmt$ } from '@/lib/utils'

interface Props {
  onClose: () => void
  onSelect: (p: AnalyzedProperty) => void
}

export default function CompareModal({ onClose, onSelect }: Props) {
  const { favorites, remove, clear } = useFavorites()

  const rows: { label: string; get: (p: AnalyzedProperty) => string; color?: (p: AnalyzedProperty) => string }[] = [
    { label: 'Address',     get: p => `${p.addr}, ${p.city}, ${p.state} ${p.zip}` },
    { label: 'Source',      get: p => p.sourceLabel },
    { label: 'Price',       get: p => fmt$(p.price) },
    { label: 'ARV',         get: p => fmt$(p.arv) },
    { label: 'Rehab',       get: p => fmt$(p.rehabCost) },
    { label: 'Total Cash',  get: p => fmt$(p.totalCash) },
    { label: 'Profit',      get: p => fmt$(p.profit),  color: p => p.profit >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'ROI',         get: p => p.roi.toFixed(1)+'%', color: p => p.roi >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Cash-on-Cash',get: p => p.cashOnCash.toFixed(1)+'%' },
    { label: 'Annualized',  get: p => p.annualizedROI.toFixed(1)+'%' },
    { label: 'Equity %',    get: p => p.equityPct.toFixed(1)+'%' },
    { label: 'Score',       get: p => `${p.flipScore} (${p.scoreGrade})`, color: p => p.scoreClass },
    { label: '70% Rule',    get: p => p.underMoms ? '✓ Pass' : '✗ Fail', color: p => p.underMoms ? 'text-emerald-400' : 'text-zinc-500' },
    { label: 'Beds / Baths',get: p => `${p.beds} / ${p.baths}` },
    { label: 'Sqft',        get: p => p.sqft ? p.sqft.toLocaleString() : '—' },
    { label: 'Year Built',  get: p => p.yearBuilt ? String(p.yearBuilt) : '—' },
    { label: 'DOM',         get: p => p.dom ? `${p.dom}d` : '—' },
  ]

  // Best-value highlights for numeric rows
  const best = (key: 'profit' | 'roi' | 'cashOnCash' | 'flipScore') =>
    favorites.length > 0 ? Math.max(...favorites.map(p => p[key])) : 0
  const bestProfit = best('profit')
  const bestRoi = best('roi')
  const bestCoc = best('cashOnCash')
  const bestScore = best('flipScore')

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 flex-shrink-0">
          <div>
            <div className="text-sm font-bold text-white tracking-wide">⭐ Favorites & Comparison</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {favorites.length} saved {favorites.length === 1 ? 'property' : 'properties'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {favorites.length > 0 && (
              <button onClick={() => { if (confirm('Remove all favorites?')) clear() }}
                className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-red-400 border border-zinc-800 hover:border-red-500/50 rounded px-2.5 py-1 bg-transparent cursor-pointer transition-colors">
                Clear All
              </button>
            )}
            <button onClick={onClose}
              className="text-[10px] uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded px-2.5 py-1 bg-transparent cursor-pointer transition-colors">
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {favorites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-5xl mb-4 opacity-30">⭐</div>
              <div className="text-sm text-zinc-400 mb-1">No favorites yet</div>
              <div className="text-xs text-zinc-600 max-w-xs">
                Click the star on any property card to save it here for side-by-side comparison.
              </div>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-950 z-10">
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-[10px] uppercase tracking-widest text-zinc-500 py-3 px-3 font-normal sticky left-0 bg-zinc-950 z-20 min-w-[120px]">Metric</th>
                  {favorites.map(p => (
                    <th key={p.id} className="text-left py-3 px-3 min-w-[200px] border-l border-zinc-900">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => onSelect(p)}
                          className="text-left flex-1 cursor-pointer group"
                        >
                          <div className="text-xs font-bold text-white group-hover:text-[#7a9fe8] leading-tight">{p.addr}</div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">{p.city}, {p.state}</div>
                        </button>
                        <button onClick={() => remove(p.id)}
                          title="Remove from favorites"
                          className="text-zinc-600 hover:text-red-400 text-base leading-none cursor-pointer transition-colors flex-shrink-0">
                          ×
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.label} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                    <td className="py-2.5 px-3 text-[10px] uppercase tracking-wider text-zinc-500 sticky left-0 bg-zinc-950 font-medium">{r.label}</td>
                    {favorites.map(p => {
                      const val = r.get(p)
                      let isBest = false
                      if (r.label === 'Profit' && p.profit === bestProfit && favorites.length > 1) isBest = true
                      if (r.label === 'ROI' && p.roi === bestRoi && favorites.length > 1) isBest = true
                      if (r.label === 'Cash-on-Cash' && p.cashOnCash === bestCoc && favorites.length > 1) isBest = true
                      if (r.label === 'Score' && p.flipScore === bestScore && favorites.length > 1) isBest = true
                      return (
                        <td key={p.id} className={`py-2.5 px-3 border-l border-zinc-900 ${r.color ? r.color(p) : 'text-zinc-200'} ${isBest ? 'bg-emerald-950/30 font-bold' : ''}`}>
                          {val}
                          {isBest && <span className="ml-1.5 text-[9px] text-emerald-500">★ best</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}