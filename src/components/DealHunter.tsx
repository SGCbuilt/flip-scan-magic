import { useState } from 'react'
import {
  runDealHunt, DealHuntResult, BankruptcyFiling,
  HUDListing, AuctionListing, USDAListing, ProbateLead, TaxDelinquentLead
} from '../lib/dealHunter'
import { SearchParams } from '../types'

interface Props { params: SearchParams }

const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'

const SOURCE_CONFIG = {
  bankruptcy:    { label: 'Bankruptcy Filings', icon: '⚖️', color: '#7F77DD', bg: '#EEEDFE', desc: 'Federal Ch.7/13 — CourtListener free API' },
  hud:           { label: 'HUD HomeStore',       icon: '🏛️', color: '#185FA5', bg: '#E6F1FB', desc: 'FHA foreclosures — government portal' },
  auction:       { label: 'Auction.com',          icon: '🔨', color: '#C0341D', bg: '#FCEBEB', desc: 'REO & courthouse step auctions' },
  usda:          { label: 'USDA Rural',           icon: '🌾', color: '#3B6D11', bg: '#EAF3DE', desc: 'Rural Development foreclosures — data.gov' },
  probate:       { label: 'Probate / Estate',     icon: '📋', color: '#854F0B', bg: '#FAEEDA', desc: 'Inherited property leads — CourtListener' },
  taxDelinquent: { label: 'Tax Delinquent',       icon: '💸', color: '#993C1D', bg: '#FAECE7', desc: 'County tax delinquent open data' },
}

function SourceToggle({
  id, enabled, onChange
}: { id: keyof typeof SOURCE_CONFIG; enabled: boolean; onChange: (v: boolean) => void }) {
  const cfg = SOURCE_CONFIG[id]
  return (
    <label className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all"
      style={{
        borderColor: enabled ? cfg.color + '50' : 'var(--sgc-gray-border)',
        background: enabled ? cfg.bg : 'white',
      }}>
      <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)}
        className="mt-0.5 flex-shrink-0" style={{ accentColor: cfg.color }} />
      <div>
        <div className="text-sm font-semibold" style={{ color: enabled ? cfg.color : 'var(--sgc-black)' }}>
          {cfg.icon} {cfg.label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{cfg.desc}</div>
      </div>
    </label>
  )
}

function LeadCard({ children, source, urgent }: { children: React.ReactNode; source: keyof typeof SOURCE_CONFIG; urgent?: boolean }) {
  const cfg = SOURCE_CONFIG[source]
  return (
    <div className="bg-white rounded-xl border overflow-hidden transition-all hover:shadow-sm"
      style={{ borderColor: urgent ? cfg.color + '60' : 'var(--sgc-gray-border)' }}>
      <div className="h-1" style={{ background: cfg.color }} />
      <div className="p-4">{children}</div>
    </div>
  )
}

function SignalPill({ text }: { text: string }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full inline-block"
      style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
      {text}
    </span>
  )
}

function SourceBadge({ source }: { source: keyof typeof SOURCE_CONFIG }) {
  const cfg = SOURCE_CONFIG[source]
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function ScoreRing({ score, size = 40 }: { score: number; size?: number }) {
  const color = score >= 75 ? '#1A7A4A' : score >= 55 ? '#8A5700' : '#C0341D'
  const bg = score >= 75 ? '#EDFAF3' : score >= 55 ? '#FEF7EA' : '#FEF0ED'
  return (
    <div className="flex-shrink-0 rounded-full flex flex-col items-center justify-center border-2 text-center"
      style={{ width: size, height: size, borderColor: color + '60', background: bg }}>
      <span className="font-bold leading-none" style={{ fontSize: size * 0.3, color }}>{score}</span>
    </div>
  )
}

function StatBadge({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className="text-xs font-bold" style={{ color: color || 'var(--sgc-navy)' }}>{value}</div>
      <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
    </div>
  )
}

// Section header
function SectionHeader({ source, count }: { source: keyof typeof SOURCE_CONFIG; count: number }) {
  const cfg = SOURCE_CONFIG[source]
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-lg">{cfg.icon}</span>
      <div>
        <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>{cfg.label}</div>
        <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{cfg.desc}</div>
      </div>
      <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full"
        style={{ background: cfg.bg, color: cfg.color }}>
        {count} found
      </span>
    </div>
  )
}

// External link button
function ExtLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors"
      style={{ color: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy-mid)', background: 'var(--sgc-navy-pale)' }}
      onClick={e => e.stopPropagation()}>
      {label} ↗
    </a>
  )
}

export default function DealHunter({ params }: Props) {
  const [sources, setSources] = useState({
    bankruptcy: true, hud: true, auction: true,
    usda: false, probate: true, taxDelinquent: false,
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DealHuntResult | null>(null)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [filter, setFilter] = useState<string>('all')

  // Parse location from search params
  const parseLocation = () => {
    const q = params.locationQuery.trim()
    const isZip = /^\d{5}$/.test(q)
    if (isZip) return { state: '', zip: q, city: undefined }
    const parts = q.split(',').map(s => s.trim())
    const city = parts[0]
    const state = parts[1] || 'VA'
    return { state: state.length > 2 ? state.slice(0, 2) : state, city, zip: undefined }
  }

  const handleHunt = async () => {
    const activeSources = Object.values(sources).filter(Boolean).length
    if (!activeSources) return
    if (!params.locationQuery.trim()) return

    setLoading(true); setResult(null)
    const { state, city, zip } = parseLocation()

    const msgs = [
      'Searching federal bankruptcy courts...',
      'Fetching HUD government listings...',
      'Scanning auction.com...',
      'Checking probate filings...',
      'Pulling USDA rural data...',
      'Analyzing all leads...',
    ]
    let mi = 0
    const interval = setInterval(() => {
      setLoadingMsg(msgs[mi % msgs.length])
      mi++
    }, 1200)

    try {
      const r = await runDealHunt({ state, city, zip, sources })
      setResult(r)
    } finally {
      clearInterval(interval)
      setLoading(false)
      setLoadingMsg('')
    }
  }

  const totalCount = result
    ? result.bankruptcy.length + result.hud.length + result.auction.length +
      result.usda.length + result.probate.length + result.taxDelinquent.length
    : 0

  const FILTERS = [
    { key: 'all',         label: 'All Leads',     count: totalCount },
    { key: 'bankruptcy',  label: '⚖️ Bankruptcy', count: result?.bankruptcy.length || 0 },
    { key: 'hud',         label: '🏛️ HUD',        count: result?.hud.length || 0 },
    { key: 'auction',     label: '🔨 Auctions',   count: result?.auction.length || 0 },
    { key: 'probate',     label: '📋 Probate',    count: result?.probate.length || 0 },
    { key: 'usda',        label: '🌾 USDA',       count: result?.usda.length || 0 },
    { key: 'taxDelinquent', label: '💸 Tax',      count: result?.taxDelinquent.length || 0 },
  ].filter(f => f.key === 'all' || f.count > 0)

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* LEFT: Config panel */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r" style={{ background: 'white', borderColor: 'var(--sgc-gray-border)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="text-sm font-bold mb-0.5" style={{ color: 'var(--sgc-navy)' }}>Deal Hunter</div>
          <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
            {params.locationQuery || 'Set location in search'} · Federal + public sources
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>
            Data Sources
          </div>
          {(Object.keys(sources) as Array<keyof typeof sources>).map(key => (
            <SourceToggle key={key} id={key} enabled={sources[key]}
              onChange={v => setSources(s => ({ ...s, [key]: v }))} />
          ))}
        </div>

        <div className="p-4 border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <button onClick={handleHunt} disabled={loading || !params.locationQuery.trim()}
            className="w-full py-3 rounded-lg text-sm font-bold text-white transition-all border-none cursor-pointer"
            style={{ background: loading ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)' }}>
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin inline-block" />
                  Hunting...
                </span>
              : `⬡ Hunt for Deals`}
          </button>
          {loading && (
            <div className="text-xs text-center mt-2" style={{ color: 'var(--sgc-gray-mid)' }}>{loadingMsg}</div>
          )}
        </div>
      </div>

      {/* RIGHT: Results */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Filter bar */}
        {result && totalCount > 0 && (
          <div className="flex items-center gap-2 px-5 py-3 border-b flex-shrink-0 flex-wrap"
            style={{ background: 'white', borderColor: 'var(--sgc-gray-border)' }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border cursor-pointer"
                style={filter === f.key
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {f.label}
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={filter === f.key ? { background: 'rgba(255,255,255,0.25)', color: 'white' } : { background: 'var(--sgc-gray-light)' }}>
                  {f.count}
                </span>
              </button>
            ))}

            {result.errors.length > 0 && (
              <span className="ml-auto text-xs px-2 py-1 rounded-lg cursor-help"
                style={{ background: '#FEF7EA', color: '#8A5700' }}
                title={result.errors.join('\n')}>
                ⚠ {result.errors.length} warning{result.errors.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">

          {/* Idle */}
          {!loading && !result && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <svg viewBox="0 0 100 100" className="w-24 h-24 mb-6 opacity-15">
                <polyline points="50,8 90,38 90,88 10,88 10,38" fill="none" stroke="var(--sgc-navy)" strokeWidth="4" strokeLinejoin="round"/>
                <line x1="50" y1="8" x2="10" y2="38" stroke="var(--sgc-navy)" strokeWidth="4" strokeLinecap="round"/>
                <rect x="36" y="62" width="28" height="26" rx="1" fill="none" stroke="var(--sgc-navy)" strokeWidth="3.5"/>
                <circle cx="72" cy="28" r="14" fill="none" stroke="#C0341D" strokeWidth="3.5"/>
                <line x1="82" y1="38" x2="92" y2="48" stroke="#C0341D" strokeWidth="3.5" strokeLinecap="round"/>
              </svg>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Multi-Source Deal Hunter</h3>
              <p className="text-sm mb-6 max-w-md" style={{ color: 'var(--sgc-gray-mid)' }}>
                Searches federal bankruptcy courts, HUD government listings, live auctions, USDA rural properties, probate filings, and tax delinquent data — all free public sources — simultaneously.
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-lg w-full text-left">
                {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => (
                  <div key={key} className="rounded-xl border p-3" style={{ background: 'white', borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="text-sm font-semibold mb-0.5" style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</div>
                    <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{cfg.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-12 h-12 border-2 rounded-full spin mb-4"
                style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }} />
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--sgc-navy)' }}>{loadingMsg}</div>
              <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                Scanning {Object.values(sources).filter(Boolean).length} free federal & public sources
              </div>
            </div>
          )}

          {/* Results */}
          {result && totalCount === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--sgc-navy)' }}>No leads found</div>
              <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                Try a different location or enable more sources.<br/>
                Some sources only have data for specific counties.
              </div>
              {result.errors.length > 0 && (
                <div className="mt-3 text-xs max-w-sm" style={{ color: 'var(--sgc-danger)' }}>
                  {result.errors.join(' · ')}
                </div>
              )}
            </div>
          )}

          {result && totalCount > 0 && !loading && (
            <div className="space-y-6">

              {/* Summary strip */}
              <div className="grid grid-cols-6 gap-3">
                {[
                  { l: 'Total Leads', v: String(totalCount), c: 'var(--sgc-navy)' },
                  { l: 'Bankruptcy', v: String(result.bankruptcy.length), c: '#7F77DD' },
                  { l: 'HUD Gov', v: String(result.hud.length), c: '#185FA5' },
                  { l: 'Auctions', v: String(result.auction.length), c: '#C0341D' },
                  { l: 'Probate', v: String(result.probate.length), c: '#854F0B' },
                  { l: 'USDA Rural', v: String(result.usda.length), c: '#3B6D11' },
                ].map(s => (
                  <div key={s.l} className="rounded-xl border p-3 text-center" style={{ background: 'white', borderColor: 'var(--sgc-gray-border)' }}>
                    <div className="text-xl font-bold" style={{ color: s.c }}>{s.v}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Bankruptcy */}
              {(filter === 'all' || filter === 'bankruptcy') && result.bankruptcy.length > 0 && (
                <div>
                  <SectionHeader source="bankruptcy" count={result.bankruptcy.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.bankruptcy.map(b => (
                      <LeadCard key={b.id} source="bankruptcy" urgent={b.distressScore >= 75}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <SourceBadge source="bankruptcy" />
                            <div className="text-sm font-bold mt-2 mb-0.5" style={{ color: 'var(--sgc-black)' }}>
                              {b.caseName || 'Bankruptcy Filing'}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                              Case #{b.caseNumber} · {b.court} · Filed {new Date(b.dateFiled).toLocaleDateString()}
                            </div>
                          </div>
                          <ScoreRing score={b.distressScore} />
                        </div>
                        <div className="flex gap-2 mb-3 flex-wrap">
                          <StatBadge label="Chapter" value={`Ch. ${b.chapter}`} color="#7F77DD" />
                          <StatBadge label="Days Open" value={`${b.daysOpen}d`} color={b.daysOpen < 60 ? 'var(--sgc-danger)' : 'var(--sgc-warn)'} />
                          <StatBadge label="Filing Type" value={b.filingType} />
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {b.signals.map((s, i) => <SignalPill key={i} text={s} />)}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <ExtLink
                            href={`https://www.courtlistener.com/?q=${encodeURIComponent(b.caseName)}&type=r&order_by=score+desc`}
                            label="CourtListener" />
                          <ExtLink
                            href={`https://pacer.uscourts.gov/search`}
                            label="PACER" />
                        </div>
                      </LeadCard>
                    ))}
                  </div>
                </div>
              )}

              {/* HUD */}
              {(filter === 'all' || filter === 'hud') && result.hud.length > 0 && (
                <div>
                  <SectionHeader source="hud" count={result.hud.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.hud.map(h => (
                      <LeadCard key={h.id} source="hud">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <SourceBadge source="hud" />
                            <div className="text-sm font-bold mt-2 mb-0.5" style={{ color: 'var(--sgc-black)' }}>
                              {h.addr || 'HUD Property'}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                              {h.city && `${h.city}, `}{h.state} {h.zip}
                              {h.beds > 0 && ` · ${h.beds}bd/${h.baths}ba`}
                            </div>
                          </div>
                          {h.price > 0 && (
                            <div className="text-right">
                              <div className="text-base font-bold" style={{ color: 'var(--sgc-navy)' }}>{fmt$(h.price)}</div>
                              {h.dom > 0 && <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{h.dom}d listed</div>}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {h.signals.map((s, i) => <SignalPill key={i} text={s} />)}
                        </div>
                        <ExtLink
                          href={`https://www.hudhomestore.gov/Home/Index.aspx`}
                          label="View on HUD HomeStore" />
                      </LeadCard>
                    ))}
                  </div>
                </div>
              )}

              {/* Auctions */}
              {(filter === 'all' || filter === 'auction') && result.auction.length > 0 && (
                <div>
                  <SectionHeader source="auction" count={result.auction.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.auction.map(a => (
                      <LeadCard key={a.id} source="auction" urgent={a.daysToAuction != null && a.daysToAuction <= 7}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <SourceBadge source="auction" />
                            {a.daysToAuction != null && a.daysToAuction <= 7 && (
                              <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full"
                                style={{ background: '#FCEBEB', color: '#C0341D' }}>
                                AUCTION IN {a.daysToAuction}d
                              </span>
                            )}
                            <div className="text-sm font-bold mt-2 mb-0.5" style={{ color: 'var(--sgc-black)' }}>
                              {a.addr || 'Auction Property'}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                              {a.city && `${a.city}, `}{a.state}
                              {a.beds > 0 && ` · ${a.beds}bd/${a.baths}ba`}
                              {a.auctionDate && ` · Auction: ${new Date(a.auctionDate).toLocaleDateString()}`}
                            </div>
                          </div>
                          {a.openingBid && (
                            <div className="text-right">
                              <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>Opening bid</div>
                              <div className="text-base font-bold" style={{ color: 'var(--sgc-danger)' }}>{fmt$(a.openingBid)}</div>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {a.signals.map((s, i) => <SignalPill key={i} text={s} />)}
                        </div>
                        <ExtLink href={a.url} label="View on Auction.com" />
                      </LeadCard>
                    ))}
                  </div>
                </div>
              )}

              {/* Probate */}
              {(filter === 'all' || filter === 'probate') && result.probate.length > 0 && (
                <div>
                  <SectionHeader source="probate" count={result.probate.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.probate.map(p => (
                      <LeadCard key={p.id} source="probate">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <SourceBadge source="probate" />
                            <div className="text-sm font-bold mt-2 mb-0.5" style={{ color: 'var(--sgc-black)' }}>
                              {p.caseName}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                              Case #{p.caseNumber} · {p.court} · Filed {new Date(p.dateFiled).toLocaleDateString()}
                            </div>
                          </div>
                          <ScoreRing score={p.distressScore} size={36} />
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {p.signals.map((s, i) => <SignalPill key={i} text={s} />)}
                        </div>
                        <ExtLink
                          href={`https://www.courtlistener.com/?q=${encodeURIComponent(p.caseName)}&type=r`}
                          label="View Filing" />
                      </LeadCard>
                    ))}
                  </div>
                </div>
              )}

              {/* USDA */}
              {(filter === 'all' || filter === 'usda') && result.usda.length > 0 && (
                <div>
                  <SectionHeader source="usda" count={result.usda.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.usda.map(u => (
                      <LeadCard key={u.id} source="usda">
                        <SourceBadge source="usda" />
                        <div className="text-sm font-bold mt-2 mb-0.5" style={{ color: 'var(--sgc-black)' }}>
                          {u.addr || 'USDA Property'}
                        </div>
                        <div className="text-xs mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>
                          {u.city && `${u.city}, `}{u.state} {u.zip}
                          {u.beds > 0 && ` · ${u.beds} beds`}
                          {u.acres && u.acres > 0 && ` · ${u.acres} acres`}
                        </div>
                        {u.price > 0 && (
                          <div className="text-sm font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>{fmt$(u.price)}</div>
                        )}
                        <div className="flex flex-wrap gap-1 mb-3">
                          {u.signals.map((s, i) => <SignalPill key={i} text={s} />)}
                        </div>
                        <ExtLink
                          href={`https://www.sc.egov.usda.gov/data/RD_Properties.html`}
                          label="USDA Portal" />
                      </LeadCard>
                    ))}
                  </div>
                </div>
              )}

              {/* Tax Delinquent */}
              {(filter === 'all' || filter === 'taxDelinquent') && result.taxDelinquent.length > 0 && (
                <div>
                  <SectionHeader source="taxDelinquent" count={result.taxDelinquent.length} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {result.taxDelinquent.map(t => (
                      <LeadCard key={t.id} source="taxDelinquent" urgent={t.distressScore >= 75}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <SourceBadge source="taxDelinquent" />
                            <div className="text-sm font-bold mt-2 mb-0.5" style={{ color: 'var(--sgc-black)' }}>
                              {t.addr}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                              {t.city && `${t.city}, `}{t.state} · Owner: {t.ownerName}
                            </div>
                          </div>
                          <ScoreRing score={t.distressScore} size={36} />
                        </div>
                        <div className="flex gap-3 mb-3">
                          <StatBadge label="Tax Owed" value={fmt$(t.taxOwed)} color="var(--sgc-danger)" />
                          <StatBadge label="Yrs Delinquent" value={String(t.yearsDelinquent)} color="var(--sgc-warn)" />
                          {t.price > 0 && <StatBadge label="Est. Price" value={fmt$(t.price)} />}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {t.signals.map((s, i) => <SignalPill key={i} text={s} />)}
                        </div>
                      </LeadCard>
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
