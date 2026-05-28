import { useState } from 'react'
import { analyzeArea, AreaAnalysis, getApiKeys, saveApiKey } from '../lib/marketAnalyzer'

const fmt$ = (n?: number) => n && n > 0 ? '$' + Math.round(n).toLocaleString() : '—'
const pct   = (n?: number) => n != null && n >= 0 ? n.toFixed(1) + '%' : '—'

function ScoreArc({ score, label }: { score: number; label: string }) {
  const c  = score >= 70 ? '#1A7A4A' : score >= 50 ? '#C45E1A' : '#C0341D'
  const bg = score >= 70 ? '#EDFAF3' : score >= 50 ? '#FEF3EA' : '#FEF0ED'
  const r  = 26, cx = 32, cy = 32
  const toR = (d: number) => d * Math.PI / 180
  const start = -205, sweep = 230
  const end = start + (Math.min(100, Math.max(0, score)) / 100) * sweep
  const large = score > 50 ? 1 : 0
  const ax = (a: number) => cx + r * Math.cos(toR(a))
  const ay = (a: number) => cy + r * Math.sin(toR(a))
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 64 52" className="w-16 h-14">
        <path d={`M ${ax(start)} ${ay(start)} A ${r} ${r} 0 1 1 ${ax(start+sweep)} ${ay(start+sweep)}`}
          fill="none" stroke="var(--sgc-gray-border)" strokeWidth="5" strokeLinecap="round"/>
        {score > 0 && <path d={`M ${ax(start)} ${ay(start)} A ${r} ${r} 0 ${large} 1 ${ax(end)} ${ay(end)}`}
          fill="none" stroke={c} strokeWidth="5" strokeLinecap="round"/>}
        <text x={cx} y={cy+5} textAnchor="middle" fontSize="14" fontWeight="800" fill={c}>{score}</text>
      </svg>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: c }}>{label}</div>
    </div>
  )
}

function Tile({ label, value, sub, color, accent }: {
  label: string; value: string; sub?: string; color?: string; accent?: string
}) {
  return (
    <div className="bg-white rounded-xl border p-3 overflow-hidden relative" style={{ borderColor: accent ? accent+'30' : 'var(--sgc-gray-border)' }}>
      {accent && <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: accent }}/>}
      <div className="text-[10px] uppercase tracking-wider font-medium mb-1 mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
      <div className="text-xl font-bold leading-none" style={{ color: color || 'var(--sgc-black)' }}>{value}</div>
      {sub && <div className="text-[10px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>{sub}</div>}
    </div>
  )
}

function Sec({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--sgc-navy)' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--sgc-gray-border)' }}/>
    </div>
  )
}

function CrimeBar({ value, label, national }: { value: number; label: string; national: number }) {
  const ratio = Math.min(2, value / national)
  const color = ratio < 0.7 ? '#1A7A4A' : ratio < 1.2 ? '#8A5700' : '#C0341D'
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="text-xs w-28 flex-shrink-0" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
      <div className="flex-1 h-2 rounded-full relative overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 50)}%`, background: color }}/>
        <div className="absolute top-0 bottom-0 w-0.5 opacity-40" style={{ left: '50%', background: '#1B3A8C' }}/>
      </div>
      <div className="text-xs font-bold w-16 text-right" style={{ color }}>{value.toFixed(1)}</div>
    </div>
  )
}

const MARKET_BADGE: Record<string, { text: string; c: string; bg: string; desc: string }> = {
  emerging:    { text: '🚀 Emerging Market',    c: '#1A7A4A', bg: '#EDFAF3', desc: 'Strong growth — buy before prices peak'    },
  established: { text: '✅ Established Market', c: '#185FA5', bg: '#E6F1FB', desc: 'Stable, reliable exit market'              },
  peak:        { text: '⚠️ Peak Market',        c: '#8A5700', bg: '#FEF7EA', desc: 'Be conservative on ARV'                    },
  stable:      { text: '⚖️ Stable Market',      c: '#534AB7', bg: '#EEEDFE', desc: 'Predictable — good for BRRRR'              },
  declining:   { text: '📉 Declining Market',   c: '#C0341D', bg: '#FEF0ED', desc: 'Only deep discounts make sense'            },
}

const TABS = [
  { id: 'overview',     label: 'Overview',       icon: '⊞' },
  { id: 'financial',    label: 'Financial',      icon: '💰' },
  { id: 'crime',        label: 'Crime & Schools', icon: '🛡️' },
  { id: 'demographics', label: 'Demographics',   icon: '👥' },
  { id: 'development',  label: 'Development',    icon: '🏗️' },
  { id: 'rental',       label: 'Rental Market',  icon: '🏠' },
  { id: 'strategy',     label: 'SGC Strategy',   icon: '🎯' },
]

const ic = `w-full rounded-lg border text-sm px-3 py-2 outline-none bg-white
  border-[var(--sgc-gray-border)] focus:border-[var(--sgc-navy)] placeholder:text-gray-400`

export default function MarketAnalyzer() {
  const [city,     setCity]     = useState('')
  const [state,    setState]    = useState('')
  const [zip,      setZip]      = useState('')
  const [mode,     setMode]     = useState<'city'|'zip'>('city')
  const [tab,      setTab]      = useState('overview')
  const [loading,  setLoading]  = useState(false)
  const [loadMsg,  setLoadMsg]  = useState('')
  const [analysis, setAnalysis] = useState<AreaAnalysis | null>(null)
  const [showKeys, setShowKeys] = useState(false)
  const [draftKey, setDraftKey] = useState('')

  const keys = getApiKeys()

  const handleAnalyze = async () => {
    const isZip = /^\d{5}$/.test(city.trim()) || /^\d{5}$/.test(zip.trim())
    const aZip   = isZip ? (city.trim() || zip.trim()) : undefined
    const aCity  = !isZip ? city.trim() : undefined
    const aState = !isZip ? state.trim() : undefined
    const loc = aZip || [aCity, aState].filter(Boolean).join(', ')
    if (!loc) return
    if (!keys.anthropic) { setShowKeys(true); return }

    setLoading(true); setAnalysis(null)
    const msgs = [
      `Analyzing ${loc}...`,
      'Pulling demographic data...',
      'Checking crime statistics...',
      'Analyzing real estate market...',
      'Computing investor scores...',
      'Loading RentCast live data...',
    ]
    let mi = 0
    const iv = setInterval(() => setLoadMsg(msgs[mi++ % msgs.length]), 1400)
    try {
      const r = await analyzeArea(aZip, aCity, aState)
      setAnalysis(r); setTab('overview')
    } finally { clearInterval(iv); setLoading(false); setLoadMsg('') }
  }

  const ai  = analysis?.ai
  const rc  = analysis?.rentcast
  const mb  = ai ? (MARKET_BADGE[ai.marketType] || MARKET_BADGE.stable) : null
  const gy  = ai?.medianRent && ai?.medianHomeValue
    && ai.medianRent > 100 && ai.medianHomeValue > 10000
    ? (ai.medianRent * 12 / ai.medianHomeValue) * 100 : null

  // Use RentCast data when available, fall back to AI estimates
  const homeValue = rc?.saleData?.averagePrice || ai?.medianHomeValue
  const avgDOM    = rc?.saleData?.averageDaysOnMarket || ai?.avgDaysOnMarket
  const avgRent   = rc?.rentalData?.averageRent || ai?.medianRent

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* LEFT CONFIG */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>🔬 Area Intelligence</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>AI Market Analysis + RentCast Live</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

          {/* API Key status */}
          <div className="rounded-xl border p-3" style={{
            borderColor: keys.anthropic ? '#1A7A4A40' : '#C0341D40',
            background:  keys.anthropic ? '#EDFAF3'   : '#FEF0ED',
          }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: keys.anthropic ? '#1A7A4A' : '#C0341D' }}/>
                <span className="text-xs font-semibold" style={{ color: keys.anthropic ? '#1A7A4A' : '#C0341D' }}>
                  {keys.anthropic ? 'Claude AI Ready' : 'API Key Required'}
                </span>
              </div>
              <button onClick={() => setShowKeys(s => !s)}
                className="text-[10px] font-semibold cursor-pointer bg-transparent border-none"
                style={{ color: keys.anthropic ? '#1A7A4A' : '#C0341D' }}>
                {keys.anthropic ? 'Change' : 'Add Key'}
              </button>
            </div>
            {!keys.anthropic && (
              <div className="text-[10px] mt-1" style={{ color: '#C0341D' }}>
                Get free key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>console.anthropic.com</a>
              </div>
            )}
          </div>

          {/* Key input */}
          {showKeys && (
            <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[10px] font-semibold" style={{ color: 'var(--sgc-gray-mid)' }}>ANTHROPIC API KEY</div>
              <input className={ic + ' text-xs py-1.5'} type="password" value={draftKey}
                onChange={e => setDraftKey(e.target.value)} placeholder="sk-ant-..." />
              <div className="flex gap-2">
                <button onClick={() => { saveApiKey('anthropic', draftKey); setShowKeys(false) }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white border-none cursor-pointer"
                  style={{ background: 'var(--sgc-navy)' }}>Save Key</button>
                <button onClick={() => setShowKeys(false)}
                  className="px-3 py-1.5 rounded-lg text-xs border-none cursor-pointer"
                  style={{ background: 'var(--sgc-gray-border)' }}>Cancel</button>
              </div>
              <div className="text-[10px] p-2 rounded-lg" style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
                Stored in your browser only. Used to call Claude AI directly for market data.
              </div>
            </div>
          )}

          {/* Search mode */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>Search</div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {[{ id: 'city', l: '📍 City' }, { id: 'zip', l: '#️⃣ Zip Code' }].map(m => (
                <button key={m.id} onClick={() => setMode(m.id as any)}
                  className="py-2 rounded-lg border text-xs font-medium cursor-pointer"
                  style={mode === m.id
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {m.l}
                </button>
              ))}
            </div>
            {mode === 'city' ? (
              <div className="space-y-2">
                <input className={ic} value={city} onChange={e => setCity(e.target.value)}
                  placeholder="Wake Forest · Norfolk · Austin"
                  onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
                <input className={ic} value={state} onChange={e => setState(e.target.value.toUpperCase().slice(0,2))}
                  placeholder="NC · VA · TX" maxLength={2}
                  onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
              </div>
            ) : (
              <input className={ic} value={zip} onChange={e => setZip(e.target.value.replace(/\D/g,'').slice(0,5))}
                placeholder="27587 · 23501 · 78701"
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
            )}
          </div>

          {/* Section nav */}
          {analysis?.ai && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>Sections</div>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border-none text-left mb-0.5"
                  style={tab === t.id
                    ? { background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)', fontWeight: 600 }
                    : { background: 'transparent', color: 'var(--sgc-gray-mid)' }}>
                  <span>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
          )}

          {/* How it works */}
          <div className="rounded-xl p-3" style={{ background: 'var(--sgc-gray-light)' }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>How It Works</div>
            <div className="space-y-1.5">
              {[
                { icon: '🤖', t: 'Claude AI',     d: 'Demographics, crime, schools, economy — temperature 0 for consistency' },
                { icon: '🏠', t: 'RentCast Live', d: 'Live sale prices, days on market, rental data' },
                { icon: '💾', t: 'Cached 24hrs',  d: 'Same location = identical result' },
              ].map(s => (
                <div key={s.t} className="flex items-start gap-2">
                  <span className="text-sm flex-shrink-0">{s.icon}</span>
                  <div>
                    <div className="text-[10px] font-semibold" style={{ color: 'var(--sgc-black)' }}>{s.t}</div>
                    <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <button onClick={handleAnalyze} disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: loading ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)' }}>
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin inline-block"/>
                  Analyzing...
                </span>
              : '🔬 Analyze Market'}
          </button>
          {loading && <div className="text-[11px] text-center mt-2" style={{ color: 'var(--sgc-gray-mid)' }}>{loadMsg}</div>}
        </div>
      </div>

      {/* RIGHT RESULTS */}
      <div className="flex-1 overflow-y-auto">

        {/* Idle */}
        {!loading && !analysis && (
          <div className="h-full flex flex-col items-center justify-center text-center px-8 max-w-2xl mx-auto">
            <svg viewBox="0 0 120 90" className="w-28 h-20 mb-5 opacity-15">
              <rect x="8" y="55" width="16" height="28" rx="2" fill="var(--sgc-navy)"/>
              <rect x="30" y="38" width="16" height="45" rx="2" fill="var(--sgc-navy)"/>
              <rect x="52" y="18" width="16" height="65" rx="2" fill="var(--sgc-navy)"/>
              <rect x="74" y="42" width="16" height="41" rx="2" fill="var(--sgc-navy)"/>
              <rect x="96" y="28" width="16" height="55" rx="2" fill="var(--sgc-navy)"/>
              <polyline points="16,50 38,32 60,13 82,36 104,24" fill="none" stroke="#C0341D" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Area Intelligence</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--sgc-gray-mid)' }}>
              Full market picture for any US city or zip — demographics, crime, schools, new development, economic indicators, and investor scores.
            </p>
            {!keys.anthropic && (
              <button onClick={() => setShowKeys(true)}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer mb-4"
                style={{ background: 'var(--sgc-navy)' }}>
                Add Anthropic API Key to Start →
              </button>
            )}
            <div className="grid grid-cols-3 gap-3 text-left w-full">
              {[
                { i:'💰', t:'Home Values',     d:'Median price, 1yr & 3yr appreciation, days on market, inventory' },
                { i:'🛡️', t:'Crime & Safety',  d:'FBI UCR rates per 100k vs national avg, trend, letter grade' },
                { i:'👥', t:'Demographics',    d:'Population, income, age, education, vacancy, owner occupancy' },
                { i:'🏗️', t:'New Development', d:'Building permits trend, major projects, infrastructure' },
                { i:'🏠', t:'Rental Market',   d:'Live RentCast data — avg rent, DOM, rental listings' },
                { i:'🎯', t:'SGC Strategy',    d:'Specific flip and BRRRR strategy for this exact market' },
              ].map(s => (
                <div key={s.t} className="rounded-xl border p-3 bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <div className="text-xl mb-1">{s.i}</div>
                  <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--sgc-navy)' }}>{s.t}</div>
                  <div className="text-xs leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-2 rounded-full spin mb-5"
              style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }}/>
            <div className="text-base font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>{loadMsg}</div>
            <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>Claude AI + RentCast running in parallel</div>
          </div>
        )}

        {/* Results */}
        {analysis && !loading && ai && (
          <div className="p-6 space-y-5 max-w-5xl">

            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold capitalize" style={{ color: 'var(--sgc-navy)' }}>{analysis.location}</h2>
                <div className="text-xs mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {new Date(analysis.analyzedAt).toLocaleString()}
                  {analysis.cacheHit && ' · cached'}
                  {rc && ' · RentCast live data included'}
                </div>
                {analysis.errors.length > 0 && (
                  <div className="text-xs mt-1" style={{ color: '#8A5700' }}>⚠ {analysis.errors.join(' · ')}</div>
                )}
              </div>
              {mb && (
                <div className="flex-shrink-0 rounded-xl border px-4 py-2"
                  style={{ background: mb.bg, borderColor: mb.c + '40' }}>
                  <div className="text-sm font-bold" style={{ color: mb.c }}>{mb.text}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: mb.c + 'bb' }}>{mb.desc}</div>
                </div>
              )}
            </div>

            {/* Data note */}
            <div className="text-[10px] px-3 py-2 rounded-lg" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
              {ai.dataNote}
            </div>

            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
              <div className="space-y-5">
                {/* Scores */}
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <Sec icon="🎯" label="Investor Scores" />
                  <div className="flex items-center gap-6">
                    <ScoreArc score={ai.investorScore} label="Overall"   />
                    <div className="w-px h-14" style={{ background: 'var(--sgc-gray-border)' }}/>
                    <ScoreArc score={ai.flipScore}     label="Fix & Flip"/>
                    <div className="w-px h-14" style={{ background: 'var(--sgc-gray-border)' }}/>
                    <ScoreArc score={ai.brrrScore}     label="BRRRR"     />
                    <div className="flex-1 ml-4 text-xs space-y-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                      <div>{ai.summary}</div>
                    </div>
                  </div>
                </div>

                {/* Key stats */}
                <div className="grid grid-cols-4 gap-3">
                  <Tile label="Median Home Value"   value={fmt$(homeValue)}  sub={rc?.saleData ? 'RentCast live' : 'AI estimate'} color="var(--sgc-navy)" accent="#1B3A8C"/>
                  <Tile label="Median Income"        value={fmt$(ai.medianHouseholdIncome)} sub="AI estimate"/>
                  <Tile label="Avg Days on Market"   value={avgDOM ? `${avgDOM}d` : '—'} sub={rc?.saleData ? 'RentCast live' : 'AI estimate'}
                    color={avgDOM && avgDOM < 25 ? '#C0341D' : avgDOM && avgDOM > 60 ? '#1A7A4A' : 'var(--sgc-black)'}/>
                  <Tile label="Unemployment"         value={pct(ai.unemploymentRate)} color={ai.unemploymentRate < 4 ? '#1A7A4A' : ai.unemploymentRate > 7 ? '#C0341D' : 'var(--sgc-black)'}/>
                  <Tile label="Violent Crime/100k"   value={ai.violentCrimeRate.toFixed(1)}
                    sub={`Grade ${ai.crimeGrade} · ${ai.crimeVsNational}`}
                    color={ai.crimeGrade <= 'B' ? '#1A7A4A' : ai.crimeGrade === 'C' ? '#8A5700' : '#C0341D'}/>
                  <Tile label="School Rating"        value={`${ai.schoolRating}/10`} color={ai.schoolRating > 7 ? '#1A7A4A' : ai.schoolRating < 5 ? '#C0341D' : '#8A5700'}/>
                  <Tile label="Gross Yield" value={gy ? `${gy.toFixed(1)}%` : '—'} color={gy ? (gy > 8 ? '#1A7A4A' : gy > 5 ? '#8A5700' : '#C0341D') : 'var(--sgc-gray-mid)'}/>
                  <Tile label="Population Growth"    value={`${ai.populationGrowthRate > 0 ? '+' : ''}${ai.populationGrowthRate.toFixed(1)}%/yr`}
                    color={ai.populationGrowthRate > 1 ? '#1A7A4A' : ai.populationGrowthRate < 0 ? '#C0341D' : 'var(--sgc-black)'}/>
                </div>

                {/* Signals & Risks */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border p-4" style={{ borderLeft: '3px solid #1A7A4A', borderColor: '#1A7A4A30' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#1A7A4A' }}>✓ Opportunity Signals</div>
                    {ai.signals.map((s, i) => (
                      <div key={i} className="text-sm mb-1.5 flex items-start gap-2" style={{ color: 'var(--sgc-black)' }}>
                        <span className="flex-shrink-0">{s.split(' ')[0]}</span>
                        <span>{s.split(' ').slice(1).join(' ')}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-2xl border p-4" style={{ borderLeft: '3px solid #C0341D', borderColor: '#C0341D30' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#C0341D' }}>⚠ Risk Factors</div>
                    {ai.risks.length > 0
                      ? ai.risks.map((r, i) => (
                          <div key={i} className="text-sm mb-1.5 flex items-start gap-2" style={{ color: 'var(--sgc-black)' }}>
                            <span className="flex-shrink-0">{r.split(' ')[0]}</span>
                            <span>{r.split(' ').slice(1).join(' ')}</span>
                          </div>
                        ))
                      : <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>No major risks identified</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ── FINANCIAL ── */}
            {tab === 'financial' && (
              <div className="space-y-5">
                <Sec icon="💰" label="Financial Indicators" />
                <div className="grid grid-cols-3 gap-3">
                  <Tile label="Median Home Value"    value={fmt$(homeValue)}              sub={rc?.saleData ? 'RentCast live avg' : 'AI estimate'} color="var(--sgc-navy)"/>
                  <Tile label="Median Sale Price"    value={fmt$(rc?.saleData?.medianPrice || ai.medianHomeValue)} sub={rc?.saleData ? 'RentCast live' : 'AI estimate'}/>
                  <Tile label="Price per Sq Ft"      value={rc?.saleData?.pricePerSqFt ? `$${rc.saleData.pricePerSqFt.toFixed(0)}` : '—'} sub="RentCast live"/>
                  <Tile label="1-Year Appreciation"  value={`${ai.homeValueChange1yr > 0 ? '+' : ''}${ai.homeValueChange1yr.toFixed(1)}%`} color={ai.homeValueChange1yr > 0 ? '#1A7A4A' : '#C0341D'}/>
                  <Tile label="3-Year Appreciation"  value={`${ai.homeValueChange3yr > 0 ? '+' : ''}${ai.homeValueChange3yr.toFixed(1)}%`} color={ai.homeValueChange3yr > 0 ? '#1A7A4A' : '#C0341D'}/>
                  <Tile label="Avg Days on Market"   value={avgDOM ? `${avgDOM}d` : '—'} sub={rc?.saleData ? 'RentCast live' : 'AI estimate'}
                    color={avgDOM && avgDOM < 25 ? '#C0341D' : avgDOM && avgDOM > 60 ? '#1A7A4A' : 'var(--sgc-black)'}/>
                  <Tile label="Inventory"            value={`${ai.inventoryMonths.toFixed(1)} mo`} color={ai.inventoryMonths < 3 ? '#C0341D' : ai.inventoryMonths > 6 ? '#1A7A4A' : 'var(--sgc-black)'}/>
                  <Tile label="List-to-Sale Ratio"   value={`${ai.listToSaleRatio.toFixed(1)}%`} color={ai.listToSaleRatio > 100 ? '#C0341D' : ai.listToSaleRatio > 98 ? '#8A5700' : '#1A7A4A'}/>
                  <Tile label="Median Income"        value={fmt$(ai.medianHouseholdIncome)} color="var(--sgc-black)"/>
                </div>
                {/* Investment return */}
                {ai.medianRent > 0 && ai.medianHomeValue > 0 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="📊" label="Investment Returns" />
                    <div className="grid grid-cols-3 gap-5">
                      {(() => {
                        const hv = homeValue || ai.medianHomeValue
                        const r  = avgRent   || ai.medianRent
                        const gy2 = r && hv && r > 100 && hv > 10000 ? (r * 12 / hv) * 100 : null
                        const ptr = r && hv && r > 100 && hv > 10000 ? hv / (r * 12) : null
                        const one = r && hv && r > 100 && hv > 10000 ? r / hv * 100 : null
                        return <>
                          <div className="text-center">
                            <div className="text-3xl font-bold mb-1" style={{ color: gy2 ? (gy2 > 8 ? '#1A7A4A' : gy2 > 5 ? '#8A5700' : '#C0341D') : 'var(--sgc-gray-mid)' }}>{gy2 ? `${gy2.toFixed(1)}%` : '—'}</div>
                            <div className="text-sm font-semibold" style={{ color: 'var(--sgc-navy)' }}>Gross Yield</div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{gy2 ? (gy2 > 8 ? '🟢 Excellent' : gy2 > 5 ? '🟡 Acceptable' : '🔴 Thin') : 'Rent data unavailable'}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold mb-1" style={{ color: ptr ? (ptr < 15 ? '#1A7A4A' : '#C0341D') : 'var(--sgc-gray-mid)' }}>{ptr ? `${ptr.toFixed(1)}×` : '—'}</div>
                            <div className="text-sm font-semibold" style={{ color: 'var(--sgc-navy)' }}>Price-to-Rent</div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>&lt;15 ideal</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold mb-1" style={{ color: one != null ? (one >= 1 ? '#1A7A4A' : '#C0341D') : 'var(--sgc-gray-mid)' }}>{one != null ? `${one.toFixed(2)}% ${one >= 1 ? '✓' : '✗'}` : '—'}</div>
                            <div className="text-sm font-semibold" style={{ color: 'var(--sgc-navy)' }}>1% Rule</div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Rent ÷ price ≥ 1%</div>
                          </div>
                        </>
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CRIME & SCHOOLS ── */}
            {tab === 'crime' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="🛡️" label="Crime Analysis" />
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-4xl font-black mb-1" style={{
                          color: ai.crimeGrade <= 'B' ? '#1A7A4A' : ai.crimeGrade === 'C' ? '#8A5700' : '#C0341D'
                        }}>{ai.crimeGrade}</div>
                        <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Crime Grade</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: 'var(--sgc-black)' }}>{ai.crimeVsNational}</div>
                        <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>vs National Average</div>
                        <div className="text-xs mt-1 font-semibold" style={{
                          color: ai.crimeTrend === 'improving' ? '#1A7A4A' : ai.crimeTrend === 'worsening' ? '#C0341D' : '#8A5700'
                        }}>
                          {ai.crimeTrend === 'improving' ? '📉 Improving' : ai.crimeTrend === 'worsening' ? '📈 Worsening' : '→ Stable'}
                        </div>
                      </div>
                    </div>
                    {/* National: violent=380.7, property=1954.4 per 100k (FBI 2022) */}
                    <CrimeBar value={ai.violentCrimeRate}  label="Violent Crime"  national={380.7}  />
                    <CrimeBar value={ai.propertyCrimeRate} label="Property Crime" national={1954.4} />
                    <div className="text-[10px] mt-3 p-2 rounded-lg" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                      Blue center line = national average. Rates per 100,000 population (FBI UCR data).
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="🎓" label="Schools" />
                    <div className="text-center p-4 rounded-xl mb-4" style={{
                      background: ai.schoolRating > 7 ? '#EDFAF3' : ai.schoolRating > 5 ? '#FEF7EA' : '#FEF0ED'
                    }}>
                      <div className="text-4xl font-black mb-1" style={{
                        color: ai.schoolRating > 7 ? '#1A7A4A' : ai.schoolRating > 5 ? '#8A5700' : '#C0341D'
                      }}>{ai.schoolRating}/10</div>
                      <div className="text-sm font-semibold capitalize" style={{ color: 'var(--sgc-black)' }}>{ai.schoolDistrictQuality} District</div>
                    </div>
                    {ai.topSchools.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>Top Schools</div>
                        {ai.topSchools.map((s, i) => (
                          <div key={i} className="text-sm mb-1 flex items-center gap-2" style={{ color: 'var(--sgc-black)' }}>
                            <span className="text-[10px] font-bold" style={{ color: '#1A7A4A' }}>#{i+1}</span> {s}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 p-2 rounded-lg text-xs" style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
                      💡 Good schools = faster sales, higher ARV, stronger buyer pool
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── DEMOGRAPHICS ── */}
            {tab === 'demographics' && (
              <div className="space-y-5">
                <Sec icon="👥" label="Demographics" />
                <div className="grid grid-cols-4 gap-3">
                  <Tile label="Population"         value={ai.population.toLocaleString()}/>
                  <Tile label="Pop. Growth/yr"     value={`${ai.populationGrowthRate > 0 ? '+' : ''}${ai.populationGrowthRate.toFixed(1)}%`} color={ai.populationGrowthRate > 1 ? '#1A7A4A' : ai.populationGrowthRate < 0 ? '#C0341D' : 'var(--sgc-black)'}/>
                  <Tile label="Median Age"         value={`${ai.medianAge} yrs`}/>
                  <Tile label="College Degree"     value={pct(ai.collegeDegreeRate)} color={ai.collegeDegreeRate > 35 ? '#1A7A4A' : 'var(--sgc-black)'}/>
                  <Tile label="Owner Occupancy"    value={pct(ai.ownerOccupancyRate)} color={ai.ownerOccupancyRate > 65 ? '#1A7A4A' : '#534AB7'}/>
                  <Tile label="Vacancy Rate"       value={pct(ai.vacancyRate)} color={ai.vacancyRate > 8 ? '#C45E1A' : '#1A7A4A'}/>
                  <Tile label="Poverty Rate"       value={pct(ai.povertyRate)} color={ai.povertyRate > 20 ? '#C0341D' : '#1A7A4A'}/>
                  <Tile label="Unemployment"       value={pct(ai.unemploymentRate)} color={ai.unemploymentRate < 4 ? '#1A7A4A' : ai.unemploymentRate > 7 ? '#C0341D' : 'var(--sgc-black)'}/>
                </div>
                <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <Sec icon="💡" label="What This Means for SGC" />
                  <div className="space-y-2 text-sm" style={{ color: 'var(--sgc-black)' }}>
                    {ai.ownerOccupancyRate < 55 && <div>🏠 Low owner-occupancy ({pct(ai.ownerOccupancyRate)}) — strong rental demand, excellent for BRRRR</div>}
                    {ai.ownerOccupancyRate > 72 && <div>🏡 High owner-occupancy ({pct(ai.ownerOccupancyRate)}) — strong buyer pool, flip-friendly market</div>}
                    {ai.populationGrowthRate > 2 && <div>📈 Fast growth ({ai.populationGrowthRate.toFixed(1)}%/yr) — housing demand outpacing supply</div>}
                    {ai.collegeDegreeRate > 40 && <div>🎓 Educated market — supports higher ARV and premium finishes</div>}
                    {ai.medianAge < 35 && <div>👶 Young population — high rental demand and first-time buyer market</div>}
                    {ai.povertyRate > 20 && <div>⚠️ High poverty rate — constrain ARV ceiling, screen tenants carefully</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ── DEVELOPMENT ── */}
            {tab === 'development' && (
              <div className="space-y-5">
                <Sec icon="🏗️" label="New Development & Economy" />
                <div className="grid grid-cols-3 gap-3">
                  <Tile label="Permits YoY"     value={`${ai.newPermitsYoY > 0 ? '+' : ''}${ai.newPermitsYoY.toFixed(1)}%`} color={ai.newPermitsYoY > 0 ? '#1A7A4A' : '#C0341D'}/>
                  <Tile label="Job Growth"       value={`${ai.jobGrowthRate > 0 ? '+' : ''}${ai.jobGrowthRate.toFixed(1)}%/yr`} color={ai.jobGrowthRate > 1 ? '#1A7A4A' : '#C0341D'}/>
                  <Tile label="Economic Outlook" value={ai.economicOutlook.charAt(0).toUpperCase() + ai.economicOutlook.slice(1)}
                    color={ai.economicOutlook === 'strong' ? '#1A7A4A' : ai.economicOutlook === 'weak' ? '#C0341D' : '#8A5700'}/>
                </div>
                {ai.majorDevelopments.length > 0 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="🏢" label="Major Developments" />
                    {ai.majorDevelopments.map((d, i) => (
                      <div key={i} className="flex items-start gap-3 p-2.5 mb-2 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5" style={{ background: 'var(--sgc-navy)' }}>{i+1}</span>
                        <span className="text-sm" style={{ color: 'var(--sgc-black)' }}>{d}</span>
                      </div>
                    ))}
                  </div>
                )}
                {ai.infrastructureProjects.length > 0 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="🚧" label="Infrastructure Projects" />
                    {ai.infrastructureProjects.map((p, i) => (
                      <div key={i} className="text-sm mb-1.5 flex items-start gap-2" style={{ color: 'var(--sgc-black)' }}>
                        <span style={{ color: '#C45E1A', fontWeight: 700 }}>→</span> {p}
                      </div>
                    ))}
                  </div>
                )}
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <Sec icon="🏭" label="Major Employers & Industries" />
                  <div className="flex flex-wrap gap-2 mb-3">
                    {ai.majorEmployers.map((e, i) => (
                      <span key={i} className="text-sm px-3 py-1.5 rounded-full font-medium"
                        style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>{e}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ai.dominantIndustries.map((d, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-full"
                        style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>{d}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── RENTAL ── */}
            {tab === 'rental' && (
              <div className="space-y-5">
                <Sec icon="🏠" label="Rental Market" />
                <div className="grid grid-cols-4 gap-3">
                  <Tile label="Avg Rent/mo"  value={fmt$(avgRent)} sub={rc?.rentalData ? 'RentCast live' : 'AI estimate'} color="#1A7A4A"/>
                  <Tile label="Median Rent"  value={rc?.rentalData?.medianRent ? fmt$(rc.rentalData.medianRent) : fmt$(ai.medianRent)} sub={rc?.rentalData ? 'RentCast live' : 'AI estimate'} color="#1A7A4A"/>
                  <Tile label="Rental DOM"   value={rc?.rentalData?.averageDaysOnMarket ? `${rc.rentalData.averageDaysOnMarket}d` : '—'} sub="RentCast live"/>
                  <Tile label="Rental Listings" value={rc?.rentalData?.totalListings?.toLocaleString() || '—'} sub="RentCast live"/>
                </div>
                {/* BRRRR Analysis */}
                {(() => {
                  const hv = homeValue || ai.medianHomeValue
                  const r  = avgRent   || ai.medianRent
                  if (!hv || !r || hv < 10000 || r < 100) return null
                  const gy2 = (r * 12 / hv) * 100
                  const ptr = hv / (r * 12)
                  const cf  = r - (hv * 0.008) - (hv * 0.01 / 12)
                  return (
                    <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                      <Sec icon="🔄" label="BRRRR Analysis" />
                      <div className="grid grid-cols-3 gap-5">
                        <div className="text-center rounded-xl p-4" style={{ background: 'var(--sgc-gray-light)' }}>
                          <div className="text-2xl font-bold mb-1" style={{ color: gy2 > 8 ? '#1A7A4A' : gy2 > 5 ? '#8A5700' : '#C0341D' }}>{gy2.toFixed(1)}%</div>
                          <div className="text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>Gross Yield</div>
                        </div>
                        <div className="text-center rounded-xl p-4" style={{ background: 'var(--sgc-gray-light)' }}>
                          <div className="text-2xl font-bold mb-1" style={{ color: ptr < 15 ? '#1A7A4A' : '#C0341D' }}>{ptr.toFixed(1)}×</div>
                          <div className="text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>Price-to-Rent</div>
                        </div>
                        <div className="text-center rounded-xl p-4" style={{ background: 'var(--sgc-gray-light)' }}>
                          <div className="text-2xl font-bold mb-1" style={{ color: cf > 0 ? '#1A7A4A' : '#C0341D' }}>{fmt$(cf)}/mo</div>
                          <div className="text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>Est. Cash Flow</div>
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>After est. PITI</div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ── STRATEGY ── */}
            {tab === 'strategy' && (
              <div className="space-y-5">
                <Sec icon="🎯" label="SGC Investment Strategy" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)', borderLeft: '3px solid #C45E1A' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#C45E1A' }}>🔨 Fix & Flip Strategy</div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--sgc-black)' }}>{ai.flipStrategy}</p>
                  </div>
                  <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)', borderLeft: '3px solid #1A7A4A' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#1A7A4A' }}>🔄 BRRRR Strategy</div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--sgc-black)' }}>{ai.brrrStrategy}</p>
                  </div>
                </div>
                {ai.opportunities.length > 0 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="💡" label="Specific Opportunities" />
                    <div className="grid grid-cols-2 gap-2">
                      {ai.opportunities.map((o, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl text-sm" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-black)' }}>
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5" style={{ background: 'var(--sgc-navy)' }}>{i+1}</span>
                          {o}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* No AI data */}
        {analysis && !loading && !ai && (
          <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <div className="text-4xl mb-3">⚠️</div>
            <div className="text-base font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Analysis Failed</div>
            {analysis.errors.map((e, i) => (
              <div key={i} className="text-sm mb-1" style={{ color: '#C0341D' }}>{e}</div>
            ))}
            <button onClick={() => setShowKeys(true)} className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>
              Check API Key →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
