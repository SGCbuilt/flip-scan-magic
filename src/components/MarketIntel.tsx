import { AnalyzedProperty, MarketStats } from '../types'
import { fmt$, fmtPct } from '../lib/utils'

interface Props {
  results: AnalyzedProperty[]
  marketStats: MarketStats | null
}

const GaugeCard = ({ value, label, cls = '' }: { value: string; label: string; cls?: string }) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
    <div className={`text-xl font-semibold ${cls || 'text-amber-400'}`}>{value}</div>
    <div className="text-[9px] tracking-widest uppercase text-zinc-600 mt-1">{label}</div>
  </div>
)

export default function MarketIntel({ results, marketStats }: Props) {
  if (!results.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
        <div className="text-4xl mb-4 opacity-30">📊</div>
        <div className="text-sm text-zinc-400">Run a search first</div>
        <div className="text-xs mt-1">Market intelligence loads after your first search</div>
      </div>
    )
  }

  const med = (arr: number[]) => { const s = [...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)] }
  const avg = (arr: number[]) => arr.reduce((s,n)=>s+n,0)/arr.length

  const avgProfit = avg(results.map(p => p.profit))
  const avgRoi = avg(results.map(p => p.roi))
  const passRule = results.filter(p => p.underMoms).length
  const avgScore = Math.round(avg(results.map(p => p.flipScore)))
  const medPrice = med(results.map(p => p.price))

  const sd = marketStats?.saleData || marketStats

  const grades = [
    { label: 'A (80-100)', range: [80, 100], color: 'bg-green-500' },
    { label: 'B (65-79)',  range: [65, 79],  color: 'bg-amber-400' },
    { label: 'C (50-64)',  range: [50, 64],  color: 'bg-orange-400' },
    { label: 'D (<50)',    range: [0, 49],   color: 'bg-red-500' },
  ]

  return (
    <div className="p-6">
      <div className="text-[10px] tracking-[2px] uppercase text-amber-400 mb-4 flex items-center gap-2">
        Market Summary
        <div className="flex-1 h-px bg-amber-500/20" />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <GaugeCard value={fmt$(medPrice)} label="Median List Price" />
        <GaugeCard value={fmt$(avgProfit)} label="Avg Flip Profit" cls={avgProfit >= 0 ? 'text-green-400' : 'text-red-400'} />
        <GaugeCard value={fmtPct(avgRoi)} label="Avg ROI" cls={avgRoi >= 0 ? 'text-green-400' : 'text-red-400'} />
        <GaugeCard value={`${passRule} / ${results.length}`} label="70% Rule Pass" />
        <GaugeCard value={String(avgScore)} label="Avg Flip Score" />
        <GaugeCard value={String(results.length)} label="Active Deals" />
      </div>

      {sd && (typeof sd === 'object') && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4">
          <div className="text-[10px] tracking-[2px] uppercase text-amber-400 mb-3">Market Velocity (RentCast)</div>
          {(sd as any).averageDaysOnMarket && (
            <div className="flex justify-between text-xs py-1.5 border-b border-white/[0.03]">
              <span className="text-zinc-500">Avg Days on Market</span>
              <span className="font-semibold">{(sd as any).averageDaysOnMarket}</span>
            </div>
          )}
          {(sd as any).averagePrice && (
            <div className="flex justify-between text-xs py-1.5 border-b border-white/[0.03]">
              <span className="text-zinc-500">Market Avg Price</span>
              <span className="font-semibold">{fmt$((sd as any).averagePrice)}</span>
            </div>
          )}
          {(sd as any).averagePricePerSquareFoot && (
            <div className="flex justify-between text-xs py-1.5">
              <span className="text-zinc-500">Avg Price / SqFt</span>
              <span className="font-semibold">{fmt$((sd as any).averagePricePerSquareFoot)}</span>
            </div>
          )}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="text-[10px] tracking-[2px] uppercase text-amber-400 mb-3">Score Distribution</div>
        {grades.map(g => {
          const count = results.filter(p => p.flipScore >= g.range[0] && p.flipScore <= g.range[1]).length
          const pct = results.length ? (count / results.length) * 100 : 0
          return (
            <div key={g.label} className="flex items-center gap-3 py-1.5 text-xs">
              <span className="text-zinc-400 w-20">{g.label}</span>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${g.color}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-zinc-500 w-6 text-right">{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
