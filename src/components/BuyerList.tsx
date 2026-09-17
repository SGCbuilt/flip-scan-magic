import { useEscapeKey } from '../lib/useEscapeKey'
/**
 * Buyer List Manager — Full UI
 *
 * Add buyers with their buy box criteria.
 * When you have a wholesale deal, the system auto-matches and
 * lets you blast the deal to all matching buyers in one click.
 */
import { useState, useEffect } from 'react'
import {
  getBuyers, addBuyer, updateBuyer, deleteBuyer,
  matchBuyers, recordDealShared, getBuyerStats,
  Buyer, BuyerMatch, BuyerType, PropertyPref, RehabPref,
} from '../lib/buyerList'
import { getWholesaleDeals } from '../lib/wholesalePDF'
import { generateWholesaleEmail } from '../lib/wholesalePDF'
import { supabase } from '@/integrations/supabase/client'

// ── Waitlist signups from the coming-soon page ────────────────────────────────
interface WaitlistLead {
  id: string; full_name: string; email: string; phone: string | null
  markets: string; motion: string; company: string | null; message: string | null
  created_at: string
}

function WaitlistPanel() {
  const [leads,  setLeads]  = useState<WaitlistLead[]>([])
  const [open,   setOpen]   = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.from('waitlist_leads').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { setLeads((data as WaitlistLead[]) || []); setLoaded(true) })
  }, [])

  if (!loaded || leads.length === 0) return null

  return (
    <div className="mb-4 bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-none cursor-pointer bg-transparent">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>📥 Waitlist signups</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#EEF2FB', color: '#1B3A8C' }}>{leads.length}</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{open ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {open && (
        <div className="border-t divide-y" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          {leads.map(l => (
            <div key={l.id} className="px-4 py-3 flex items-start justify-between gap-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="min-w-0">
                <div className="text-xs font-bold" style={{ color: 'var(--sgc-black)' }}>
                  {l.full_name} {l.company ? <span style={{ color: 'var(--sgc-gray-mid)', fontWeight: 400 }}>· {l.company}</span> : null}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {l.email}{l.phone ? ` · ${l.phone}` : ''} · {l.markets} · {l.motion}
                </div>
                {l.message && <div className="text-[11px] mt-1 italic" style={{ color: 'var(--sgc-gray-mid)' }}>"{l.message}"</div>}
              </div>
              <div className="text-[10px] flex-shrink-0" style={{ color: 'var(--sgc-gray-mid)' }}>
                {new Date(l.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const fmt$ = (n: number) => n >= 1000 ? `$${Math.round(n/1000)}k` : n > 0 ? `$${n}` : '—'

const BUYER_TYPE_LABEL: Record<BuyerType, string> = {
  cash:         '💵 Cash',
  hard_money:   '🏦 Hard Money',
  conventional: '📋 Conventional',
  any:          'Any Financing',
}
const REHAB_LABEL: Record<RehabPref, string> = {
  turnkey: '✨ Turnkey',
  light:   '🔨 Light Rehab',
  heavy:   '🏚️ Heavy Rehab',
  any:     'Any Condition',
}
const PROP_LABEL: Record<PropertyPref, string> = {
  sfr:   '🏠 Single Family',
  multi: '🏘️ Multi-Family',
  both:  '🏠🏘️ SFR + Multi',
  any:   'Any Type',
}

// ── Add / Edit Buyer Modal ────────────────────────────────────────────────────
function BuyerModal({ buyer, onClose, onSave }: {
  buyer?: Buyer; onClose: () => void; onSave: () => void
}) {
  const isEdit = !!buyer
  const [name,        setName]       = useState(buyer?.name        || '')
  const [company,     setCompany]    = useState(buyer?.company     || '')
  useEscapeKey(onClose)
  const [email,       setEmail]      = useState(buyer?.email       || '')
  const [phone,       setPhone]      = useState(buyer?.phone       || '')
  const [states,      setStates]     = useState<string[]>(buyer?.states || ['VA'])
  const [minARV,      setMinARV]     = useState(buyer?.minARV      || 0)
  const [maxARV,      setMaxARV]     = useState(buyer?.maxARV      || 500000)
  const [maxPrice,    setMaxPrice]   = useState(buyer?.maxPrice    || 300000)
  const [buyerType,   setBuyerType]  = useState<BuyerType>(buyer?.buyerType   || 'cash')
  const [propPref,    setPropPref]   = useState<PropertyPref>(buyer?.propertyPref || 'sfr')
  const [rehabPref,   setRehabPref]  = useState<RehabPref>(buyer?.rehabPref  || 'any')
  const [notes,       setNotes]      = useState(buyer?.notes       || '')
  const [countiesRaw, setCounties]   = useState(buyer?.counties?.join(', ') || '')

  const toggleState = (s: string) =>
    setStates(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const handleSave = () => {
    if (!name || !email) return
    const data = {
      name, company, email, phone,
      states: states.length ? states : ['VA'],
      counties: countiesRaw.split(',').map(s => s.trim()).filter(Boolean),
      minARV, maxARV, maxPrice,
      buyerType, propertyPref: propPref, rehabPref,
      notes, active: true,
    }
    if (isEdit) {
      updateBuyer(buyer!.id, data)
    } else {
      addBuyer(data)
    }
    onSave(); onClose()
  }

  const NumInput = ({ label, value, set }: { label: string; value: number; set: (n: number) => void }) => (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>$</span>
        <input type="number" value={value} onChange={e => set(parseFloat(e.target.value)||0)}
          className="w-full rounded-xl border text-sm py-2 pl-6 pr-3 outline-none"
          style={{ borderColor: 'var(--sgc-gray-border)' }} />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="p-5 border-b flex justify-between sticky top-0 bg-white rounded-t-2xl"
          style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>
            {isEdit ? '✏️ Edit Buyer' : '+ Add Buyer'}
          </div>
          <button onClick={onClose} className="text-xl cursor-pointer bg-transparent border-none" aria-label="Close" style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Contact info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Full Name *</div>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="John Smith"
                className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                style={{ borderColor: 'var(--sgc-gray-border)' }} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Company</div>
              <input type="text" value={company} onChange={e => setCompany(e.target.value)}
                placeholder="Smith Investments LLC"
                className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                style={{ borderColor: 'var(--sgc-gray-border)' }} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Phone</div>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="757-000-0000"
                className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                style={{ borderColor: 'var(--sgc-gray-border)' }} />
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Email *</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="john@smithinvestments.com"
                className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                style={{ borderColor: 'var(--sgc-gray-border)' }} />
            </div>
          </div>

          {/* Buy box */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>Buy Box</div>

            {/* States */}
            <div className="mb-3">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>States</div>
              <div className="flex gap-2 flex-wrap">
                {['VA','NC','MD','DC','SC','GA','TN','FL','all'].map(s => (
                  <button key={s} onClick={() => toggleState(s)}
                    className="px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer"
                    style={states.includes(s)
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {s === 'all' ? '🌍 All States' : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Counties */}
            <div className="mb-3">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Preferred Counties (optional)</div>
              <input type="text" value={countiesRaw} onChange={e => setCounties(e.target.value)}
                placeholder="Chatham, Norfolk, Wake (leave blank for all)"
                className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                style={{ borderColor: 'var(--sgc-gray-border)' }} />
            </div>

            {/* ARV + Price */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <NumInput label="Min ARV" value={minARV}    set={setMinARV}    />
              <NumInput label="Max ARV" value={maxARV}    set={setMaxARV}    />
              <NumInput label="Max Price" value={maxPrice} set={setMaxPrice}  />
            </div>

            {/* Preferences */}
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>Financing</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['cash','hard_money','conventional','any'] as BuyerType[]).map(t => (
                    <button key={t} onClick={() => setBuyerType(t)}
                      className="py-2 rounded-xl border text-xs font-semibold cursor-pointer"
                      style={buyerType === t
                        ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                        : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                      {BUYER_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>Property Type</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['sfr','multi','both','any'] as PropertyPref[]).map(t => (
                    <button key={t} onClick={() => setPropPref(t)}
                      className="py-2 rounded-xl border text-xs font-semibold cursor-pointer"
                      style={propPref === t
                        ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                        : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                      {PROP_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>Rehab Preference</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['turnkey','light','heavy','any'] as RehabPref[]).map(t => (
                    <button key={t} onClick={() => setRehabPref(t)}
                      className="py-2 rounded-xl border text-xs font-semibold cursor-pointer"
                      style={rehabPref === t
                        ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                        : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                      {REHAB_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Notes</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded-xl border text-sm px-3 py-2 outline-none resize-none"
              style={{ borderColor: 'var(--sgc-gray-border)', minHeight: 60 }}
              placeholder="Prefers distressed, quick closes, pays cash same week..." />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={!name || !email}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: !name || !email ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)' }}>
              {isEdit ? 'Save Changes' : '+ Add to Buyer List'}
            </button>
            <button onClick={onClose}
              className="px-4 py-3 rounded-xl text-sm border-none cursor-pointer"
              style={{ background: 'var(--sgc-gray-border)' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Deal Blast Modal ──────────────────────────────────────────────────────────
function DealBlastModal({ onClose }: { onClose: () => void }) {
  const deals   = getWholesaleDeals().filter(d => d.status === 'listed' || d.status === 'pending')
  useEscapeKey(onClose)
  const [selectedDeal, setSelectedDeal] = useState(deals[0]?.id || '')
  const [selectedBuyers, setSelectedBuyers] = useState<Set<string>>(new Set())
  const [sent, setSent] = useState(false)

  const deal = deals.find(d => d.id === selectedDeal)
  const matches = deal ? matchBuyers({
    state:      deal.state,
    county:     deal.county,
    arv:        deal.arv,
    askingPrice:deal.askingPrice,
    rehab:      deal.rehab,
  }) : []

  // Auto-select high matches
  useEffect(() => {
    if (matches.length > 0) {
      setSelectedBuyers(new Set(matches.filter(m => m.score >= 60).map(m => m.buyer.id)))
    }
  }, [selectedDeal])

  const toggleBuyer = (id: string) => {
    setSelectedBuyers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBlast = () => {
    if (!deal || selectedBuyers.size === 0) return
    // Open email client for each selected buyer
    const buyerList = matches
      .filter(m => selectedBuyers.has(m.buyer.id))
      .map(m => m.buyer)

    buyerList.forEach((buyer, i) => {
      const emailText = generateWholesaleEmail(deal)
      // Small delay between windows
      setTimeout(() => {
        const subject = `🏠 DEAL: ${deal.address}, ${deal.city} ${deal.state}`
        const body    = emailText.replace(/^Subject:.*\n\n/, '')
        const mailto  = `mailto:${buyer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
        window.open(mailto, '_blank')
      }, i * 500)
    })

    recordDealShared(buyerList.map(b => b.id))
    setSent(true)
  }

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="text-5xl mb-4">✉️</div>
          <div className="text-xl font-bold mb-2" style={{ color: '#1A7A4A' }}>Blast Sent!</div>
          <div className="text-sm mb-6" style={{ color: 'var(--sgc-gray-mid)' }}>
            Email drafts opened for {selectedBuyers.size} buyer{selectedBuyers.size > 1 ? 's' : ''}. Check your email client.
          </div>
          <button onClick={onClose}
            className="px-8 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: 'var(--sgc-navy)' }}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="p-5 border-b flex justify-between sticky top-0 bg-white rounded-t-2xl"
          style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>📢 Blast Deal to Buyers</div>
          <button onClick={onClose} className="text-xl cursor-pointer bg-transparent border-none" aria-label="Close" style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
        </div>
        <div className="p-5 space-y-4">

          {deals.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
              No active wholesale deals. Create a deal in the Wholesale tab first.
            </div>
          ) : (
            <>
              {/* Deal selector */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Select Deal</div>
                <select className="w-full rounded-xl border text-sm px-3 py-2.5 outline-none"
                  style={{ borderColor: 'var(--sgc-gray-border)' }}
                  value={selectedDeal} onChange={e => setSelectedDeal(e.target.value)}>
                  {deals.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.address} — ${Math.round(d.askingPrice/1000)}k ask · ${Math.round(d.arv/1000)}k ARV
                    </option>
                  ))}
                </select>
              </div>

              {/* Matched buyers */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>
                    Matched Buyers ({matches.length})
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedBuyers(new Set(matches.map(m => m.buyer.id)))}
                      className="text-[10px] cursor-pointer bg-transparent border-none font-semibold"
                      style={{ color: 'var(--sgc-navy)' }}>Select All</button>
                    <button onClick={() => setSelectedBuyers(new Set())}
                      className="text-[10px] cursor-pointer bg-transparent border-none font-semibold"
                      style={{ color: 'var(--sgc-gray-mid)' }}>None</button>
                  </div>
                </div>

                {matches.length === 0 ? (
                  <div className="text-sm text-center py-4" style={{ color: 'var(--sgc-gray-mid)' }}>
                    No buyers in your list yet. Add buyers first.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {matches.map(m => (
                      <div key={m.buyer.id}
                        onClick={() => toggleBuyer(m.buyer.id)}
                        className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                        style={{
                          borderColor: selectedBuyers.has(m.buyer.id) ? 'var(--sgc-navy)40' : 'var(--sgc-gray-border)',
                          background: selectedBuyers.has(m.buyer.id) ? 'var(--sgc-navy-pale)' : 'white',
                        }}>
                        {/* Checkbox */}
                        <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{
                            borderColor: selectedBuyers.has(m.buyer.id) ? 'var(--sgc-navy)' : 'var(--sgc-gray-border)',
                            background: selectedBuyers.has(m.buyer.id) ? 'var(--sgc-navy)' : 'white',
                          }}>
                          {selectedBuyers.has(m.buyer.id) && <span className="text-white text-[10px]">✓</span>}
                        </div>

                        {/* Score */}
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                          style={{
                            background: m.score >= 80 ? '#EDFAF3' : m.score >= 60 ? '#EEF2FB' : 'var(--sgc-gray-light)',
                            color:      m.score >= 80 ? '#1A7A4A'  : m.score >= 60 ? '#1B3A8C'  : 'var(--sgc-gray-mid)',
                          }}>
                          {m.score}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm" style={{ color: 'var(--sgc-black)' }}>
                            {m.buyer.name}
                            {m.buyer.company && <span className="font-normal text-xs ml-1" style={{ color: 'var(--sgc-gray-mid)' }}>· {m.buyer.company}</span>}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{m.buyer.email}</div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {m.reasons.slice(0,2).map(r => (
                              <span key={r} className="text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{ background: '#EDFAF3', color: '#1A7A4A' }}>✓ {r}</span>
                            ))}
                            {m.misses.slice(0,1).map(r => (
                              <span key={r} className="text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{ background: '#FEF7EA', color: '#8A5700' }}>⚠ {r}</span>
                            ))}
                          </div>
                        </div>

                        {/* Track record */}
                        {m.buyer.dealsClosed > 0 && (
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs font-bold" style={{ color: '#1A7A4A' }}>{m.buyer.dealsClosed} closed</div>
                            <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>with you</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Send button */}
              <div className="pt-2">
                <button onClick={handleBlast}
                  disabled={selectedBuyers.size === 0}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                  style={{ background: selectedBuyers.size === 0 ? 'var(--sgc-gray-mid)' : '#1A7A4A' }}>
                  ✉️ Blast to {selectedBuyers.size} Buyer{selectedBuyers.size !== 1 ? 's' : ''} — Open Email Drafts
                </button>
                <div className="text-[10px] text-center mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                  Opens pre-filled email draft for each buyer in your email client
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Buyer Card ─────────────────────────────────────────────────────────────────
function BuyerCard({ buyer, onEdit, onDelete }: {
  buyer: Buyer; onEdit: () => void; onDelete: () => void
}) {
  const fmt$ = (n: number) => n >= 1000 ? `$${Math.round(n/1000)}k` : n > 0 ? `$${n}` : '—'

  return (
    <div className="bg-white rounded-2xl border p-4 hover:shadow-md transition-all"
      style={{ borderColor: buyer.dealsClosed > 0 ? '#1A7A4A30' : 'var(--sgc-gray-border)' }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="font-bold" style={{ color: 'var(--sgc-black)' }}>{buyer.name}</div>
          {buyer.company && <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{buyer.company}</div>}
          <div className="text-xs mt-1" style={{ color: 'var(--sgc-navy)' }}>{buyer.email}</div>
          {buyer.phone && <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{buyer.phone}</div>}
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
            {BUYER_TYPE_LABEL[buyer.buyerType]}
          </div>
        </div>
      </div>

      {/* Buy box */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center p-2 rounded-lg" style={{ background: 'var(--sgc-gray-light)' }}>
          <div className="text-[9px] uppercase" style={{ color: 'var(--sgc-gray-mid)' }}>States</div>
          <div className="text-xs font-bold" style={{ color: 'var(--sgc-navy)' }}>
            {buyer.states.includes('all') ? '🌍 All' : buyer.states.join(', ')}
          </div>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: 'var(--sgc-gray-light)' }}>
          <div className="text-[9px] uppercase" style={{ color: 'var(--sgc-gray-mid)' }}>ARV Range</div>
          <div className="text-xs font-bold" style={{ color: 'var(--sgc-navy)' }}>
            {fmt$(buyer.minARV)}–{fmt$(buyer.maxARV)}
          </div>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: 'var(--sgc-gray-light)' }}>
          <div className="text-[9px] uppercase" style={{ color: 'var(--sgc-gray-mid)' }}>Max Price</div>
          <div className="text-xs font-bold" style={{ color: 'var(--sgc-navy)' }}>{fmt$(buyer.maxPrice)}</div>
        </div>
      </div>

      {/* Preferences */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        <span className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: '#EEF2FB', color: '#1B3A8C' }}>
          {PROP_LABEL[buyer.propertyPref]}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: '#FEF7EA', color: '#8A5700' }}>
          {REHAB_LABEL[buyer.rehabPref]}
        </span>
        {buyer.counties.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
            📍 {buyer.counties.join(', ')}
          </span>
        )}
      </div>

      {/* Track record */}
      {(buyer.dealsShared > 0 || buyer.dealsClosed > 0) && (
        <div className="flex gap-3 mb-3 text-xs">
          <span style={{ color: 'var(--sgc-gray-mid)' }}>
            {buyer.dealsShared} deals shared
          </span>
          {buyer.dealsClosed > 0 && (
            <span className="font-bold" style={{ color: '#1A7A4A' }}>
              {buyer.dealsClosed} closed · ${Math.round(buyer.totalPaid/1000)}k paid
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={onEdit}
          className="flex-1 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer"
          style={{ borderColor: 'var(--sgc-navy)30', color: 'var(--sgc-navy)', background: 'var(--sgc-navy-pale)' }}>
          ✏️ Edit
        </button>
        <a href={`mailto:${buyer.email}`}
          className="px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer no-underline"
          style={{ borderColor: '#1A7A4A30', color: '#1A7A4A', background: '#EDFAF3' }}>
          ✉️
        </a>
        {buyer.phone && (
          <a href={`tel:${buyer.phone}`}
            className="px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer no-underline"
            style={{ borderColor: '#1A7A4A30', color: '#1A7A4A', background: '#EDFAF3' }}>
            📞
          </a>
        )}
        <button onClick={() => { if(confirm('Remove this buyer?')) onDelete() }}
          className="px-3 py-1.5 rounded-lg border text-xs cursor-pointer"
          style={{ borderColor: '#C0341D30', color: '#C0341D', background: '#FEF0ED' }}>
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BuyerList() {
  const [buyers,     setBuyers]     = useState<Buyer[]>([])
  const [showAdd,    setShowAdd]    = useState(false)
  const [editBuyer,  setEditBuyer]  = useState<Buyer | null>(null)
  const [showBlast,  setShowBlast]  = useState(false)
  const [showInactive, setInactive] = useState(false)
  const [search,     setSearch]     = useState('')

  const refresh = () => setBuyers(getBuyers(!showInactive))
  useEffect(() => { refresh() }, [showInactive])

  const stats = getBuyerStats()

  const displayed = buyers.filter(b =>
    !search ||
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.email.toLowerCase().includes(search.toLowerCase()) ||
    b.company?.toLowerCase().includes(search.toLowerCase()) ||
    b.states.some(s => s.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        {/* Stats strip */}
        <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(4,1fr)', borderColor: 'var(--sgc-gray-border)' }}>
          {[
            { l: 'Total Buyers',   v: stats.total,                           c: 'var(--sgc-navy)' },
            { l: 'Active',         v: stats.active,                          c: '#1A7A4A'         },
            { l: 'Cash Buyers',    v: stats.cash,                            c: '#534AB7'         },
            { l: 'Fees Collected', v: stats.totalFeesPaid > 0 ? `$${Math.round(stats.totalFeesPaid/1000)}k` : '—', c: '#1A7A4A' },
          ].map((s, i) => (
            <div key={s.l} className={`p-3 ${i < 3 ? 'border-r' : ''}`} style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
              <div className="text-xl font-bold" style={{ color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 px-5 py-3 flex-wrap">
          <input
            className="text-xs px-3 py-1.5 rounded-lg border outline-none w-44"
            style={{ borderColor: 'var(--sgc-gray-border)' }}
            placeholder="Search buyers..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={() => setInactive(s => !s)}
            className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer"
            style={{ borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)', background: 'white' }}>
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </button>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setShowBlast(true)}
              className="px-4 py-2 rounded-xl text-sm font-bold border-none cursor-pointer"
              style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
              📢 Blast a Deal
            </button>
            <button onClick={() => setShowAdd(true)}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>
              + Add Buyer
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <WaitlistPanel />
        {buyers.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto px-8">
            <div className="text-5xl mb-4">👥</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Build Your Buyer List</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--sgc-gray-mid)' }}>
              Your wholesale machine needs buyers behind it. Add cash buyers, hard money investors, and landlords with their buy box. When you have a deal, blast it to all matching buyers in one click.
            </p>
            <div className="space-y-3 w-full mb-6">
              {[
                { icon: '💵', t: 'Cash Buyers', d: 'Close in 7-14 days — fastest, most reliable' },
                { icon: '🏦', t: 'Hard Money Buyers', d: 'Close in 2-3 weeks — good deal flow' },
                { icon: '🏘️', t: 'Landlords / BRRRR Investors', d: 'Repeat buyers if you keep finding rentals' },
              ].map(s => (
                <div key={s.t} className="flex gap-3 bg-white rounded-xl border p-3 text-left"
                  style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <span className="text-2xl">{s.icon}</span>
                  <div>
                    <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>{s.t}</div>
                    <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowAdd(true)}
              className="px-8 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>
              + Add Your First Buyer →
            </button>
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
            No buyers match "{search}"
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {displayed.map(b => (
              <BuyerCard
                key={b.id}
                buyer={b}
                onEdit={() => setEditBuyer(b)}
                onDelete={() => { deleteBuyer(b.id); refresh() }}
              />
            ))}
          </div>
        )}
      </div>

      {showAdd   && <BuyerModal onClose={() => { setShowAdd(false); refresh() }}   onSave={refresh} />}
      {editBuyer && <BuyerModal buyer={editBuyer} onClose={() => { setEditBuyer(null); refresh() }} onSave={refresh} />}
      {showBlast && <DealBlastModal onClose={() => { setShowBlast(false); refresh() }} />}
    </div>
  )
}
