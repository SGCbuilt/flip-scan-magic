import { useMemo, useState } from 'react'
import { toast } from '../lib/toast'
import { supabase } from '../integrations/supabase/client'

/**
 * Chatham Permits — organizer for Chatham County's monthly permit reports.
 *
 * HONEST DESIGN: Chatham County publishes NO live permit API — only monthly
 * reports (PDF/Excel) on chathamcountync.gov. So this tool doesn't pretend to
 * fetch live data. Instead: you open the county's monthly report, copy the
 * text (Ctrl+A, Ctrl+C in the PDF) or paste CSV, and this parses it into a
 * clean, sortable, flip-focused table. Works with what actually exists.
 *
 * The parser is tolerant: it scans pasted lines for permit-shaped records —
 * permit numbers, dates, dollar values, addresses — and also handles proper
 * CSV with headers. Unknown lines are skipped, never crash.
 */

const NAVY = '#0F2460'
const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

export interface ChathamPermit {
  permitNum:   string
  date:        string
  type:        string
  address:     string
  value:       number
  contractor:  string
  owner:       string
  raw:         string
  flipSignal:  'strong' | 'medium' | 'low'
}

// Flip-relevance: what a GC-investor actually cares about in a permit feed
function flipSignal(type: string, value: number): ChathamPermit['flipSignal'] {
  const t = type.toLowerCase()
  // Strong: demolition, repair, foundation, fire — distress or teardown signals
  if (/demo|repair|fire|foundation|condemn|unsafe/.test(t)) return 'strong'
  // Strong: big-value new SFD nearby = appreciating pocket
  if (/single|sfd|dwelling|new house|new home/.test(t) && value >= 200000) return 'strong'
  // Medium: additions/renovations = active investment in the area
  if (/addition|renovat|remodel|alteration|upfit/.test(t)) return 'medium'
  if (value >= 100000) return 'medium'
  return 'low'
}

// ── tolerant parsing ──────────────────────────────────────────────────────────
const DATE_RE   = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/
const MONEY_RE  = /(?:\$\s?|valuation:?\s*\$?\s?|value:?\s*\$?\s?|cost:?\s*\$?\s?)([\d,]{4,})(?:\.\d{2})?\b/i
const PERMIT_RE = /\b(\d{2,4}[-\/]?\d{3,6}|[A-Z]{1,4}[-\s]?\d{4,8})\b/
const ADDR_RE   = /\b(\d{1,6}\s+[A-Za-z0-9.\- ]{3,40}\s(?:RD|ROAD|ST|STREET|DR|DRIVE|LN|LANE|CT|COURT|WAY|CIR|CIRCLE|AVE|AVENUE|HWY|TRL|TRAIL|PL|PLACE|LOOP|PKWY|BLVD)\b\.?)/i

function splitCSVLine(line: string): string[] {
  const out: string[] = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (q && line[i+1] === '"') { cur += '"'; i++ } else q = !q }
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

export function parseChathamReport(text: string): ChathamPermit[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) return []
  const permits: ChathamPermit[] = []

  // Path A: looks like CSV with headers?
  const head = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase())
  const isCSV = head.length >= 3 && head.some(h => /permit|date|address|type|value|descr/.test(h))
  if (isCSV) {
    const idx = {
      permit: head.findIndex(h => /permit|number|#/.test(h)),
      date:   head.findIndex(h => /date|issued/.test(h)),
      type:   head.findIndex(h => /type|descr|work|class/.test(h)),
      addr:   head.findIndex(h => /address|location|site/.test(h)),
      value:  head.findIndex(h => /value|cost|valuation|amount/.test(h)),
      contr:  head.findIndex(h => /contractor|builder|applicant/.test(h)),
      owner:  head.findIndex(h => /owner/.test(h)),
    }
    for (let i = 1; i < lines.length; i++) {
      const c = splitCSVLine(lines[i])
      const g = (j: number) => (j >= 0 && j < c.length ? c[j].trim() : '')
      const addr = g(idx.addr); if (!addr && !g(idx.permit)) continue
      const val = parseFloat(g(idx.value).replace(/[$,\s]/g, '')) || 0
      const type = g(idx.type) || 'Permit'
      permits.push({
        permitNum: g(idx.permit) || '—', date: g(idx.date) || '', type,
        address: addr || '—', value: val,
        contractor: g(idx.contr) || '', owner: g(idx.owner) || '',
        raw: lines[i], flipSignal: flipSignal(type, val),
      })
    }
    return permits
  }

  // Path B: pasted PDF text — scan line-by-line for permit-shaped records.
  // A record line usually contains an address; date/permit#/value may be on
  // the same line or adjacent ones, so we look in a small window.
  for (let i = 0; i < lines.length; i++) {
    const addrM = lines[i].match(ADDR_RE)
    if (!addrM) continue
    const windowText = [lines[i-1] || '', lines[i], lines[i+1] || ''].join('  ')
    const dateM   = windowText.match(DATE_RE)
    const moneyM  = windowText.match(MONEY_RE)
    const permitM = windowText.match(PERMIT_RE)
    const value   = moneyM ? parseFloat(moneyM[1].replace(/,/g, '')) : 0
    // Type: search the window for a known permit-type phrase (types often sit on
    // a different line than the address in PDF paste); fall back to cleaning the line.
    const TYPE_RE = /(new single family dwelling|single family|residential repair(?:\s*[-–]\s*fire damage)?|fire damage|demolition(?:\s*[-–]?\s*(?:residential|commercial))?|foundation repair|addition\/?\s?renovation|renovation|remodel|accessory building|electrical only|plumbing only|mechanical only|deck|garage|pool|manufactured home|modular|commercial upfit|upfit)/i
    const typeM = windowText.match(TYPE_RE)
    let type = typeM ? typeM[1].trim() : lines[i]
      .replace(addrM[0], '').replace(DATE_RE, '').replace(MONEY_RE, '')
      .replace(PERMIT_RE, '').replace(/[|,;]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (type.length < 3) type = 'Permit'
    permits.push({
      permitNum: permitM ? permitM[1] : '—',
      date: dateM ? dateM[1] : '',
      type: type.slice(0, 60),
      address: addrM[1].trim(),
      value,
      contractor: '', owner: '',
      raw: lines[i],
      flipSignal: flipSignal(type, value),
    })
  }
  return permits
}

// ── component ────────────────────────────────────────────────────────────────
type SortKey = 'signal' | 'value' | 'date' | 'address'

export default function ChathamPermits() {
  const [pasted, setPasted]   = useState('')
  const [permits, setPermits] = useState<ChathamPermit[]>([])
  const [search, setSearch]   = useState('')
  const [minVal, setMinVal]   = useState(0)
  const [sort, setSort]       = useState<SortKey>('signal')
  const [fetching, setFetching] = useState(false)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)

  const handleFetchLatest = async () => {
    setFetching(true)
    try {
      const { data, error } = await supabase.functions.invoke('chatham-permits', { body: {} })
      if (error) throw new Error(error.message)
      if (!data?.text) throw new Error(data?.error || 'No report text returned')
      setPasted(data.text)
      setSourceUrl(data.reportUrl || null)
      const parsed = parseChathamReport(data.text)
      if (parsed.length) {
        setPermits(parsed)
        toast.success(`Fetched & organized ${parsed.length} permits`)
      } else {
        toast.warning('Report fetched but no records recognized — review the text below')
      }
    } catch (e) {
      toast.error(`Fetch failed: ${(e as Error).message}`)
    } finally {
      setFetching(false)
    }
  }

  const handleParse = () => {
    const p = parseChathamReport(pasted)
    if (!p.length) { toast.warning('No permit records recognized — check the pasted text has addresses/values'); return }
    setPermits(p)
    toast.success(`${p.length} permits organized`)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader()
    r.onload = () => { setPasted(String(r.result || '')); }
    r.readAsText(f)
  }

  const view = useMemo(() => {
    const rank = { strong: 2, medium: 1, low: 0 }
    let v = permits.filter(p =>
      p.value >= minVal &&
      (!search || `${p.address} ${p.type} ${p.contractor} ${p.owner}`.toLowerCase().includes(search.toLowerCase()))
    )
    v.sort((a, b) =>
      sort === 'signal'  ? rank[b.flipSignal] - rank[a.flipSignal] || b.value - a.value :
      sort === 'value'   ? b.value - a.value :
      sort === 'date'    ? b.date.localeCompare(a.date) :
      a.address.localeCompare(b.address)
    )
    return v
  }, [permits, search, minVal, sort])

  const exportCSV = () => {
    const rows = [['Signal','Permit#','Date','Type','Address','Value','Contractor','Owner'],
      ...view.map(p => [p.flipSignal, p.permitNum, p.date, p.type, p.address, String(p.value), p.contractor, p.owner])]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'chatham-permits-organized.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const SIG = {
    strong: { label: '🔥 Strong', bg: '#FEF0ED', color: '#C0341D' },
    medium: { label: '↗ Medium', bg: '#FEF7EA', color: '#8A5700' },
    low:    { label: '· Low',    bg: '#F1F5F9', color: '#94A3B8' },
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#F8FAFC' }}>
      <div className="px-6 py-5 border-b bg-white" style={{ borderColor: '#E5E9F0' }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏛️</span>
          <div>
            <h1 className="text-lg font-black tracking-tight" style={{ color: NAVY }}>Chatham Permits</h1>
            <p className="text-xs" style={{ color: '#64748B' }}>Organize the county's monthly permit report into flip opportunities</p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-4xl">
        {permits.length === 0 ? (
          <>
            <div className="rounded-xl p-4 mb-4" style={{ background: '#EEF2FB' }}>
              <div className="text-xs font-bold mb-2" style={{ color: NAVY }}>How to get the report (2 minutes, once a month)</div>
              <ol className="text-xs space-y-1 pl-4 m-0" style={{ color: '#475569' }}>
                <li>1. Go to <strong>chathamcountync.gov</strong> → Central Permitting & Inspections → <strong>monthly permit reports</strong> (Jan 2017–present). If the page moves, email <strong>bid…@ / Central Permitting</strong> at 80 East St, Pittsboro and ask for the latest monthly issued-permits report.</li>
                <li>2. Open the report. If PDF: <strong>Select All (Ctrl/Cmd+A) → Copy</strong>. If Excel/CSV: save as CSV.</li>
                <li>3. Paste the text below (or upload the CSV) → <strong>Organize</strong>.</li>
              </ol>
            </div>
            <textarea
              value={pasted}
              onChange={e => setPasted(e.target.value)}
              placeholder={'Paste the monthly report text here (or upload CSV)…\n\nThe parser recognizes permit records by address + value + date, and skips everything else. CSV with headers (Permit #, Date, Type, Address, Value…) is parsed by column.'}
              className="w-full h-56 rounded-xl border px-3 py-2 text-xs font-mono outline-none resize-none"
              style={{ borderColor: '#D1D9E6', background: 'white' }}
            />
            <div className="flex items-center gap-3 mt-3">
              <button onClick={handleFetchLatest} disabled={fetching}
                className="px-5 py-2.5 rounded-lg text-sm font-bold text-white border-none cursor-pointer disabled:opacity-60"
                style={{ background: '#1B3A8C' }}>
                {fetching ? 'Fetching…' : '⬇ Fetch latest report'}
              </button>
              <button onClick={handleParse}
                className="px-5 py-2.5 rounded-lg text-sm font-bold text-white border-none cursor-pointer"
                style={{ background: NAVY }}>
                Organize Report →
              </button>
              <label className="px-4 py-2.5 rounded-lg text-sm font-semibold border cursor-pointer"
                style={{ borderColor: '#D1D9E6', color: NAVY }}>
                Upload CSV / TXT
                <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleFile} className="hidden" />
              </label>
            </div>
            {sourceUrl && (
              <div className="text-[11px] mt-2" style={{ color: '#64748B' }}>
                Source: <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ color: NAVY }}>{sourceUrl}</a>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search address / type / contractor…"
                className="flex-1 min-w-40 rounded-lg border px-3 py-2 text-xs outline-none" style={{ borderColor: '#D1D9E6' }} />
              <select value={minVal} onChange={e => setMinVal(+e.target.value)}
                className="rounded-lg border px-2 py-2 text-xs outline-none cursor-pointer" style={{ borderColor: '#D1D9E6' }}>
                <option value={0}>Any value</option>
                <option value={50000}>$50k+</option>
                <option value={100000}>$100k+</option>
                <option value={250000}>$250k+</option>
              </select>
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
                className="rounded-lg border px-2 py-2 text-xs outline-none cursor-pointer" style={{ borderColor: '#D1D9E6' }}>
                <option value="signal">Sort: Flip signal</option>
                <option value="value">Sort: Value</option>
                <option value="date">Sort: Date</option>
                <option value="address">Sort: Address</option>
              </select>
              <button onClick={exportCSV} className="px-3 py-2 rounded-lg text-xs font-bold border cursor-pointer"
                style={{ borderColor: '#D1D9E6', color: NAVY }}>⬇ Export CSV</button>
              <button onClick={() => { setPermits([]); setPasted('') }} className="px-3 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer"
                style={{ background: '#F1F5F9', color: '#64748B' }}>↺ New report</button>
            </div>

            <div className="text-xs mb-2" style={{ color: '#64748B' }}>{view.length} of {permits.length} permits</div>

            {/* Table */}
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E5E9F0' }}>
              <div className="grid px-3 py-2 text-[10px] font-bold uppercase tracking-wide border-b"
                style={{ gridTemplateColumns: '90px 1fr 90px 90px', color: '#94A3B8', borderColor: '#E5E9F0' }}>
                <span>Signal</span><span>Permit</span><span className="text-right">Value</span><span className="text-right">Date</span>
              </div>
              {view.map((p, i) => {
                const s = SIG[p.flipSignal]
                return (
                  <div key={i} className="grid px-3 py-2.5 text-xs border-b items-center"
                    style={{ gridTemplateColumns: '90px 1fr 90px 90px', borderColor: '#F1F5F9' }}>
                    <span><span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: s.bg, color: s.color }}>{s.label}</span></span>
                    <span className="min-w-0">
                      <div className="font-bold truncate" style={{ color: NAVY }}>{p.address}</div>
                      <div className="truncate" style={{ color: '#64748B' }}>
                        {p.type}{p.permitNum !== '—' ? ` · #${p.permitNum}` : ''}{p.contractor ? ` · ${p.contractor}` : ''}
                      </div>
                    </span>
                    <span className="text-right font-bold" style={{ color: p.value > 0 ? NAVY : '#CBD5E1' }}>{p.value > 0 ? fmt(p.value) : '—'}</span>
                    <span className="text-right" style={{ color: '#64748B' }}>{p.date || '—'}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
