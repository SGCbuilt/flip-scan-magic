import { AnalyzedProperty } from '../types'
import { fmt$, tagColors } from '../lib/utils'

interface Props {
  property: AnalyzedProperty
  onClick: () => void
  view?: 'card' | 'row'
}

export default function PropertyCard({ property: p, onClick, view = 'card' }: Props) {
  const isHot = p.flipScore >= 70
  const accentColor = isHot ? 'bg-green-500' : 'bg-slate-200 group-hover:bg-blue-900/60'

  if (view === 'row') {
    return (
      <tr onClick={onClick} className="border-b border-slate-200/70 hover:bg-slate-100/50 cursor-pointer transition-colors group">
        <td className="py-2.5 pl-4 pr-2">
          <div className="flex items-center gap-2">
            <div className={`w-1 h-8 rounded-full flex-shrink-0 ${isHot ? 'bg-green-500' : 'bg-slate-200 group-hover:bg-blue-900'} transition-colors`} />
            <div>
              <div className="text-xs text-slate-800 font-medium truncate max-w-[200px]">{p.addr}</div>
              <div className="text-[10px] text-slate-500">{p.city}, {p.state} · {p.beds}bd/{p.baths}ba</div>
            </div>
          </div>
        </td>
        <td className="py-2.5 px-2 text-xs">{fmt$(p.price)}</td>
        <td className="py-2.5 px-2 text-xs text-blue-900">{fmt$(p.arv)}</td>
        <td className={`py-2.5 px-2 text-xs font-semibold ${p.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt$(p.profit)}</td>
        <td className={`py-2.5 px-2 text-xs ${p.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{p.roi.toFixed(1)}%</td>
        <td className="py-2.5 px-2 text-xs text-slate-600">{p.dom || '—'}</td>
        <td className="py-2.5 px-2">
          <span className={`text-sm font-bold ${p.scoreClass}`}>{p.flipScore}</span>
        </td>
        <td className="py-2.5 px-2 pr-4">
          <div className="flex gap-1 flex-wrap">
            {p.tags.slice(0, 2).map((t, i) => (
              <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border ${tagColors[t.color] || tagColors.amber}`}>{t.text}</span>
            ))}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-lg p-4 cursor-pointer transition-all overflow-hidden border
        ${isHot ? 'bg-green-950/20 border-green-800/40 hover:border-green-600/50' : 'bg-slate-50 border-slate-200 hover:border-blue-900/30 hover:bg-slate-100/80'}`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${accentColor} transition-colors`} />

      {/* Top row */}
      <div className="flex justify-between items-start mb-3 pl-2">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2 mb-0.5">
            {isHot && <span className="text-[9px] bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded tracking-wide uppercase">Hot Deal</span>}
            {p.priceReduced && <span className="text-[9px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded tracking-wide uppercase">Price ↓</span>}
          </div>
          <div className="text-sm font-semibold text-slate-900 truncate">{p.addr}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {p.city}, {p.state} {p.zip}
            {p.beds ? ` · ${p.beds}bd` : ''}{p.baths ? `/${p.baths}ba` : ''}
            {p.sqft ? ` · ${p.sqft.toLocaleString()} sqft` : ''}
            {p.yearBuilt ? ` · ${p.yearBuilt}` : ''}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-2xl font-bold leading-none ${p.scoreClass}`}>{p.flipScore}</div>
          <div className="text-[9px] tracking-widest uppercase text-slate-500 mt-0.5">Score</div>
          <div className={`text-xs font-semibold mt-1 ${p.scoreClass}`}>{p.scoreGrade}</div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-6 gap-1.5 mb-3 pl-2">
        {[
          { label: 'List Price',  value: fmt$(p.price),            cls: '' },
          { label: 'ARV',         value: fmt$(p.arv),              cls: 'text-blue-900' },
          { label: 'Profit',      value: fmt$(p.profit),           cls: p.profit >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'ROI',         value: p.roi.toFixed(1) + '%',   cls: p.roi >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Rehab Est',   value: fmt$(p.rehabCost),        cls: 'text-orange-400' },
          { label: 'DOM',         value: p.dom ? String(p.dom) : '—', cls: p.dom > 60 ? 'text-blue-900' : '' },
        ].map(m => (
          <div key={m.label}>
            <div className="text-[9px] tracking-wider uppercase text-slate-500 mb-0.5">{m.label}</div>
            <div className={`text-[11px] font-semibold ${m.cls || 'text-slate-800'}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Signals */}
      {p.signals.length > 0 && (
        <div className="pl-2 mb-2">
          <div className="text-[10px] text-slate-500 mb-1">Opportunity Signals</div>
          <div className="flex flex-wrap gap-1">
            {p.signals.slice(0, 3).map((s, i) => (
              <span key={i} className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{s}</span>
            ))}
            {p.signals.length > 3 && <span className="text-[10px] text-slate-500">+{p.signals.length - 3} more</span>}
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 pl-2">
        {p.tags.map((t, i) => (
          <span key={i} className={`text-[9px] px-2 py-0.5 rounded border ${tagColors[t.color] || tagColors.amber}`}>{t.text}</span>
        ))}
      </div>
    </div>
  )
}
