import { useState } from 'react'
import { analyzeArea, AreaAnalysis } from '../lib/marketAnalyzer'

const fmt$ = (n?: number) => n && n > 0 ? '$' + Math.round(n).toLocaleString() : '—'
const fmtPct = (n?: number) => n != null ? (n > 0 ? '+' : '') + n.toFixed(1) + '%' : '—'

// ── Mini spark bar chart ──────────────────────────────────────────────────────
function BarSpark({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-0.5 h-10">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div className="w-full rounded-sm transition-opacity"
            style={{ height: `${Math.max(4, (d.value / max) * 36)}px`, background: color, opacity: i === data.length - 1 ? 1 : 0.4 }} />
          <div className="absolute bottom-full mb-1 text-[9px] bg-black text-white px-1 py-0.5 rounded hidden group-hover:block whitespace-nowrap z-10">
            {d.label}: {d.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Score gauge ───────────────────────────────────────────────────────────────
function ScoreGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const bg = score >= 70 ? '#EDFAF3' : score >= 50 ? '#FEF7EA' : '#FEF0ED'
  const tc = score >= 70 ? '#1A7A4A' : score >= 50 ? '#8A5700' : '#C0341D'
  const pct = score
  // SVG arc
  const r = 28, cx = 36, cy = 36
  const startAngle = -210, endAngle = startAngle + (pct / 100) * 240
  const toRad = (d: number) => (d * Math.PI) / 180
  const x1 = cx + r * Math.cos(toRad(startAngle))
  const y1 = cy + r * Math.sin(toRad(startAngle))
  const x2 = cx + r * Math.cos(toRad(endAngle))
  const y2 = cy + r * Math.sin(toRad(endAngle))
  const largeArc = pct > 66 ? 1 : 0

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 72 60" className="w-20 h-16">
        {/* Track */}
        <path d={`M ${cx + r * Math.cos(toRad(-210))} ${cy + r * Math.sin(toRad(-210))} A ${r} ${r} 0 1 1 ${cx + r * Math.cos(toRad(30))} ${cy + r * Math.sin(toRad(30))}`}
          fill="none" stroke="var(--sgc-gray-border)" strokeWidth="5" strokeLinecap="round" />
        {/* Fill */}
        {score > 0 && (
          <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" />
        )}
        <text x={cx} y={cy + 5} textAnchor="middle" fill={tc} fontSize="13" fontWeight="700">{score}</text>
      </svg>
      <div className="text-[10px] font-semibold uppercase tracking-wider mt-0 text-center" style={{ color: tc }}>{label}</div>
    </div>
  )
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function Tile({ label, value, sub, trend, color }: { label: string; value: string; sub?: string; trend?: number; color?: string }) {
  return (
    <div className="bg-white rounded-xl border p-3.5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
      <div className="text-xl font-bold leading-none mb-0.5" style={{ color: color || 'var(--sgc-black)' }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{sub}</div>}
      {trend != null && (
        <div className="text-[10px] font-semibold mt-1" style={{ color: trend >= 0 ? '#1A7A4A' : '#C0341D' }}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}% YoY
        </div>
      )}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base">{icon}</span>
      <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>{label}</div>
      <div className="flex-1 h-px" style={{ background: 'var(--sgc-gray-border)' }} />
    </div>
  )
}

// ── Market type badge ─────────────────────────────────────────────────────────
const MARKET_TYPES = {
  emerging:    { label: '🚀 Emerging Market',    color: '#1A7A4A', bg: '#EDFAF3', desc: 'Fast appreciation, growing inventory — great time to buy and flip' },
  established: { label: '✅ Established Market', color: '#185FA5', bg: '#E6F1FB', desc: 'Stable growth, reliable buyer pool, lower risk' },
  peak:        { label: '⚠️ Peak Market',        color: '#8A5700', bg: '#FEF7EA', desc: 'High prices, slower appreciation ahead — be conservative on ARV' },
  declining:   { label: '📉 Declining Market',   color: '#C0341D', bg: '#FEF0ED', desc: 'Values falling — avoid unless deeply discounted acquisition' },
  stable:      { label: '⚖️ Stable Market',      color: '#534AB7', bg: '#EEEDFE', desc: 'Predictable market — good for BRRRR and long-term holds' },
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MarketAnalyzer() {
  const [searchMode, setSearchMode] = useState<'zip' | 'city'>('city')
  const [zip, setZip]               = useState('')
  const [city, setCity]             = useState('')
  const [state, setState]           = useState('VA')
  const [loading, setLoading]       = useState(false)
  const [analysis, setAnalysis]     = useState<AreaAnalysis | null>(null)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [activeSection, setActiveSection] = useState<'overview' | 'financial' | 'construction' | 'demographics' | 'rental'>('overview')

  const handleAnalyze = async () => {
    setLoading(true); setAnalysis(null)
    const msgs = [
      'Pulling Census demographics & income data...',
      'Fetching building permits & new construction...',
      'Loading FRED economic indicators...',
      'Querying RentCast market stats...',
      'Calculating investor scores...',
    ]
    let mi = 0
    const iv = setInterval(() => setLoadingMsg(msgs[mi++ % msgs.length]), 1400)

    try {
      const result = await analyzeArea(
        searchMode === 'zip' ? zip : undefined,
        searchMode === 'city' ? city : undefined,
        state || undefined
      )
      setAnalysis(result)
    } finally {
      clearInterval(iv); setLoading(false); setLoadingMsg('')
    }
  }

  const ic = `w-full rounded-lg border text-sm px-3 py-2 outline-none bg-white transition-colors
    border-[var(--sgc-gray-border)] focus:border-[var(--sgc-navy)] placeholder:text-gray-400`

  const SECTIONS = [
    { id: 'overview',     label: 'Overview',     icon: '⊞' },
    { id: 'financial',    label: 'Financial',    icon: '💰' },
    { id: 'construction', label: 'Construction', icon: '🏗️' },
    { id: 'demographics', label: 'Demographics', icon: '👥' },
    { id: 'rental',       label: 'Rental Market',icon: '🏠' },
  ]

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* ── LEFT: Search panel ─────────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>📊 Market Analyzer</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
            Census · FRED · Permits · RentCast
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Mode toggle */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>
              Search By
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[{ id: 'city', l: '📍 City' }, { id: 'zip', l: '#️⃣ Zip Code' }].map(m => (
                <button key={m.id} onClick={() => setSearchMode(m.id as any)}
                  className="py-2 rounded-lg border text-xs font-medium cursor-pointer transition-all"
                  style={searchMode === m.id
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          {searchMode === 'city' ? (
            <div className="space-y-2">
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>CITY</div>
                <input className={ic} value={city} onChange={e => setCity(e.target.value)}
                  placeholder="Norfolk · Austin · Miami"
                  onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
              </div>
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>STATE</div>
                <input className={ic} value={state} onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="VA" maxLength={2}
                  onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
              </div>
            </div>
          ) : (
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>ZIP CODE</div>
              <input className={ic} value={zip} onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="23501 · 77002 · 33101"
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
            </div>
          )}

          {/* Data sources info */}
          <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--sgc-gray-light)' }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-navy)' }}>
              Data Sources
            </div>
            {[
              { icon: '🏛️', label: 'Census ACS 2023', sub: 'Demographics, income, housing' },
              { icon: '🏗️', label: 'Census BPS',       sub: 'Building permits, construction' },
              { icon: '📈', label: 'FRED / St. Louis Fed', sub: 'HPI, mortgage rates, unemployment' },
              { icon: '🏠', label: 'RentCast',          sub: 'Sale & rental market trends' },
            ].map(s => (
              <div key={s.label} className="flex items-start gap-2">
                <span className="text-sm flex-shrink-0">{s.icon}</span>
                <div>
                  <div className="text-[10px] font-semibold" style={{ color: 'var(--sgc-black)' }}>{s.label}</div>
                  <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{s.sub}</div>
                </div>
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#EDFAF3', color: '#1A7A4A' }}>Free</span>
              </div>
            ))}
          </div>

          {/* Section nav — only when we have results */}
          {analysis && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>
                Sections
              </div>
              <div className="space-y-1">
                {SECTIONS.map(s => (
                  <button key={s.id} onClick={() => setActiveSection(s.id as any)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer border-none transition-all text-left"
                    style={activeSection === s.id
                      ? { background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }
                      : { background: 'transparent', color: 'var(--sgc-gray-mid)' }}>
                    <span>{s.icon}</span> {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Analyze button */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <button onClick={handleAnalyze} disabled={loading || (!zip && !city)}
            className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer transition-all"
            style={{ background: loading ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)' }}>
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin inline-block" />
                  Analyzing...
                </span>
              : '📊 Analyze Market'}
          </button>
          {loading && <div className="text-[11px] text-center mt-2" style={{ color: 'var(--sgc-gray-mid)' }}>{loadingMsg}</div>}
        </div>
      </div>

      {/* ── RIGHT: Results ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Empty state */}
        {!loading && !analysis && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 max-w-2xl mx-auto">
            <svg viewBox="0 0 120 100" className="w-28 h-24 mb-6 opacity-15">
              <rect x="10" y="60" width="18" height="30" rx="2" fill="var(--sgc-navy)" />
              <rect x="35" y="40" width="18" height="50" rx="2" fill="var(--sgc-navy)" />
              <rect x="60" y="20" width="18" height="70" rx="2" fill="var(--sgc-navy)" />
              <rect x="85" y="45" width="18" height="45" rx="2" fill="var(--sgc-navy)" />
              <polyline points="19,55 44,35 69,15 94,40" fill="none" stroke="#C0341D" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Area Market Intelligence</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--sgc-gray-mid)' }}>
              Enter any zip code or city to get a complete market picture — demographics, home values, building permits, new construction, rental market, economic indicators, and a composite investor score.
            </p>
            <div className="grid grid-cols-3 gap-3 text-left w-full">
              {[
                { icon: '💰', t: 'Financial Health', d: 'Median income, home values, appreciation rate, mortgage rate impact' },
                { icon: '🏗️', t: 'New Development', d: 'Building permits trend, new construction starts, supply pipeline' },
                { icon: '👥', t: 'Demographics', d: 'Population, age, education, employment, poverty rate' },
                { icon: '🏠', t: 'Rental Market', d: 'Avg rent, gross yield, price-to-rent ratio, vacancy rate' },
                { icon: '📈', t: 'Appreciation', d: '1-year and 3-year home value index from FRED' },
                { icon: '🎯', t: 'Investor Scores', d: 'Flip score, BRRRR score, overall investor attractiveness — 0 to 100' },
              ].map(s => (
                <div key={s.t} className="rounded-xl border p-3 bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <div className="text-xl mb-1">{s.icon}</div>
                  <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--sgc-navy)' }}>{s.t}</div>
                  <div className="text-xs leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-12 h-12 border-2 rounded-full spin mb-5"
              style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }} />
            <div className="text-base font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>{loadingMsg}</div>
            <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>Querying 4 free data sources simultaneously</div>
          </div>
        )}

        {/* Results */}
        {analysis && !loading && (
          <div className="p-6 max-w-5xl space-y-6">

            {/* ── Location header ── */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold" style={{ color: 'var(--sgc-navy)' }}>{analysis.location}</h2>
                <div className="text-sm mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {analysis.census ? `Pop. ${analysis.census.population.toLocaleString()} · ` : ''}
                  Market analysis · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </div>
                {analysis.errors.length > 0 && (
                  <div className="text-xs mt-1" style={{ color: '#8A5700' }}>
                    ⚠ Partial data: {analysis.errors.join(', ')}
                  </div>
                )}
              </div>
              {/* Market type badge */}
              {(() => {
                const mt = MARKET_TYPES[analysis.marketType]
                return (
                  <div className="flex-shrink-0 rounded-xl border px-4 py-2 text-right"
                    style={{ background: mt.bg, borderColor: mt.color + '40' }}>
                    <div className="text-sm font-bold" style={{ color: mt.color }}>{mt.label}</div>
                    <div className="text-[11px] mt-0.5 max-w-[200px]" style={{ color: mt.color + 'cc' }}>{mt.desc}</div>
                  </div>
                )
              })()}
            </div>

            {/* ── OVERVIEW section ── */}
            {activeSection === 'overview' && (
              <div className="space-y-5">

                {/* Investor score gauges */}
                <div>
                  <SectionLabel icon="🎯" label="Investor Scores" />
                  <div className="bg-white rounded-2xl border p-5 flex items-center justify-around gap-4"
                    style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <ScoreGauge score={analysis.investorScore} label="Overall" color="#1B3A8C" />
                    <div className="w-px h-16" style={{ background: 'var(--sgc-gray-border)' }} />
                    <ScoreGauge score={analysis.flipScore} label="Fix & Flip" color="#C45E1A" />
                    <div className="w-px h-16" style={{ background: 'var(--sgc-gray-border)' }} />
                    <ScoreGauge score={analysis.brrrScore} label="BRRRR" color="#1A7A4A" />
                    <div className="flex-1 ml-4 space-y-1.5">
                      <div className="text-xs font-semibold mb-2" style={{ color: 'var(--sgc-navy)' }}>How scores are calculated:</div>
                      {[
                        { l: 'Income & employment strength', c: '#1B3A8C' },
                        { l: 'Home value appreciation (FRED)', c: '#1B3A8C' },
                        { l: 'Days on market / exit speed', c: '#C45E1A' },
                        { l: 'Vacancy & rental demand', c: '#1A7A4A' },
                        { l: 'New construction activity', c: '#1A7A4A' },
                        { l: 'Gross yield & cash flow potential', c: '#1A7A4A' },
                      ].map(s => (
                        <div key={s.l} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.c }} />
                          {s.l}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <SectionLabel icon="📋" label="Market Summary" />
                  <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--sgc-black)' }}>{analysis.summary}</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold mb-2" style={{ color: '#1A7A4A' }}>✓ Opportunity Signals</div>
                      {analysis.signals.length > 0
                        ? analysis.signals.map((s, i) => (
                            <div key={i} className="text-sm mb-1.5 flex items-start gap-2" style={{ color: 'var(--sgc-black)' }}>
                              <span className="flex-shrink-0">{s.split(' ')[0]}</span>
                              <span>{s.split(' ').slice(1).join(' ')}</span>
                            </div>
                          ))
                        : <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>No strong signals detected</div>
                      }
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-2" style={{ color: '#C0341D' }}>⚠ Risk Factors</div>
                      {analysis.risks.length > 0
                        ? analysis.risks.map((r, i) => (
                            <div key={i} className="text-sm mb-1.5 flex items-start gap-2" style={{ color: 'var(--sgc-black)' }}>
                              <span className="flex-shrink-0">{r.split(' ')[0]}</span>
                              <span>{r.split(' ').slice(1).join(' ')}</span>
                            </div>
                          ))
                        : <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>No major risks flagged</div>
                      }
                    </div>
                  </div>
                </div>

                {/* Key numbers */}
                <div>
                  <SectionLabel icon="📌" label="Key Numbers" />
                  <div className="grid grid-cols-4 gap-3">
                    <Tile label="Median Home Value" value={fmt$(analysis.census?.medianHomeValue)} trend={analysis.economic?.homeValueChange1yr} color="var(--sgc-navy)" />
                    <Tile label="Median Income" value={fmt$(analysis.census?.medianHouseholdIncome)} color="var(--sgc-black)" />
                    <Tile label="Median Rent" value={analysis.census?.medianRent ? `${fmt$(analysis.census.medianRent)}/mo` : '—'} color="#1A7A4A" />
                    <Tile label="Unemployment" value={analysis.census?.unemploymentRate != null ? `${analysis.census.unemploymentRate.toFixed(1)}%` : '—'}
                      color={analysis.census?.unemploymentRate && analysis.census.unemploymentRate < 5 ? '#1A7A4A' : '#C0341D'} />
                    <Tile label="Mortgage Rate (30yr)" value={analysis.economic?.mortgageRate30yr ? `${analysis.economic.mortgageRate30yr.toFixed(2)}%` : '—'}
                      color={analysis.economic?.mortgageRate30yr && analysis.economic.mortgageRate30yr < 7 ? '#1A7A4A' : '#C0341D'} />
                    <Tile label="Vacancy Rate" value={analysis.census?.vacancyRate != null ? `${analysis.census.vacancyRate.toFixed(1)}%` : '—'} color="#8A5700" />
                    <Tile label="Avg Days on Market" value={analysis.rentcast?.saleData?.averageDaysOnMarket ? `${analysis.rentcast.saleData.averageDaysOnMarket}d` : '—'}
                      color="var(--sgc-navy)" />
                    <Tile label="New Permits (YoY)" value={analysis.permits?.yearOverYearChange != null ? fmtPct(analysis.permits.yearOverYearChange) : '—'}
                      color={analysis.permits?.hotMarket ? '#1A7A4A' : 'var(--sgc-black)'} />
                  </div>
                </div>
              </div>
            )}

            {/* ── FINANCIAL section ── */}
            {activeSection === 'financial' && (
              <div className="space-y-5">
                <SectionLabel icon="💰" label="Financial Indicators" />

                <div className="grid grid-cols-3 gap-4">
                  <Tile label="Median Home Value" value={fmt$(analysis.census?.medianHomeValue)} trend={analysis.economic?.homeValueChange1yr} color="var(--sgc-navy)" />
                  <Tile label="1-Year Appreciation" value={fmtPct(analysis.economic?.homeValueChange1yr)}
                    color={analysis.economic?.homeValueChange1yr && analysis.economic.homeValueChange1yr > 0 ? '#1A7A4A' : '#C0341D'}
                    sub="FRED Home Price Index" />
                  <Tile label="3-Year Appreciation" value={fmtPct(analysis.economic?.homeValueChange3yr)}
                    color={analysis.economic?.homeValueChange3yr && analysis.economic.homeValueChange3yr > 0 ? '#1A7A4A' : '#C0341D'}
                    sub="FRED Home Price Index" />
                  <Tile label="Median Household Income" value={fmt$(analysis.census?.medianHouseholdIncome)} sub="Census ACS 2023" />
                  <Tile label="30-Year Mortgage Rate" value={analysis.economic?.mortgageRate30yr ? `${analysis.economic.mortgageRate30yr.toFixed(2)}%` : '—'}
                    color={analysis.economic?.mortgageRate30yr && analysis.economic.mortgageRate30yr < 7 ? '#1A7A4A' : '#C0341D'}
                    sub="Current FRED rate" />
                  <Tile label="Unemployment Rate" value={analysis.economic?.unemploymentLocal ? `${analysis.economic.unemploymentLocal.toFixed(1)}%` : analysis.census?.unemploymentRate != null ? `${analysis.census.unemploymentRate.toFixed(1)}%` : '—'}
                    color={((analysis.economic?.unemploymentLocal || analysis.census?.unemploymentRate) ?? 5) < 5 ? '#1A7A4A' : '#C0341D'}
                    sub="State-level FRED" />
                </div>

                {/* HPI Chart */}
                {analysis.economic?.homeValueIndex && analysis.economic.homeValueIndex.length > 0 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>Home Price Index — 3 Year Trend</div>
                      <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Source: FRED / St. Louis Fed</div>
                    </div>
                    <BarSpark
                      data={analysis.economic.homeValueIndex.slice(-24).map(p => ({
                        label: p.date,
                        value: p.value,
                      }))}
                      color="#1B3A8C"
                    />
                    <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                      <span>3 years ago</span>
                      <span>Today</span>
                    </div>
                  </div>
                )}

                {/* Gross yield analysis */}
                {analysis.census && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--sgc-navy)' }}>
                      Investment Return Analysis
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {(() => {
                        const hv = analysis.census!.medianHomeValue
                        const rent = analysis.census!.medianRent
                        const grossYield = hv > 0 && rent > 0 ? (rent * 12 / hv) * 100 : 0
                        const ptr = hv > 0 && rent > 0 ? hv / (rent * 12) : 0
                        const oneRule = hv > 0 && rent > 0 ? rent / hv * 100 : 0
                        return <>
                          <div className="text-center">
                            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Gross Yield</div>
                            <div className="text-2xl font-bold" style={{ color: grossYield > 8 ? '#1A7A4A' : grossYield > 5 ? '#8A5700' : '#C0341D' }}>
                              {grossYield > 0 ? grossYield.toFixed(1) + '%' : '—'}
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                              {grossYield > 8 ? 'Excellent' : grossYield > 5 ? 'Good' : 'Thin'}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Price-to-Rent Ratio</div>
                            <div className="text-2xl font-bold" style={{ color: ptr < 15 ? '#1A7A4A' : ptr < 20 ? '#8A5700' : '#C0341D' }}>
                              {ptr > 0 ? ptr.toFixed(1) + 'x' : '—'}
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>&lt;15 ideal · &gt;20 tough</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>1% Rule</div>
                            <div className="text-2xl font-bold" style={{ color: oneRule >= 1 ? '#1A7A4A' : '#C0341D' }}>
                              {oneRule > 0 ? oneRule.toFixed(2) + '%' : '—'}
                              {oneRule >= 1 ? ' ✓' : oneRule > 0 ? ' ✗' : ''}
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Rent ÷ Price ≥ 1%</div>
                          </div>
                        </>
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CONSTRUCTION section ── */}
            {activeSection === 'construction' && (
              <div className="space-y-5">
                <SectionLabel icon="🏗️" label="New Construction & Development" />

                {analysis.permits ? (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                      <Tile label="Single-Family Permits" value={analysis.permits.singleFamilyUnits > 0 ? analysis.permits.singleFamilyUnits.toLocaleString() : '—'}
                        sub="Annual rate" color="var(--sgc-navy)" />
                      <Tile label="Multi-Family Permits" value={analysis.permits.multiFamilyUnits > 0 ? analysis.permits.multiFamilyUnits.toLocaleString() : '—'}
                        sub="Annual rate" color="#534AB7" />
                      <Tile label="YoY Change" value={fmtPct(analysis.permits.yearOverYearChange)}
                        color={analysis.permits.yearOverYearChange > 0 ? '#1A7A4A' : '#C0341D'}
                        sub="vs last year" />
                      <Tile label="Market Status" value={analysis.permits.hotMarket ? '🔥 Hot' : '⚖️ Normal'}
                        color={analysis.permits.hotMarket ? '#1A7A4A' : 'var(--sgc-black)'}
                        sub=">15% YoY = hot" />
                    </div>

                    {analysis.permits.monthlyTrend.length > 0 && (
                      <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>Single-Family Permits — Monthly Trend</div>
                          <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Source: FRED / Census BPS</div>
                        </div>
                        <BarSpark data={analysis.permits.monthlyTrend.map(m => ({ label: m.month, value: m.units }))} color="#C45E1A" />
                        <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                          <span>{analysis.permits.monthlyTrend[0]?.month}</span>
                          <span>{analysis.permits.monthlyTrend[analysis.permits.monthlyTrend.length - 1]?.month}</span>
                        </div>
                      </div>
                    )}

                    <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                      <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>
                        What This Means for SGC
                      </div>
                      <div className="space-y-2 text-sm" style={{ color: 'var(--sgc-black)' }}>
                        {analysis.permits.hotMarket && (
                          <div className="flex items-start gap-2">
                            <span>🔥</span>
                            <span>Hot permit market — strong buyer demand, faster flip exits expected</span>
                          </div>
                        )}
                        {analysis.permits.singleFamilyUnits > analysis.permits.multiFamilyUnits && (
                          <div className="flex items-start gap-2">
                            <span>🏡</span>
                            <span>SF-dominant construction — your core flip market is growing</span>
                          </div>
                        )}
                        {analysis.permits.singleFamilyUnits < analysis.permits.multiFamilyUnits && (
                          <div className="flex items-start gap-2">
                            <span>🏢</span>
                            <span>Multi-family heavy — rental demand strong, good for BRRRR strategy</span>
                          </div>
                        )}
                        {analysis.permits.yearOverYearChange > 20 && (
                          <div className="flex items-start gap-2">
                            <span>📈</span>
                            <span>Permits up {analysis.permits.yearOverYearChange.toFixed(0)}% — area is attracting investment, values likely rising</span>
                          </div>
                        )}
                        {analysis.permits.yearOverYearChange < -10 && (
                          <div className="flex items-start gap-2">
                            <span>⚠️</span>
                            <span>Permits declining — softening construction activity may signal cooling market</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="text-3xl mb-2">🏗️</div>
                    <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>Building permit data not available for this location</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                      Visit <a href="https://www.census.gov/construction/bps/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sgc-navy)' }}>census.gov/construction/bps</a> for county-level data
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── DEMOGRAPHICS section ── */}
            {activeSection === 'demographics' && (
              <div className="space-y-5">
                <SectionLabel icon="👥" label="Demographics & Community" />
                {analysis.census ? (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                      <Tile label="Total Population" value={analysis.census.population.toLocaleString()} sub="Census ACS 2023" />
                      <Tile label="Median Age" value={`${analysis.census.medianAge.toFixed(0)} yrs`} />
                      <Tile label="Avg Household Size" value={analysis.census.avgHouseholdSize.toFixed(1)} sub="persons/household" />
                      <Tile label="College Degree Rate" value={`${analysis.census.collegeDegreeRate.toFixed(1)}%`}
                        color={analysis.census.collegeDegreeRate > 30 ? '#1A7A4A' : 'var(--sgc-black)'}
                        sub="Bachelor's or higher" />
                      <Tile label="Owner Occupancy" value={`${analysis.census.ownerOccupancyRate.toFixed(1)}%`}
                        color={analysis.census.ownerOccupancyRate > 60 ? '#1A7A4A' : '#534AB7'} />
                      <Tile label="Vacancy Rate" value={`${analysis.census.vacancyRate.toFixed(1)}%`}
                        color={analysis.census.vacancyRate > 10 ? '#C45E1A' : '#1A7A4A'} sub="Housing units" />
                      <Tile label="Poverty Rate" value={`${analysis.census.povertyRate.toFixed(1)}%`}
                        color={analysis.census.povertyRate > 15 ? '#C0341D' : analysis.census.povertyRate < 8 ? '#1A7A4A' : 'var(--sgc-black)'} />
                      <Tile label="Unemployment" value={`${analysis.census.unemploymentRate.toFixed(1)}%`}
                        color={analysis.census.unemploymentRate < 4 ? '#1A7A4A' : analysis.census.unemploymentRate > 7 ? '#C0341D' : 'var(--sgc-black)'} />
                    </div>

                    <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                      <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--sgc-navy)' }}>
                        Investor Interpretation
                      </div>
                      <div className="space-y-2 text-sm" style={{ color: 'var(--sgc-black)' }}>
                        {analysis.census.ownerOccupancyRate < 55 && <div className="flex items-start gap-2"><span>🏠</span><span>Low owner-occupancy ({analysis.census.ownerOccupancyRate.toFixed(0)}%) — strong rental demand, BRRRR-friendly market</span></div>}
                        {analysis.census.ownerOccupancyRate > 70 && <div className="flex items-start gap-2"><span>🏡</span><span>High owner-occupancy ({analysis.census.ownerOccupancyRate.toFixed(0)}%) — flip-friendly, strong buyer pool</span></div>}
                        {analysis.census.collegeDegreeRate > 35 && <div className="flex items-start gap-2"><span>🎓</span><span>High education rate — higher-income tenants/buyers, supports premium ARV</span></div>}
                        {analysis.census.medianAge < 35 && <div className="flex items-start gap-2"><span>👶</span><span>Young population — growing household formation, strong rental and starter-home demand</span></div>}
                        {analysis.census.vacancyRate > 10 && <div className="flex items-start gap-2"><span>🏚️</span><span>High vacancy ({analysis.census.vacancyRate.toFixed(1)}%) — acquisition opportunities, watch for market softness</span></div>}
                        {analysis.census.povertyRate > 18 && <div className="flex items-start gap-2"><span>⚠️</span><span>High poverty rate — may limit exit buyer pool, size ARV carefully</span></div>}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>Census data not available for this search. Try a zip code for best results.</div>
                  </div>
                )}
              </div>
            )}

            {/* ── RENTAL section ── */}
            {activeSection === 'rental' && (
              <div className="space-y-5">
                <SectionLabel icon="🏠" label="Rental Market" />
                <div className="grid grid-cols-4 gap-3">
                  <Tile label="Median Rent" value={analysis.census?.medianRent ? `${fmt$(analysis.census.medianRent)}/mo` : '—'}
                    sub="Census ACS 2023" color="#1A7A4A" />
                  <Tile label="RentCast Avg Rent"
                    value={analysis.rentcast?.rentalData?.averageRent ? `${fmt$(analysis.rentcast.rentalData.averageRent)}/mo` : '—'}
                    sub="Live RentCast data" color="#1A7A4A" />
                  <Tile label="Avg DOM (Rental)" value={analysis.rentcast?.rentalData?.averageDaysOnMarket ? `${analysis.rentcast.rentalData.averageDaysOnMarket}d` : '—'}
                    sub="Days to rent" />
                  <Tile label="Total Rental Listings" value={analysis.rentcast?.rentalData?.totalListings?.toLocaleString() || '—'} />
                </div>

                {/* RentCast rental history bars */}
                {analysis.rentcast?.rentalData?.history && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>Rental Trend — 18 Months</div>
                      <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Source: RentCast</div>
                    </div>
                    {(() => {
                      const hist = Object.entries(analysis.rentcast.rentalData.history)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .slice(-18)
                      if (!hist.length) return <div className="text-sm text-center py-4" style={{ color: 'var(--sgc-gray-mid)' }}>No history available</div>
                      return (
                        <>
                          <BarSpark data={hist.map(([date, val]: any) => ({
                            label: new Date(date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                            value: val.averageRent || 0,
                          }))} color="#1A7A4A" />
                          <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                            <span>{new Date(hist[0][0]).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                            <span>Today</span>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
