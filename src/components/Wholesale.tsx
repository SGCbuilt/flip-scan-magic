/**
 * Wholesale Deal Machine — Full UI
 * 
 * Create wholesale deals from pipeline leads
 * Track status: Listed → Pending → Closed
 * Generate PDF summaries + email templates
 * Track total assignment fees earned
 */
import { useState, useEffect } from 'react'
import {
  getWholesaleDeals, createWholesaleDeal, updateWholesaleDeal,
  closeWholesaleDeal, pullWholesaleDeal, getWholesaleStats,
  generateWholesalePDF, generateWholesaleEmail,
  WholesaleDeal, WholesaleStatus,
} from '../lib/wholesalePDF'
import { matchBuyers, recordDealShared, getBuyers } from '../lib/buyerList'
import { getPipeline, PipelineLead } from '../lib/pipeline'

const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'

const STATUS_CONFIG: Record<WholesaleStatus, { label: string; color: string; bg: string; icon: string }> = {
  listed:  { label: 'Listed',  color: '#1B3A8C', bg: '#EEF2FB', icon: '📢' },
  pending: { label: 'Pending', color: '#8A5700', bg: '#FEF7EA', icon: '🤝' },
  closed:  { label: 'Closed',  color: '#1A7A4A', bg: '#EDFAF3', icon: '✅' },
  pulled:  { label: 'Pulled',  color: 'var(--sgc-gray-mid)', bg: 'var(--sgc-gray-light)', icon: '↩️' },
}

// ── New Deal Modal ────────────────────────────────────────────────────────────
function NewDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const pipelineLeads = getPipeline().filter(l =>
    ['researching','contacted','negotiating','under_contract'].includes(l.stage)
  )

  const [selectedLeadId, setSelectedLead] = useState(pipelineLeads[0]?.id || '')
  const [arv,            setArv]           = useState(0)
  const [rehab,          setRehab]         = useState(0)
  const [contractPrice,  setContract]      = useState(0)
  const [assignmentFee,  setFee]           = useState(10000)
  const [beds,           setBeds]          = useState(3)
  const [baths,          setBaths]         = useState(2)
  const [sqft,           setSqft]          = useState(1200)
  const [yearBuilt,      setYearBuilt]     = useState(0)
  const [propertyType,   setPropType]      = useState('Single Family')
  const [description,    setDescription]   = useState('')
  const [photos,         setPhotos]        = useState('')

  const lead = pipelineLeads.find(l => l.id === selectedLeadId)
  const askingPrice = contractPrice + assignmentFee
  const buyerProfit = arv - askingPrice - rehab
  const buyerROI    = arv > 0 && askingPrice > 0 ? Math.round((buyerProfit / (askingPrice + rehab)) * 100) : 0

  // Auto-fill from pipeline lead
  useEffect(() => {
    if (lead) {
      if (lead.estimatedARV > 0)    setArv(lead.estimatedARV)
      if (lead.estimatedRehab > 0)  setRehab(lead.estimatedRehab)
      if (lead.maxOffer > 0)        setContract(lead.maxOffer)
      if (lead.notes) setDescription(lead.notes)
    }
  }, [selectedLeadId])

  const handleCreate = () => {
    if (!lead) return
    createWholesaleDeal(lead, {
      arv, rehab, contractPrice, assignmentFee,
      beds, baths, sqft, yearBuilt, propertyType, description, photos,
    })
    onCreated()
    onClose()
  }

  const NumInput = ({ label, value, set, prefix = '$' }: {
    label: string; value: number; set: (n: number) => void; prefix?: string
  }) => (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>{prefix}</span>
        <input type="number" value={value} onChange={e => set(parseFloat(e.target.value)||0)}
          className="w-full rounded-lg border text-sm py-2 pl-6 pr-3 outline-none"
          style={{ borderColor: 'var(--sgc-gray-border)' }} />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        <div className="p-5 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl"
          style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div>
            <div className="font-bold text-base" style={{ color: 'var(--sgc-navy)' }}>🏷️ Create Wholesale Deal</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Turn this lead into a wholesale listing</div>
          </div>
          <button onClick={onClose} className="text-xl cursor-pointer bg-transparent border-none" style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Lead selector */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>
              Select from Pipeline
            </div>
            {pipelineLeads.length === 0 ? (
              <div className="text-sm p-3 rounded-xl" style={{ background: '#FEF7EA', color: '#8A5700' }}>
                No active pipeline leads. Add leads from Lead Radar first.
              </div>
            ) : (
              <select className="w-full rounded-lg border text-sm px-3 py-2.5 outline-none"
                style={{ borderColor: 'var(--sgc-gray-border)' }}
                value={selectedLeadId} onChange={e => setSelectedLead(e.target.value)}>
                {pipelineLeads.map(l => (
                  <option key={l.id} value={l.id}>{l.address}, {l.city}, {l.state}</option>
                ))}
              </select>
            )}
            {lead && (
              <div className="mt-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
                Signal: {lead.signalLabel} · Score: {lead.investorScore}/100 · {lead.city}, {lead.state}
              </div>
            )}
          </div>

          {/* Deal numbers */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>Deal Numbers</div>
            <div className="grid grid-cols-2 gap-3">
              <NumInput label="ARV (After Repair Value)" value={arv} set={setArv} />
              <NumInput label="Estimated Rehab" value={rehab} set={setRehab} />
              <NumInput label="Your Contract Price" value={contractPrice} set={setContract} />
              <NumInput label="Assignment Fee (your profit)" value={assignmentFee} set={setFee} />
            </div>
          </div>

          {/* Live deal preview */}
          {arv > 0 && askingPrice > 0 && (
            <div className="grid grid-cols-3 gap-3 p-4 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
              <div className="text-center">
                <div className="text-xs mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Asking Price</div>
                <div className="text-xl font-black" style={{ color: 'var(--sgc-navy)' }}>{fmt$(askingPrice)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Buyer Profit</div>
                <div className="text-xl font-black" style={{ color: buyerProfit > 0 ? '#1A7A4A' : '#C0341D' }}>{fmt$(buyerProfit)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Buyer ROI</div>
                <div className="text-xl font-black" style={{ color: buyerROI >= 20 ? '#1A7A4A' : '#C0341D' }}>{buyerROI}%</div>
              </div>
            </div>
          )}

          {/* Property details */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>Property Details</div>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <NumInput label="Beds" value={beds} set={setBeds} prefix="" />
              <NumInput label="Baths" value={baths} set={setBaths} prefix="" />
              <NumInput label="Sq Ft" value={sqft} set={setSqft} prefix="" />
              <NumInput label="Year Built" value={yearBuilt} set={setYearBuilt} prefix="" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Property Type</div>
              <div className="grid grid-cols-3 gap-2">
                {['Single Family', 'Multi-Family', 'Townhouse', 'Condo', 'Mobile Home', 'Land'].map(t => (
                  <button key={t} onClick={() => setPropType(t)}
                    className="py-2 rounded-lg border text-xs font-medium cursor-pointer"
                    style={propertyType === t
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description & photos */}
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                Property Description / Why It's Available
              </div>
              <textarea
                className="w-full rounded-lg border text-sm px-3 py-2 outline-none resize-none"
                style={{ borderColor: 'var(--sgc-gray-border)', minHeight: 80 }}
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Structural violations, absentee owner, estate sale, fire damage — the story behind the deal..." />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Photos URL (Zillow / Google Maps)</div>
              <input type="text" value={photos} onChange={e => setPhotos(e.target.value)}
                className="w-full rounded-lg border text-sm px-3 py-2 outline-none"
                style={{ borderColor: 'var(--sgc-gray-border)' }}
                placeholder="https://zillow.com/homes/... or Google Maps link" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreate} disabled={!lead || arv === 0 || contractPrice === 0}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: !lead || arv === 0 || contractPrice === 0 ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)' }}>
              📢 List This Deal for Wholesale
            </button>
            <button onClick={onClose}
              className="px-5 py-3 rounded-xl text-sm border-none cursor-pointer"
              style={{ background: 'var(--sgc-gray-border)' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Deal Card ─────────────────────────────────────────────────────────────────
function DealCard({ deal, onUpdate }: { deal: WholesaleDeal; onUpdate: () => void }) {
  const sc = STATUS_CONFIG[deal.status]
  const buyerProfit = deal.arv - deal.askingPrice - deal.rehab
  const buyerROI    = deal.arv > 0 ? Math.round((buyerProfit / (deal.askingPrice + deal.rehab)) * 100) : 0
  const [showEmail,   setShowEmail]   = useState(false)
  const [showClose,   setShowClose]   = useState(false)
  const [buyerName,   setBuyerName]   = useState('')
  const [feePaid,     setFeePaid]     = useState(deal.assignmentFee)
  const emailText = generateWholesaleEmail(deal)

  return (
    <div className="bg-white rounded-2xl border overflow-hidden"
      style={{ borderColor: deal.status === 'closed' ? '#1A7A4A30' : deal.status === 'listed' ? 'var(--sgc-navy)20' : 'var(--sgc-gray-border)' }}>

      {/* Status bar */}
      <div className="h-1" style={{ background: sc.color }}/>

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base leading-tight" style={{ color: 'var(--sgc-black)' }}>{deal.address}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              {deal.city}, {deal.state} {deal.zip} · {deal.county && `${deal.county} County`}
            </div>
            <div className="text-[10px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>
              {deal.signalLabel} · Listed {new Date(deal.listedAt).toLocaleDateString()}
            </div>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
            style={{ background: sc.bg, color: sc.color }}>
            {sc.icon} {sc.label}
          </span>
        </div>

        {/* Numbers */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { l: 'ARV',        v: fmt$(deal.arv),        c: 'var(--sgc-navy)' },
            { l: 'Asking',     v: fmt$(deal.askingPrice), c: 'var(--sgc-black)' },
            { l: 'Buyer Profit', v: fmt$(buyerProfit),  c: buyerProfit > 0 ? '#1A7A4A' : '#C0341D' },
            { l: 'Assignment', v: fmt$(deal.assignmentFee), c: '#1A7A4A' },
          ].map(m => (
            <div key={m.l} className="text-center p-2 rounded-lg" style={{ background: 'var(--sgc-gray-light)' }}>
              <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
              <div className="text-sm font-black" style={{ color: m.c }}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Buyer ROI */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sgc-gray-border)' }}>
            <div className="h-full rounded-full" style={{
              width: `${Math.min(100, buyerROI)}%`,
              background: buyerROI >= 25 ? '#1A7A4A' : buyerROI >= 15 ? '#C45E1A' : '#C0341D'
            }}/>
          </div>
          <span className="text-xs font-bold flex-shrink-0" style={{ color: buyerROI >= 25 ? '#1A7A4A' : buyerROI >= 15 ? '#C45E1A' : '#C0341D' }}>
            {buyerROI}% buyer ROI
          </span>
        </div>

        {/* Closed details */}
        {deal.status === 'closed' && deal.buyerName && (
          <div className="mb-3 p-2.5 rounded-xl text-xs" style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
            🎉 Closed with {deal.buyerName} · Assignment fee: {fmt$(deal.assignmentPaid || 0)}
          </div>
        )}

        {/* Action buttons */}
        {deal.status !== 'pulled' && deal.status !== 'closed' && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => generateWholesalePDF(deal)}
              className="text-xs font-bold px-3 py-2 rounded-lg border-none cursor-pointer text-white"
              style={{ background: 'var(--sgc-navy)' }}>
              📄 PDF
            </button>
            <button onClick={() => {
              const matches = matchBuyers({ state: deal.state, county: deal.county, arv: deal.arv, askingPrice: deal.askingPrice, rehab: deal.rehab })
              const topBuyers = matches.filter(m => m.score >= 60).slice(0, 10)
              if (topBuyers.length === 0) { alert('No matching buyers. Add buyers in the Buyers tab first.'); return }
              topBuyers.forEach((m, i) => {
                setTimeout(() => {
                  const subject = `🏠 DEAL: ${deal.address}, ${deal.city} ${deal.state}`
                  const body = generateWholesaleEmail(deal).replace(/^Subject:.*\n\n/, '')
                  window.open(`mailto:${m.buyer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank')
                }, i * 400)
              })
              recordDealShared(topBuyers.map(m => m.buyer.id))
              alert(`📢 Blast sent to ${topBuyers.length} matching buyer${topBuyers.length > 1 ? 's' : ''}! Check your email client.`)
            }}
              className="text-xs font-bold px-3 py-2 rounded-lg border-none cursor-pointer"
              style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
              📢 Blast ({matchBuyers({ state: deal.state, county: deal.county, arv: deal.arv, askingPrice: deal.askingPrice, rehab: deal.rehab }).filter(m => m.score >= 60).length})
            </button>
            <button onClick={() => setShowEmail(e => !e)}
              className="text-xs font-bold px-3 py-2 rounded-lg border-none cursor-pointer"
              style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
              ✉️ Email Template
            </button>
            {deal.status === 'listed' && (
              <button onClick={() => { updateWholesaleDeal(deal.id, { status: 'pending' }); onUpdate() }}
                className="text-xs font-bold px-3 py-2 rounded-lg border-none cursor-pointer"
                style={{ background: '#FEF7EA', color: '#8A5700' }}>
                🤝 Mark Pending
              </button>
            )}
            <button onClick={() => setShowClose(true)}
              className="text-xs font-bold px-3 py-2 rounded-lg border-none cursor-pointer"
              style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
              ✅ Close Deal
            </button>
            <button onClick={() => { pullWholesaleDeal(deal.id); onUpdate() }}
              className="text-xs px-3 py-2 rounded-lg border-none cursor-pointer"
              style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
              ↩ Pull
            </button>
          </div>
        )}

        {/* Closed actions */}
        {deal.status === 'closed' && (
          <button onClick={() => generateWholesalePDF(deal)}
            className="text-xs font-bold px-3 py-2 rounded-lg border-none cursor-pointer text-white"
            style={{ background: 'var(--sgc-navy)' }}>
            📄 View Summary
          </button>
        )}

        {/* Email template */}
        {showEmail && (
          <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="flex items-center justify-between px-3 py-2"
              style={{ background: 'var(--sgc-gray-light)' }}>
              <span className="text-xs font-bold" style={{ color: 'var(--sgc-navy)' }}>Email Template — Copy & Send</span>
              <button onClick={() => navigator.clipboard.writeText(emailText)}
                className="text-xs font-bold px-2.5 py-1 rounded-lg border-none cursor-pointer text-white"
                style={{ background: 'var(--sgc-navy)' }}>
                Copy
              </button>
            </div>
            <pre className="text-[10px] p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed"
              style={{ color: 'var(--sgc-black)', fontFamily: 'monospace', maxHeight: 200 }}>
              {emailText}
            </pre>
          </div>
        )}

        {/* Close deal form */}
        {showClose && (
          <div className="mt-3 p-4 rounded-xl border space-y-3" style={{ borderColor: '#1A7A4A40', background: '#EDFAF3' }}>
            <div className="text-xs font-bold" style={{ color: '#1A7A4A' }}>✅ Close This Deal</div>
            <input type="text" value={buyerName} onChange={e => setBuyerName(e.target.value)}
              className="w-full rounded-lg border text-sm px-3 py-2 outline-none bg-white"
              style={{ borderColor: '#1A7A4A40' }} placeholder="Buyer name" />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>$</span>
              <input type="number" value={feePaid} onChange={e => setFeePaid(parseFloat(e.target.value)||0)}
                className="w-full rounded-lg border text-sm py-2 pl-7 pr-3 outline-none bg-white"
                style={{ borderColor: '#1A7A4A40' }} placeholder="Assignment fee collected" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { closeWholesaleDeal(deal.id, buyerName, feePaid); setShowClose(false); onUpdate() }}
                className="flex-1 py-2 rounded-lg text-xs font-bold text-white border-none cursor-pointer"
                style={{ background: '#1A7A4A' }}>
                Confirm Close — {fmt$(feePaid)} Fee
              </button>
              <button onClick={() => setShowClose(false)}
                className="px-3 py-2 rounded-lg text-xs border-none cursor-pointer"
                style={{ background: 'var(--sgc-gray-border)' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Wholesale Component ──────────────────────────────────────────────────
export default function Wholesale() {
  const [deals,    setDeals]    = useState<WholesaleDeal[]>([])
  const [showNew,  setShowNew]  = useState(false)
  const [filter,   setFilter]   = useState<WholesaleStatus | 'all'>('all')

  const refresh = () => setDeals(getWholesaleDeals())
  useEffect(() => { refresh() }, [])

  const stats = getWholesaleStats()
  const displayed = deals.filter(d => filter === 'all' || d.status === filter)

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* Header */}
      <div className="flex-shrink-0 border-b bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        {/* Stats strip */}
        <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(5,1fr)', borderColor: 'var(--sgc-gray-border)' }}>
          {[
            { l: 'Active Listings', v: stats.active,    c: 'var(--sgc-navy)' },
            { l: 'Deals Closed',    v: stats.closed,    c: '#1A7A4A'         },
            { l: 'Total Fees Earned', v: fmt$(stats.totalFees), c: '#1A7A4A' },
            { l: 'Avg Fee',         v: stats.closed > 0 ? fmt$(Math.round(stats.totalFees/stats.closed)) : '—', c: '#534AB7' },
            { l: 'Total Deals',     v: stats.total,     c: 'var(--sgc-black)'},
          ].map((s, i) => (
            <div key={s.l} className={`p-3 ${i < 4 ? 'border-r' : ''}`} style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
              <div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="flex gap-1">
            {(['all','listed','pending','closed','pulled'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="text-[10px] px-2.5 py-1.5 rounded border cursor-pointer capitalize"
                style={filter === f
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {f === 'all' ? 'All' : STATUS_CONFIG[f].icon + ' ' + STATUS_CONFIG[f].label}
                {f !== 'all' && deals.filter(d => d.status === f).length > 0 &&
                  ` (${deals.filter(d => d.status === f).length})`}
              </button>
            ))}
          </div>
          <button onClick={() => setShowNew(true)}
            className="ml-auto px-4 py-2 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: 'var(--sgc-navy)' }}>
            + New Wholesale Deal
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {deals.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto px-8">
            <div className="text-5xl mb-4">🏷️</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Wholesale Deal Machine</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--sgc-gray-mid)' }}>
              Found a deal you can't flip yourself? Don't let it die. Put it under contract and wholesale it to your buyer list for a $5-15k assignment fee.
            </p>
            <div className="text-left w-full space-y-3 mb-6">
              {[
                { icon: '📋', t: 'Step 1 — Get it under contract', d: 'Use your pipeline lead. Negotiate with the seller and lock it up at your target price.' },
                { icon: '🏷️', t: 'Step 2 — Create wholesale listing', d: 'Enter your ARV, rehab estimate, contract price, and assignment fee. The deal summary is auto-generated.' },
                { icon: '📄', t: 'Step 3 — Generate PDF + Email', d: 'One click creates a professional PDF and email template. Send to your buyer list immediately.' },
                { icon: '✅', t: 'Step 4 — Collect your fee', d: 'Buyer closes, you collect the assignment fee. Track everything here.' },
              ].map(s => (
                <div key={s.t} className="flex gap-3 bg-white rounded-xl border p-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <span className="text-xl flex-shrink-0 mt-0.5">{s.icon}</span>
                  <div>
                    <div className="text-sm font-bold mb-0.5" style={{ color: 'var(--sgc-navy)' }}>{s.t}</div>
                    <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowNew(true)}
              className="px-8 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>
              Create Your First Wholesale Deal →
            </button>
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
            No {filter} deals · <button onClick={() => setFilter('all')} className="cursor-pointer bg-transparent border-none underline" style={{ color: 'var(--sgc-navy)' }}>Show all</button>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))' }}>
            {displayed.map(d => (
              <DealCard key={d.id} deal={d} onUpdate={refresh} />
            ))}
          </div>
        )}
      </div>

      {showNew && <NewDealModal onClose={() => setShowNew(false)} onCreated={refresh} />}
    </div>
  )
}
