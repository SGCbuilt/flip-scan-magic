import { AnalyzedProperty } from '../types'
import { fmt$, tagColors } from '../lib/utils'

interface Props {
  property: AnalyzedProperty
  onClick: () => void
}

export default function PropertyCard({ property: p, onClick }: Props) {
  const isHot = p.flipScore >= 70
  const accentColor = isHot ? 'bg-green-500' : 'bg-amber-500/40 group-hover:bg-amber-500'

  return (
    <div
      onClick={onClick}
      className={`group relative bg-zinc-900 border rounded-lg p-4 cursor-pointer transition-all overflow-hidden
        ${isHot ? 'border-green-500/30 hover:border-green-500/50' : 'border-zinc-800 hover:border-amber-500/30'}
        hover:bg-zinc-800/80`}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${accentColor} transition-colors`} />

      <div className="flex justify-between items-start mb-3 pl-2">
        <div className="flex-1 min-w-0 pr-4">
          <div className="text-sm font-semibold text-zinc-100 truncate">{p.addr}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            {p.city}, {p.state} {p.zip}
            {p.beds ? ` · ${p.beds}bd` : ''}{p.baths ? `/${p.baths}ba` : ''}
            {p.sqft ? ` · ${p.sqft.toLocaleString()} sqft` : ''}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-2xl font-semibold leading-none ${p.scoreClass}`}>{p.flipScore}</div>
          <div className="text-[9px] tracking-widest uppercase text-zinc-600 mt-0.5">Flip Score</div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 mb-3 pl-2">
        {[
          { label: 'List Price', value: fmt$(p.price), cls: '' },
          { label: 'Est ARV', value: fmt$(p.arv), cls: 'text-amber-400' },
          { label: 'Est Profit', value: fmt$(p.profit), cls: p.profit >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'ROI', value: p.roi.toFixed(1) + '%', cls: p.roi >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'DOM', value: p.dom ? String(p.dom) : '—', cls: '' },
        ].map(m => (
          <div key={m.label}>
            <div className="text-[9px] tracking-widest uppercase text-zinc-600 mb-0.5">{m.label}</div>
            <div className={`text-xs font-semibold ${m.cls || 'text-zinc-100'}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 pl-2">
        {p.tags.map((t, i) => (
          <span key={i} className={`text-[10px] px-2 py-0.5 rounded border ${tagColors[t.color] || tagColors.amber}`}>
            {t.text}
          </span>
        ))}
      </div>
    </div>
  )
}
