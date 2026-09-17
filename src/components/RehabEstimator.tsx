import { toast } from '../lib/toast'
/**
 * Renovation Cost Estimator — Embedded Component
 * 
 * Used in:
 *   1. Pipeline drawer → Rehab tab (per-deal scope)
 *   2. Standalone mode in Financial Tools (generic estimator)
 * 
 * VA/NC market rates, May 2026 (RSMeans + HomeAdvisor regional)
 * Albert's GC advantage: ~22% below retail pricing shown separately
 */
import { useState, useCallback } from 'react'
import {
  calculateRehab, DEFAULT_SYSTEMS,
  RehabSystem, Condition, RehabEstimate,
  generateScopeOfWorkPDF,
} from '../lib/rehabEstimator'

const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'

const CONDITION_CONFIG: Record<Condition, { label: string; color: string; bg: string; short: string }> = {
  good:    { label: 'Good',    color: '#1A7A4A', bg: '#EDFAF3', short: 'G' },
  fair:    { label: 'Fair',    color: '#8A5700', bg: '#FEF7EA', short: 'F' },
  poor:    { label: 'Poor',    color: '#C45E1A', bg: '#FEF3EA', short: 'P' },
  replace: { label: 'Replace', color: '#C0341D', bg: '#FEF0ED', short: 'R' },
}

const ROI_CONFIG = {
  excellent: { label: 'Best ROI', color: '#1A7A4A', bg: '#EDFAF3' },
  good:      { label: 'Good ROI', color: '#1B3A8C', bg: '#EEF2FB' },
  moderate:  { label: 'Moderate', color: '#8A5700', bg: '#FEF7EA' },
  low:       { label: 'Low ROI',  color: 'var(--sgc-gray-mid)', bg: 'var(--sgc-gray-light)' },
}

interface RehabEstimatorProps {
  // Address (for PDF export)
  address?:       string
  city?:          string
  state?:         string
  zip?:           string
  purchasePrice?: number
  // When embedded in Pipeline — pre-fill and callback
  initialARV?:    number
  initialSqft?:   number
  initialBeds?:   number
  onRehabChange?: (rehab: number) => void
  compact?:       boolean  // true = Pipeline drawer, false = standalone
}

export default function RehabEstimator({
  address = '',
  city = '',
  state = 'VA',
  zip = '',
  purchasePrice,
  initialARV = 0,
  initialSqft = 1200,
  initialBeds = 3,
  onRehabChange,
  compact = false,
}: RehabEstimatorProps) {
  const [systems,  setSystems]  = useState<RehabSystem[]>(DEFAULT_SYSTEMS.map(s => ({ ...s })))
  const [sqft,     setSqft]     = useState(initialSqft)
  const [beds,     setBeds]     = useState(initialBeds)
  const [arv,      setArv]      = useState(initialARV)
  const [showAll,  setShowAll]  = useState(false)

  const estimate: RehabEstimate = calculateRehab(systems, sqft, beds)
  const activeItems = estimate.lineItems.filter(i => i.condition !== 'good')

  const setCondition = useCallback((id: string, condition: Condition) => {
    setSystems(prev => prev.map(s => s.id === id ? { ...s, condition } : s))
    // Notify parent if embedded
    if (onRehabChange) {
      const updated = systems.map(s => s.id === id ? { ...s, condition } : s)
      const est = calculateRehab(updated, sqft, beds)
      onRehabChange(est.total.mid)
    }
  }, [systems, sqft, beds, onRehabChange])

  // Derived deal math
  const mao70        = arv > 0 ? Math.round(arv * 0.70 - estimate.total.mid) : 0
  const maoAlbert    = arv > 0 ? Math.round(arv * 0.70 - estimate.albertCost) : 0
  const profitEst    = arv > 0 ? Math.round(arv - mao70 - estimate.total.mid - arv * 0.08) : 0
  const profitAlbert = arv > 0 ? Math.round(arv - maoAlbert - estimate.albertCost - arv * 0.08) : 0

  // SOW export
  const [showSOWModal, setShowSOWModal] = useState(false)
  const [sowAddress,   setSOWAddress]   = useState(address)
  const [sowCity,      setSOWCity]      = useState(city)
  const [sowState,     setSOWState]     = useState(state)
  const [sowZip,       setSOWZip]       = useState(zip)
  const [sowFor,       setSOWFor]       = useState('')
  const [sowNotes,     setSOWNotes]     = useState('')
  const [sowProjNum,   setSOWProjNum]   = useState('')

  const handleExportSOW = () => {
    if (activeItems.length === 0) { toast.warning('Add at least one system that needs work before exporting.'); return }
    generateScopeOfWorkPDF({
      address:       sowAddress || address || 'Address TBD',
      city:          sowCity    || city    || '',
      state:         sowState   || state   || 'VA',
      zip:           sowZip     || zip     || '',
      arv:           arv        || initialARV || undefined,
      purchasePrice: purchasePrice,
      beds:          beds       || undefined,
      baths:         undefined,
      sqft:          sqft       || undefined,
      estimate,
      systems,
      notes:         sowNotes   || undefined,
      preparedFor:   sowFor     || undefined,
      projectNumber: sowProjNum || undefined,
    })
    setShowSOWModal(false)
  }

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>

      {/* Property inputs */}
      <div className={`grid gap-3 ${compact ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {!compact && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>ARV (for deal math)</div>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>$</span>
              <input type="number" value={arv} onChange={e => setArv(parseInt(e.target.value)||0)}
                className="w-full rounded-lg border text-sm py-2 pl-6 pr-2 outline-none"
                style={{ borderColor: 'var(--sgc-gray-border)' }} />
            </div>
          </div>
        )}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Sq Footage</div>
          <input type="number" value={sqft} onChange={e => setSqft(parseInt(e.target.value)||1200)}
            className="w-full rounded-lg border text-sm py-2 px-3 outline-none"
            style={{ borderColor: 'var(--sgc-gray-border)' }} />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Bedrooms</div>
          <div className="grid grid-cols-4 gap-1">
            {[2,3,4,5].map(b => (
              <button key={b} onClick={() => setBeds(b)}
                className="py-1.5 rounded-lg border text-xs font-bold cursor-pointer"
                style={beds === b
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {b}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>View</div>
          <button onClick={() => setShowAll(s => !s)}
            className="w-full py-2 rounded-lg border text-xs font-semibold cursor-pointer"
            style={{ borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-navy)', background: 'var(--sgc-navy-pale)' }}>
            {showAll ? '▼ Active only' : '▲ All systems'}
          </button>
        </div>
      </div>

      {/* Systems grid */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>
          Rate Each System — Market Rates (May 2026)
        </div>
        <div className="space-y-1.5">
          {DEFAULT_SYSTEMS
            .filter(s => showAll || systems.find(x => x.id === s.id)?.condition !== 'good')
            .map(sys => {
              const cur = systems.find(x => x.id === sys.id)?.condition || 'good'
              const item = estimate.lineItems.find(i => i.system === sys.id)
              const isActive = cur !== 'good'
              const isCritical = ['foundation','roof','electrical','hvac','plumbing'].includes(sys.id)

              return (
                <div key={sys.id} className="rounded-xl border overflow-hidden"
                  style={{
                    borderColor: isActive
                      ? CONDITION_CONFIG[cur].color + '50'
                      : 'var(--sgc-gray-border)',
                    background: isActive ? CONDITION_CONFIG[cur].bg : 'white',
                  }}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    {/* System name */}
                    <span className="text-base w-6 flex-shrink-0">{sys.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold" style={{ color: 'var(--sgc-black)' }}>{sys.name}</span>
                        {isCritical && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                          style={{ background: '#FEF0ED', color: '#C0341D' }}>CRITICAL</span>}
                        {item && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium ml-auto"
                            style={{ background: ROI_CONFIG[item.roi].bg, color: ROI_CONFIG[item.roi].color }}>
                            {ROI_CONFIG[item.roi].label}
                          </span>
                        )}
                      </div>
                      {item && (
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                          {item.note}
                        </div>
                      )}
                    </div>

                    {/* Condition buttons */}
                    <div className="flex gap-1 flex-shrink-0">
                      {(['good','fair','poor','replace'] as Condition[]).map(c => (
                        <button key={c} onClick={() => setCondition(sys.id, c)}
                          className="w-14 py-1 rounded-lg text-[10px] font-bold cursor-pointer border"
                          style={cur === c
                            ? { background: CONDITION_CONFIG[c].color, borderColor: CONDITION_CONFIG[c].color, color: 'white' }
                            : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                          {CONDITION_CONFIG[c].label}
                        </button>
                      ))}
                    </div>

                    {/* Cost display */}
                    {item && (
                      <div className="text-right w-20 flex-shrink-0">
                        <div className="text-sm font-black" style={{ color: CONDITION_CONFIG[cur].color }}>
                          {fmt$(item.mid)}
                        </div>
                        <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                          {fmt$(item.low)}–{fmt$(item.high)}
                        </div>
                      </div>
                    )}
                    {!item && (
                      <div className="text-right w-20 flex-shrink-0">
                        <div className="text-xs font-semibold" style={{ color: '#1A7A4A' }}>✓ Good</div>
                        <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>No cost</div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
        </div>

        {/* Show all toggle when in compact mode */}
        <button onClick={() => setShowAll(s => !s)}
          className="w-full mt-2 py-1.5 rounded-lg border-none text-xs font-semibold cursor-pointer"
          style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
          {showAll ? `▼ Show active systems only (${activeItems.length} selected)` : `▲ Show all ${DEFAULT_SYSTEMS.length} systems`}
        </button>
      </div>

      {/* Results */}
      {activeItems.length > 0 && (
        <div className="space-y-3">

          {/* Critical items warning */}
          {estimate.highPriorityItems.length > 0 && (
            <div className="rounded-xl p-3" style={{ background: '#FEF0ED', border: '1px solid #C0341D30' }}>
              <div className="text-xs font-bold mb-1" style={{ color: '#C0341D' }}>
                ⚠ Critical Systems Flagged — Verify In Person Before Offering
              </div>
              <div className="text-xs" style={{ color: '#C0341D' }}>
                {estimate.highPriorityItems.join(' · ')}
              </div>
            </div>
          )}

          {/* Line items breakdown */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="px-4 py-2.5 flex items-center justify-between"
              style={{ background: 'var(--sgc-navy)' }}>
              <span className="text-xs font-bold text-white uppercase tracking-wider">Scope of Work Estimate</span>
              <span className="text-[10px] text-white/70">Labor + material rates · May 2026</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              {activeItems.map(item => (
                <div key={item.system} className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{DEFAULT_SYSTEMS.find(s => s.id === item.system)?.icon}</span>
                    <div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--sgc-black)' }}>
                        {DEFAULT_SYSTEMS.find(s => s.id === item.system)?.name}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                        {CONDITION_CONFIG[item.condition].label} · {item.note}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold" style={{ color: 'var(--sgc-black)' }}>
                      {fmt$(item.mid)}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                      {fmt$(item.low)}–{fmt$(item.high)}
                    </div>
                  </div>
                </div>
              ))}
              {/* Subtotal */}
              <div className="flex items-center justify-between px-4 py-2.5"
                style={{ background: 'var(--sgc-gray-light)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--sgc-gray-mid)' }}>Subtotal</span>
                <span className="text-sm font-bold" style={{ color: 'var(--sgc-black)' }}>{fmt$(estimate.subtotal.mid)}</span>
              </div>
              {/* Contingency */}
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>+ 10% Contingency</span>
                <span className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>{fmt$(estimate.contingency10)}</span>
              </div>
              {/* Total */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ background: '#EEF2FB' }}>
                <span className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>Total (Retail)</span>
                <div className="text-right">
                  <div className="text-xl font-black" style={{ color: 'var(--sgc-navy)' }}>{fmt$(estimate.total.mid)}</div>
                  <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                    Range {fmt$(estimate.total.low)} – {fmt$(estimate.total.high)}
                  </div>
                </div>
              </div>
              {/* Albert's cost */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ background: '#EDFAF3' }}>
                <div>
                  <div className="text-sm font-bold" style={{ color: '#1A7A4A' }}>Your GC Cost (SGC)</div>
                  <div className="text-[10px]" style={{ color: '#1A7A4A' }}>
                    ~22% below retail · {fmt$(estimate.gcAdvantage)} savings
                  </div>
                </div>
                <div className="text-xl font-black" style={{ color: '#1A7A4A' }}>
                  {fmt$(estimate.albertCost)}
                </div>
              </div>
            </div>
          </div>

          {/* Deal math with rehab */}
          {(arv > 0 || initialARV > 0) && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="px-4 py-2.5" style={{ background: '#FEF7EA' }}>
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#8A5700' }}>Deal Math with This Rehab</div>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                {/* Retail GC column */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>
                    Retail GC (what others pay)
                  </div>
                  {[
                    { l: 'ARV', v: fmt$(arv || initialARV) },
                    { l: 'Max Offer (70% rule)', v: fmt$(mao70), bold: true },
                    { l: 'Retail Rehab', v: `- ${fmt$(estimate.total.mid)}`, color: '#C0341D' },
                    { l: 'Est. Carry + Close (8%)', v: `- ${fmt$(Math.round((arv||initialARV) * 0.08))}`, color: '#C0341D' },
                    { l: 'Est. Net Profit', v: fmt$(profitEst), color: profitEst > 0 ? '#1A7A4A' : '#C0341D', bold: true },
                  ].map(r => (
                    <div key={r.l} className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                      <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{r.l}</span>
                      <span className="text-xs font-semibold" style={{ color: r.color || 'var(--sgc-black)', fontWeight: r.bold ? 800 : 600 }}>{r.v}</span>
                    </div>
                  ))}
                </div>
                {/* SGC column */}
                <div className="rounded-xl p-3" style={{ background: '#EDFAF3' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#1A7A4A' }}>
                    SGC Advantage (your cost)
                  </div>
                  {[
                    { l: 'ARV', v: fmt$(arv || initialARV) },
                    { l: 'Max Offer (70% rule)', v: fmt$(maoAlbert), bold: true },
                    { l: 'SGC Rehab Cost', v: `- ${fmt$(estimate.albertCost)}`, color: '#C45E1A' },
                    { l: 'Est. Carry + Close (8%)', v: `- ${fmt$(Math.round((arv||initialARV) * 0.08))}`, color: '#C45E1A' },
                    { l: 'Est. Net Profit', v: fmt$(profitAlbert), color: profitAlbert > 0 ? '#1A7A4A' : '#C0341D', bold: true },
                  ].map(r => (
                    <div key={r.l} className="flex justify-between py-1 border-b" style={{ borderColor: '#1A7A4A20' }}>
                      <span className="text-xs" style={{ color: '#1A7A4A' }}>{r.l}</span>
                      <span className="text-xs font-semibold" style={{ color: r.color || '#1A7A4A', fontWeight: r.bold ? 800 : 600 }}>{r.v}</span>
                    </div>
                  ))}
                  {profitAlbert > profitEst && (
                    <div className="mt-2 text-[10px] font-bold text-center" style={{ color: '#1A7A4A' }}>
                      GC Advantage: +{fmt$(profitAlbert - profitEst)} more profit vs hiring out
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ROI ranked summary */}
          <div className="rounded-xl p-3" style={{ background: 'var(--sgc-gray-light)' }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>
              ROI Priority Order — Do These First
            </div>
            <div className="flex flex-wrap gap-1.5">
              {estimate.roiItems.slice(0, 8).map((item, i) => (
                <span key={item} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: i < 3 ? '#EDFAF3' : '#EEF2FB',
                    color: i < 3 ? '#1A7A4A' : 'var(--sgc-navy)',
                  }}>
                  {i + 1}. {DEFAULT_SYSTEMS.find(s => s.id === item)?.icon} {DEFAULT_SYSTEMS.find(s => s.id === item)?.name}
                </span>
              ))}
            </div>
            <div className="text-[10px] mt-2" style={{ color: 'var(--sgc-gray-mid)' }}>
              {estimate.summaryNote}
            </div>
            <div className="text-[10px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>
              ⚠ Screening estimate only — not a contractor bid. Your actual GC costs will vary.
            </div>
          </div>

          {/* ── EXPORT BUTTON ── */}
          <button
            onClick={() => setShowSOWModal(true)}
            className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer flex items-center justify-center gap-2"
            style={{ background: '#1B3A8C' }}>
            📄 Export Scope of Work PDF
          </button>
        </div>
      )}

      {activeItems.length === 0 && (
        <div className="text-center py-6 rounded-xl" style={{ background: '#EDFAF3' }}>
          <div className="text-2xl mb-2">✓</div>
          <div className="text-sm font-bold" style={{ color: '#1A7A4A' }}>All systems rated Good</div>
          <div className="text-xs mt-1" style={{ color: '#1A7A4A' }}>
            Select Fair / Poor / Replace on any system to generate cost estimates
          </div>
        </div>
      )}

      {/* ── SOW EXPORT MODAL ── */}
      {showSOWModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b flex justify-between items-center"
              style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div>
                <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>📄 Export Scope of Work</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                  Professional PDF — {activeItems.length} line items · {(() => {
                    const fmt = (n: number) => '$' + Math.round(n).toLocaleString()
                    return `${fmt(estimate.total.mid)} retail / ${fmt(estimate.albertCost)} SGC`
                  })()}
                </div>
              </div>
              <button onClick={() => setShowSOWModal(false)}
                className="text-xl cursor-pointer bg-transparent border-none"
                style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
            </div>
            <div className="p-5 space-y-3">
              {/* Property details */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--sgc-navy)' }}>Property</div>
                <div className="space-y-2">
                  <input type="text" value={sowAddress} onChange={e => setSOWAddress(e.target.value)}
                    placeholder="123 Oak Street"
                    className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                    style={{ borderColor: 'var(--sgc-gray-border)' }} />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" value={sowCity} onChange={e => setSOWCity(e.target.value)}
                      placeholder="City"
                      className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                      style={{ borderColor: 'var(--sgc-gray-border)' }} />
                    <input type="text" value={sowState} onChange={e => setSOWState(e.target.value.toUpperCase().slice(0,2))}
                      placeholder="VA"
                      className="w-full rounded-xl border text-sm px-3 py-2 outline-none text-center font-bold"
                      style={{ borderColor: 'var(--sgc-gray-border)' }} />
                    <input type="text" value={sowZip} onChange={e => setSOWZip(e.target.value)}
                      placeholder="Zip" maxLength={5}
                      className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                      style={{ borderColor: 'var(--sgc-gray-border)' }} />
                  </div>
                </div>
              </div>

              {/* Optional fields */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1"
                    style={{ color: 'var(--sgc-gray-mid)' }}>Prepared For (optional)</div>
                  <input type="text" value={sowFor} onChange={e => setSOWFor(e.target.value)}
                    placeholder="Buyer or contractor name"
                    className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                    style={{ borderColor: 'var(--sgc-gray-border)' }} />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1"
                    style={{ color: 'var(--sgc-gray-mid)' }}>Project # (optional)</div>
                  <input type="text" value={sowProjNum} onChange={e => setSOWProjNum(e.target.value)}
                    placeholder="SGC-001"
                    className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                    style={{ borderColor: 'var(--sgc-gray-border)' }} />
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1"
                  style={{ color: 'var(--sgc-gray-mid)' }}>Additional Notes (optional)</div>
                <textarea value={sowNotes} onChange={e => setSOWNotes(e.target.value)}
                  placeholder="Special instructions, permit requirements, access notes..."
                  className="w-full rounded-xl border text-sm px-3 py-2 outline-none resize-none"
                  style={{ borderColor: 'var(--sgc-gray-border)', minHeight: 70 }} />
              </div>

              {/* Preview summary */}
              <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--sgc-navy-pale)' }}>
                <div className="font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>
                  Document will include:
                </div>
                <div className="space-y-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                  <div>✓ SGC Built letterhead + project number + date</div>
                  <div>✓ {activeItems.length} line items with condition, scope of work, cost range</div>
                  <div>✓ 10% contingency + retail total + SGC GC cost</div>
                  {estimate.highPriorityItems.length > 0 && (
                    <div style={{ color: '#C0341D' }}>⚠ Critical system warning included</div>
                  )}
                  <div>✓ Signature lines for both parties</div>
                  <div>✓ Disclaimer + data source attribution</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={handleExportSOW}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                  style={{ background: 'var(--sgc-navy)' }}>
                  📄 Generate PDF → Print / Save
                </button>
                <button onClick={() => setShowSOWModal(false)}
                  className="px-4 py-3 rounded-xl text-sm border-none cursor-pointer"
                  style={{ background: 'var(--sgc-gray-border)' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
