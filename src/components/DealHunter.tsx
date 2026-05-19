import { useState } from 'react'
import {
  runDealHunt, DealHuntResult, ALL_STATES,
  BankruptcyFiling, HUDListing, AuctionListing,
  USDAListing, ProbateLead, TaxDelinquentLead, GovREOPortal,
  stateOf, cityOf, zipOf
} from '../lib/dealHunter'

const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'

const SRC = {
  bankruptcy:    { label: 'Bankruptcy',      icon: '⚖️', color: '#534AB7', bg: '#EEEDFE', desc: 'Federal Ch.7/Ch.13 — CourtListener free API' },
  hud:           { label: 'HUD Gov',         icon: '🏛️', color: '#185FA5', bg: '#E6F1FB', desc: 'FHA foreclosures — hudhomestore.gov' },
  govReo:        { label: 'Gov REO Portals', icon: '🏦', color: '#1A7A4A', bg: '#EDFAF3', desc: 'HomePath, HomeSteps, VA, USDA portals' },
  auction:       { label: 'Live Auctions',   icon: '🔨', color: '#C0341D', bg: '#FCEBEB', desc: 'Auction.com, Hubzu, Xome, Ten-X' },
  probate:       { label: 'Probate/Estate',  icon: '📋', color: '#854F0B', bg: '#FAEEDA', desc: 'Federal court estate filings' },
  usda:          { label: 'USDA Rural',      icon: '🌾', color: '#3B6D11', bg: '#EAF3DE', desc: 'Rural Development foreclosures' },
  taxDelinquent: { label: 'Tax Delinquent',  icon: '💸', color: '#993C1D', bg: '#FAECE7', desc: 'County open-data delinquencies' },
}

type SrcKey = keyof typeof SRC

const DEFAULT_SOURCES = {
  bankruptcy: true, hud: true, govReo: true, auction: true,
  probate: true, usda: false, taxDelinquent: false,
}

function Badge({ s, small }: { s: SrcKey; small?: boolean }) {
  const c = SRC[s]
  return (
    <span className={`font-semibold rounded-full inline-block ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'}`}
      style={{ background: c.bg, color: c.color }}>
      {c.icon} {c.label}
    </span>
  )
}

function Pill({ text }: { text: string }) {
  return <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>{text}</span>
}

function ScoreDot({ score }: { score: number }) {
  const c = score >= 75 ? '#1A7A4A' : score >= 55 ? '#8A5700' : '#C0341D'
  const bg = score >= 75 ? '#EDFAF3' : score >= 55 ? '#FEF7EA' : '#FEF0ED'
  return (
    <div className="w-10 h-10 rounded-full border-2 flex-shrink-0 flex items-center justify-center font-bold text-sm"
      style={{ borderColor: c + '60', background: bg, color: c }}>{score}</div>
  )
}

function Card({ children, src, urgent }: { children: React.ReactNode; src: SrcKey; urgent?: boolean }) {
  const c = SRC[src]
  return (
    <div className="bg-white rounded-xl border overflow-hidden hover:shadow-sm transition-shadow"
      style={{ borderColor: urgent ? c.color + '50' : 'var(--sgc-gray-border)' }}>
      <div className="h-0.5" style={{ background: c.color }} />
      <div className="p-4">{children}</div>
    </div>
  )
}

function ExtBtn({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border"
      style={{ color: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy-mid)', background: 'var(--sgc-navy-pale)' }}>
      {label} ↗
    </a>
  )
}

function SectionHead({ src, count }: { src: SrcKey; count: number }) {
  const c = SRC[src]
  return (
    <div className="flex items-center gap-3 mb-3 pb-2 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <span className="text-2xl">{c.icon}</span>
      <div className="flex-1">
        <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>{c.label}</div>
        <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{c.desc}</div>
      </div>
      <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: c.bg, color: c.color }}>
        {count} {count === 1 ? 'result' : 'results'}
      </span>
    </div>
  )
}

export default function DealHunter() {
  const [searchType, setSearchType] = useState<'national' | 'state' | 'city' | 'zip'>('national')
  const [stateInput, setStateInput] = useState('')
  const [cityInput, setCityInput] = useState('')
  const [zipInput, setZipInput] = useState('')
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [sources, setSources] = useState(DEFAULT_SOURCES)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DealHuntResult | null>(null)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [stateDropdown, setStateDropdown] = useState(false)

  const toggleState = (s: string) => setSelectedStates(prev =>
    prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
  )

  const buildOpts = () => {
    let states: string[] = []
    let city: string | undefined
    let zip: string | undefined

    if (searchType === 'national') {
      states = ['ALL']
    } else if (searchType === 'state') {
      states = selectedStates.length > 0 ? selectedStates : [stateOf(stateInput)].filter(Boolean)
    } else if (searchType === 'city') {
      city = cityOf(cityInput) || cityInput
      const st = stateOf(cityInput)
      states = st ? [st] : []
    } else if (searchType === 'zip') {
      zip = zipOf(zipInput) || zipInput
      const st = stateOf(zipInput)
      states = st ? [st] : []
    }

    return { states, city, zip, sources }
  }

  const handleHunt = async () => {
    setLoading(true); setResult(null); setFilter('all')
    const msgs = [
      'Searching federal bankruptcy courts nationwide...',
      'Fetching HUD government listings...',
      'Scanning auction platforms...',
      'Querying federal probate filings...',
      'Pulling USDA rural data...',
      'Analyzing tax delinquency records...',
      'Building government REO portal map...',
      'Compiling all leads...',
    ]
    let mi = 0
    const iv = setInterval(() => { setLoadingMsg(msgs[mi++ % msgs.length]) }, 1500)
    try {
      const r = await runDealHunt(buildOpts())
      setResult(r)
    } finally {
      clearInterval(iv); setLoading(false); setLoadingMsg('')
    }
  }

  const counts = result ? {
    bankruptcy: result.bankruptcy.length, hud: result.hud.length,
    auction: result.auction.length, usda: result.usda.length,
    probate: result.probate.length, taxDelinquent: result.taxDelinquent.length,
    govReo: result.govReo.length,
  } : null

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0

  const FILTER_TABS = [
    { k: 'all',          l: 'All',           n: total },
    { k: 'bankruptcy',   l: '⚖️ Bankruptcy', n: counts?.bankruptcy || 0 },
    { k: 'hud',          l: '🏛️ HUD',        n: counts?.hud || 0 },
    { k: 'govReo',       l: '🏦 Gov REO',    n: counts?.govReo || 0 },
    { k: 'auction',      l: '🔨 Auctions',   n: counts?.auction || 0 },
    { k: 'probate',      l: '📋 Probate',    n: counts?.probate || 0 },
    { k: 'taxDelinquent',l: '💸 Tax',        n: counts?.taxDelinquent || 0 },
    { k: 'usda',         l: '🌾 USDA',       n: counts?.usda || 0 },
  ].filter(t => t.k === 'all' || t.n > 0)

  const ic = `w-full rounded-lg border text-sm px-3 py-2 outline-none transition-colors bg-white text-gray-900 placeholder:text-gray-400`
    + ` border-[var(--sgc-gray-border)] focus:border-[var(--sgc-navy)] focus:ring-1 focus:ring-[var(--sgc-navy)]/20`

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* ── LEFT CONFIG ── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>🎯 Deal Hunter</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Federal courts · Government portals · Auctions</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* SEARCH SCOPE */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>Search Scope</div>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                { k: 'national', l: '🌎 National', sub: 'All 50 states' },
                { k: 'state',    l: '🗺️ State(s)',  sub: 'One or more states' },
                { k: 'city',     l: '📍 City',      sub: 'City + state' },
                { k: 'zip',      l: '#️⃣ Zip Code',   sub: '5-digit zip' },
              ] as const).map(o => (
                <button key={o.k} onClick={() => setSearchType(o.k)}
                  className="rounded-lg border p-2 text-left cursor-pointer transition-all"
                  style={searchType === o.k
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-black)' }}>
                  <div className="text-xs font-semibold">{o.l}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{o.sub}</div>
                </button>
              ))}
            </div>

            {/* National info */}
            {searchType === 'national' && (
              <div className="mt-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
                🌎 Searches all federal court districts + all government portals across all 50 states simultaneously.
              </div>
            )}

            {/* State picker */}
            {searchType === 'state' && (
              <div className="mt-2">
                <div className="relative">
                  <button onClick={() => setStateDropdown(d => !d)}
                    className="w-full text-left rounded-lg border px-3 py-2 text-sm cursor-pointer"
                    style={{ borderColor: 'var(--sgc-gray-border)', background: 'white', color: 'var(--sgc-black)' }}>
                    {selectedStates.length === 0
                      ? 'Select states...'
                      : selectedStates.length <= 3
                        ? selectedStates.join(', ')
                        : `${selectedStates.slice(0, 3).join(', ')} +${selectedStates.length - 3}`
                    } ▾
                  </button>
                  {stateDropdown && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-lg overflow-y-auto"
                      style={{ borderColor: 'var(--sgc-gray-border)', maxHeight: 220 }}>
                      <div className="p-2 grid grid-cols-3 gap-1">
                        {Object.entries(ALL_STATES).map(([abbr, name]) => (
                          <button key={abbr} onClick={() => toggleState(abbr)}
                            className="text-xs px-2 py-1 rounded text-left cursor-pointer transition-colors"
                            style={selectedStates.includes(abbr)
                              ? { background: 'var(--sgc-navy)', color: 'white' }
                              : { background: 'var(--sgc-gray-light)', color: 'var(--sgc-black)' }}>
                            <span className="font-bold">{abbr}</span>
                          </button>
                        ))}
                      </div>
                      <div className="px-2 pb-2 flex gap-2">
                        <button onClick={() => setSelectedStates(Object.keys(ALL_STATES))}
                          className="text-xs px-2 py-1 rounded cursor-pointer" style={{ background: 'var(--sgc-navy)', color: 'white' }}>All</button>
                        <button onClick={() => setSelectedStates([])}
                          className="text-xs px-2 py-1 rounded cursor-pointer" style={{ background: 'var(--sgc-gray-border)', color: 'var(--sgc-black)' }}>Clear</button>
                        <button onClick={() => setStateDropdown(false)}
                          className="text-xs px-2 py-1 rounded cursor-pointer ml-auto" style={{ background: 'var(--sgc-navy)', color: 'white' }}>Done</button>
                      </div>
                    </div>
                  )}
                </div>
                {selectedStates.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {selectedStates.map(s => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer font-semibold"
                        style={{ background: 'var(--sgc-navy)', color: 'white' }}
                        onClick={() => toggleState(s)}>
                        {s} ✕
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {searchType === 'city' && (
              <div className="mt-2">
                <input className={ic} value={cityInput} onChange={e => setCityInput(e.target.value)}
                  placeholder="Norfolk, VA  ·  Austin, TX  ·  Miami, FL"
                  onKeyDown={e => e.key === 'Enter' && handleHunt()} />
              </div>
            )}

            {searchType === 'zip' && (
              <div className="mt-2">
                <input className={ic} value={zipInput} onChange={e => setZipInput(e.target.value)}
                  placeholder="23501  ·  77002  ·  33101"
                  onKeyDown={e => e.key === 'Enter' && handleHunt()} />
              </div>
            )}
          </div>

          {/* DATA SOURCES */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>Data Sources</div>
            <div className="space-y-1.5">
              {(Object.entries(SRC) as [SrcKey, typeof SRC[SrcKey]][]).map(([key, cfg]) => (
                <label key={key} className="flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all"
                  style={{
                    borderColor: sources[key] ? cfg.color + '40' : 'var(--sgc-gray-border)',
                    background: sources[key] ? cfg.bg : 'white',
                  }}>
                  <input type="checkbox" checked={sources[key]}
                    onChange={e => setSources(s => ({ ...s, [key]: e.target.checked }))}
                    className="mt-0.5 flex-shrink-0" style={{ accentColor: cfg.color }} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold" style={{ color: sources[key] ? cfg.color : 'var(--sgc-black)' }}>
                      {cfg.icon} {cfg.label}
                    </div>
                    <div className="text-[10px] leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>{cfg.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setSources(Object.fromEntries(Object.keys(SRC).map(k => [k, true])) as typeof sources)}
                className="text-xs px-2 py-1 rounded cursor-pointer" style={{ background: 'var(--sgc-navy)', color: 'white' }}>All On</button>
              <button onClick={() => setSources(Object.fromEntries(Object.keys(SRC).map(k => [k, false])) as typeof sources)}
                className="text-xs px-2 py-1 rounded cursor-pointer" style={{ background: 'var(--sgc-gray-border)', color: 'var(--sgc-black)' }}>All Off</button>
            </div>
          </div>
        </div>

        {/* HUNT BUTTON */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <button onClick={handleHunt} disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer transition-all"
            style={{ background: loading ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)' }}>
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin inline-block" />
                  Hunting Deals...
                </span>
              : `⬡ Hunt ${searchType === 'national' ? 'Nationwide' : 'for Deals'}`}
          </button>
          {loading && <div className="text-[11px] text-center mt-2" style={{ color: 'var(--sgc-gray-mid)' }}>{loadingMsg}</div>}
        </div>
      </div>

      {/* ── RIGHT RESULTS ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Filter tabs */}
        {result && total > 0 && (
          <div className="flex items-center gap-1.5 px-5 py-2.5 border-b flex-shrink-0 flex-wrap bg-white"
            style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <span className="text-xs font-semibold mr-1" style={{ color: 'var(--sgc-gray-mid)' }}>Filter:</span>
            {FILTER_TABS.map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-all"
                style={filter === f.k
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {f.l}
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={filter === f.k ? { background: 'rgba(255,255,255,0.25)', color: 'white' } : { background: 'var(--sgc-gray-light)' }}>
                  {f.n}
                </span>
              </button>
            ))}
            <div className="ml-auto text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
              {result.isNational ? '🌎 National' : result.searchedStates.join(', ')}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">

          {/* IDLE */}
          {!loading && !result && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 max-w-3xl mx-auto">
              <svg viewBox="0 0 120 100" className="w-28 h-24 mb-6 opacity-15">
                <polyline points="60,8 108,44 108,92 12,92 12,44" fill="none" stroke="var(--sgc-navy)" strokeWidth="3.5" strokeLinejoin="round"/>
                <line x1="60" y1="8" x2="12" y2="44" stroke="var(--sgc-navy)" strokeWidth="3.5" strokeLinecap="round"/>
                <rect x="44" y="64" width="32" height="28" rx="1" fill="none" stroke="var(--sgc-navy)" strokeWidth="3"/>
                <circle cx="88" cy="26" r="16" fill="none" stroke="#C0341D" strokeWidth="3.5"/>
                <line x1="100" y1="38" x2="112" y2="50" stroke="#C0341D" strokeWidth="3.5" strokeLinecap="round"/>
              </svg>
              <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Multi-Source Deal Hunter</h3>
              <p className="text-sm mb-6 max-w-lg" style={{ color: 'var(--sgc-gray-mid)' }}>
                Searches federal bankruptcy courts, HUD government listings, live auction platforms, probate filings, USDA rural properties, and tax delinquent open data — all in parallel. Select a scope and hunt.
              </p>
              <div className="grid grid-cols-2 gap-3 w-full max-w-xl text-left">
                {(Object.entries(SRC) as [SrcKey, typeof SRC[SrcKey]][]).map(([k, c]) => (
                  <div key={k} className="rounded-xl border p-3 bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="text-sm font-semibold mb-0.5" style={{ color: c.color }}>{c.icon} {c.label}</div>
                    <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{c.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LOADING */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-12 h-12 border-2 rounded-full spin mb-5" style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }} />
              <div className="text-base font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>{loadingMsg}</div>
              <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                Scanning {Object.values(sources).filter(Boolean).length} sources
                {searchType === 'national' ? ' · All 50 states' : ''}
              </div>
            </div>
          )}

          {/* RESULTS */}
          {result && !loading && (
            <div className="space-y-6">

              {/* Summary */}
              {total === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🔍</div>
                  <div className="text-sm font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>No results found</div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Try national scope or enable more sources</div>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { l: 'Total Leads', v: String(total), c: 'var(--sgc-navy)' },
                    { l: 'Bankruptcy', v: String(result.bankruptcy.length), c: '#534AB7' },
                    { l: 'Gov / HUD', v: String(result.hud.length + result.govReo.length), c: '#185FA5' },
                    { l: 'Auctions', v: String(result.auction.length), c: '#C0341D' },
                  ].map(s => (
                    <div key={s.l} className="bg-white rounded-xl border p-3 text-center" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                      <div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Gov REO Portals */}
              {(filter === 'all' || filter === 'govReo') && result.govReo.length > 0 && (
                <div>
                  <SectionHead src="govReo" count={result.govReo.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.govReo.map((p: GovREOPortal) => (
                      <Card key={p.id} src="govReo">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <Badge s="govReo" small />
                            <div className="text-sm font-bold mt-1.5" style={{ color: 'var(--sgc-black)' }}>{p.name}</div>
                            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{p.description}</div>
                          </div>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                            style={{ background: '#EDFAF3', color: '#1A7A4A' }}>{p.discount}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {p.signals.map((s, i) => <Pill key={i} text={s} />)}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>📍 {p.coverageStates.join(', ')}</span>
                          <ExtBtn href={p.url} label={`Open ${p.name}`} />
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Bankruptcy */}
              {(filter === 'all' || filter === 'bankruptcy') && result.bankruptcy.length > 0 && (
                <div>
                  <SectionHead src="bankruptcy" count={result.bankruptcy.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.bankruptcy.map(b => (
                      <Card key={b.id} src="bankruptcy" urgent={b.distressScore >= 75}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <Badge s="bankruptcy" small />
                            <div className="text-sm font-bold mt-1.5 mb-0.5" style={{ color: 'var(--sgc-black)' }}>{b.caseName}</div>
                            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                              Case #{b.caseNumber} · {b.court || b.state}
                              {b.dateFiled && ` · Filed ${new Date(b.dateFiled).toLocaleDateString()}`}
                            </div>
                          </div>
                          <ScoreDot score={b.distressScore} />
                        </div>
                        <div className="flex gap-3 mb-2 text-center">
                          {[
                            { l: 'Chapter', v: `Ch. ${b.chapter}`, c: '#534AB7' },
                            { l: 'Days Open', v: `${b.daysOpen}d`, c: b.daysOpen < 30 ? 'var(--sgc-danger)' : 'var(--sgc-warn)' },
                            { l: 'State', v: b.state || '—', c: 'var(--sgc-navy)' },
                          ].map(m => (
                            <div key={m.l} className="rounded-lg p-2 flex-1" style={{ background: 'var(--sgc-gray-light)' }}>
                              <div className="text-xs font-bold" style={{ color: m.c }}>{m.v}</div>
                              <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {b.signals.slice(0, 3).map((s, i) => <Pill key={i} text={s} />)}
                        </div>
                        <div className="flex gap-2">
                          <ExtBtn href={b.clUrl} label="CourtListener" />
                          <ExtBtn href="https://pacer.uscourts.gov" label="PACER" />
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* HUD */}
              {(filter === 'all' || filter === 'hud') && result.hud.length > 0 && (
                <div>
                  <SectionHead src="hud" count={result.hud.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.hud.map(h => (
                      <Card key={h.id} src="hud">
                        <Badge s="hud" small />
                        <div className="text-sm font-bold mt-1.5 mb-0.5" style={{ color: 'var(--sgc-black)' }}>
                          {h.addr || `HUD Property — ${ALL_STATES[h.state] || h.state}`}
                        </div>
                        <div className="text-xs mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>
                          {h.city && `${h.city}, `}{h.state} {h.zip}
                          {h.beds > 0 && ` · ${h.beds}bd/${h.baths}ba`}
                          {h.sqft > 0 && ` · ${h.sqft.toLocaleString()} sqft`}
                        </div>
                        {h.price > 0 && <div className="text-sm font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>{fmt$(h.price)}</div>}
                        <div className="flex flex-wrap gap-1 mb-3">
                          {h.signals.map((s, i) => <Pill key={i} text={s} />)}
                        </div>
                        <ExtBtn href={h.listingUrl || 'https://www.hudhomestore.gov'} label="HUD HomeStore" />
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Auctions */}
              {(filter === 'all' || filter === 'auction') && result.auction.length > 0 && (
                <div>
                  <SectionHead src="auction" count={result.auction.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.auction.map(a => (
                      <Card key={a.id} src="auction" urgent={a.daysToAuction != null && a.daysToAuction <= 7}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#FCEBEB', color: '#C0341D' }}>
                                🔨 {a.platform || 'Auction'}
                              </span>
                              {a.daysToAuction != null && a.daysToAuction <= 7 && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#C0341D', color: 'white' }}>
                                  ⚡ {a.daysToAuction}d TO AUCTION
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-bold mb-0.5" style={{ color: 'var(--sgc-black)' }}>{a.addr}</div>
                            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                              {a.city && `${a.city}, `}{a.state}
                              {a.beds > 0 && ` · ${a.beds}bd`}
                              {a.auctionDate && ` · Auction: ${new Date(a.auctionDate).toLocaleDateString()}`}
                            </div>
                          </div>
                          {a.openingBid && (
                            <div className="text-right flex-shrink-0">
                              <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>Opening bid</div>
                              <div className="text-sm font-bold" style={{ color: 'var(--sgc-danger)' }}>{fmt$(a.openingBid)}</div>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {a.signals.map((s, i) => <Pill key={i} text={s} />)}
                        </div>
                        <ExtBtn href={a.url} label={`View on ${a.platform || 'Auction.com'}`} />
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Probate */}
              {(filter === 'all' || filter === 'probate') && result.probate.length > 0 && (
                <div>
                  <SectionHead src="probate" count={result.probate.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.probate.map(p => (
                      <Card key={p.id} src="probate">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <Badge s="probate" small />
                            <div className="text-sm font-bold mt-1.5 mb-0.5" style={{ color: 'var(--sgc-black)' }}>{p.caseName}</div>
                            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                              #{p.caseNumber} · {p.court || p.state}
                              {p.dateFiled && ` · ${new Date(p.dateFiled).toLocaleDateString()}`}
                            </div>
                          </div>
                          <ScoreDot score={p.distressScore} />
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {p.signals.map((s, i) => <Pill key={i} text={s} />)}
                        </div>
                        <ExtBtn href={p.clUrl} label="View Filing" />
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* USDA */}
              {(filter === 'all' || filter === 'usda') && result.usda.length > 0 && (
                <div>
                  <SectionHead src="usda" count={result.usda.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.usda.map(u => (
                      <Card key={u.id} src="usda">
                        <Badge s="usda" small />
                        <div className="text-sm font-bold mt-1.5 mb-0.5" style={{ color: 'var(--sgc-black)' }}>
                          {u.addr || `USDA Property — ${ALL_STATES[u.state] || u.state}`}
                        </div>
                        <div className="text-xs mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>
                          {u.city && `${u.city}, `}{u.state} {u.zip}
                          {u.beds > 0 && ` · ${u.beds} beds`}
                          {u.acres && u.acres > 0 && ` · ${u.acres} acres`}
                        </div>
                        {u.price > 0 && <div className="text-sm font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>{fmt$(u.price)}</div>}
                        <div className="flex flex-wrap gap-1 mb-3">
                          {u.signals.map((s, i) => <Pill key={i} text={s} />)}
                        </div>
                        <ExtBtn href={u.listingUrl} label="USDA Portal" />
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Tax Delinquent */}
              {(filter === 'all' || filter === 'taxDelinquent') && result.taxDelinquent.length > 0 && (
                <div>
                  <SectionHead src="taxDelinquent" count={result.taxDelinquent.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.taxDelinquent.map(t => (
                      <Card key={t.id} src="taxDelinquent" urgent={t.distressScore >= 75}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <Badge s="taxDelinquent" small />
                            <div className="text-sm font-bold mt-1.5 mb-0.5" style={{ color: 'var(--sgc-black)' }}>{t.addr}</div>
                            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                              {t.city && `${t.city}, `}{t.state} · {t.county} County
                              {t.ownerName && ` · ${t.ownerName}`}
                            </div>
                          </div>
                          <ScoreDot score={t.distressScore} />
                        </div>
                        <div className="flex gap-2 mb-2 text-center">
                          {[
                            { l: 'Tax Owed', v: fmt$(t.taxOwed), c: 'var(--sgc-danger)' },
                            { l: 'Yrs Delinquent', v: String(t.yearsDelinquent), c: 'var(--sgc-warn)' },
                            { l: 'Est. Price', v: t.price > 0 ? fmt$(t.price) : '—', c: 'var(--sgc-navy)' },
                          ].map(m => (
                            <div key={m.l} className="rounded-lg p-2 flex-1" style={{ background: 'var(--sgc-gray-light)' }}>
                              <div className="text-xs font-bold" style={{ color: m.c }}>{m.v}</div>
                              <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {t.signals.map((s, i) => <Pill key={i} text={s} />)}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
