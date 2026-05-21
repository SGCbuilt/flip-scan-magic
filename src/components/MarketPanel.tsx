import { useState, useEffect } from 'react'
import { MarketIntelligence, HistoricalPoint, fetchMarketIntelligence, fetchRentEstimate } from '../lib/market'
import { AnalyzedProperty } from '../types'

interface Props {
  locationQuery: string
  searchMode: string
  results: AnalyzedProperty[]
  visible: boolean
}

// ── Mini chart using inline SVG ───────────────────────────────────────────
function SparkLine({
  data, field, color, height = 48, showArea = true
}: {
  data: HistoricalPoint[]
  field: keyof HistoricalPoint
  color: string
  height?: number
  showArea?: boolean
}) {
  const values = data.map(d => d[field] as number).filter(v => v != null && v > 0)
  if (values.length < 2) return <div className="h-12 flex items-center justify-center text-[10px] text-[var(--sgc-gray-mid)]">No history</div>

  const min = Math.min(...values) * 0.98
  const max = Math.max(...values) * 1.02
  const range = max - min || 1
  const w = 300
  const h = height

  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: h - ((v - min) / range) * h
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${pts[pts.length-1].x} ${h} L 0 ${h} Z`

  const last = values[values.length - 1]
  const first = values[0]
  const change = ((last - first) / first) * 100
  const isUp = change >= 0

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
        {showArea && (
          <path d={areaPath} fill={color} fillOpacity="0.08" />
        )}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Last point dot */}
        <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="3" fill={color} />
      </svg>
      <div className={`absolute top-0 right-0 text-[10px] font-bold ${isUp ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]'}`}>
        {isUp ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
      </div>
    </div>
  )
}

// ── Buyer/Seller Gauge ────────────────────────────────────────────────────
function MarketGauge({ score, type }: { score: number; type: string }) {
  // All states use the navy/blue family — matches layout brand
  const navyPalette = {
    bar:    'bg-[var(--sgc-navy)]',
    text:   'text-[var(--sgc-navy)]',
    bg:     'bg-[var(--sgc-navy-pale)]',
    border: 'border-[var(--sgc-navy)]',
  }
  const colors: Record<string, typeof navyPalette> = {
    'strong-sellers': navyPalette,
    'sellers':        navyPalette,
    'balanced':       navyPalette,
    'buyers':         navyPalette,
    'strong-buyers':  navyPalette,
  }
  const c = colors[type] || colors.balanced
  const labels: Record<string, string> = {
    'strong-sellers': "🔥 Strong Seller's Market",
    'sellers':        "📈 Seller's Market",
    'balanced':       '⚖️ Balanced Market',
    'buyers':         "💡 Buyer's Market",
    'strong-buyers':  "🛒 Strong Buyer's Market",
  }
  const descriptions: Record<string, string> = {
    'strong-sellers': 'Homes sell fast, often above ask. Multiple offers common. Limited negotiation power.',
    'sellers':        'Sellers have advantage. Homes move quickly. Moderate competition among buyers.',
    'balanced':       'Fair to both sides. Reasonable negotiation. Normal days on market.',
    'buyers':         'More inventory, slower sales. Room to negotiate price and terms.',
    'strong-buyers':  'High inventory, slow market. Significant leverage to negotiate deals.',
  }
  const flipTips: Record<string, string> = {
    'strong-sellers': '⚡ Flips sell fast — great exit market. Compete hard on acquisition.',
    'sellers':        '✅ Good flip environment. Plan ARV conservatively.',
    'balanced':       '⚖️ Standard flip calculus applies. Margins matter.',
    'buyers':         '🏷️ More acquisition opportunities. Price ARV carefully.',
    'strong-buyers':  '📦 Best time to buy below market. Longer hold expected.',
  }

  return (
    <div
      className={`rounded-2xl border ${c.border} border-l-4 p-5 ${c.bg} relative overflow-hidden`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg, rgba(27,58,140,0.06) 0 2px, transparent 2px 12px),' +
          'repeating-linear-gradient(45deg, rgba(27,58,140,0.04) 0 1px, transparent 1px 10px)',
        backgroundColor: 'var(--sgc-navy-pale)',
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-gray-mid)] mb-1">Market Condition</div>
          <div className={`text-xl font-bold ${c.text}`}>{labels[type]}</div>
          <div className="text-xs text-[var(--sgc-gray-mid)] mt-1 max-w-xs leading-relaxed">{descriptions[type]}</div>
        </div>
        {/* Score dial */}
        <div className="flex-shrink-0 text-right">
          <div className={`text-5xl font-black ${c.text} leading-none`}>{score}</div>
          <div className="text-[10px] text-[var(--sgc-gray-mid)] mt-0.5">/ 100</div>
          <div className="text-[9px] text-[var(--sgc-gray-mid)]">Sellers ←→ Buyers</div>
        </div>
      </div>

      {/* Bar gauge */}
      <div className="mb-4">
        <div className="flex justify-between text-[9px] text-[var(--sgc-gray-mid)] mb-1">
          <span>Buyers 0</span>
          <span>Balanced 50</span>
          <span>100 Sellers</span>
        </div>
        <div className="h-3 bg-white border border-[var(--sgc-gray-border)] rounded-full overflow-hidden relative">
          {/* Navy gradient — light navy (buyers) → mid → deep navy (sellers) */}
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to right, var(--sgc-navy-mid), var(--sgc-navy-light) 50%, var(--sgc-navy-dark))' }} />
          {/* Score marker */}
          <div className="absolute -top-0.5 -bottom-0.5 w-1.5 bg-white border border-[var(--sgc-navy-dark)] rounded-full transition-all shadow"
            style={{ left: `calc(${score}% - 3px)` }} />
        </div>
      </div>

      {/* Flip tip */}
      <div className="text-[11px] text-[var(--sgc-black)] bg-white rounded-lg px-3 py-2 border border-[var(--sgc-gray-border)]">
        {flipTips[type]}
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────
function Stat({ label, value, sub, color = 'text-[var(--sgc-black)]' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-3">
      <div className="text-[9px] tracking-[2px] uppercase text-[var(--sgc-gray-mid)] mb-1">{label}</div>
      <div className={`text-lg font-bold leading-none ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--sgc-gray-mid)] mt-1">{sub}</div>}
    </div>
  )
}

// ── Trend badge ───────────────────────────────────────────────────────────
function TrendBadge({ trend, pct }: { trend: string; pct: number }) {
  const up   = trend === 'rising'
  const flat = trend === 'stable'
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full
      ${flat ? 'bg-[var(--sgc-gray-border)] text-[var(--sgc-gray-mid)]' : up ? 'bg-emerald-950 text-[var(--sgc-success)] border border-emerald-800' : 'bg-red-950 text-[var(--sgc-danger)] border border-red-800'}`}>
      {flat ? '→' : up ? '↑' : '↓'} {flat ? 'Stable' : `${Math.abs(pct).toFixed(1)}%`}
    </span>
  )
}

// ── Full bar chart ────────────────────────────────────────────────────────
function BarChart({
  data, field, label, color, fmt
}: {
  data: HistoricalPoint[]
  field: keyof HistoricalPoint
  label: string
  color: string
  fmt: (v: number) => string
}) {
  const values = data.map(d => ({ v: d[field] as number, l: d.label })).filter(x => x.v > 0)
  if (!values.length) return null

  const max = Math.max(...values.map(x => x.v))
  const recent = values.slice(-3)

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-gray-mid)]">{label}</div>
        <div className="text-xs font-bold text-[var(--sgc-black)]">{fmt(values[values.length-1]?.v || 0)}</div>
      </div>
      {/* Sparkline */}
      <div className="h-14 mb-2">
        <SparkLine data={data} field={field} color={color} height={56} />
      </div>
      {/* Last 3 bars */}
      <div className="flex gap-1 items-end h-10">
        {values.slice(-12).map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className={`w-full rounded-sm transition-all ${i >= values.slice(-12).length - 3 ? 'opacity-100' : 'opacity-40'}`}
              style={{ height: `${Math.max(4, (v.v / max) * 36)}px`, background: color }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-[var(--sgc-gray-mid)] mt-0.5">
        <span>{values[Math.max(0, values.length-12)]?.l}</span>
        <span>{values[values.length-1]?.l}</span>
      </div>
    </div>
  )
}

const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'
const fmtPct = (n: number) => n.toFixed(1) + '%'

// ── MAIN COMPONENT ────────────────────────────────────────────────────────
export default function MarketPanel({ locationQuery, searchMode, results, visible }: Props) {
  const [intel, setIntel] = useState<MarketIntelligence | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeChart, setActiveChart] = useState<'price' | 'rent' | 'dom' | 'inventory'>('price')

  useEffect(() => {
    if (!visible || !locationQuery) return
    loadIntel()
  }, [visible, locationQuery])

  const loadIntel = async () => {
    setLoading(true); setError(''); setIntel(null)
    const q = locationQuery.trim()

    let zipCode: string | undefined
    let city: string | undefined
    let state: string | undefined

    if (/^\d{5}$/.test(q)) {
      zipCode = q
    } else {
      const parts = q.split(',').map(s => s.trim())
      city  = parts[0]
      state = parts[1] || undefined
    }

    try {
      const data = await fetchMarketIntelligence(zipCode, city, state)
      if (!data) throw new Error('No market data available for this location')
      setIntel(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="w-10 h-10 border-2 border-[var(--sgc-gray-border)] border-t-[#1a3a8f] rounded-full animate-spin mb-4" />
      <div className="text-sm text-[var(--sgc-gray-mid)]">Loading market intelligence...</div>
      <div className="text-xs text-[var(--sgc-gray-mid)] mt-1">Pulling sale & rental trends from RentCast</div>
    </div>
  )

  if (error) return (
    <div className="p-6">
      <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-4 max-w-md">
        <div className="text-sm text-[var(--sgc-danger)] font-semibold mb-1">⚠️ Market Data Unavailable</div>
        <div className="text-xs text-[var(--sgc-danger)]/70">{error}</div>
        <div className="text-[11px] text-[var(--sgc-gray-mid)] mt-2">Market data requires a zip code or city + state search.</div>
        <button onClick={loadIntel} className="mt-3 text-[11px] text-[var(--sgc-navy)] cursor-pointer hover:text-[var(--sgc-black)] transition-colors bg-transparent border-none">
          ↻ Retry
        </button>
      </div>
    </div>
  )

  if (!intel) return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="text-5xl mb-4 opacity-20">📊</div>
      <div className="text-sm text-[var(--sgc-black)] mb-1">Market Intelligence</div>
      <div className="text-xs text-[var(--sgc-gray-mid)] max-w-xs">Run a search to load rental trends, price history, and buyer/seller analysis for your target market.</div>
    </div>
  )

  const { sale, rental, intelligence: intel_ } = intel
  const {
    marketType, marketScore, priceTrend, priceTrendPct,
    rentTrend, rentTrendPct, domTrend, grossYield,
    monthsOfSupply, signals, summary
  } = intel_

  // Merge sale + rental history for combo charts
  const allHistory = (sale?.history || []).map(h => {
    const rh = rental?.history.find(r => r.year === h.year && r.month === h.month)
    return { ...h, avgRent: rh?.avgRent }
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-[var(--sgc-black)]">Market Intelligence</h2>
            <div className="text-xs text-[var(--sgc-gray-mid)]">{locationQuery} — Live RentCast data</div>
          </div>
          <button onClick={loadIntel}
            className="text-[11px] text-[var(--sgc-gray-mid)] hover:text-[var(--sgc-black)] border border-[var(--sgc-gray-border)] hover:border-zinc-600 px-3 py-1.5 rounded-lg transition-colors cursor-pointer bg-transparent">
            ↻ Refresh
          </button>
        </div>

        {/* Market Condition Gauge */}
        <div className="mb-5">
          <MarketGauge score={marketScore} type={marketType} />
        </div>

        {/* Signals */}
        {signals.length > 0 && (
          <div className="mb-5">
            <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-gray-mid)] mb-2">Market Signals</div>
            <div className="flex flex-wrap gap-2">
              {signals.map((s, i) => (
                <span key={i} className="text-xs text-[var(--sgc-black)] bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] px-3 py-1.5 rounded-lg">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Key Stats Grid */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {sale && <>
            <Stat label="Avg Sale Price"   value={fmt$(sale.avgPrice)}   sub={`Median ${fmt$(sale.medianPrice)}`} />
            <Stat label="Avg $/SqFt"       value={sale.avgPsf > 0 ? fmt$(sale.avgPsf) : '—'} />
            <Stat label="Avg Days on Mkt"  value={sale.avgDom > 0 ? `${sale.avgDom}d` : '—'} color={sale.avgDom < 30 ? 'text-[var(--sgc-danger)]' : sale.avgDom > 60 ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-black)]'} />
            <Stat label="Active Listings"  value={sale.totalListings > 0 ? String(sale.totalListings) : '—'} sub={sale.newListings > 0 ? `${sale.newListings} new` : undefined} />
          </>}
        </div>

        {/* Rental Stats Grid */}
        {rental && (
          <div className="grid grid-cols-4 gap-2 mb-5">
            <Stat label="Avg Rent/mo"      value={fmt$(rental.avgRent)}   sub={`Median ${fmt$(rental.medianRent)}`} color="text-[var(--sgc-navy)]" />
            <Stat label="Avg Rent/SqFt"    value={rental.avgRentPsf > 0 ? `$${rental.avgRentPsf.toFixed(2)}` : '—'} color="text-[var(--sgc-navy)]" />
            <Stat label="Gross Yield"       value={grossYield > 0 ? fmtPct(grossYield) : '—'} color={grossYield > 8 ? 'text-[var(--sgc-success)]' : grossYield > 5 ? 'text-[var(--sgc-navy)]' : 'text-[var(--sgc-danger)]'} sub="Annual rent / price" />
            <Stat label="Months of Supply"  value={monthsOfSupply > 0 ? `${monthsOfSupply.toFixed(1)} mo` : '—'} color={monthsOfSupply < 3 ? 'text-[var(--sgc-danger)]' : monthsOfSupply > 6 ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-navy)]'} sub={monthsOfSupply < 3 ? 'Low inventory' : monthsOfSupply > 6 ? 'High inventory' : 'Normal'} />
          </div>
        )}

        {/* Trend summary row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-[2px] text-[var(--sgc-gray-mid)] mb-2">Price Trend (6mo)</div>
            <div className="flex items-center gap-2 mb-1">
              <TrendBadge trend={priceTrend} pct={priceTrendPct} />
              <span className="text-xs text-[var(--sgc-gray-mid)]">{priceTrend}</span>
            </div>
            {sale && sale.history.length > 0 && (
              <SparkLine data={sale.history} field="avgPrice" color="#3b82f6" height={40} />
            )}
          </div>
          <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-[2px] text-[var(--sgc-gray-mid)] mb-2">Rent Trend (6mo)</div>
            <div className="flex items-center gap-2 mb-1">
              <TrendBadge trend={rentTrend} pct={rentTrendPct} />
              <span className="text-xs text-[var(--sgc-gray-mid)]">{rentTrend}</span>
            </div>
            {rental && rental.history.length > 0 && (
              <SparkLine data={rental.history} field="avgRent" color="#f59e0b" height={40} />
            )}
          </div>
          <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-[2px] text-[var(--sgc-gray-mid)] mb-2">Days-on-Market Trend</div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
                ${domTrend === 'decreasing' ? 'text-[var(--sgc-danger)] border-red-800 bg-red-950' :
                  domTrend === 'increasing' ? 'text-[var(--sgc-success)] border-emerald-800 bg-emerald-950' :
                  'text-[var(--sgc-gray-mid)] border-[var(--sgc-gray-border)] bg-[var(--sgc-gray-border)]'}`}>
                {domTrend === 'decreasing' ? '↓ Faster' : domTrend === 'increasing' ? '↑ Slower' : '→ Stable'}
              </span>
            </div>
            {sale && sale.history.length > 0 && (
              <SparkLine data={sale.history} field="avgDom" color="#8b5cf6" height={40} showArea={false} />
            )}
          </div>
        </div>

        {/* Detailed chart tabs */}
        {(sale?.history.length || 0) > 2 && (
          <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-gray-mid)]">Historical Trends (18 months)</div>
              <div className="flex gap-1">
                {([
                  { k: 'price' as const,     l: 'Sale Price' },
                  { k: 'rent' as const,      l: 'Rent' },
                  { k: 'dom' as const,       l: 'DOM' },
                  { k: 'inventory' as const, l: 'Inventory' },
                ]).map(({ k, l }) => (
                  <button key={k} onClick={() => setActiveChart(k)}
                    className={`text-[10px] px-2.5 py-1 rounded border cursor-pointer transition-colors
                      ${activeChart === k ? 'bg-[var(--sgc-navy)]/30 border-[var(--sgc-navy)]/60 text-[var(--sgc-navy)]' : 'bg-transparent border-[var(--sgc-gray-border)] text-[var(--sgc-gray-mid)] hover:text-[var(--sgc-gray-mid)]'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {activeChart === 'price' && sale && (
              <BarChart data={sale.history} field="avgPrice" label="Avg Sale Price" color="#3b82f6" fmt={fmt$} />
            )}
            {activeChart === 'rent' && rental && (
              <BarChart data={rental.history} field="avgRent" label="Avg Monthly Rent" color="#f59e0b" fmt={fmt$} />
            )}
            {activeChart === 'dom' && sale && (
              <BarChart data={sale.history} field="avgDom" label="Avg Days on Market" color="#8b5cf6" fmt={v => `${Math.round(v)}d`} />
            )}
            {activeChart === 'inventory' && sale && (
              <BarChart data={sale.history} field="totalListings" label="Total Active Listings" color="#10b981" fmt={v => String(Math.round(v))} />
            )}
          </div>
        )}

        {/* BRRRR / Rental Analysis for this market */}
        {rental && sale && (
          <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-5 mb-5">
            <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-gray-mid)] mb-4">Rental Investment Analysis</div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-[10px] text-[var(--sgc-gray-mid)] mb-1">Monthly Cash Flow Estimate</div>
                <div className="text-sm font-bold text-[var(--sgc-success)]">
                  {rental.avgRent > 0 && sale.avgPrice > 0
                    ? fmt$(rental.avgRent - (sale.avgPrice * 0.008) - (sale.avgPrice * 0.01 / 12))
                    : '—'}
                </div>
                <div className="text-[9px] text-[var(--sgc-gray-mid)]">After est. PITI @ 8% rate</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--sgc-gray-mid)] mb-1">Price-to-Rent Ratio</div>
                <div className={`text-sm font-bold ${
                  sale.avgPrice / (rental.avgRent * 12) < 15 ? 'text-[var(--sgc-success)]' :
                  sale.avgPrice / (rental.avgRent * 12) < 20 ? 'text-[var(--sgc-navy)]' : 'text-[var(--sgc-danger)]'}`}>
                  {rental.avgRent > 0 ? (sale.avgPrice / (rental.avgRent * 12)).toFixed(1) + 'x' : '—'}
                </div>
                <div className="text-[9px] text-[var(--sgc-gray-mid)]">&lt;15 great · 15–20 ok · &gt;20 tough</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--sgc-gray-mid)] mb-1">1% Rule Threshold</div>
                <div className={`text-sm font-bold ${rental.avgRent / sale.avgPrice * 100 >= 1 ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]'}`}>
                  {rental.avgRent > 0
                    ? `${(rental.avgRent / sale.avgPrice * 100).toFixed(2)}% ${rental.avgRent / sale.avgPrice * 100 >= 1 ? '✓' : '✗'}`
                    : '—'}
                </div>
                <div className="text-[9px] text-[var(--sgc-gray-mid)]">Rent ÷ Price ≥ 1% monthly</div>
              </div>
            </div>
          </div>
        )}

        {/* Your deals vs market */}
        {results.length > 0 && sale && (
          <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-5">
            <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-gray-mid)] mb-4">Your Deals vs Market</div>
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  label: 'Your Avg Price vs Market',
                  yours: results.reduce((s,r) => s+r.price, 0) / results.length,
                  market: sale.avgPrice,
                  fmt: fmt$,
                  lowerIsBetter: true,
                },
                {
                  label: 'Your ARV vs Market Price',
                  yours: results.reduce((s,r) => s+r.arv, 0) / results.length,
                  market: sale.avgPrice,
                  fmt: fmt$,
                  lowerIsBetter: false,
                },
                {
                  label: 'Your Avg DOM vs Market',
                  yours: results.reduce((s,r) => s + (r.dom||0), 0) / results.length,
                  market: sale.avgDom,
                  fmt: (v: number) => `${Math.round(v)}d`,
                  lowerIsBetter: true,
                },
              ].map(({ label, yours, market, fmt, lowerIsBetter }) => {
                const pct = ((yours - market) / market) * 100
                const isBetter = lowerIsBetter ? pct < 0 : pct > 0
                return (
                  <div key={label}>
                    <div className="text-[10px] text-[var(--sgc-gray-mid)] mb-1">{label}</div>
                    <div className="text-sm font-bold text-[var(--sgc-black)]">{fmt(yours)}</div>
                    <div className="text-[10px] text-[var(--sgc-gray-mid)]">Market: {fmt(market)}</div>
                    <div className={`text-[10px] font-bold mt-0.5 ${isBetter ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]'}`}>
                      {pct > 0 ? '+' : ''}{pct.toFixed(1)}% vs market {isBetter ? '✓' : '⚠'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
