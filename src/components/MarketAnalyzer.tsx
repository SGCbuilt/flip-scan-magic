import { useState } from 'react'
import { analyzeArea, AreaAnalysis } from '../lib/marketAnalyzer'

const fmt$ = (n?: number) => n && n > 0 ? '$' + Math.round(n).toLocaleString() : '—'
const pct   = (n?: number, d = 1) => n != null ? n.toFixed(d) + '%' : '—'
const rate  = (n?: number) => n != null ? n.toFixed(1) + '/100k' : '—'

// ── Helpers ───────────────────────────────────────────────────────────────────
function ScoreArc({ score, label, sub }: { score: number; label: string; sub?: string }) {
  const c  = score >= 70 ? '#1A7A4A' : score >= 50 ? '#C45E1A' : '#C0341D'
  const bg = score >= 70 ? '#EDFAF3' : score >= 50 ? '#FEF3EA' : '#FEF0ED'
  const r  = 26, cx = 32, cy = 32
  const toRad = (d: number) => d * Math.PI / 180
  const start = -205, sweep = 230
  const end = start + (Math.min(100, score) / 100) * sweep
  const lArc = score > 50 ? 1 : 0
  const aX = (a: number) => cx + r * Math.cos(toRad(a))
  const aY = (a: number) => cy + r * Math.sin(toRad(a))
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 64 52" className="w-16 h-14">
        <path d={`M ${aX(start)} ${aY(start)} A ${r} ${r} 0 1 1 ${aX(start+sweep)} ${aY(start+sweep)}`}
          fill="none" stroke="var(--sgc-gray-border)" strokeWidth="5" strokeLinecap="round"/>
        {score > 0 && <path d={`M ${aX(start)} ${aY(start)} A ${r} ${r} 0 ${lArc} 1 ${aX(end)} ${aY(end)}`}
          fill="none" stroke={c} strokeWidth="5" strokeLinecap="round"/>}
        <text x={cx} y={cy+5} textAnchor="middle" fontSize="14" fontWeight="800" fill={c}>{score}</text>
      </svg>
      <div className="text-[10px] font-bold uppercase tracking-wider text-center" style={{ color: c }}>{label}</div>
      {sub && <div className="text-[9px] text-center" style={{ color: 'var(--sgc-gray-mid)' }}>{sub}</div>}
    </div>
  )
}

function Tile({ label, value, sub, color, accent }: {
  label: string; value: string; sub?: string; color?: string; accent?: string
}) {
  return (
    <div className="bg-white rounded-xl border p-3 overflow-hidden relative" style={{ borderColor: accent ? accent + '30' : 'var(--sgc-gray-border)' }}>
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

function parseInsight(text: string) {
  const [lead, ...rest] = text.split(' — ')
  const firstSpace = lead.indexOf(' ')
  return {
    icon: firstSpace > -1 ? lead.slice(0, firstSpace) : '•',
    metric: firstSpace > -1 ? lead.slice(firstSpace + 1) : lead,
    meaning: rest.join(' — ') || text,
  }
}

function InsightCard({ title, note, items, tone }: { title: string; note: string; items: string[]; tone: 'pro'|'con' }) {
  const good = tone === 'pro'
  const main = good ? 'var(--sgc-success)' : 'var(--sgc-danger)'
  const bg = good ? 'var(--sgc-success-bg)' : 'var(--sgc-danger-bg)'
  return (
    <div className="bg-white rounded-2xl border p-4" style={{ borderColor: main, borderLeft: `4px solid ${main}` }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: main }}>{title}</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{note}</div>
        </div>
        <div className="text-[11px] font-bold rounded-full px-2 py-1" style={{ background: bg, color: main }}>
          {items.length}
        </div>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, i) => {
            const parsed = parseInsight(item)
            return (
              <div key={i} className="flex gap-2 rounded-xl p-2" style={{ background: 'var(--sgc-gray-light)' }}>
                <span className="flex-shrink-0 leading-5">{parsed.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-snug" style={{ color: 'var(--sgc-black)' }}>{parsed.metric}</div>
                  <div className="text-xs leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>{parsed.meaning}</div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
          {good ? 'No strong green-number advantages found.' : 'No major red-number risks found.'}
        </div>
      )}
    </div>
  )
}

function verdictFor(score?: number) {
  if (score == null) return null
  if (score >= 72) return { label: 'Good location', detail: 'Most numbers support investing here. Still verify street-level comps before buying.', color: 'var(--sgc-success)', bg: 'var(--sgc-success-bg)' }
  if (score >= 60) return { label: 'Workable location', detail: 'The numbers are mostly positive, but one or two risks need underwriting.', color: 'var(--sgc-navy)', bg: 'var(--sgc-navy-pale)' }
  if (score >= 40) return { label: 'Mixed location', detail: 'There are usable opportunities, but the cons can erase profit if the buy price is not discounted.', color: 'var(--sgc-warn)', bg: 'var(--sgc-warn-bg)' }
  return { label: 'Weak location', detail: 'The numbers point to higher risk. Only buy with a deep discount and a clear exit.', color: 'var(--sgc-danger)', bg: 'var(--sgc-danger-bg)' }
}

function CrimeBar({ value, label, national }: { value: number; label: string; national: number }) {
  const pctOfNat = Math.min(200, (value / national) * 100)
  const color = pctOfNat < 70 ? '#1A7A4A' : pctOfNat < 120 ? '#8A5700' : '#C0341D'
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="text-xs w-32 flex-shrink-0" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
      <div className="flex-1 h-2 rounded-full relative overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pctOfNat / 2)}%`, background: color }}/>
        {/* National average marker at 50% */}
        <div className="absolute top-0 bottom-0 w-0.5" style={{ left: '50%', background: '#1B3A8C', opacity: 0.4 }}/>
      </div>
      <div className="text-xs font-bold w-20 text-right" style={{ color }}>{value.toFixed(1)}</div>
    </div>
  )
}

const MARKET_LABEL: Record<string, { text: string; c: string; bg: string; desc: string }> = {
  emerging:    { text: '🚀 Emerging',    c: 'var(--sgc-success)', bg: 'var(--sgc-success-bg)', desc: 'Strong growth signals — buy before prices peak' },
  established: { text: '✅ Established', c: 'var(--sgc-navy)',    bg: 'var(--sgc-navy-pale)',  desc: 'Stable growth, reliable exit market'             },
  stable:      { text: '⚖️ Stable',      c: 'var(--sgc-warn)',    bg: 'var(--sgc-warn-bg)',    desc: 'Predictable — good for holds and BRRRR'         },
  declining:   { text: '📉 Declining',   c: 'var(--sgc-danger)',  bg: 'var(--sgc-danger-bg)',  desc: 'Only deeply discounted acquisitions make sense'  },
}

const TABS = [
  { id: 'overview',     label: 'Overview',      icon: '⊞' },
  { id: 'financial',    label: 'Financial',     icon: '💰' },
  { id: 'demographics', label: 'Demographics',  icon: '👥' },
  { id: 'crime',        label: 'Crime & Safety',icon: '🛡️' },
  { id: 'rental',       label: 'Rental Market', icon: '🏠' },
  { id: 'strategy',     label: 'SGC Strategy',  icon: '🎯' },
]

const ic = 'w-full rounded-lg border text-sm px-3 py-2 outline-none bg-white sgc-input'

export default function MarketAnalyzer() {
  const [city,  setCity]  = useState('')
  const [state, setState] = useState('')
  const [zip,   setZip]   = useState('')
  const [mode,  setMode]  = useState<'city'|'zip'>('city')
  const [tab,   setTab]   = useState('overview')
  const [loading, setLoading]   = useState(false)
  const [loadMsg, setLoadMsg]   = useState('')
  const [analysis, setAnalysis] = useState<AreaAnalysis | null>(null)
  const [showKeys, setShowKeys] = useState(false)
  const [valError, setValError] = useState('')
  const governmentKeysReady = true

  const handleAnalyze = async () => {
    setValError('')
    const isZip = /^\d{5}$/.test(city.trim()) || /^\d{5}$/.test(zip.trim())
    const actualZip   = isZip ? (city.trim() || zip.trim()) : undefined
    const actualCity  = !isZip ? city.trim()  : undefined
    const actualState = !isZip ? state.trim() : undefined

    // ── Validation ───────────────────────────────────────────────
    if (mode === 'zip') {
      if (!zip.trim()) { setValError('ZIP code is required.'); return }
      if (!/^\d{5}$/.test(zip.trim())) { setValError('ZIP must be exactly 5 digits (e.g. 27587).'); return }
    } else {
      if (!city.trim()) { setValError('City is required.'); return }
      if (!state.trim()) { setValError('State is required (2-letter code, e.g. NC).'); return }
      if (!/^\d{5}$/.test(city.trim())) {
        // city mode — no zip needed, but if user typed a zip in city field, accept it
      }
    }
    // ── End Validation ────────────────────────────────────────────

    const location = actualZip || [actualCity, actualState].filter(Boolean).join(', ')
    if (!location) return

    setLoading(true); setAnalysis(null)
    const msgs = [
      `Fetching Census ACS data for ${location}...`,
      'Querying FBI UCR crime statistics...',
      'Pulling BLS unemployment data...',
      'Loading RentCast market trends...',
      'Computing investor scores...',
      'Generating AI strategy narrative...',
    ]
    let mi = 0
    const iv = setInterval(() => setLoadMsg(msgs[mi++ % msgs.length]), 1600)
    try {
      const r = await analyzeArea(actualZip, actualCity, actualState)
      setAnalysis(r); setTab('overview')
    } finally { clearInterval(iv); setLoading(false); setLoadMsg('') }
  }

  // Derived convenience refs
  const cen  = analysis?.census
  const cr   = analysis?.crime
  const bls  = analysis?.bls
  const rc   = analysis?.rentcast
  const sc   = analysis?.scores
  const ai   = analysis?.ai
  const mb   = sc ? (MARKET_LABEL[sc.marketType] || MARKET_LABEL.stable) : null

  const unemp = bls?.unemploymentRate ?? cen?.unemploymentRate
  const grossYield = cen?.medianRent && cen?.medianHomeValue && cen.medianHomeValue > 0
    ? (cen.medianRent * 12 / cen.medianHomeValue) * 100 : null
  const verdict = verdictFor(sc?.investorScore)

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* LEFT CONFIG */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>🔬 Area Intelligence</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
            Census · FBI UCR · BLS · RentCast · AI
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

          {/* API key status */}
          <div className="rounded-xl border p-3 space-y-1.5" style={{
            borderColor: 'var(--sgc-gray-border)', background: 'var(--sgc-gray-light)'
          }}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>API Keys</div>
              <button onClick={() => setShowKeys(s => !s)}
                className="text-[10px] cursor-pointer bg-transparent border-none font-semibold"
                style={{ color: 'var(--sgc-navy)' }}>
                {showKeys ? 'Done' : 'Configure'}
              </button>
            </div>
            {[
              { k: 'census',      label: 'Census ACS',  url: 'api.census.gov/data/key_signup.html', set: governmentKeysReady },
              { k: 'fbi',         label: 'FBI Crime',   url: 'api.data.gov/signup',                 set: governmentKeysReady },
              { k: 'anthropic',   label: 'AI Strategy', url: 'console.anthropic.com',               set: governmentKeysReady },
              { k: 'supabase',    label: 'Backend',     url: 'supabase.com',                        set: governmentKeysReady },
            ].map(({ k, label, url, set }) => (
              <div key={k} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: set ? '#1A7A4A' : 'var(--sgc-gray-border)' }}/>
                <span className="text-[10px] flex-1" style={{ color: set ? '#1A7A4A' : 'var(--sgc-gray-mid)' }}>
                  {label}: {set ? '✓ Set' : <a href={`https://${url}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sgc-navy)' }}>Get free key ↗</a>}
                </span>
              </div>
            ))}
          </div>

          {/* Key inputs */}
          {showKeys && (
            <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[10px] p-2 rounded-lg" style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
                Census, FBI, BLS, RentCast, and AI are handled by the secure backend. No browser API keys are needed.
              </div>
            </div>
          )}

          {/* Search */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>Search</div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {[{ id: 'city', l: '📍 City + State' }, { id: 'zip', l: '#️⃣ Zip Code' }].map(m => (
                <button key={m.id} onClick={() => setMode(m.id as any)}
                  className="py-1.5 rounded-lg border text-xs font-medium cursor-pointer"
                  style={mode === m.id
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {m.l}
                </button>
              ))}
            </div>
            {mode === 'city' ? (
              <div className="space-y-2">
                <input className={ic} value={city} onChange={e => { setCity(e.target.value); setValError('') }}
                  placeholder="Wake Forest, Norfolk, Austin" onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
                <input className={ic} value={state} onChange={e => { setState(e.target.value.toUpperCase().slice(0,2)); setValError('') }}
                  placeholder="NC · VA · TX" maxLength={2} onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
              </div>
            ) : (
              <input className={ic} value={zip} onChange={e => { setZip(e.target.value.replace(/\D/g,'').slice(0,5)); setValError('') }}
                placeholder="27587 · 23501 · 78701" onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
            )}
            {valError && (
              <div className="mt-2 text-[11px] font-semibold rounded-lg px-3 py-2" style={{ background: 'var(--sgc-danger-bg)', color: 'var(--sgc-danger)' }}>
                {valError}
              </div>
            )}
          </div>

          {/* Section nav */}
          {analysis && (
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

          {/* Data sources */}
          <div className="rounded-xl p-3" style={{ background: 'var(--sgc-gray-light)' }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>Legal Data Sources</div>
            {[
              { s: '🏛️ Census ACS 5-yr 2023', n: 'Income, housing, demographics — U.S. Census Bureau' },
              { s: '🔵 FBI UCR Crime Data',    n: 'Crime rates — Dept. of Justice Open Government Data' },
              { s: '📊 BLS Unemployment',      n: 'Jobless rate — Bureau of Labor Statistics' },
              { s: '🏠 RentCast Markets',      n: 'Sale + rental trends — Licensed API' },
              { s: '🤖 Claude AI',             n: 'Narrative only — never generates numbers' },
            ].map(({ s, n }) => (
              <div key={s} className="mb-1.5">
                <div className="text-[10px] font-semibold" style={{ color: 'var(--sgc-black)' }}>{s}</div>
                <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{n}</div>
              </div>
            ))}
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
              : '🔬 Deep Analyze Market'}
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
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Deep Area Intelligence</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--sgc-gray-mid)' }}>
              Every number comes from a verified U.S. government source. Same search = identical results every time. AI writes the narrative; APIs provide the data.
            </p>
            <div className="grid grid-cols-3 gap-3 text-left w-full">
              {[
                { icon: '🏛️', t: 'Census ACS 2023', d: 'Real income, home values, vacancy, poverty, education from 2023 5-year estimates' },
                { icon: '🔵', t: 'FBI Crime Data', d: 'Official UCR violent and property crime rates per 100k vs national average' },
                { icon: '📊', t: 'BLS Unemployment', d: 'Monthly state unemployment rate from Bureau of Labor Statistics LAUS series' },
                { icon: '🏠', t: 'RentCast Market', d: 'Live sale price, days on market, inventory, rental trends — 24 months history' },
                { icon: '🎯', t: 'Investor Scores', d: 'Flip/BRRRR scores derived mathematically from real data — deterministic, never random' },
                { icon: '🤖', t: 'AI Strategy', d: 'Claude AI reads your real numbers and writes specific investor strategy, never the numbers' },
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
              style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }}/>
            <div className="text-base font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>{loadMsg}</div>
            <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>Querying government APIs + AI in parallel</div>
          </div>
        )}

        {/* Results */}
        {analysis && !loading && (
          <div id="report-print-area" className="p-6 space-y-5 max-w-5xl">

            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold" style={{ color: 'var(--sgc-navy)' }}>{analysis.geoName || analysis.location}</h2>
                <div className="text-xs mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                  Analyzed {new Date(analysis.analyzedAt).toLocaleString()}
                  {analysis.cacheHit && ' · from cache'}
                </div>
                {analysis.errors.length > 0 && (
                  <div className="text-xs mt-1" style={{ color: '#8A5700' }}>⚠ {analysis.errors.join(' · ')}</div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {mb && (
                  <div className="rounded-xl border px-4 py-2"
                    style={{ background: mb.bg, borderColor: mb.c + '40' }}>
                    <div className="text-sm font-bold" style={{ color: mb.c }}>{mb.text}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: mb.c + 'bb' }}>{mb.desc}</div>
                  </div>
                )}
                <button
                  onClick={() => window.print()}
                  data-print-hide
                  className="rounded-xl border px-3 py-2 text-xs font-bold hover:opacity-90 transition"
                  style={{ background: 'var(--sgc-navy)', color: 'white', borderColor: 'var(--sgc-navy)' }}
                  title="Save report as PDF"
                >
                  ⬇ Save PDF
                </button>
              </div>
            </div>

            {/* Attribution — required by Census ToS */}
            <div className="text-[10px] px-3 py-2 rounded-lg" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
              {analysis.sources.join(' · ')}
              {cen && ' · This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.'}
            </div>

            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
              <div className="space-y-5">
                {/* Scores */}
                {sc && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="🎯" label="Location Verdict — Calculated from Real Data" />
                    {verdict && (
                      <div className="mb-4 rounded-xl p-3" style={{ background: verdict.bg, color: verdict.color }}>
                        <div className="text-base font-black">{verdict.label}</div>
                        <div className="text-xs mt-0.5">{verdict.detail}</div>
                      </div>
                    )}
                    <div className="flex items-center gap-6">
                      <ScoreArc score={sc.investorScore} label="Overall"   sub="All factors" />
                      <div className="w-px h-14" style={{ background: 'var(--sgc-gray-border)' }}/>
                      <ScoreArc score={sc.flipScore}     label="Fix & Flip" sub="Exit speed + income" />
                      <div className="w-px h-14" style={{ background: 'var(--sgc-gray-border)' }}/>
                      <ScoreArc score={sc.brrrScore}     label="BRRRR"     sub="Yield + vacancy" />
                      <div className="flex-1 ml-2 space-y-1.5 text-[11px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                        <div>Scores are deterministic math — same inputs, same result every time</div>
                        {unemp !== undefined && <div>• Unemployment {unemp.toFixed(1)}% → {unemp < 4 ? 'strong +' : unemp > 7 ? 'weak −' : 'neutral'} employment base</div>}
                        {cen?.ownerOccupancyRate !== undefined && <div>• Owner occupancy {cen.ownerOccupancyRate.toFixed(0)}% → {cen.ownerOccupancyRate > 70 ? 'flip-friendly' : cen.ownerOccupancyRate < 55 ? 'rental demand' : 'balanced'}</div>}
                        {rc?.saleData?.averageDaysOnMarket && <div>• {rc.saleData.averageDaysOnMarket}d avg DOM → {rc.saleData.averageDaysOnMarket < 25 ? 'fast flip exits' : rc.saleData.averageDaysOnMarket > 70 ? 'slow market' : 'normal pace'}</div>}
                        {cr && <div>• Crime {cr.violentVsNational > 0 ? '+' : ''}{cr.violentVsNational.toFixed(0)}% vs national (FBI {cr.dataYear})</div>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Key stats */}
                <div className="grid grid-cols-4 gap-3">
                  <Tile label="Median Home Value" value={fmt$(cen?.medianHomeValue)} sub="Census ACS 2023" color="var(--sgc-navy)" accent="#1B3A8C" />
                  <Tile label="Median Income" value={fmt$(cen?.medianHouseholdIncome)} sub="Census ACS 2023" />
                  <Tile label="Median Rent/mo" value={fmt$(cen?.medianRent)} sub="Census ACS 2023" color="#1A7A4A" />
                  <Tile label="Avg Days on Mkt" value={rc?.saleData?.averageDaysOnMarket ? `${rc.saleData.averageDaysOnMarket}d` : '—'}
                    sub="RentCast live" color={rc?.saleData?.averageDaysOnMarket && rc.saleData.averageDaysOnMarket < 25 ? '#C0341D' : '#1A7A4A'} />
                  <Tile label="Unemployment" value={unemp !== undefined ? `${unemp.toFixed(1)}%` : '—'}
                    sub={bls ? `BLS ${bls.month} ${bls.year}` : 'Census ACS'}
                    color={unemp !== undefined && unemp < 4 ? '#1A7A4A' : unemp !== undefined && unemp > 7 ? '#C0341D' : 'var(--sgc-black)'} />
                  <Tile label="Violent Crime/100k" value={cr ? `${cr.violentCrimeRate}` : '—'}
                    sub={cr ? `FBI UCR ${cr.dataYear} · Grade ${cr.crimeGrade}` : 'FBI data unavailable'}
                    color={cr ? (cr.violentVsNational < -15 ? '#1A7A4A' : cr.violentVsNational > 30 ? '#C0341D' : '#8A5700') : 'var(--sgc-gray-mid)'} />
                  <Tile label="Gross Yield" value={grossYield ? `${grossYield.toFixed(1)}%` : '—'}
                    sub="Census rent ÷ home value × 12"
                    color={grossYield ? (grossYield > 8 ? '#1A7A4A' : grossYield > 5 ? '#8A5700' : '#C0341D') : 'var(--sgc-gray-mid)'} />
                  <Tile label="Vacancy Rate" value={pct(cen?.vacancyRate)} sub="Census ACS 2023"
                    color={cen?.vacancyRate && cen.vacancyRate > 8 ? '#C45E1A' : '#1A7A4A'} />
                </div>

                {/* Signals / Risks */}
                <div className="grid grid-cols-2 gap-4">
                  <InsightCard title="Pros from the numbers" note="Green items help flips, rentals, or buyer demand." items={analysis.signals} tone="pro" />
                  <InsightCard title="Cons from the numbers" note="Red items can lower ARV, slow exits, or hurt cash flow." items={analysis.risks} tone="con" />
                </div>

                {/* Warnings */}
                {analysis.warnings.length > 0 && (
                  <div className="text-xs px-3 py-2 rounded-lg" style={{ background: '#FEF7EA', color: '#8A5700' }}>
                    ℹ {analysis.warnings.join(' · ')}
                  </div>
                )}
              </div>
            )}

            {/* ── FINANCIAL ── */}
            {tab === 'financial' && (
              <div className="space-y-5">
                <Sec icon="💰" label="Financial Indicators — Census ACS 2023 + RentCast" />
                <div className="grid grid-cols-3 gap-3">
                  <Tile label="Median Home Value" value={fmt$(cen?.medianHomeValue)} sub="Census ACS 5-yr 2023" color="var(--sgc-navy)" />
                  <Tile label="Median Household Income" value={fmt$(cen?.medianHouseholdIncome)} sub="Census ACS 5-yr 2023" />
                  <Tile label="Median Gross Rent" value={cen?.medianRent ? fmt$(cen.medianRent) + '/mo' : '—'} sub="Census ACS 5-yr 2023" color="#1A7A4A" />
                  <Tile label="RentCast Avg Sale Price" value={fmt$(rc?.saleData?.averagePrice)} sub="Live market" color="var(--sgc-navy)" />
                  <Tile label="RentCast Median Price" value={fmt$(rc?.saleData?.medianPrice)} sub="Live market" />
                  <Tile label="Avg Days on Market" value={rc?.saleData?.averageDaysOnMarket ? `${rc.saleData.averageDaysOnMarket}d` : '—'} sub="Live market"
                    color={rc?.saleData?.averageDaysOnMarket && rc.saleData.averageDaysOnMarket < 25 ? '#C0341D' : '#1A7A4A'} />
                  <Tile label="Active Listings" value={rc?.saleData?.totalListings?.toLocaleString() || '—'} sub="RentCast live" />
                  <Tile label="Price per Sq Ft" value={rc?.saleData?.pricePerSqFt ? `$${rc.saleData.pricePerSqFt.toFixed(0)}` : '—'} sub="RentCast live" />
                  <Tile label="Poverty Rate" value={pct(cen?.povertyRate)} sub="Census ACS 2023"
                    color={cen?.povertyRate && cen.povertyRate > 20 ? '#C0341D' : '#1A7A4A'} />
                </div>

                {/* Investment math */}
                {cen?.medianRent && cen?.medianHomeValue && cen.medianHomeValue > 0 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <Sec icon="📊" label="Investment Return Analysis — All from Census ACS 2023" />
                    <div className="grid grid-cols-3 gap-5">
                      {(() => {
                        const gy  = (cen.medianRent * 12 / cen.medianHomeValue) * 100
                        const ptr = cen.medianHomeValue / (cen.medianRent * 12)
                        const one = cen.medianRent / cen.medianHomeValue * 100
                        return <>
                          <div className="text-center">
                            <div className="text-3xl font-bold mb-1" style={{ color: gy > 8 ? '#1A7A4A' : gy > 5 ? '#8A5700' : '#C0341D' }}>
                              {gy.toFixed(1)}%
                            </div>
                            <div className="text-sm font-semibold" style={{ color: 'var(--sgc-navy)' }}>Gross Yield</div>
                            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{gy > 8 ? '🟢 Excellent' : gy > 5 ? '🟡 Acceptable' : '🔴 Thin'}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold mb-1" style={{ color: ptr < 15 ? '#1A7A4A' : ptr < 20 ? '#8A5700' : '#C0341D' }}>
                              {ptr.toFixed(1)}×
                            </div>
                            <div className="text-sm font-semibold" style={{ color: 'var(--sgc-navy)' }}>Price-to-Rent</div>
                            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{ptr < 15 ? '🟢 Great' : ptr < 20 ? '🟡 OK' : '🔴 Tough'} · ideal &lt;15</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold mb-1" style={{ color: one >= 1 ? '#1A7A4A' : '#C0341D' }}>
                              {one.toFixed(2)}% {one >= 1 ? '✓' : '✗'}
                            </div>
                            <div className="text-sm font-semibold" style={{ color: 'var(--sgc-navy)' }}>1% Rule</div>
                            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Rent ÷ Price — need ≥ 1%</div>
                          </div>
                        </>
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── DEMOGRAPHICS ── */}
            {tab === 'demographics' && (
              <div className="space-y-5">
                <Sec icon="👥" label="Demographics — U.S. Census ACS 5-Year 2023" />
                {!cen ? (
                  <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                      Census demographics were not found for this location. Try a 5-digit ZIP code or city with state abbreviation.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                      <Tile label="Population" value={cen.population.toLocaleString()} sub="Census ACS 2023" />
                      <Tile label="Median Age" value={`${cen.medianAge.toFixed(0)} yrs`} sub="Census ACS 2023" />
                      <Tile label="Avg Household Size" value={cen.avgHouseholdSize.toFixed(1)} sub="Census ACS 2023" />
                      <Tile label="Total Housing Units" value={cen.totalHousingUnits.toLocaleString()} sub="Census ACS 2023" />
                      <Tile label="Owner Occupancy" value={pct(cen.ownerOccupancyRate)}
                        sub="Census ACS 2023" color={cen.ownerOccupancyRate > 65 ? '#1A7A4A' : '#534AB7'} />
                      <Tile label="Vacancy Rate" value={pct(cen.vacancyRate)}
                        sub="Census ACS 2023" color={cen.vacancyRate > 8 ? '#C45E1A' : '#1A7A4A'} />
                      <Tile label="Unemployment Rate" value={pct(unemp)}
                        sub={bls ? `BLS LAUS ${bls.month} ${bls.year}` : 'Census ACS estimate'}
                        color={unemp !== undefined && unemp < 4 ? '#1A7A4A' : unemp !== undefined && unemp > 7 ? '#C0341D' : 'var(--sgc-black)'} />
                      <Tile label="Poverty Rate" value={pct(cen.povertyRate)}
                        sub="Census ACS 2023" color={cen.povertyRate > 20 ? '#C0341D' : '#1A7A4A'} />
                      <Tile label="College Degree Rate" value={pct(cen.collegeDegreeRate)}
                        sub="25+ with Bach or higher" color={cen.collegeDegreeRate > 35 ? '#1A7A4A' : 'var(--sgc-black)'} />
                    </div>
                    <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                      <Sec icon="💡" label="Investor Interpretation" />
                      <div className="space-y-2 text-sm" style={{ color: 'var(--sgc-black)' }}>
                        {cen.ownerOccupancyRate < 55 && <div>🏠 Low owner-occupancy ({pct(cen.ownerOccupancyRate)}) — strong rental demand, excellent for BRRRR</div>}
                        {cen.ownerOccupancyRate > 72 && <div>🏡 High owner-occupancy ({pct(cen.ownerOccupancyRate)}) — strong flip market, large buyer pool</div>}
                        {cen.vacancyRate > 10 && <div>🏚️ High vacancy ({pct(cen.vacancyRate)}) — below-market acquisition opportunities</div>}
                        {cen.medianAge < 35 && <div>👶 Young population (median {cen.medianAge.toFixed(0)}) — high rental demand, first-time buyers</div>}
                        {cen.collegeDegreeRate > 40 && <div>🎓 Educated workforce ({pct(cen.collegeDegreeRate)}) — supports higher ARV and premium rents</div>}
                        {cen.povertyRate > 20 && <div>⚠️ High poverty ({pct(cen.povertyRate)}) — constrained ARV ceiling, vetting tenants critical</div>}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── CRIME ── */}
            {tab === 'crime' && (
              <div className="space-y-5">
                <Sec icon="🛡️" label="Crime Data — FBI Uniform Crime Reporting (UCR)" />
                {!cr ? (
                  <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="text-sm mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>
                      FBI crime data was not available for this state/year.
                    </div>
                    <div className="text-xs mt-3" style={{ color: 'var(--sgc-gray-mid)' }}>
                      Source: FBI UCR Program — voluntary reporting by 19,000+ agencies. Official DOJ Open Government Data.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                        <Sec icon="📊" label="Crime Rates per 100,000 Population" />
                        <div className="space-y-2.5 mb-4">
                          <CrimeBar value={cr.violentCrimeRate}  label="Violent Crime"  national={380.7}  />
                          <CrimeBar value={cr.homicideRate}       label="Homicide"       national={6.5}    />
                          <CrimeBar value={cr.robberyRate}        label="Robbery"        national={60.0}   />
                          <CrimeBar value={cr.propertyCrimeRate}  label="Property Crime" national={1954.4} />
                          <CrimeBar value={cr.burglaryRate}       label="Burglary"       national={314.2}  />
                          <CrimeBar value={cr.larcenyRate}        label="Larceny"        national={1383.7} />
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                          Blue line = national average. {cr.source}
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                        <Sec icon="🎓" label="Crime Summary" />
                        <div className="space-y-3">
                          <div className="text-center p-4 rounded-xl" style={{
                            background: cr.crimeGrade <= 'B' ? '#EDFAF3' : cr.crimeGrade === 'C' ? '#FEF7EA' : '#FEF0ED'
                          }}>
                            <div className="text-5xl font-black mb-1" style={{
                              color: cr.crimeGrade <= 'B' ? '#1A7A4A' : cr.crimeGrade === 'C' ? '#8A5700' : '#C0341D'
                            }}>{cr.crimeGrade}</div>
                            <div className="text-sm font-semibold" style={{ color: 'var(--sgc-black)' }}>Crime Grade</div>
                          </div>
                          {[
                            { l: 'Violent vs National', v: cr.violentVsNational, suffix: '%' },
                            { l: 'Property vs National', v: cr.propertyVsNational, suffix: '%' },
                          ].map(m => (
                            <div key={m.l} className="flex justify-between">
                              <span className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</span>
                              <span className="text-sm font-bold" style={{ color: m.v < 0 ? '#1A7A4A' : '#C0341D' }}>
                                {m.v > 0 ? '+' : ''}{m.v.toFixed(1)}{m.suffix}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                          {cr.coverageNote}
                        </div>
                        <div className="mt-2 p-3 rounded-xl text-xs" style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
                          💡 Lower crime = stronger ARV support, faster sales, higher-quality buyer pool and tenants
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── RENTAL ── */}
            {tab === 'rental' && (
              <div className="space-y-5">
                <Sec icon="🏠" label="Rental Market — Census ACS 2023 + RentCast Live" />
                <div className="grid grid-cols-4 gap-3">
                  <Tile label="Census Median Rent" value={cen?.medianRent ? fmt$(cen.medianRent) + '/mo' : '—'} sub="ACS 2023" color="#1A7A4A" />
                  <Tile label="RentCast Avg Rent" value={rc?.rentalData?.averageRent ? fmt$(rc.rentalData.averageRent) + '/mo' : '—'} sub="Live" color="#1A7A4A" />
                  <Tile label="Rental DOM" value={rc?.rentalData?.averageDaysOnMarket ? `${rc.rentalData.averageDaysOnMarket}d` : '—'} sub="RentCast live" />
                  <Tile label="Rental Listings" value={rc?.rentalData?.totalListings?.toLocaleString() || '—'} sub="RentCast live" />
                </div>
                {grossYield && (
                  <div className="grid grid-cols-3 gap-5 bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="text-center">
                      <div className="text-3xl font-bold mb-1" style={{ color: grossYield > 8 ? '#1A7A4A' : grossYield > 5 ? '#8A5700' : '#C0341D' }}>
                        {grossYield.toFixed(1)}%
                      </div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--sgc-navy)' }}>Gross Yield</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold mb-1" style={{ color: (cen!.medianHomeValue / (cen!.medianRent! * 12)) < 15 ? '#1A7A4A' : '#C0341D' }}>
                        {(cen!.medianHomeValue / (cen!.medianRent! * 12)).toFixed(1)}×
                      </div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--sgc-navy)' }}>Price-to-Rent</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold mb-1" style={{ color: (cen!.medianRent! / cen!.medianHomeValue * 100) >= 1 ? '#1A7A4A' : '#C0341D' }}>
                        {(cen!.medianRent! / cen!.medianHomeValue * 100).toFixed(2)}%
                      </div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--sgc-navy)' }}>1% Rule</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── STRATEGY ── */}
            {tab === 'strategy' && (
              <div className="space-y-5">
                <Sec icon="🎯" label="SGC Investment Strategy — AI Narrative Based on Real Data" />
                {!ai ? (
                  <div className="bg-white rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="text-sm mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>AI strategy narrative is temporarily unavailable.</div>
                  </div>
                ) : (
                  <>
                    {ai.summary && (
                      <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                        <Sec icon="📋" label="Market Summary" />
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--sgc-black)' }}>{ai.summary}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      {ai.flipStrategy && (
                        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)', borderLeft: '3px solid #C45E1A' }}>
                          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#C45E1A' }}>🔨 Fix & Flip Strategy</div>
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--sgc-black)' }}>{ai.flipStrategy}</p>
                        </div>
                      )}
                      {ai.brrrStrategy && (
                        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)', borderLeft: '3px solid #1A7A4A' }}>
                          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#1A7A4A' }}>🔄 BRRRR Strategy</div>
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--sgc-black)' }}>{ai.brrrStrategy}</p>
                        </div>
                      )}
                    </div>
                    {ai.opportunities?.length > 0 && (
                      <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                        <Sec icon="💡" label="Specific Opportunities" />
                        <div className="grid grid-cols-2 gap-2">
                          {ai.opportunities.map((o, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-xl" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-black)' }}>
                              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 text-white mt-0.5" style={{ background: 'var(--sgc-navy)' }}>{i+1}</span>
                              {o}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(ai.majorEmployers?.length > 0 || ai.dominantIndustries?.length > 0) && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                          <Sec icon="🏢" label="Major Employers" />
                          {ai.majorEmployers.map((e, i) => <div key={i} className="text-sm mb-1" style={{ color: 'var(--sgc-black)' }}>• {e}</div>)}
                        </div>
                        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                          <Sec icon="🏭" label="Key Industries" />
                          {ai.dominantIndustries.map((d, i) => <div key={i} className="text-sm mb-1" style={{ color: 'var(--sgc-black)' }}>• {d}</div>)}
                          {ai.economicContext && <p className="text-xs mt-2" style={{ color: 'var(--sgc-gray-mid)' }}>{ai.economicContext}</p>}
                        </div>
                      </div>
                    )}
                    {ai.majorDevelopments?.length > 0 && (
                      <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                        <Sec icon="🏗️" label="Known Developments" />
                        {ai.majorDevelopments.map((d, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm mb-2" style={{ color: 'var(--sgc-black)' }}>
                            <span style={{ color: 'var(--sgc-navy)', fontWeight: 700 }}>→</span> {d}
                          </div>
                        ))}
                      </div>
                    )}
                    {(ai.schoolNote) && (
                      <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                        <Sec icon="🎓" label="Schools" />
                        <p className="text-sm" style={{ color: 'var(--sgc-black)' }}>{ai.schoolNote}</p>
                      </div>
                    )}
                    <div className="text-[10px] px-3 py-2 rounded-lg" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                      AI narrative is based on Claude's training data (through early 2025) about this market. All numeric data shown in other tabs comes from official government sources. Verify current conditions with local sources before making investment decisions.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
