import { AnalyzedProperty } from '../types'
import { fmt$ } from '../lib/utils'

interface Props {
  results: AnalyzedProperty[]
  onSelect: (p: AnalyzedProperty) => void
}

const StatCard = ({ label, value, sub, color = 'text-amber-400' }: { label: string; value: string; sub?: string; color?: string }) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
    <div className="text-[10px] tracking-widest uppercase text-zinc-600 mb-1">{label}</div>
    <div className={`text-xl font-bold ${color}`}>{value}</div>
    {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
  </div>
)

function ScoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-[10px] text-zinc-600 w-12 text-right">{label}</div>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <div className="text-[10px] text-zinc-500 w-6">{score}</div>
    </div>
  )
}

function OpportunityCard({ p, onSelect }: { p: AnalyzedProperty; onSelect: () => void }) {
  const isHot = p.flipScore >= 70
  const profitPct = Math.min(100, Math.max(0, (p.profit / Math.max(p.arv, 1)) * 100))

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border cursor-pointer transition-all hover:scale-[1.01] group
        ${isHot
          ? 'bg-gradient-to-br from-green-950/40 to-zinc-900 border-green-700/40 hover:border-green-500/60'
          : 'bg-zinc-900 border-zinc-800 hover:border-amber-500/40'}`}
    >
      {/* Card header */}
      <div className="p-4 border-b border-zinc-800/60">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {isHot && (
                <span className="text-[9px] bg-green-500 text-zinc-950 font-bold px-2 py-0.5 rounded-full tracking-wide">🔥 HOT DEAL</span>
              )}
              {p.underMoms && (
                <span className="text-[9px] border border-green-500/40 text-green-400 px-2 py-0.5 rounded-full">70% ✓</span>
              )}
              {p.priceReduced && (
                <span className="text-[9px] border border-purple-500/40 text-purple-400 px-2 py-0.5 rounded-full">Price ↓</span>
              )}
            </div>
            <div className="text-sm font-bold text-zinc-100">{p.addr}</div>
            <div className="text-[11px] text-zinc-500">
              {p.city}, {p.state} {p.zip}
              {p.beds ? ` · ${p.beds}bd/${p.baths}ba` : ''}
              {p.sqft ? ` · ${p.sqft.toLocaleString()} sqft` : ''}
              {p.yearBuilt ? ` · Built ${p.yearBuilt}` : ''}
            </div>
          </div>
          {/* Score circle */}
          <div className={`w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center flex-shrink-0
            ${p.flipScore >= 80 ? 'border-green-500 bg-green-950/40' : p.flipScore >= 65 ? 'border-amber-500 bg-amber-950/30' : 'border-zinc-600 bg-zinc-800/50'}`}>
            <span className={`text-lg font-bold leading-none ${p.scoreClass}`}>{p.flipScore}</span>
            <span className={`text-[9px] font-semibold ${p.scoreClass}`}>{p.scoreGrade}</span>
          </div>
        </div>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-3 divide-x divide-zinc-800/60 border-b border-zinc-800/60">
        <div className="p-3 text-center">
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">List Price</div>
          <div className="text-sm font-bold text-zinc-200">{fmt$(p.price)}</div>
        </div>
        <div className="p-3 text-center">
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Est ARV</div>
          <div className="text-sm font-bold text-amber-400">{fmt$(p.arv)}</div>
        </div>
        <div className="p-3 text-center">
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Net Profit</div>
          <div className={`text-sm font-bold ${p.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt$(p.profit)}</div>
        </div>
      </div>

      {/* Profit bar */}
      <div className="px-4 py-2 border-b border-zinc-800/60">
        <div className="flex justify-between text-[10px] text-zinc-600 mb-1">
          <span>Profit margin</span>
          <span className={p.profit >= 0 ? 'text-green-400' : 'text-red-400'}>{profitPct.toFixed(1)}%</span>
        </div>
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${p.profit >= 0 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${profitPct}%` }} />
        </div>
      </div>

      {/* Score breakdown */}
      <div className="p-4 border-b border-zinc-800/60">
        <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">Score Breakdown</div>
        <div className="space-y-1.5">
          <ScoreBar score={p.scoreBreakdown.roi}    label="ROI"    color="bg-green-500" />
          <ScoreBar score={p.scoreBreakdown.rule70} label="70%"    color="bg-amber-500" />
          <ScoreBar score={p.scoreBreakdown.dom}    label="DOM"    color="bg-blue-500" />
          <ScoreBar score={p.scoreBreakdown.equity} label="Equity" color="bg-purple-500" />
          <ScoreBar score={p.scoreBreakdown.profit} label="Profit" color="bg-teal-500" />
        </div>
      </div>

      {/* Extra metrics row */}
      <div className="grid grid-cols-4 divide-x divide-zinc-800/40 border-b border-zinc-800/60">
        {[
          { l: 'ROI', v: p.roi.toFixed(1) + '%', c: p.roi >= 0 ? 'text-green-400' : 'text-red-400' },
          { l: 'Rehab', v: fmt$(p.rehabCost), c: 'text-orange-400' },
          { l: 'DOM', v: p.dom ? String(p.dom) + 'd' : '—', c: p.dom > 60 ? 'text-amber-400' : 'text-zinc-400' },
          { l: 'Cash Req', v: fmt$(p.totalCash), c: 'text-zinc-300' },
        ].map(m => (
          <div key={m.l} className="py-2 px-2 text-center">
            <div className="text-[9px] text-zinc-600 uppercase tracking-wider">{m.l}</div>
            <div className={`text-xs font-semibold ${m.c}`}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Signals */}
      {p.signals.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">Opportunity Signals</div>
          <div className="flex flex-wrap gap-1">
            {p.signals.map((s, i) => (
              <span key={i} className="text-[10px] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-full border border-zinc-700/50">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Opportunities({ results, onSelect }: Props) {
  if (!results.length) {
    return (
      <div className="flex flex-col items-center justify-center h-80 text-center px-8">
        <div className="text-5xl mb-4 opacity-20">🎯</div>
        <div className="text-sm text-zinc-300 mb-1">No Opportunities Yet</div>
        <div className="text-xs text-zinc-600 max-w-xs">Run a search to see ranked flip opportunities with full deal analysis and scoring breakdown.</div>
      </div>
    )
  }

  const hot = results.filter(r => r.flipScore >= 70)
  const good = results.filter(r => r.flipScore >= 55 && r.flipScore < 70)
  const rest = results.filter(r => r.flipScore < 55)
  const avg = (arr: number[]) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0
  const totalPotential = results.reduce((s, r) => s + Math.max(0, r.profit), 0)

  return (
    <div className="p-5">
      {/* Summary Strip */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        <StatCard label="Total Deals" value={String(results.length)} sub="matching criteria" />
        <StatCard label="Hot Deals" value={String(hot.length)} sub="score ≥ 70" color="text-green-400" />
        <StatCard label="Avg Flip Score" value={String(Math.round(avg(results.map(r => r.flipScore))))} color="text-amber-400" />
        <StatCard label="Avg Net Profit" value={fmt$(avg(results.map(r => r.profit)))} color={avg(results.map(r => r.profit)) >= 0 ? 'text-green-400' : 'text-red-400'} />
        <StatCard label="Total Potential" value={fmt$(totalPotential)} sub="sum of all profits" color="text-amber-400" />
      </div>

      {/* HOT DEALS */}
      {hot.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] tracking-[2px] uppercase text-green-400 font-semibold">🔥 Hot Deals — Score 70+</span>
            <div className="flex-1 h-px bg-green-500/20" />
            <span className="text-[10px] text-zinc-600">{hot.length} properties</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {hot.map(p => <OpportunityCard key={p.id} p={p} onSelect={() => onSelect(p)} />)}
          </div>
        </>
      )}

      {/* GOOD DEALS */}
      {good.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] tracking-[2px] uppercase text-amber-400 font-semibold">✅ Good Deals — Score 55–69</span>
            <div className="flex-1 h-px bg-amber-500/20" />
            <span className="text-[10px] text-zinc-600">{good.length} properties</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {good.map(p => <OpportunityCard key={p.id} p={p} onSelect={() => onSelect(p)} />)}
          </div>
        </>
      )}

      {/* MARGINAL */}
      {rest.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] tracking-[2px] uppercase text-zinc-500 font-semibold">⚠️ Marginal — Score &lt;55</span>
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-[10px] text-zinc-600">{rest.length} properties</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rest.map(p => <OpportunityCard key={p.id} p={p} onSelect={() => onSelect(p)} />)}
          </div>
        </>
      )}
    </div>
  )
}
