/**
 * Auction Radar — distressed properties heading to auction.
 *
 * Backed by the `auction-radar` edge function. Every card shown here is
 * evidence-gated: street address + a sale date that exists in the source +
 * an official / auction-platform source link. Nothing is fabricated; when a
 * source yields nothing the panel says so and shows what was scanned.
 */
import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../integrations/supabase/client'
import { toast } from '../lib/toast'
import { addToPipeline, isInPipeline } from '../lib/pipeline'
import sgcLogo from '../assets/sgc-logo.png'
import {
  loadSearchLog, saveSearch, deleteSearch, syncSearchLog,
  type SavedAuctionSearch,
} from '../lib/auctionSearchLog'

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

interface Memo {
  loading: boolean
  stage?: string
  text?: string
  error?: string
  scan?: any
  at?: string
}

interface SourceHealth {
  firecrawl: 'ok' | 'out_of_credits' | 'missing_key' | 'bad_key' | 'error'
  rentcast: 'ok' | 'forbidden' | 'missing_key' | 'bad_key'
  firecrawlError?: string | null
  rentcastNote?: string
}

interface ScanResult {
  area: string
  records: AuctionRecord[]
  stats: { total: number; scheduled: number; within7: number; within30: number; avgScore: number }
  sources: { name: string; note: string; count: number }[]
  sourceHealth?: SourceHealth
  debug: any
  scannedAt: string
}

const HEALTH_MSG: Record<string, string> = {
  out_of_credits: 'The web-notice scanner is out of Firecrawl credits, so trustee, sheriff and tax-sale notice pages could not be read. Top up the Firecrawl plan to restore this source.',
  missing_key_fc: 'The web-notice scanner has no Firecrawl key configured, so auction notice pages could not be read.',
  bad_key_fc: 'Firecrawl rejected the current key, so auction notice pages could not be read.',
  error: 'The web-notice scanner could not reach its sources on this run. Try again in a moment.',
  forbidden: 'RentCast rejected the request (403), so distressed MLS listings were skipped. Check the RentCast plan or key.',
  missing_key_rc: 'No RentCast key is configured, so distressed MLS listings were skipped.',
  bad_key_rc: 'RentCast rejected the current key, so distressed MLS listings were skipped.',
}

const TYPES = [
  'All types', 'Trustee Sale', 'Sheriff Sale', 'Tax Foreclosure', 'Judicial Sale',
  'Bank / REO Auction', 'Pre-Foreclosure', 'Probate / Estate', 'Foreclosure Auction', 'Short Sale',
]

// ── Target markets: curated city lists for the four operating states ──────
const MARKET_STATES = ['VA', 'NC', 'TN', 'FL'] as const
const STATE_NAME: Record<string, string> = {
  VA: 'Virginia', NC: 'North Carolina', TN: 'Tennessee', FL: 'Florida',
}
const MARKETS: Record<string, string[]> = {
  VA: [
    'Norfolk', 'Virginia Beach', 'Chesapeake', 'Portsmouth', 'Suffolk', 'Hampton',
    'Newport News', 'Williamsburg', 'Richmond', 'Petersburg', 'Hopewell', 'Colonial Heights',
    'Chesterfield', 'Henrico', 'Charlottesville', 'Lynchburg', 'Roanoke', 'Danville',
    'Martinsville', 'Harrisonburg', 'Staunton', 'Winchester', 'Fredericksburg',
    'Manassas', 'Woodbridge', 'Alexandria', 'Arlington', 'Emporia', 'Franklin', 'Salem',
  ],
  NC: [
    'Raleigh', 'Durham', 'Cary', 'Chapel Hill', 'Pittsboro', 'Siler City', 'Sanford',
    'Apex', 'Garner', 'Clayton', 'Zebulon', 'Wake Forest', 'Burlington', 'Greensboro',
    'High Point', 'Winston-Salem', 'Charlotte', 'Concord', 'Gastonia', 'Salisbury',
    'Fayetteville', 'Wilmington', 'Jacksonville', 'Greenville', 'Rocky Mount',
    'Wilson', 'Goldsboro', 'Kinston', 'Asheville', 'Hickory', 'Statesville',
  ],
  TN: [
    'Nashville', 'Murfreesboro', 'Franklin', 'Hendersonville', 'Gallatin', 'Lebanon',
    'Clarksville', 'Columbia', 'Cookeville', 'Memphis', 'Bartlett', 'Germantown',
    'Jackson', 'Knoxville', 'Maryville', 'Oak Ridge', 'Sevierville', 'Morristown',
    'Chattanooga', 'Cleveland', 'Johnson City', 'Kingsport', 'Bristol', 'Greeneville',
  ],
  FL: [
    'Jacksonville', 'Orange Park', 'St. Augustine', 'Palm Coast', 'Daytona Beach',
    'Ocala', 'Gainesville', 'Orlando', 'Kissimmee', 'Sanford', 'Deltona', 'Leesburg',
    'Tampa', 'St. Petersburg', 'Clearwater', 'Brandon', 'Lakeland', 'Winter Haven',
    'Sarasota', 'Bradenton', 'Port Charlotte', 'Cape Coral', 'Fort Myers', 'Naples',
    'West Palm Beach', 'Port St. Lucie', 'Fort Lauderdale', 'Hollywood', 'Miami',
    'Homestead', 'Pensacola', 'Tallahassee', 'Panama City',
  ],
}

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

function AuctionSearchProgress({ progress, batch }: { progress: number; batch: { done: number; total: number } | null }) {
  const safeProgress = Math.max(0, Math.min(96, Math.round(progress)))
  const stage = batch
    ? `Checking market ${Math.min(batch.done + 1, batch.total)} of ${batch.total}`
    : safeProgress < 28
      ? 'Connecting to county auction sources'
      : safeProgress < 55
        ? 'Reading trustee and tax-sale notices'
        : safeProgress < 78
          ? 'Verifying addresses and auction dates'
          : 'Scoring the strongest opportunities'

  return (
    <div className="auction-search-progress rounded-xl border mb-4 overflow-hidden" role="status" aria-live="polite"
      aria-label={`Auction search ${safeProgress} percent complete`}>
      <div className="flex flex-col sm:flex-row items-center gap-5 px-5 py-6 sm:px-8">
        <div className="auction-logo-build" aria-hidden="true">
          <img src={sgcLogo} alt="" className="auction-logo-ghost" />
          <div className="auction-logo-fill" style={{ clipPath: `inset(${100 - safeProgress}% 0 0 0)` }}>
            <img src={sgcLogo} alt="" />
          </div>
          <div className="auction-logo-scanline" style={{ bottom: `${safeProgress}%` }} />
        </div>

        <div className="w-full min-w-0 flex-1">
          <div className="flex items-end justify-between gap-3 mb-2">
            <div>
              <div className="text-sm font-black" style={{ color: NAVY }}>Building your auction search</div>
              <div className="text-[11px] mt-0.5" style={{ color: '#64748B' }}>{stage}</div>
            </div>
            <div className="text-xl font-black tabular-nums" style={{ color: NAVY_2 }}>{safeProgress}%</div>
          </div>
          <div className="auction-progress-track" aria-hidden="true">
            <div className="auction-progress-fill" style={{ width: `${safeProgress}%` }} />
          </div>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-semibold" style={{ color: '#8B8F9A' }}>
            <span className="auction-search-dot" />
            Every address and sale date is being verified against its source
          </div>
        </div>
      </div>
    </div>
  )
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
  const [customCity, setCustomCity] = useState(false)
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null)
  const [scanProgress, setScanProgress] = useState(0)

  useEffect(() => {
    if (!loading) { setScanProgress(0); return }
    setScanProgress(6)
    const timer = window.setInterval(() => {
      setScanProgress(current => current >= 92 ? current : Math.min(92, current + Math.max(1, Math.round((92 - current) / 9))))
    }, 650)
    return () => window.clearInterval(timer)
  }, [loading])

  const displayedScanProgress = batch?.total
    ? Math.max(scanProgress, 6 + (batch.done / batch.total) * 88)
    : scanProgress

  // ── Saved search log ────────────────────────────────────────────────────
  const [savedLog, setSavedLog] = useState<SavedAuctionSearch[]>(() => loadSearchLog())
  const [showLog, setShowLog] = useState(false)
  const [askSave, setAskSave] = useState<{ label: string; count: number } | null>(null)
  const [restored, setRestored] = useState<string | null>(null)

  useEffect(() => { syncSearchLog().then(setSavedLog).catch(() => {}) }, [])

  function keepSearch() {
    if (!result) { setAskSave(null); return }
    const label = askSave?.label || result.area || 'Auction search'
    const entry: SavedAuctionSearch = {
      id: `as-${Date.now()}`,
      label,
      savedAt: new Date().toISOString(),
      scannedAt: result.scannedAt,
      count: result.records?.length || 0,
      query: { city, state: stateCode, county, zip, daysAhead, maxPrice },
      result,
      memos,
    }
    setSavedLog(saveSearch(entry))
    setRestored(entry.id)
    setAskSave(null)
    setShowLog(true)
    toast.success('Search saved — reopen it any time, free')
  }

  function discardSearch() {
    setAskSave(null)
    setResult(null)
    setMemos({})
    setRestored(null)
    toast.info('Search discarded')
  }

  function openSaved(e: SavedAuctionSearch) {
    setResult(e.result)
    setMemos(e.memos || {})
    setRestored(e.id)
    setAskSave(null)
    setErr('')
    toast.success(`Reopened “${e.label}” — no new cost`)
  }

  function removeSaved(e: SavedAuctionSearch) {
    setSavedLog(deleteSearch(e.id))
    if (restored === e.id) { setResult(null); setMemos({}); setRestored(null) }
    toast.info('Saved search deleted')
  }


  // ── Deep Scan memos (session cache, keyed by record id) ─────────────────
  const [memos, setMemos] = useState<Record<string, Memo>>({})
  const [openMemo, setOpenMemo] = useState<Record<string, boolean>>({})
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)

  // ── Email alerts ────────────────────────────────────────────────────────
  const [watches, setWatches] = useState<any[]>([])
  const [wEmail, setWEmail] = useState('')
  const [wBusy, setWBusy] = useState<string | null>(null)
  const [wNote, setWNote] = useState('')
  const [showAlerts, setShowAlerts] = useState(false)

  const DEFAULT_WATCHES = [
    { label: 'Chatham County, NC', city: '', state: 'NC', county: 'Chatham', zip: '' },
    { label: 'North Carolina (statewide)', city: '', state: 'NC', county: '', zip: '' },
    { label: 'Virginia (statewide)', city: '', state: 'VA', county: '', zip: '' },
    { label: 'Tennessee (statewide)', city: '', state: 'TN', county: '', zip: '' },
    { label: 'Florida (statewide)', city: '', state: 'FL', county: '', zip: '' },
  ]

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser()
      if (!u?.user) return
      if (!wEmail) setWEmail(u.user.email || '')
      const { data } = await supabase.from('auction_watches')
        .select('*').order('created_at', { ascending: true })
      if (data?.length) {
        setWatches(data)
        const em = data.find((w: any) => w.notify_email)?.notify_email
        if (em) setWEmail(em)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ensureWatches(): Promise<any[]> {
    if (watches.length) return watches
    const { data: u } = await supabase.auth.getUser()
    if (!u?.user) throw new Error('Sign in first')
    const rows = DEFAULT_WATCHES.map(w => ({
      ...w, user_id: u.user.id, days_ahead: 90, max_price: 0,
      notify_email: wEmail.trim(), active: false,
    }))
    const { data, error } = await supabase.from('auction_watches').insert(rows).select()
    if (error) throw error
    setWatches(data || [])
    return data || []
  }

  async function toggleWatch(w: any) {
    if (!wEmail.trim()) { toast.error('Enter an email address first'); return }
    setWBusy(w.id); setWNote('')
    try {
      const { data, error } = await supabase.from('auction_watches')
        .update({ active: !w.active, notify_email: wEmail.trim() }).eq('id', w.id).select().single()
      if (error) throw error
      setWatches(ws => ws.map(x => x.id === w.id ? data : x))
      toast.success(!w.active ? `${w.label} alerts are on` : `${w.label} alerts paused`)
    } catch (e: any) { toast.error(e?.message || 'Could not save the alert') }
    finally { setWBusy(null) }
  }

  async function turnAllOn() {
    if (!wEmail.trim()) { toast.error('Enter an email address first'); return }
    setWBusy('all'); setWNote('')
    try {
      const ws = await ensureWatches()
      const { data, error } = await supabase.from('auction_watches')
        .update({ active: true, notify_email: wEmail.trim() })
        .in('id', ws.map((w: any) => w.id)).select()
      if (error) throw error
      setWatches(data || [])
      toast.success('VA, NC & TN auction alerts are on')
    } catch (e: any) { toast.error(e?.message || 'Could not save the alerts') }
    finally { setWBusy(null) }
  }

  async function testAlert(w: any) {
    setWBusy(w.id); setWNote('')
    try {
      const { data, error } = await supabase.functions.invoke('auction-watch-run', {
        body: { watchId: w.id, force: true },
      })
      if (error) throw error
      const r = data?.results?.[0]
      setWNote(`${w.label}: ${r?.note || 'check complete'}`)
      if (r?.emailed) toast.success(`Test email sent to ${wEmail}`)
      else toast.info('Check ran — nothing new to send right now')
    } catch (e: any) { toast.error(e?.message || 'Alert check failed') }
    finally { setWBusy(null) }
  }

  // ── Deep Scan (staged: each source is its own short call, so nothing times out)
  async function deepScanOne(r: AuctionRecord): Promise<void> {
    if (memos[r.id]?.text) { setOpenMemo(o => ({ ...o, [r.id]: true })); return }
    const setStage = (stage: string) => setMemos(m => ({ ...m, [r.id]: { ...(m[r.id] || {}), loading: true, stage } }))
    setMemos(m => ({ ...m, [r.id]: { loading: true, stage: 'Pulling photos and property record…' } }))
    setOpenMemo(o => ({ ...o, [r.id]: true }))
    const base = { address: r.address, city: r.city, state: r.state, zip: r.zip }
    const call = async (mode: string, extra: Record<string, unknown> = {}) => {
      const { data, error } = await supabase.functions.invoke('deep-scan', { body: { ...base, mode, ...extra } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    }
    try {
      const deal = {
        address: `${r.address}, ${r.city}, ${r.state} ${r.zip}`.trim(),
        listPrice: r.openingBid || 0,
        arv: r.estimatedValue || 0,
        beds: r.beds || 0, baths: r.baths || 0, sqft: r.sqft || 0,
        yearBuilt: r.yearBuilt || null,
        propertyType: 'Single Family',
        daysOnMarket: 0,
        estRehabCost: 0,
        seventyPctMax: r.estimatedValue ? Math.round(r.estimatedValue * 0.7) : 0,
        currentFlipProfit: r.equityDollars || 0,
        currentROI: 0,
        flipScore: r.score,
        auctionType: r.auctionType,
        auctionDate: r.auctionDate,
        sourceUrl: r.sourceUrl,
      }

      const [photos, history] = await Promise.all([
        call('photos').catch(e => ({ list: [], source: 'none', count: 0, error: e?.message })),
        call('history').catch(e => ({ sales: [], assessments: [], taxes: [], valueSeries: [], error: e?.message })),
      ])
      setMemos(m => ({ ...m, [r.id]: { ...(m[r.id] || {}), loading: true, stage: 'Checking permits, violations and distress signals…', scan: { photos, history } } }))

      const [permits, distress] = await Promise.all([
        call('permits').catch(e => ({ permits: [], violations: [], source: 'error', error: e?.message })),
        call('distress').catch(e => ({ signals: [], source: 'error', error: e?.message })),
      ])
      setMemos(m => ({ ...m, [r.id]: { ...(m[r.id] || {}), loading: true, stage: 'Writing the investor memo…', scan: { photos, history, permits, distress } } }))
      setStage('Writing the investor memo…')

      const sum = await call('summary', {
        context: {
          deal,
          photosFound: photos?.count || 0,
          permitsFound: permits?.permits?.length || 0,
          violationsFound: permits?.violations?.length || 0,
          distressSignals: (distress?.signals || []).flatMap((s: any) => s.flags || []),
          propertyFacts: history?.facts || null,
          saleHistory: history?.sales || [],
          taxAssessmentHistory: history?.assessments || [],
          propertyTaxHistory: history?.taxes || [],
          valueThroughTheYears: history?.valueSeries || [],
          currentValuation: history?.current || null,
          appreciation: history?.appreciation || null,
          ownership: history?.owner || null,
        },
      })
      const text: string = sum?.summary || ''
      if (!text.trim()) throw new Error('No memo returned for this address')
      setMemos(m => ({
        ...m,
        [r.id]: { loading: false, text, scan: { photos, history, permits, distress, evaluation: sum?.evaluation }, at: new Date().toISOString() },
      }))
    } catch (e: any) {
      setMemos(m => ({ ...m, [r.id]: { ...(m[r.id] || {}), loading: false, stage: undefined, error: e?.message || 'Deep Scan failed' } }))
    }
  }


  async function deepScanAllVisible() {
    const todo = filtered.filter(r => !memos[r.id]?.text && !memos[r.id]?.loading)
    if (!todo.length) { toast.info('Every visible listing already has a memo'); return }
    setBulk({ done: 0, total: todo.length })
    for (let i = 0; i < todo.length; i += 3) {
      await Promise.all(todo.slice(i, i + 3).map(r => deepScanOne(r)))
      setBulk({ done: Math.min(i + 3, todo.length), total: todo.length })
    }
    setBulk(null)
    toast.success('Deep Scan finished for the visible listings')
  }

  function buildStats(records: AuctionRecord[]) {
    const sched = records.filter(r => r.auctionDate)
    return {
      total: records.length,
      scheduled: sched.length,
      within7: sched.filter(r => daysUntil(r.auctionDate!) <= 7 && daysUntil(r.auctionDate!) >= 0).length,
      within30: sched.filter(r => daysUntil(r.auctionDate!) <= 30 && daysUntil(r.auctionDate!) >= 0).length,
      avgScore: records.length ? Math.round(records.reduce((s, r) => s + (r.score || 0), 0) / records.length) : 0,
    }
  }

  // Sweep a list of markets, merging every result into one deduped board.
  async function sweep(markets: { city: string; state: string }[], label: string) {
    setLoading(true); setErr(''); setResult(null); setAskSave(null)
    setBatch({ done: 0, total: markets.length })
    const merged: AuctionRecord[] = []
    const seen = new Set<string>()
    let health: SourceHealth | undefined
    let failures = 0
    try {
      for (let i = 0; i < markets.length; i += 3) {
        const chunk = markets.slice(i, i + 3)
        const out = await Promise.all(chunk.map(async m => {
          try {
            const { data, error } = await supabase.functions.invoke('auction-radar', {
              body: { city: m.city, state: m.state, county: '', zip: '', daysAhead, maxPrice, nonce: Date.now() },
            })
            if (error || data?.error) throw new Error(error?.message || data.error)
            return data as ScanResult
          } catch { failures++; return null }
        }))
        out.forEach(d => {
          if (!d) return
          if (d.sourceHealth) health = d.sourceHealth
          ;(d.records || []).forEach(r => {
            const k = (r.address || '').toLowerCase().replace(/[^a-z0-9]/g, '')
            if (k && !seen.has(k)) { seen.add(k); merged.push(r) }
          })
        })
        setBatch({ done: Math.min(i + 3, markets.length), total: markets.length })
      }
      setResult({
        area: label,
        records: merged,
        stats: buildStats(merged),
        sources: [{
          name: `${markets.length - failures}/${markets.length} markets scanned`,
          note: label,
          count: merged.length,
        }],
        sourceHealth: health,
        debug: { sweep: true, markets: markets.length, failures },
        scannedAt: new Date().toISOString(),
      })
      setRestored(null)
      setAskSave({ label, count: merged.length })
      if (merged.length) toast.success(`${merged.length} distressed / auction records across ${markets.length} markets`)
      else toast.warning('No verifiable auction records in those markets yet')
    } catch (e: any) {
      setErr(e?.message || String(e))
      toast.error('Market sweep failed')
    } finally {
      setBatch(null); setLoading(false)
    }
  }

  function scanStateCities() {
    const list = (MARKETS[stateCode] || []).map(c => ({ city: c, state: stateCode }))
    if (!list.length) { toast.info('No saved city list for that state'); return }
    sweep([{ city: '', state: stateCode }, ...list], `${STATE_NAME[stateCode] || stateCode} — all markets`)
  }

  function scanAllStates() {
    const list: { city: string; state: string }[] = []
    MARKET_STATES.forEach(s => {
      list.push({ city: '', state: s })
      ;(MARKETS[s] || []).forEach(c => list.push({ city: c, state: s }))
    })
    sweep(list, 'VA · NC · TN · FL — all markets')
  }

  async function runScan() {
    setLoading(true); setErr(''); setResult(null); setAskSave(null)
    try {
      const { data, error } = await supabase.functions.invoke('auction-radar', {
        body: { city, state: stateCode, county, zip, daysAhead, maxPrice, nonce: Date.now() },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setResult(data as ScanResult)
      setRestored(null)
      const n = data?.records?.length || 0
      setAskSave({
        label: (data as ScanResult)?.area || [city, stateCode].filter(Boolean).join(', ') || 'Auction search',
        count: n,
      })
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
      notes: [
        r.description,
        r.caseNumber && `Case #${r.caseNumber}`,
        r.trustee && `Trustee: ${r.trustee}`,
        r.sourceUrl,
        memos[r.id]?.text && `\n— INVESTOR MEMO (Deep Scan) —\n${memos[r.id].text}`,
      ].filter(Boolean).join('\n'),
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
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>State</label>
              <select value={stateCode}
                onChange={e => { setStateCode(e.target.value); setCity(''); setCustomCity(false) }}
                className="w-full mt-1 px-2 py-2 text-sm rounded-lg border outline-none cursor-pointer"
                style={{ borderColor: '#D1D9E6', color: NAVY, background: 'white' }}>
                {MARKET_STATES.map(s => <option key={s} value={s}>{STATE_NAME[s]} ({s})</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>City / market</label>
              {customCity ? (
                <input value={city} autoFocus onChange={e => setCity(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runScan()}
                  placeholder="Type any city"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border outline-none"
                  style={{ borderColor: '#D1D9E6', color: NAVY }} />
              ) : (
                <select value={city}
                  onChange={e => {
                    if (e.target.value === '__custom') { setCustomCity(true); setCity('') }
                    else setCity(e.target.value)
                  }}
                  className="w-full mt-1 px-2 py-2 text-sm rounded-lg border outline-none cursor-pointer"
                  style={{ borderColor: '#D1D9E6', color: NAVY, background: 'white' }}>
                  <option value="">Statewide — all of {STATE_NAME[stateCode] || stateCode}</option>
                  {(MARKETS[stateCode] || []).map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom">Other city…</option>
                </select>
              )}
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

          {customCity && (
            <button onClick={() => { setCustomCity(false); setCity('') }}
              className="mt-2 text-[11px] underline bg-transparent border-none cursor-pointer p-0"
              style={{ color: NAVY_2 }}>← back to the market list</button>
          )}

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
            <button onClick={scanStateCities} disabled={loading}
              className="px-4 py-2.5 rounded-lg text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: loading ? '#94A3B8' : NAVY_2 }}>
              🏙️ Sweep every {stateCode} city
            </button>
            <button onClick={scanAllStates} disabled={loading}
              className="px-4 py-2.5 rounded-lg text-sm font-bold border cursor-pointer"
              style={{ background: 'white', borderColor: NAVY_2, color: NAVY_2 }}>
              🌎 Sweep VA · NC · TN · FL
            </button>
            {batch && (
              <span className="text-[11px] font-bold" style={{ color: NAVY_2 }}>
                Sweeping markets {batch.done}/{batch.total}…
              </span>
            )}
            {result && (
              <span className="text-[11px]" style={{ color: '#94A3B8' }}>
                Scanned {new Date(result.scannedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Save-or-delete prompt after every scan */}
        {askSave && (
          <div className="rounded-xl border p-4 mb-4 flex flex-wrap items-center gap-3"
            style={{ background: '#FFF8E8', borderColor: '#F0D9A0' }}>
            <span className="flex-1 min-w-[220px] text-[12px] font-semibold" style={{ color: NAVY }}>
              Keep this search? “{askSave.label}” · {askSave.count} listing{askSave.count === 1 ? '' : 's'}
              <span className="block font-normal mt-0.5" style={{ color: '#64748B' }}>
                Saved searches reopen instantly later with no new scan cost.
              </span>
            </span>
            <button onClick={keepSearch}
              className="px-4 py-2 rounded-lg text-[12px] font-bold text-white border-none cursor-pointer"
              style={{ background: NAVY }}>💾 Save the full search</button>
            <button onClick={discardSearch}
              className="px-4 py-2 rounded-lg text-[12px] font-bold border cursor-pointer"
              style={{ background: 'white', borderColor: '#C0341D', color: '#C0341D' }}>🗑 Delete it</button>
          </div>
        )}

        {/* Saved search log */}
        <div className="rounded-xl border mb-4" style={{ background: 'white', borderColor: '#E5E9F0' }}>
          <button onClick={() => setShowLog(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 bg-transparent border-none cursor-pointer text-left">
            <span className="text-sm font-bold" style={{ color: NAVY }}>
              🗂 Saved searches
              <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded"
                style={{ background: '#F1F5F9', color: '#64748B' }}>{savedLog.length}</span>
            </span>
            <span className="text-xs" style={{ color: '#94A3B8' }}>{showLog ? '▲' : '▼'}</span>
          </button>
          {showLog && (
            <div className="px-4 pb-4">
              {!savedLog.length ? (
                <p className="text-[11px]" style={{ color: '#64748B' }}>
                  Nothing saved yet. After a scan finishes, choose “Save the full search” to keep it here.
                </p>
              ) : savedLog.map(e => (
                <div key={e.id} className="flex flex-wrap items-center gap-2 py-2 border-t" style={{ borderColor: '#EEF2F7' }}>
                  <span className="flex-1 min-w-[180px] text-[12px] font-semibold" style={{ color: NAVY }}>
                    {e.label}
                    {restored === e.id && (
                      <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: '#ECFDF5', color: '#0F7A3D' }}>OPEN</span>
                    )}
                    <span className="block font-normal text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>
                      {e.count} listing{e.count === 1 ? '' : 's'} · saved {new Date(e.savedAt).toLocaleString()}
                    </span>
                  </span>
                  <button onClick={() => openSaved(e)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white border-none cursor-pointer"
                    style={{ background: NAVY_2 }}>Reopen</button>
                  <button onClick={() => removeSaved(e)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer"
                    style={{ background: 'white', borderColor: '#C0341D', color: '#C0341D' }}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email alerts */}
        <div className="rounded-xl border mb-4" style={{ background: 'white', borderColor: '#E5E9F0' }}>
          <button onClick={() => setShowAlerts(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 bg-transparent border-none cursor-pointer text-left">
            <span className="text-sm font-bold" style={{ color: NAVY }}>
              🔔 Email alerts — VA · NC · TN
              <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded"
                style={{ background: watches.some(w => w.active) ? '#ECFDF5' : '#F1F5F9', color: watches.some(w => w.active) ? '#0F7A3D' : '#64748B' }}>
                {watches.filter(w => w.active).length ? `${watches.filter(w => w.active).length} ON` : 'OFF'}
              </span>
            </span>
            <span className="text-xs" style={{ color: '#94A3B8' }}>{showAlerts ? '▲' : '▼'}</span>
          </button>
          {showAlerts && (
            <div className="px-4 pb-4">
              <p className="text-[11px] mb-3 leading-relaxed" style={{ color: '#64748B' }}>
                Once a day at 7:00 AM Eastern the radar checks each area below and emails you only the
                listings it has never reported before. Nothing new means no email.
              </p>
              <div className="flex flex-wrap items-end gap-2 mb-3">
                <div className="flex-1 min-w-[220px]">
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Send alerts to</label>
                  <input value={wEmail} onChange={e => setWEmail(e.target.value)}
                    placeholder="you@sgcbuilt.com"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border outline-none"
                    style={{ borderColor: '#D1D9E6', color: NAVY }} />
                </div>
                <button onClick={turnAllOn} disabled={!!wBusy}
                  className="px-4 py-2 rounded-lg text-[11px] font-bold text-white border-none cursor-pointer"
                  style={{ background: wBusy ? '#94A3B8' : NAVY }}>
                  {wBusy === 'all' ? 'Working…' : watches.length ? 'Turn all on' : 'Set up VA · NC · TN alerts'}
                </button>
              </div>
              {watches.map(w => (
                <div key={w.id} className="flex flex-wrap items-center gap-2 py-2 border-t" style={{ borderColor: '#EEF2F7' }}>
                  <span className="flex-1 min-w-[160px] text-[12px] font-semibold" style={{ color: NAVY }}>
                    {w.label}
                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: w.active ? '#ECFDF5' : '#F1F5F9', color: w.active ? '#0F7A3D' : '#64748B' }}>
                      {w.active ? 'ON' : 'OFF'}
                    </span>
                  </span>
                  <button onClick={() => toggleWatch(w)} disabled={!!wBusy}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold border-none cursor-pointer"
                    style={{ background: wBusy === w.id ? '#94A3B8' : w.active ? '#C0341D' : NAVY, color: 'white' }}>
                    {wBusy === w.id ? 'Working…' : w.active ? 'Turn off' : 'Turn on'}
                  </button>
                  <button onClick={() => testAlert(w)} disabled={!!wBusy}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer"
                    style={{ borderColor: '#D1D9E6', color: NAVY_2, background: 'white' }}>
                    Run check now
                  </button>
                  {w.last_run_note && (
                    <div className="w-full text-[10px]" style={{ color: '#94A3B8' }}>
                      Last check: {w.last_run_note}
                      {w.last_run_at ? ` · ${new Date(w.last_run_at).toLocaleString()}` : ''}
                    </div>
                  )}
                </div>
              ))}
              {wNote && (
                <div className="text-[11px] mt-2" style={{ color: '#64748B' }}>
                  Last check: {wNote}
                </div>
              )}
            </div>
          )}
        </div>

        {err && (
          <div className="rounded-xl border p-4 mb-4 text-sm"
            style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#991B1B' }}>
            {err}
          </div>
        )}

        {loading && (
          <AuctionSearchProgress progress={displayedScanProgress} batch={batch} />
        )}

        {result && (() => {
          const h = result.sourceHealth
          if (!h) return null
          const msgs: string[] = []
          if (h.firecrawl !== 'ok') {
            msgs.push(HEALTH_MSG[h.firecrawl === 'missing_key' ? 'missing_key_fc' : h.firecrawl === 'bad_key' ? 'bad_key_fc' : h.firecrawl] || HEALTH_MSG.error)
          }
          if (h.rentcast !== 'ok') {
            msgs.push(HEALTH_MSG[h.rentcast === 'missing_key' ? 'missing_key_rc' : h.rentcast === 'bad_key' ? 'bad_key_rc' : 'forbidden'])
          }
          if (!msgs.length) return null
          return (
            <div className="rounded-xl border p-4 mb-4" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
              <div className="text-xs font-bold mb-1" style={{ color: '#92400E' }}>⚠ Some auction sources were unavailable on this scan</div>
              {msgs.map((m, i) => (
                <div key={i} className="text-[11px] leading-relaxed" style={{ color: '#92400E' }}>• {m}</div>
              ))}
            </div>
          )
        })()}

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
              <button onClick={deepScanAllVisible} disabled={!!bulk}
                className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg border-none cursor-pointer text-white"
                style={{ background: bulk ? '#94A3B8' : NAVY_2 }}>
                {bulk ? `🔬 Deep Scanning ${bulk.done}/${bulk.total}…` : '🔬 Deep Scan all visible'}
              </button>
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
                            <button onClick={() => memos[r.id]?.text ? setOpenMemo(o => ({ ...o, [r.id]: !o[r.id] })) : deepScanOne(r)}
                              disabled={memos[r.id]?.loading}
                              className="px-3 py-1.5 text-[11px] font-bold rounded-lg border cursor-pointer"
                              style={{ borderColor: '#D1D9E6', color: NAVY_2, background: 'white' }}>
                              {memos[r.id]?.loading
                                ? '🔬 Deep Scanning…'
                                : memos[r.id]?.text
                                  ? (openMemo[r.id] ? 'Hide investor memo' : 'Show investor memo')
                                  : '🔬 Deep Scan'}
                            </button>
                            <span className="text-[10px]" style={{ color: '#94A3B8' }}>Source: {r.sourceLabel || r.sourceHost}</span>
                          </div>

                          {/* Deep Scan panel */}
                          {memos[r.id]?.loading && (
                            <div className="mt-2 rounded-lg px-3 py-2 text-[11px]"
                              style={{ background: '#F1F5F9', color: NAVY_2 }}>
                              🔬 {memos[r.id].stage || 'Deep Scanning…'}
                            </div>
                          )}
                          {memos[r.id]?.error && (
                            <div className="mt-2 rounded-lg px-3 py-2 text-[11px]"
                              style={{ background: '#FEF2F2', color: '#991B1B' }}>
                              Deep Scan could not finish for this address — {memos[r.id].error}
                            </div>
                          )}
                          {openMemo[r.id] && (memos[r.id]?.text || memos[r.id]?.scan) && (
                            <DeepScanPanel memo={memos[r.id]} />
                          )}

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

const money = (n: any) => (typeof n === 'number' && isFinite(n) ? '$' + Math.round(n).toLocaleString() : '—')

function DeepScanPanel({ memo }: { memo: Memo }) {
  const scan = memo.scan || {}
  const photos: string[] = scan.photos?.list || []
  const h = scan.history || {}
  const series: any[] = h.valueSeries || []
  const peak = Math.max(1, ...series.map((v: any) => Math.max(v.sale || 0, v.estimate || 0, v.assessed || 0)))
  const permits: any[] = scan.permits?.permits || []
  const violations: any[] = scan.permits?.violations || []
  const signals: any[] = scan.distress?.signals || []

  return (
    <div className="mt-2 rounded-lg border p-3" style={{ background: '#F8FAFC', borderColor: '#E5E9F0' }}>
      {/* Photos */}
      {!!photos.length && (
        <>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94A3B8' }}>
            Property photos ({photos.length})
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            {photos.slice(0, 12).map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img src={src} alt={`Property photo ${i + 1}`} loading="lazy"
                  className="h-24 w-32 object-cover rounded-lg border"
                  style={{ borderColor: '#E2E8F0' }} />
              </a>
            ))}
          </div>
        </>
      )}

      {/* Value through the years */}
      {!!series.length && (
        <div className="mb-3">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94A3B8' }}>
            Value through the years
          </div>
          <div className="flex items-end gap-2 h-28">
            {series.map((v: any) => {
              const val = v.sale || v.estimate || v.assessed || 0
              const isSale = !!v.sale
              const isEst = !v.sale && !!v.estimate
              return (
                <div key={v.year} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="text-[9px] font-bold mb-0.5" style={{ color: '#475569' }}>
                    {val ? '$' + Math.round(val / 1000) + 'k' : '—'}
                  </div>
                  <div className="w-full rounded-t"
                    style={{
                      height: `${Math.max(4, (val / peak) * 78)}px`,
                      background: isSale ? NAVY : isEst ? '#16A34A' : NAVY_2,
                      opacity: isSale || isEst ? 1 : 0.45,
                    }} />
                  <div className="text-[9px] mt-1" style={{ color: '#94A3B8' }}>{v.year}</div>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-1 text-[9px]" style={{ color: '#94A3B8' }}>
            <span>■ Recorded sale</span>
            <span style={{ color: '#16A34A' }}>■ Current estimate</span>
            <span>□ County assessment</span>
          </div>
          {h.appreciation && (
            <div className="text-[10px] mt-1" style={{ color: '#475569' }}>
              {h.appreciation.pct > 0 ? 'Up' : 'Down'} {Math.abs(h.appreciation.pct)}% from {h.appreciation.fromYear} to {h.appreciation.toYear}
              {' '}({h.appreciation.cagrPct}%/yr)
            </div>
          )}
        </div>
      )}

      {/* Facts + valuation */}
      {(h.facts || h.current) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <Fact label="Est. value today" value={money(h.current?.estimate)} />
          <Fact label="Value range" value={h.current ? `${money(h.current.low)} – ${money(h.current.high)}` : '—'} />
          <Fact label="Last sale" value={h.facts?.lastSalePrice ? `${money(h.facts.lastSalePrice)} · ${String(h.facts.lastSaleDate || '').slice(0, 10)}` : '—'} />
          <Fact label="Owner tenure" value={h.owner?.tenureYears != null ? `${h.owner.tenureYears} yr` : '—'} />
          <Fact label="Type" value={h.facts?.propertyType || '—'} />
          <Fact label="Beds / baths" value={h.facts ? `${h.facts.bedrooms ?? '—'} / ${h.facts.bathrooms ?? '—'}` : '—'} />
          <Fact label="Sqft / lot" value={h.facts ? `${h.facts.squareFootage ?? '—'} / ${h.facts.lotSize ?? '—'}` : '—'} />
          <Fact label="Built" value={h.facts?.yearBuilt ? String(h.facts.yearBuilt) : '—'} />
        </div>
      )}

      {/* Sale history */}
      {!!(h.sales || []).length && (
        <div className="mb-3">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Sale history</div>
          {h.sales.map((s: any, i: number) => (
            <div key={i} className="flex justify-between text-[11px] py-0.5" style={{ color: '#334155' }}>
              <span>{s.date} · {s.event}</span><b>{money(s.price)}</b>
            </div>
          ))}
        </div>
      )}

      {/* Tax history */}
      {!!(h.taxes || []).length && (
        <div className="mb-3">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Property taxes</div>
          <div className="flex flex-wrap gap-2">
            {h.taxes.map((t: any) => (
              <Chip key={t.year} label={String(t.year)} value={money(t.total)} />
            ))}
          </div>
        </div>
      )}

      {/* Permits / violations / distress */}
      {(permits.length > 0 || violations.length > 0 || signals.length > 0) && (
        <div className="mb-3 text-[11px]" style={{ color: '#475569' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Records found</div>
          {permits.length > 0 && <div>{permits.length} permit record(s)</div>}
          {violations.length > 0 && <div style={{ color: '#B45309' }}>{violations.length} violation record(s)</div>}
          {signals.length > 0 && <div>{signals.length} distress signal(s): {signals.flatMap((s: any) => s.flags || []).slice(0, 6).join(', ')}</div>}
        </div>
      )}

      {/* Memo */}
      {memo.text && (
        <>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94A3B8' }}>
            Investor memo · Deep Scan
          </div>
          <div className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: '#334155' }}>
            {memo.text}
          </div>
        </>
      )}
      <div className="text-[10px] mt-2" style={{ color: '#94A3B8' }}>
        Added to the pipeline note when you send this property to the pipeline.
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-2 py-1.5" style={{ background: 'white', borderColor: '#E5E9F0' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ color: '#94A3B8' }}>{label}</div>
      <div className="text-[11px] font-bold" style={{ color: NAVY }}>{value}</div>
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
