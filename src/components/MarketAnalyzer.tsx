import { useState } from 'react'
import { analyzeArea, AreaAnalysis, AIMarketData, getApiKeys, saveApiKey } from '../lib/marketAnalyzer'

const fmt$ = (n?: number) => n && n > 0 ? '$' + Math.round(n).toLocaleString() : '—'
const fmtPct = (n?: number, decimals = 1) => n != null ? (n > 0 ? '+' : '') + n.toFixed(decimals) + '%' : '—'
const pct = (n?: number) => n != null ? n.toFixed(1) + '%' : '—'

// ── Score arc gauge ───────────────────────────────────────────────────────────
function ScoreArc({ score, label }: { score: number; label: string }) {
  const c = score >= 70 ? '#1A7A4A' : score >= 50 ? '#C45E1A' : '#C0341D'
  const bg = score >= 70 ? '#EDFAF3' : score >= 50 ? '#FEF3EA' : '#FEF0ED'
  const pct = Math.min(100, Math.max(0, score))
  const r = 26, cx = 32, cy = 32
  const start = -200, sweep = 220
  const toRad = (d: number) => d * Math.PI / 180
  const arcX = (a: number) => cx + r * Math.cos(toRad(a))
  const arcY = (a: number) => cy + r * Math.sin(toRad(a))
  const endAngle = start + (pct / 100) * sweep
  const large = pct > 50 ? 1 : 0
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 64 52" className="w-16 h-14">
        <path d={`M ${arcX(start)} ${arcY(start)} A ${r} ${r} 0 1 1 ${arcX(start + sweep)} ${arcY(start + sweep)}`}
          fill="none" stroke="var(--sgc-gray-border)" strokeWidth="5" strokeLinecap="round" />
        {pct > 0 && <path d={`M ${arcX(start)} ${arcY(start)} A ${r} ${r} 0 ${large} 1 ${arcX(endAngle)} ${arcY(endAngle)}`}
          fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" />}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="14" fontWeight="800" fill={c}>{score}</text>
      </svg>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: c }}>{label}</div>
    </div>
  )
}

// ── Data tile ─────────────────────────────────────────────────────────────────
function Tile({ label, value, sub, trend, color, accent }: {
  label: string; value: string; sub?: string; trend?: number; color?: string; accent?: string
}) {
  return (
    <div className="bg-white rounded-xl border p-3 overflow-hidden relative" style={{ borderColor: accent ? accent + '40' : 'var(--sgc-gray-border)' }}>
      {accent && <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: accent }} />}
      <div className="text-[10px] uppercase tracking-wider font-medium mb-1 mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
      <div className="text-xl font-bold leading-none" style={{ color: color || 'var(--sgc-black)' }}>{value}</div>
      {sub && <div className="text-[10px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>{sub}</div>}
      {trend != null && (
        <div className="text-[10px] font-bold mt-1" style={{ color: trend >= 0 ? '#1A7A4A' : '#C0341D' }}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}% YoY
        </div>
      )}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function Sec({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--sgc-navy)' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--sgc-gray-border)' }} />
    </div>
  )
}

// ── Crime / score bar ─────────────────────────────────────────────────────────
function IndexBar({ value, label, inverted = true }: { value: number; label: string; inverted?: boolean }) {
  // inverted: lower = better (crime). non-inverted: higher = better (schools)
  const pct = Math.min(100, Math.max(0, value))
  const good = inverted ? pct < 35 : pct > 65
  const mid  = inverted ? pct < 65 : pct > 35
  const c = good ? '#1A7A4A' : mid ? '#8A5700' : '#C0341D'
  return (
    <div className="flex items-center gap-3">
      <div className="text-xs font-medium w-28 flex-shrink-0" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c }} />
      </div>
      <div className="text-xs font-bold w-6 text-right" style={{ color: c }}>{pct}</div>
    </div>
  )
}

// ── Mini sparkline bars ───────────────────────────────────────────────────────
function Bars({ data, color }: { data: { l: string; v: number }[]; color: string }) {
  const max = Math.max(...data.map(d => d.v), 1)
  return (
    <div className="flex items-end gap-0.5 h-12">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center relative group">
          <div className="w-full rounded-sm"
            style={{ height: `${Math.max(3, (d.v / max) * 44)}px`, background: color, opacity: i === data.length - 1 ? 1 : 0.45 }} />
          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-black text-white text-[9px] px-1 py-0.5 rounded whitespace-nowrap z-10">
            {d.l}: {d.v.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  )
}

const MARKET_BADGE: Record<string, { label: string; c: string; bg: string; desc: string }> = {
  emerging:    { label: '🚀 Emerging',    c: '#1A7A4A', bg: '#EDFAF3', desc: 'Rising fast — buy now before prices peak' },
  established: { label: '✅ Established', c: '#185FA5', bg: '#E6F1FB', desc: 'Stable, reliable market — lower risk' },
  peak:        { label: '⚠️ Peak',        c: '#8A5700', bg: '#FEF7EA', desc: 'Be conservative on ARV — limited upside' },
  declining:   { label: '📉 Declining',   c: '#C0341D', bg: '#FEF0ED', desc: 'Values falling — only deeply discounted deals' },
  stable:      { label: '⚖️ Stable',      c: '#534AB7', bg: '#EEEDFE', desc: 'Predictable — good for BRRRR and holds' },
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function MarketAnalyzer() {
  const [city, setCity]   = useState('')
  const [state, setState] = useState('')
  const [zip, setZip]     = useState('')
  const [mode, setMode]   = useState<'city' | 'zip'>('city')
  const [loading, setLoading]     = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [analysis, setAnalysis]   = useState<AreaAnalysis | null>(null)
  const [tab, setTab]             = useState<'overview' | 'financial' | 'development' | 'crime' | 'demographics' | 'rental'>('overview')
  const [showKeySetup, setShowKeySetup] = useState(false)
  const [draftKey, setDraftKey]   = useState('')

  const keys = getApiKeys()

  const handleAnalyze = async () => {
    // Auto-detect zip code even if typed in city field
    const isZip = /^\d{5}$/.test(city.trim()) || /^\d{5}$/.test(zip.trim())
    const actualZip  = isZip ? (city.trim() || zip.trim()) : undefined
    const actualCity = !isZip ? city.trim() : undefined
    const actualState = !isZip ? state.trim() : undefined

    const location = actualZip || [actualCity, actualState].filter(Boolean).join(', ')
    if (!location) return
    if (!keys.anthropic) { setShowKeySetup(true); return }

    setLoading(true); setAnalysis(null)
    const msgs = [
      `Analyzing ${location}...`,
      'Pulling demographics & income data...',
      'Researching crime & school ratings...',
      'Checking new development & permits...',
      'Fetching RentCast market trends...',
      'Calculating investor scores...',
    ]
    let mi = 0
    const iv = setInterval(() => setLoadingMsg(msgs[mi++ % msgs.length]), 1400)
    try {
      const result = await analyzeArea(actualZip, actualCity, actualState)
      setAnalysis(result)
      setTab('overview')
    } finally {
      clearInterval(iv); setLoading(false); setLoadingMsg('')
    }
  }

  const ic = `w-full rounded-lg border text-sm px-3 py-2 outline-none bg-white
    border-[var(--sgc-gray-border)] focus:border-[var(--sgc-navy)] placeholder:text-gray-400`

  const TABS = [
    { id: 'overview',     label: 'Overview',    icon: '⊞' },
    { id: 'financial',    label: 'Financial',   icon: '💰' },
    { id: 'development',  label: 'Development', icon: '🏗️' },
    { id: 'crime',        label: 'Crime/Schools',icon: '🛡️' },
    { id: 'demographics', label: 'Demographics',icon: '👥' },
    { id: 'rental',       label: 'Rental',      icon: '🏠' },
  ]

  const ai = analysis?.ai
  const rc = analysis?.rentcast
  const mb = ai ? MARKET_BADGE[ai.marketType] || MARKET_BADGE.stable : null

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* LEFT CONFIG */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>🔬 Area Intelligence</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>AI · RentCast · Census · FRED</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

          {/* API key status */}
          <div className="rounded-xl border p-3" style={{
            borderColor: keys.anthropic ? '#1A7A4A40' : '#C0341D40',
            background: keys.anthropic ? '#EDFAF3' : '#FEF0ED',
          }}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: keys.anthropic ? '#1A7A4A' : '#C0341D' }}>
                {keys.anthropic ? '✓ AI Analysis Active' : '⚠ API Key Required'}
              </div>
              <button onClick={() => setShowKeySetup(s => !s)}
                className="text-[10px] font-semibold cursor-pointer bg-transparent border-none"
                style={{ color: keys.anthropic ? '#1A7A4A' : '#C0341D' }}>
                {keys.anthropic ? 'Change' : 'Set Key'}
              </button>
            </div>
            <div className="text-[10px]" style={{ color: keys.anthropic ? '#1A7A4A' : '#C0341D' }}>
              {keys.anthropic ? 'Claude AI powers full market intelligence' : 'Add Anthropic API key to enable AI analysis'}
            </div>
          </div>

          {/* Key setup */}
          {showKeySetup && (
            <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>
                Anthropic API Key
              </div>
              <input className={ic} type="password" value={draftKey}
                onChange={e => setDraftKey(e.target.value)}
                placeholder="sk-ant-..." />
              <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                Get free at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sgc-navy)' }}>console.anthropic.com</a>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { saveApiKey('anthropic', draftKey.trim()); setShowKeySetup(false) }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white border-none cursor-pointer"
                  style={{ background: 'var(--sgc-navy)' }}>Save</button>
                <button onClick={() => setShowKeySetup(false)}
                  className="px-3 py-1.5 rounded-lg text-xs border-none cursor-pointer"
                  style={{ background: 'var(--sgc-gray-border)' }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Search mode */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>Search</div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {[{ id: 'city', l: '📍 City' }, { id: 'zip', l: '#️⃣ Zip' }].map(m => (
                <button key={m.id} onClick={() => setMode(m.id as any)}
                  className="py-2 rounded-lg border text-xs font-medium cursor-pointer transition-all"
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
                  placeholder="Wake Forest, Norfolk, Austin..."
                  onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
                <input className={ic} value={state} onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="State (e.g. NC)" maxLength={2}
                  onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
              </div>
            ) : (
              <input className={ic} value={zip} onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="27587, 23501..."
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
            )}
          </div>

          {/* Section nav */}
          {analysis?.ai && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>Sections</div>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id as any)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer border-none text-left mb-0.5 transition-all"
                  style={tab === t.id
                    ? { background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)', fontWeight: 600 }
                    : { background: 'transparent', color: 'var(--sgc-gray-mid)' }}>
                  <span>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Data sources */}
          <div className="rounded-xl p-3" style={{ background: 'var(--sgc-gray-light)' }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>Data Sources</div>
            {[
              { icon: '🤖', l: 'Claude AI',          s: 'Demographics, crime, schools, economy', ok: !!keys.anthropic },
              { icon: '🏠', l: 'RentCast',            s: 'Sale & rental market trends',           ok: true },
              { icon: '🏛️', l: 'Census API (opt)',    s: 'Official demographics by zip',           ok: !!keys.census },
              { icon: '📈', l: 'FRED API (opt)',       s: 'Home price index, mortgage rates',      ok: !!keys.fred },
            ].map(s => (
              <div key={s.l} className="flex items-center gap-2 mb-1.5">
                <span className="text-sm flex-shrink-0">{s.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold" style={{ color: 'var(--sgc-black)' }}>{s.l}</div>
                  <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{s.s}</div>
                </div>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.ok ? '#1A7A4A' : 'var(--sgc-gray-border)' }} />
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <button onClick={handleAnalyze} disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer transition-all"
            style={{ background: loading ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)' }}>
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin inline-block" />
                  Analyzing...
                </span>
              : '🔬 Analyze Market'}
          </button>
          {loading && <div className="text-[11px] text-center mt-2" style={{ color: 'var(--sgc-gray-mid)' }}>{loadingMsg}</div>}
        </div>
      </div>

      {/* RIGHT RESULTS */}
      <div className="flex-1 overflow-y-auto">

        {/* Empty */}
        {!loading && !analysis && (
          <div className="h-full flex flex-col items-center justify-center text-center px-8 max-w-2xl mx-auto">
            <svg viewBox="0 0 120 90" className="w-28 h-20 mb-5 opacity-15">
              <rect x="8" y="55" width="16" height="28" rx="2" fill="var(--sgc-navy)" />
              <rect x="30" y="38" width="16" height="45" rx="2" fill="var(--sgc-navy)" />
              <rect x="52" y="18" width="16" height="65" rx="2" fill="var(--sgc-navy)" />
              <rect x="74" y="42" width="16" height="41" rx="2" fill="var(--sgc-navy)" />
              <rect x="96" y="28" width="16" height="55" rx="2" fill="var(--sgc-navy)" />
              <polyline points="16,50 38,32 60,13 82,36 104,24" fill="none" stroke="#C0341D" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Area Intelligence</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--sgc-gray-mid)' }}>
              Full market picture for any US city or zip — AI-powered analysis of demographics, home values, crime, schools, new development, rental market, and investor scores.
            </p>
            {!keys.anthropic && (
              <button onClick={() => setShowKeySetup(true)}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer mb-4"
                style={{ background: 'var(--sgc-navy)' }}>
                Add API Key to Start →
              </button>
            )}
            <div className="grid grid-cols-3 gap-3 text-left w-full">
              {[
                { icon: '💰', t: 'Home Values & Appreciation', d: 'Median price, 1/3/5yr trends, days on market, inventory' },
                { icon: '🏗️', t: 'New Development', d: 'Building permits, major projects, infrastructure, zoning trends' },
                { icon: '🛡️', t: 'Crime & Safety', d: 'Crime index vs national avg, trend direction, violent vs property' },
                { icon: '🎓', t: 'Schools', d: 'District quality rating, top schools, avg school rating' },
                { icon: '👥', t: 'Demographics', d: 'Population, income, age, employment, education levels' },
                { icon: '🎯', t: 'Investor Scores', d: 'Flip score, BRRRR score, overall attractiveness — 0 to 100' },
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
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-2 rounded-full spin mb-5"
              style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }} />
            <div className="text-base font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>{loadingMsg}</div>
            <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>Claude AI + RentCast analyzing your market</div>
          </div>
        )}

        {/* Results */}
        {analysis && !loading && (
          <div className="p-6 space-y-5 max-w-5xl">

            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold" style={{ color: 'var(--sgc-navy)' }}>{analysis.location}</h2>
                {ai && <p className="text-sm mt-1 max-w-xl" style={{ color: 'var(--sgc-gray-mid)' }}>{ai.summary}</p>}
                {analysis.errors.length > 0 && (
                  <div className="text-xs mt-1" style={{ color: '#8A5700' }}>⚠ {analysis.errors.join(' · ')}</div>
                )}
                {ai?.dataNote && <div className="text-[10px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>ℹ {ai.dataNote}</div>}
              </div>
              {mb && (
                <div className="flex-shrink-0 rounded-xl border px-4 py-2 text-right"
                  style={{ background: mb.bg, borderColor: mb.c + '40' }}>
                  <div className="text-sm font-bold" style={{ color: mb.c }}>{mb.label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: mb.c + 'bb' }}>{mb.desc}</div>
                </div>
              )}
            </div>

            {/* ── OVERVIEW ── */}
            {tab === 'overview' && ai && (
              <div className="space-y-5">

                {/* Scores */}
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <Sec icon="🎯" label="Investor Scores" />
                  <div className="flex items-center gap-6">
                    <ScoreArc score={ai.investorScore} label="Overall" />
                    <div className="w-px h-14" style={{ background: 'var(--sgc-gray-border)' }} />
                    <ScoreArc score={ai.flipScore} label="Fix & Flip" />
                    <div className="w-px h-14" style={{ background: 'var(--sgc-gray-border)' }} />
                    <ScoreArc score={ai.brrrScore} label="BRRRR" />
                    <div className="flex-1 ml-2 space-y-1.5">
                      {[
                        { c: '#1A7A4A', t: `Home value ${ai.homeValueChange1yr > 0 ? 'up' : 'down'} ${Math.abs(ai.homeValueChange1yr).toFixed(1)}% YoY` },
                        { c: '#1A7A4A', t: `${ai.avgDaysOnMarket} avg days on market` },
                        { c: '#185FA5', t: `${pct(ai.vacancyRate)} vacancy rate` },
                        { c: '#C45E1A', t: `Crime ${ai.crimeVsNational}` },
                        { c: '#534AB7', t: `Schools rated ${ai.schoolRatingAvg.toFixed(1)}/10` },
                        { c: '#8A5700', t: `${ai.inventoryMonths.toFixed(1)} months inventory` },
                      ].map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.c }} />
                          {s.t}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Key metrics grid */}
                <div className="grid grid-cols-4 gap-3">
                  <Tile label="Median Home Value" value={fmt$(ai.medianHomeValue)} trend={ai.homeValueChange1yr} color="var(--sgc-navy)" accent="#1B3A8C" />
                  <Tile label="Median Income" value={fmt$(ai.medianHouseholdIncome)} accent="#1A7A4A" />
                  <Tile label="Avg Days on Market" value={`${ai.avgDaysOnMarket}d`} color={ai.avgDaysOnMarket < 25 ? '#C0341D' : ai.avgDaysOnMarket > 60 ? '#1A7A4A' : 'var(--sgc-black)'} accent="#534AB7" />
                  <Tile label="Inventory" value={`${ai.inventoryMonths.toFixed(1)} mo`} color={ai.inventoryMonths < 3 ? '#C0341D' : ai.inventoryMonths > 6 ? '#1A7A4A' : 'var(--sgc-black)'} />
                  <Tile label="Crime Index" value={`${ai.crimeIndexOverall}/100`} sub="Lower = safer" color={ai.crimeIndexOverall < 35 ? '#1A7A4A' : ai.crimeIndexOverall > 65 ? '#C0341D' : '#8A5700'} />
                  <Tile label="School Rating" value={`${ai.schoolRatingAvg.toFixed(1)}/10`} color={ai.schoolRatingAvg > 7 ? '#1A7A4A' : ai.schoolRatingAvg < 5 ? '#C0341D' : '#8A5700'} />
                  <Tile label="Unemployment" value={pct(ai.unemploymentRate)} color={ai.unemploymentRate < 4 ? '#1A7A4A' : ai.unemploymentRate > 7 ? '#C0341D' : 'var(--sgc-black)'} />
                  <Tile label="Population Growth" value={fmtPct(ai.populationGrowth)} color={ai.populationGrowth > 1 ? '#1A7A4A' : ai.populationGrowth < 0 ? '#C0341D' : 'var(--sgc-black)'} />
                </div>

                {/* Signals & risks */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#1A7A4A30', borderLeftWidth: 3, borderLeftColor: '#1A7A4A' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#1A7A4A' }}>✓ Opportunity Signals</div>
                    {ai.signals.length > 0
                      ? ai.signals.map((s, i) => (
                          <div key={i} className="text-sm mb-1.5 flex items-start gap-2" style={{ color: 'var(--sgc-black)' }}>
                            <span className="flex-shrink-0 text-base leading-none">{s[0]}</span>
                            <span>{s.slice(1).trim()}</span>
                          </div>
                        ))
                      : <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>No strong signals</div>}
                  </div>
                  <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#C0341D30', borderLeftWidth: 3, borderLeftColor: '#C0341D' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#C0341D' }}>⚠ Risk Factors</div>
                    {ai.risks.length > 0
                      ? ai.risks.map((r, i) => (
                          <div key={i} className="text-sm mb-1.5 flex items-start gap-2" style={{ color: 'var(--sgc-black)' }}>
                            <span className="flex-shrink-0 text-base leading-none">{r[0]}</span>
                            <span>{r.slice(1).trim()}</span>
                          </div>
                        ))
                      : <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>No major risks</div>}
                  </div>
                </div>

                {/* Opportunities */}
                {ai.opportunities.length > 0 && (
                  <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#1B3A8C30' }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>💡 SGC Investment Opportunities</div>
                    <div className="grid grid-cols-2 gap-2">
                      {ai.opportunities.map((o, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--sgc-black)' }}>
                          <span className="text-base leading-none flex-shrink-0">{o[0]}</span>
                          <span>{o.slice(1).trim()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── FINANCIAL ── */}
            {tab === 'financial' && ai && (
              <div className="space-y-5">
                <Sec icon="💰" label="Financial Indicators" />
                <div className="grid grid-cols-3 gap-3">
                  <Tile label="Median Home Value" value={fmt$(ai.medianHomeValue)} trend={ai.homeValueChange1yr} color="var(--sgc-navy)" />
                  <Tile label="1-Year Appreciation" value={fmtPct(ai.homeValueChange1yr)} color={ai.homeValueChange1yr > 0 ? '#1A7A4A' : '#C0341D'} />
                  <Tile label="3-Year Appreciation" value={fmtPct(ai.homeValueChange3yr)} color={ai.homeValueChange3yr > 0 ? '#1A7A4A' : '#C0341D'} />
                  <Tile label="5-Year Appreciation" value={fmtPct(ai.homeValueChange5yr)} color={ai.homeValueChange5yr > 0 ? '#1A7A4A' : '#C0341D'} />
                  <Tile label="Median Household Income" value={fmt$(ai.medianHouseholdIncome)} />
                  <Tile label="Foreclosure Rate" value={pct(ai.foreclosureRate)} color={ai.foreclosureRate > 3 ? '#1A7A4A' : 'var(--sgc-black)'} sub="% of sales — higher = more deals" />
                  <Tile label="List-to-Sale Ratio" value={pct(ai.listToSaleRatio)} color={ai.listToSaleRatio > 100 ? '#C0341D' : ai.listToSaleRatio > 98 ? '#8A5700' : '#1A7A4A'} sub="Buyers market < 97%" />
                  <Tile label="Avg Days on Market" value={`${ai.avgDaysOnMarket}d`} color={ai.avgDaysOnMarket < 20 ? '#C0341D' : ai.avgDaysOnMarket > 60 ? '#1A7A4A' : 'var(--sgc-black)'} />
                  <Tile label="Inventory" value={`${ai.inventoryMonths.toFixed(1)} mo`} sub="<3 = sellers · >6 = buyers" color={ai.inventoryMonths < 3 ? '#C0341D' : ai.inventoryMonths > 6 ? '#1A7A4A' : 'var(--sgc-black)'} />
                </div>

                {/* Investment return analysis */}
                {ai.medianRent > 0 && ai.medianHomeValue > 0 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="📊" label="Investment Return Analysis" />
                    <div className="grid grid-cols-3 gap-5">
                      {(() => {
                        const grossYield = (ai.medianRent * 12 / ai.medianHomeValue) * 100
                        const ptr = ai.medianHomeValue / (ai.medianRent * 12)
                        const oneRule = ai.medianRent / ai.medianHomeValue * 100
                        return <>
                          <div className="text-center">
                            <div className="text-3xl font-bold mb-1" style={{ color: grossYield > 8 ? '#1A7A4A' : grossYield > 5 ? '#8A5700' : '#C0341D' }}>
                              {grossYield.toFixed(1)}%
                            </div>
                            <div className="text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>Gross Yield</div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{grossYield > 8 ? '🟢 Excellent' : grossYield > 5 ? '🟡 Acceptable' : '🔴 Thin'}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold mb-1" style={{ color: ptr < 15 ? '#1A7A4A' : ptr < 20 ? '#8A5700' : '#C0341D' }}>
                              {ptr.toFixed(1)}×
                            </div>
                            <div className="text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>Price-to-Rent</div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{ptr < 15 ? '🟢 Great' : ptr < 20 ? '🟡 OK' : '🔴 Tough'} · ideal &lt;15</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold mb-1" style={{ color: oneRule >= 1 ? '#1A7A4A' : '#C0341D' }}>
                              {oneRule.toFixed(2)}% {oneRule >= 1 ? '✓' : '✗'}
                            </div>
                            <div className="text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>1% Rule</div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Rent ÷ Price · need ≥ 1%</div>
                          </div>
                        </>
                      })()}
                    </div>
                  </div>
                )}

                {/* RentCast overlay */}
                {rc?.saleData && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="🏠" label="Live RentCast Market Data" />
                    <div className="grid grid-cols-4 gap-3">
                      <Tile label="Avg Sale Price" value={fmt$(rc.saleData.averagePrice)} />
                      <Tile label="Median Sale Price" value={fmt$(rc.saleData.medianPrice)} />
                      <Tile label="Avg Days on Market" value={rc.saleData.averageDaysOnMarket ? `${rc.saleData.averageDaysOnMarket}d` : '—'} />
                      <Tile label="Active Listings" value={rc.saleData.totalListings?.toLocaleString() || '—'} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── DEVELOPMENT ── */}
            {tab === 'development' && ai && (
              <div className="space-y-5">
                <Sec icon="🏗️" label="New Development & Construction" />
                <div className="grid grid-cols-3 gap-3">
                  <Tile label="Permits YoY Change" value={fmtPct(ai.newPermitsYoY)} color={ai.newPermitsYoY > 0 ? '#1A7A4A' : '#C0341D'} sub="New residential building" />
                  <Tile label="Economic Outlook" value={ai.economicOutlook.charAt(0).toUpperCase() + ai.economicOutlook.slice(1)}
                    color={ai.economicOutlook === 'strong' ? '#1A7A4A' : ai.economicOutlook === 'weak' ? '#C0341D' : '#8A5700'} />
                  <Tile label="Job Growth Rate" value={fmtPct(ai.jobGrowthRate)} color={ai.jobGrowthRate > 1 ? '#1A7A4A' : ai.jobGrowthRate < 0 ? '#C0341D' : 'var(--sgc-black)'} />
                </div>

                {ai.majorDevelopments.length > 0 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="🏢" label="Major Development Projects" />
                    <div className="space-y-2">
                      {ai.majorDevelopments.map((d, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
                          <span className="w-6 h-6 rounded-full bg-[var(--sgc-navy)] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>
                          <span className="text-sm" style={{ color: 'var(--sgc-black)' }}>{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ai.infrastructureProjects.length > 0 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="🚧" label="Infrastructure Projects" />
                    <div className="space-y-2">
                      {ai.infrastructureProjects.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--sgc-black)' }}>
                          <span style={{ color: '#C45E1A', fontWeight: 700 }}>→</span> {p}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ai.zoningTrends && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="📋" label="Zoning Trends" />
                    <p className="text-sm" style={{ color: 'var(--sgc-black)' }}>{ai.zoningTrends}</p>
                  </div>
                )}

                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <Sec icon="🏭" label="Major Employers" />
                  <div className="flex flex-wrap gap-2">
                    {ai.majorEmployers.map((e, i) => (
                      <span key={i} className="text-sm px-3 py-1.5 rounded-full font-medium"
                        style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>{e}</span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ai.dominantIndustries.map((d, i) => (
                      <span key={i} className="text-[11px] px-2.5 py-1 rounded-full"
                        style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>{d}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── CRIME & SCHOOLS ── */}
            {tab === 'crime' && ai && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  {/* Crime */}
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="🛡️" label="Crime Analysis" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <Tile label="Overall Crime Index" value={`${ai.crimeIndexOverall}/100`} sub="Lower = safer"
                        color={ai.crimeIndexOverall < 35 ? '#1A7A4A' : ai.crimeIndexOverall > 65 ? '#C0341D' : '#8A5700'} />
                      <Tile label="vs National Avg" value={ai.crimeVsNational}
                        color={ai.crimeVsNational.includes('below') ? '#1A7A4A' : '#C0341D'} />
                    </div>
                    <div className="space-y-2.5 mb-4">
                      <IndexBar value={ai.violentCrimeIndex} label="Violent Crime" />
                      <IndexBar value={ai.propertyCrimeIndex} label="Property Crime" />
                      <IndexBar value={ai.crimeIndexOverall} label="Overall" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: 'var(--sgc-gray-mid)' }}>Trend:</span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full`} style={{
                        background: ai.crimeTrend === 'improving' ? '#EDFAF3' : ai.crimeTrend === 'worsening' ? '#FEF0ED' : 'var(--sgc-gray-light)',
                        color: ai.crimeTrend === 'improving' ? '#1A7A4A' : ai.crimeTrend === 'worsening' ? '#C0341D' : 'var(--sgc-gray-mid)'
                      }}>
                        {ai.crimeTrend === 'improving' ? '📉 Improving' : ai.crimeTrend === 'worsening' ? '📈 Worsening' : '→ Stable'}
                      </span>
                    </div>
                    <div className="mt-3 p-3 rounded-xl text-xs" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                      💡 Lower crime = easier to sell flips, higher buyer demand, higher ARV support
                    </div>
                  </div>

                  {/* Schools */}
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="🎓" label="School Quality" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <Tile label="Avg School Rating" value={`${ai.schoolRatingAvg.toFixed(1)}/10`}
                        color={ai.schoolRatingAvg > 7 ? '#1A7A4A' : ai.schoolRatingAvg < 5 ? '#C0341D' : '#8A5700'} />
                      <Tile label="District Quality" value={ai.schoolDistrictQuality.charAt(0).toUpperCase() + ai.schoolDistrictQuality.slice(1)}
                        color={ai.schoolDistrictQuality === 'excellent' ? '#1A7A4A' : ai.schoolDistrictQuality === 'poor' ? '#C0341D' : '#8A5700'} />
                    </div>
                    <div className="mb-3">
                      <IndexBar value={ai.schoolRatingAvg * 10} label="School Rating" inverted={false} />
                    </div>
                    {ai.topSchools.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>Top Schools</div>
                        {ai.topSchools.map((s, i) => (
                          <div key={i} className="text-xs mb-1 flex items-center gap-2" style={{ color: 'var(--sgc-black)' }}>
                            <span style={{ color: '#1A7A4A', fontWeight: 700 }}>#{i+1}</span> {s}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 p-3 rounded-xl text-xs" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                      💡 Good schools = homes hold value better, faster sales, higher ARV premiums
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── DEMOGRAPHICS ── */}
            {tab === 'demographics' && ai && (
              <div className="space-y-5">
                <Sec icon="👥" label="Demographics & Community" />
                <div className="grid grid-cols-4 gap-3">
                  <Tile label="Population" value={ai.population.toLocaleString()} />
                  <Tile label="Population Growth" value={fmtPct(ai.populationGrowth)} color={ai.populationGrowth > 1 ? '#1A7A4A' : ai.populationGrowth < 0 ? '#C0341D' : 'var(--sgc-black)'} sub="Annual rate" />
                  <Tile label="Median Age" value={`${ai.medianAge} yrs`} />
                  <Tile label="Avg Household Size" value={ai.avgHouseholdSize.toFixed(1)} />
                  <Tile label="Owner Occupancy" value={pct(ai.ownerOccupancyRate)} color={ai.ownerOccupancyRate > 65 ? '#1A7A4A' : '#534AB7'} />
                  <Tile label="Vacancy Rate" value={pct(ai.vacancyRate)} color={ai.vacancyRate > 10 ? '#C45E1A' : '#1A7A4A'} />
                  <Tile label="College Degree Rate" value={pct(ai.collegeDegreeRate)} color={ai.collegeDegreeRate > 35 ? '#1A7A4A' : 'var(--sgc-black)'} />
                  <Tile label="Poverty Rate" value={pct(ai.povertyRate)} color={ai.povertyRate > 15 ? '#C0341D' : '#1A7A4A'} />
                </div>

                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <Sec icon="💡" label="What This Means for SGC" />
                  <div className="space-y-2 text-sm" style={{ color: 'var(--sgc-black)' }}>
                    {ai.ownerOccupancyRate < 55 && <div className="flex items-start gap-2"><span>🏠</span><span>Low owner-occupancy ({pct(ai.ownerOccupancyRate)}) — strong rental demand, excellent for BRRRR</span></div>}
                    {ai.ownerOccupancyRate > 70 && <div className="flex items-start gap-2"><span>🏡</span><span>High owner-occupancy ({pct(ai.ownerOccupancyRate)}) — strong flip market, large buyer pool</span></div>}
                    {ai.populationGrowth > 2 && <div className="flex items-start gap-2"><span>📈</span><span>Fast population growth ({fmtPct(ai.populationGrowth)}/yr) — housing demand outpacing supply</span></div>}
                    {ai.populationGrowth < 0 && <div className="flex items-start gap-2"><span>⚠️</span><span>Population declining — shrinking buyer pool, be conservative on ARV</span></div>}
                    {ai.collegeDegreeRate > 40 && <div className="flex items-start gap-2"><span>🎓</span><span>Highly educated population — supports higher home values and premium finishes</span></div>}
                    {ai.medianAge < 35 && <div className="flex items-start gap-2"><span>👶</span><span>Young population (med age {ai.medianAge}) — high household formation rate, strong first-time buyer demand</span></div>}
                    {ai.vacancyRate > 10 && <div className="flex items-start gap-2"><span>🏚️</span><span>High vacancy ({pct(ai.vacancyRate)}) — acquisition opportunities, check for oversupply risk</span></div>}
                  </div>
                </div>
              </div>
            )}

            {/* ── RENTAL ── */}
            {tab === 'rental' && ai && (
              <div className="space-y-5">
                <Sec icon="🏠" label="Rental Market Analysis" />
                <div className="grid grid-cols-4 gap-3">
                  <Tile label="Median Monthly Rent" value={fmt$(ai.medianRent)} color="#1A7A4A" />
                  <Tile label="RentCast Avg Rent" value={rc?.rentalData?.averageRent ? fmt$(rc.rentalData.averageRent) + '/mo' : '—'} color="#1A7A4A" />
                  <Tile label="Avg Rental DOM" value={rc?.rentalData?.averageDaysOnMarket ? `${rc.rentalData.averageDaysOnMarket}d` : '—'} />
                  <Tile label="Rental Listings" value={rc?.rentalData?.totalListings?.toLocaleString() || '—'} />
                </div>

                {/* BRRRR analysis */}
                {ai.medianRent > 0 && ai.medianHomeValue > 0 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="🔄" label="BRRRR Analysis" />
                    <div className="grid grid-cols-3 gap-5">
                      {(() => {
                        const grossYield = (ai.medianRent * 12 / ai.medianHomeValue) * 100
                        const ptr = ai.medianHomeValue / (ai.medianRent * 12)
                        const estPITI = ai.medianHomeValue * 0.008
                        const cashFlow = ai.medianRent - estPITI - (ai.medianHomeValue * 0.01 / 12)
                        return <>
                          <div className="text-center bg-[var(--sgc-gray-light)] rounded-xl p-4">
                            <div className="text-2xl font-bold mb-1" style={{ color: grossYield > 8 ? '#1A7A4A' : grossYield > 5 ? '#8A5700' : '#C0341D' }}>{grossYield.toFixed(1)}%</div>
                            <div className="text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>Gross Yield</div>
                          </div>
                          <div className="text-center bg-[var(--sgc-gray-light)] rounded-xl p-4">
                            <div className="text-2xl font-bold mb-1" style={{ color: ptr < 15 ? '#1A7A4A' : '#C0341D' }}>{ptr.toFixed(1)}×</div>
                            <div className="text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>Price-to-Rent</div>
                          </div>
                          <div className="text-center bg-[var(--sgc-gray-light)] rounded-xl p-4">
                            <div className="text-2xl font-bold mb-1" style={{ color: cashFlow > 0 ? '#1A7A4A' : '#C0341D' }}>{fmt$(cashFlow)}/mo</div>
                            <div className="text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>Est. Cash Flow</div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>After est. PITI</div>
                          </div>
                        </>
                      })()}
                    </div>
                  </div>
                )}

                {rc?.rentalData?.history && Object.keys(rc.rentalData.history).length > 2 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="📈" label="Rental Trend (18 months)" />
                    <Bars
                      data={Object.entries(rc.rentalData.history)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .slice(-18)
                        .map(([date, val]: any) => ({
                          l: new Date(date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                          v: val?.averageRent || 0,
                        }))}
                      color="#1A7A4A"
                    />
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
