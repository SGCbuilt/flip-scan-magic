/**
 * Auction Radar — distressed properties heading to auction.
 *
 * Backed by the `auction-radar` edge function. Every card shown here is
 * evidence-gated: street address + a sale date that exists in the source +
 * an official / auction-platform source link. Nothing is fabricated; when a
 * source yields nothing the panel says so and shows what was scanned.
 */
import { useState, useMemo } from 'react'
import { supabase } from '../integrations/supabase/client'
import { toast } from '../lib/toast'
import { addToPipeline, isInPipeline } from '../lib/pipeline'

const NAVY = '#0F2460'
const NAVY_2 = '#1B3A8C'

interface AuctionRecord {
  id: string
  address: string
  city: string
  state: string
  zip: string
  county: string
  auctionDate: string | null
  auctionDateLabel?: string
  auctionTime?: string
  auctionLocation?: string
  auctionType: string
  openingBid: number
  estimatedValue: number
  valueLow?: number
  valueHigh?: number
  equitySpreadPct?: number
  equityDollars?: number
  caseNumber: string
  trustee: string
  beds?: number
  baths?: number
  sqft?: number
  yearBuilt?: number
  description: string
  sourceUrl: string
  sourceHost: string
  sourceLabel: string
  verified: boolean
  confidence: 'high' | 'medium' | 'low'
  matchReasons: string[]
  score: number
  grade: string
  urgency: string
}

interface ScanResult {
  area: string
  records: AuctionRecord[]
  stats: { total: number; scheduled: number; within7: number; within30: number; avgScore: number }
  sources: { name: string; note: string; count: number }[]
  debug: any
  scannedAt: string
}

const TYPES = [
  'All types', 'Trustee Sale', 'Sheriff Sale', 'Tax Foreclosure', 'Judicial Sale',
  'Bank / REO Auction', 'Pre-Foreclosure', 'Probate / Estate', 'Foreclosure Auction', 'Short Sale',
]

const GRADE_COLOR: Record<string, string> = {
  'A+': '#0F7A3D', 'A': '#0F7A3D', 'B+': '#1A7A4A', 'B': '#1B3A8C',
  'C+': '#C45E1A', 'C': '#C45E1A', 'D': '#94A3B8',
}

function usd(n: number) {
  if (!n) return '—'
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function daysUntil(iso: string) {
  return Math.round((new Date(iso + 'T12:00:00Z').getTime() - Date.now()) / 86400000)
}

function urgencyColor(rec: AuctionRecord) {
  if (!rec.auctionDate) return '#94A3B8'
  const d = daysUntil(rec.auctionDate)
  if (d < 0) return '#94A3B8'
  if (d <= 7) return '#C0341D'
  if (d <= 21) return '#C45E1A'
  if (d <= 45) return '#B7950B'
  return '#1B3A8C'
}

export default function AuctionRadar() {
  const [city, setCity] = useState('Norfolk')
  const [stateCode, setStateCode] = useState('VA')
  const [county, setCounty] = useState('')
  const [zip, setZip] = useState('')
  const [daysAhead, setDaysAhead] = useState(90)
  const [maxPrice, setMaxPrice] = useState(0)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [err, setErr] = useState('')
  const [typeFilter, setTypeFilter] = useState('All types')
  const [sort, setSort] = useState<'soonest' | 'score' | 'equity'>('soonest')
  const [minGradeScore, setMinGradeScore] = useState(0)
  const [showDebug, setShowDebug] = useState(false)
  const [added, setAdded] = useState<Record<string, boolean>>({})

  async function runScan() {
    setLoading(true); setErr(''); setResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('auction-radar', {
        body: { city, state: stateCode, county, zip, daysAhead, maxPrice, nonce: Date.now() },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setResult(data as ScanResult)
      const n = data?.records?.length || 0
      if (n) toast.success(`${n} auction / distressed record${n === 1 ? '' : 's'} found`)
      else toast.warning('No verifiable auction records for that area and window')
    } catch (e: any) {
      setErr(e?.message || String(e))
      toast.error('Auction scan failed')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    let rows = result?.records || []
    if (typeFilter !== 'All types') rows = rows.filter(r => r.auctionType === typeFilter)
    if (minGradeScore) rows = rows.filter(r => r.score >= minGradeScore)
    const copy = [...rows]
    if (sort === 'score') copy.sort((a, b) => b.score - a.score)
    else if (sort === 'equity') copy.sort((a, b) => (b.equityDollars || 0) - (a.equityDollars || 0))
    else copy.sort((a, b) => {
      const ad = a.auctionDate ? daysUntil(a.auctionDate) : 9999
      const bd = b.auctionDate ? daysUntil(b.auctionDate) : 9999
      return ad - bd || b.score - a.score
    })
    return copy
  }, [result, typeFilter, sort, minGradeScore])

  function sendToPipeline(r: AuctionRecord) {
    const id = `auction-${r.address.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    if (isInPipeline(id) || added[r.id]) { toast.info('Already in pipeline'); return }
    addToPipeline({
      id,
      stage: 'new',
      priority: r.score >= 78 ? 'hot' : r.score >= 62 ? 'warm' : 'cold',
      address: r.address, city: r.city, state: r.state, zip: r.zip, county: r.county,
      signalType: 'auction',
      signalLabel: `${r.auctionType}${r.auctionDate ? ` · sale ${r.auctionDate}` : ''}`,
      investorScore: r.score,
      severity: r.auctionDate && daysUntil(r.auctionDate) <= 21 ? 'high' : 'medium',
      source: r.sourceLabel || 'Auction Radar',
      ownerName: '', phones: [], emails: [], mailingAddr: '',
      estimatedARV: r.estimatedValue || 0,
      estimatedRehab: 0,
      estimatedProfit: r.equityDollars || 0,
      maxOffer: r.estimatedValue ? Math.round(r.estimatedValue * 0.7) : 0,
      notes: [r.description, r.caseNumber && `Case #${r.caseNumber}`, r.trustee && `Trustee: ${r.trustee}`, r.sourceUrl]
        .filter(Boolean).join('\n'),
      tags: ['auction', r.auctionType],
      assignedTo: '',
    })
    setAdded(a => ({ ...a, [r.id]: true }))
    toast.success('Added to pipeline')
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#F5F7FB' }}>
      <div className="max-w-[1200px] mx-auto p-4 sm:p-6">

        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-black tracking-tight" style={{ color: NAVY }}>⚖️ Auction Radar</h1>
          <p className="text-xs mt-1" style={{ color: '#64748B' }}>
            Trustee sales, sheriff sales, tax foreclosures and pre-foreclosures — every record must carry a
            street address, a sale date printed in the notice, and an official source link.
          </p>
        </div>

        {/* Search panel */}
        <div className="rounded-xl border p-4 mb-4" style={{ background: 'white', borderColor: '#E5E9F0' }}>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="col-span-2 md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>City</label>
              <input value={city} onChange={e => setCity(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runScan()}
                placeholder="Norfolk"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border outline-none"
                style={{ borderColor: '#D1D9E6', color: NAVY }} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>State</label>
              <input value={stateCode} onChange={e => setStateCode(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="VA"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border outline-none"
                style={{ borderColor: '#D1D9E6', color: NAVY }} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>County</label>
              <input value={county} onChange={e => setCounty(e.target.value)}
                placeholder="optional"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border outline-none"
                style={{ borderColor: '#D1D9E6', color: NAVY }} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>ZIP</label>
              <input value={zip} onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="optional"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border outline-none"
                style={{ borderColor: '#D1D9E6', color: NAVY }} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Window</label>
              <select value={daysAhead} onChange={e => setDaysAhead(Number(e.target.value))}
                className="w-full mt-1 px-2 py-2 text-sm rounded-lg border outline-none cursor-pointer"
                style={{ borderColor: '#D1D9E6', color: NAVY, background: 'white' }}>
                {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>Next {d} days</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 mt-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Max price</label>
              <select value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))}
                className="block mt-1 px-2 py-2 text-sm rounded-lg border outline-none cursor-pointer"
                style={{ borderColor: '#D1D9E6', color: NAVY, background: 'white' }}>
                <option value={0}>No cap</option>
                {[150000, 250000, 400000, 600000, 1000000].map(p => <option key={p} value={p}>Under {usd(p)}</option>)}
              </select>
            </div>
            <button onClick={runScan} disabled={loading}
              className="px-5 py-2.5 rounded-lg text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: loading ? '#94A3B8' : NAVY }}>
              {loading ? '⟳ Scanning auction notices…' : '⚖️ Scan for auctions'}
            </button>
            {result && (
              <span className="text-[11px]" style={{ color: '#94A3B8' }}>
                Scanned {new Date(result.scannedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {err && (
          <div className="rounded-xl border p-4 mb-4 text-sm"
            style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#991B1B' }}>
            {err}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border p-8 text-center text-sm" style={{ background: 'white', borderColor: '#E5E9F0', color: '#64748B' }}>
            Searching trustee, sheriff, tax-sale and public-notice sources…
          </div>
        )}

        {result && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {[
                { label: 'Records', value: result.stats.total, color: NAVY },
                { label: 'Dated sales', value: result.stats.scheduled, color: NAVY_2 },
                { label: '≤ 7 days', value: result.stats.within7, color: '#C0341D' },
                { label: '≤ 30 days', value: result.stats.within30, color: '#C45E1A' },
                { label: 'Avg score', value: result.stats.avgScore, color: '#0F7A3D' },
              ].map(s => (
                <div key={s.label} className="rounded-xl border p-3" style={{ background: 'white', borderColor: '#E5E9F0' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>{s.label}</div>
                  <div className="text-2xl font-black mt-0.5" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer"
                style={{ borderColor: '#D1D9E6', color: NAVY, background: 'white' }}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <select value={sort} onChange={e => setSort(e.target.value as any)}
                className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer"
                style={{ borderColor: '#D1D9E6', color: NAVY, background: 'white' }}>
                <option value="soonest">Soonest sale date</option>
                <option value="score">Highest score</option>
                <option value="equity">Biggest equity spread</option>
              </select>
              <select value={minGradeScore} onChange={e => setMinGradeScore(Number(e.target.value))}
                className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer"
                style={{ borderColor: '#D1D9E6', color: NAVY, background: 'white' }}>
                <option value={0}>Any grade</option>
                <option value={62}>B and above</option>
                <option value={78}>A and above</option>
              </select>
              <span className="text-[11px]" style={{ color: '#94A3B8' }}>
                {filtered.length} of {result.records.length}
              </span>
              <div className="flex-1" />
              <button onClick={() => setShowDebug(d => !d)}
                className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer"
                style={{ borderColor: '#D1D9E6', color: '#64748B', background: 'white' }}>
                {showDebug ? 'Hide' : 'Show'} scan detail
              </button>
            </div>

            {/* Scan transparency */}
            {showDebug && (
              <div className="rounded-xl border p-4 mb-4 text-[11px]" style={{ background: 'white', borderColor: '#E5E9F0', color: '#475569' }}>
                <div className="font-bold mb-2" style={{ color: NAVY }}>What was scanned</div>
                {result.sources.map(s => (
                  <div key={s.name} className="mb-1">• <b>{s.name}</b> — {s.note} → {s.count} kept</div>
                ))}
                <div className="mt-2">Web queries: {result.debug?.queriesOk}/{result.debug?.queriesRun} · official-host hits: {result.debug?.rawHits} · AI extraction: {result.debug?.aiUsed ? 'on' : 'off'}</div>
                {!!result.debug?.rejected?.length && (
                  <div className="mt-2">
                    <div className="font-bold" style={{ color: '#C0341D' }}>Rejected (not provable)</div>
                    {result.debug.rejected.slice(0, 12).map((r: any, i: number) => (
                      <div key={i}>• {r.address} — {r.why}</div>
                    ))}
                  </div>
                )}
                {!!result.debug?.rawHostList?.length && (
                  <div className="mt-2">Sources reached: {result.debug.rawHostList.join(', ')}</div>
                )}
              </div>
            )}

            {/* Results */}
            {filtered.length === 0 ? (
              <div className="rounded-xl border p-8 text-center" style={{ background: 'white', borderColor: '#E5E9F0' }}>
                <div className="text-sm font-bold mb-1" style={{ color: NAVY }}>No provable auction records for this area and window</div>
                <div className="text-xs" style={{ color: '#64748B' }}>
                  Nothing is shown unless the source lists a street address and a sale date. Widen the window,
                  drop the ZIP, or add the county name. Open “Show scan detail” to see exactly which sources were reached.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(r => {
                  const uc = urgencyColor(r)
                  return (
                    <div key={r.id} className="rounded-xl border overflow-hidden" style={{ background: 'white', borderColor: '#E5E9F0' }}>
                      {/* Top strip */}
                      <div className="flex items-stretch">
                        <div className="w-1.5 flex-shrink-0" style={{ background: uc }} />
                        <div className="flex-1 p-4 min-w-0">
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="flex-1 min-w-[200px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded text-[10px] font-black text-white" style={{ background: uc }}>
                                  {r.urgency}
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold"
                                  style={{ background: '#EEF2FB', color: NAVY_2 }}>{r.auctionType}</span>
                                {r.verified && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold"
                                    style={{ background: '#ECFDF5', color: '#0F7A3D' }}>✓ Source verified</span>
                                )}
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold"
                                  style={{
                                    background: r.confidence === 'high' ? '#ECFDF5' : r.confidence === 'medium' ? '#FFFBEB' : '#FEF2F2',
                                    color: r.confidence === 'high' ? '#0F7A3D' : r.confidence === 'medium' ? '#B7950B' : '#C0341D',
                                  }}>
                                  {r.confidence === 'high' ? '●●●' : r.confidence === 'medium' ? '●●○' : '●○○'} {r.confidence}
                                </span>
                              </div>
                              <div className="text-sm font-bold mt-2" style={{ color: NAVY }}>{r.address}</div>
                              <div className="text-[11px]" style={{ color: '#64748B' }}>
                                {[r.city, r.state, r.zip, r.county && `${r.county} County`].filter(Boolean).join(' · ')}
                              </div>
                            </div>

                            {/* Grade */}
                            <div className="text-center px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
                              <div className="text-2xl font-black leading-none" style={{ color: GRADE_COLOR[r.grade] || NAVY }}>{r.grade}</div>
                              <div className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: '#94A3B8' }}>{r.score}/100</div>
                            </div>
                          </div>

                          {/* Facts grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                            {[
                              { k: 'Sale date', v: r.auctionDate ? new Date(r.auctionDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (r.auctionDateLabel || 'Not scheduled') },
                              { k: 'Opening bid', v: usd(r.openingBid) },
                              { k: 'Est. value', v: usd(r.estimatedValue) },
                              {
                                k: 'Equity spread',
                                v: r.equityDollars ? `${usd(r.equityDollars)} (${r.equitySpreadPct}%)` : '—',
                                color: (r.equitySpreadPct || 0) >= 30 ? '#0F7A3D' : (r.equitySpreadPct || 0) < 0 ? '#C0341D' : undefined,
                              },
                            ].map(f => (
                              <div key={f.k} className="rounded-lg px-2.5 py-2" style={{ background: '#F8FAFC' }}>
                                <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>{f.k}</div>
                                <div className="text-xs font-bold mt-0.5" style={{ color: (f as any).color || NAVY }}>{f.v}</div>
                              </div>
                            ))}
                          </div>

                          {/* Extra detail chips */}
                          {(r.auctionTime || r.auctionLocation || r.caseNumber || r.trustee || r.sqft || r.yearBuilt) && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {r.auctionTime && <Chip label="Time" value={r.auctionTime} />}
                              {r.auctionLocation && <Chip label="Held at" value={r.auctionLocation} />}
                              {r.caseNumber && <Chip label="Case" value={r.caseNumber} />}
                              {r.trustee && <Chip label="Trustee" value={r.trustee} />}
                              {!!r.sqft && <Chip label="Sqft" value={String(r.sqft)} />}
                              {!!r.yearBuilt && <Chip label="Built" value={String(r.yearBuilt)} />}
                            </div>
                          )}

                          {r.description && (
                            <div className="text-[11px] mt-2 leading-relaxed" style={{ color: '#475569' }}>{r.description}</div>
                          )}

                          {/* Why it matched */}
                          {!!r.matchReasons?.length && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {r.matchReasons.map((m, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded"
                                  style={{ background: '#ECFDF5', color: '#0F7A3D' }}>✓ {m}</span>
                              ))}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            {r.sourceUrl && (
                              <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer"
                                className="px-3 py-1.5 text-[11px] font-bold rounded-lg border no-underline"
                                style={{ borderColor: '#D1D9E6', color: NAVY_2, background: 'white' }}>
                                Open official notice →
                              </a>
                            )}
                            <button onClick={() => sendToPipeline(r)}
                              className="px-3 py-1.5 text-[11px] font-bold rounded-lg border-none cursor-pointer text-white"
                              style={{ background: added[r.id] ? '#94A3B8' : NAVY }}>
                              {added[r.id] ? '✓ In pipeline' : '+ Add to Pipeline'}
                            </button>
                            <span className="text-[10px]" style={{ color: '#94A3B8' }}>Source: {r.sourceLabel || r.sourceHost}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {!result && !loading && !err && (
          <div className="rounded-xl border p-8 text-center" style={{ background: 'white', borderColor: '#E5E9F0' }}>
            <div className="text-sm font-bold mb-1" style={{ color: NAVY }}>Pick an area and scan</div>
            <div className="text-xs" style={{ color: '#64748B' }}>
              The radar checks trustee &amp; substitute-trustee notices, sheriff sales, county tax-foreclosure lists,
              state public-notice publishers, government sites, and the major auction platforms — then scores each
              property by how soon the sale is and how much equity sits behind the opening bid.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded border" style={{ borderColor: '#E2E8F0', color: '#475569', background: '#F8FAFC' }}>
      <b style={{ color: '#94A3B8' }}>{label}:</b> {value}
    </span>
  )
}
