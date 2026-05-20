import { SavedMarket } from '@/lib/marketFavorites'

const fmt$ = (n?: number) => n && n > 0 ? '$' + Math.round(n).toLocaleString() : '—'
const pct = (n?: number, d = 1) => n != null ? n.toFixed(d) + '%' : '—'

// Higher = better unless inverted
function bestIdx(vals: (number | undefined)[], inverted = false): number {
  let best = -1
  let bestVal = inverted ? Infinity : -Infinity
  vals.forEach((v, i) => {
    if (v == null) return
    if (inverted ? v < bestVal : v > bestVal) { bestVal = v; best = i }
  })
  return best
}

interface Row {
  label: string
  get: (m: SavedMarket) => number | undefined
  fmt: (v: number | undefined) => string
  inverted?: boolean
}

const ROWS: Row[] = [
  { label: 'Overall Investor Score', get: m => m.ai.investorScore,    fmt: v => v != null ? `${v}/100` : '—' },
  { label: 'Flip Score',             get: m => m.ai.flipScore,         fmt: v => v != null ? `${v}/100` : '—' },
  { label: 'BRRRR Score',            get: m => m.ai.brrrScore,         fmt: v => v != null ? `${v}/100` : '—' },
  { label: 'Median Home Value',      get: m => m.ai.medianHomeValue,   fmt: fmt$ },
  { label: 'Home Value 1yr',         get: m => m.ai.homeValueChange1yr,fmt: v => pct(v) },
  { label: 'Home Value 5yr',         get: m => m.ai.homeValueChange5yr,fmt: v => pct(v) },
  { label: 'Median Rent',            get: m => m.ai.medianRent,        fmt: fmt$ },
  { label: 'Median Income',          get: m => m.ai.medianHouseholdIncome, fmt: fmt$ },
  { label: 'Population Growth',      get: m => m.ai.populationGrowth,  fmt: v => pct(v) },
  { label: 'Job Growth',             get: m => m.ai.jobGrowthRate,     fmt: v => pct(v) },
  { label: 'Unemployment',           get: m => m.ai.unemploymentRate,  fmt: v => pct(v), inverted: true },
  { label: 'Avg Days on Market',     get: m => m.ai.avgDaysOnMarket,   fmt: v => v != null ? `${v}d` : '—' },
  { label: 'Inventory (months)',     get: m => m.ai.inventoryMonths,   fmt: v => v != null ? v.toFixed(1) : '—' },
  { label: 'New Permits YoY',        get: m => m.ai.newPermitsYoY,     fmt: v => pct(v) },
  { label: 'Crime Index',            get: m => m.ai.crimeIndexOverall, fmt: v => v != null ? `${v}/100` : '—', inverted: true },
  { label: 'School Rating',          get: m => m.ai.schoolRatingAvg,   fmt: v => v != null ? `${v.toFixed(1)}/10` : '—' },
  { label: 'Vacancy Rate',           get: m => m.ai.vacancyRate,       fmt: v => pct(v), inverted: true },
  { label: 'Owner Occupancy',        get: m => m.ai.ownerOccupancyRate,fmt: v => pct(v) },
]

export default function MarketCompareModal({ markets, onClose }: {
  markets: SavedMarket[]; onClose: () => void
}) {
  if (markets.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--sgc-navy)' }}>Compare Markets</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              {markets.length} markets · best value highlighted per row
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg border-none cursor-pointer text-lg leading-none"
            style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>×</button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead className="sticky top-0 bg-white z-10">
              <tr style={{ borderBottom: '2px solid var(--sgc-gray-border)' }}>
                <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--sgc-gray-mid)' }}>Metric</th>
                {markets.map(m => (
                  <th key={m.id} className="text-left px-4 py-3" style={{ minWidth: 160 }}>
                    <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>{m.location}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                      {m.ai.marketType}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, ri) => {
                const vals = markets.map(m => row.get(m))
                const best = bestIdx(vals, row.inverted)
                return (
                  <tr key={ri} style={{ borderBottom: '1px solid var(--sgc-gray-border)' }}>
                    <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--sgc-gray-mid)' }}>
                      {row.label}
                    </td>
                    {vals.map((v, i) => (
                      <td key={i} className="px-4 py-2.5 text-sm font-semibold"
                        style={{
                          color: best === i ? '#1A7A4A' : 'var(--sgc-black)',
                          background: best === i ? '#EDFAF3' : 'transparent',
                        }}>
                        {row.fmt(v)}
                        {best === i && <span className="ml-1 text-[10px]">★</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}