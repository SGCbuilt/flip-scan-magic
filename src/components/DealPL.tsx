/**
 * Deal P&L Tracker — Actuals vs Estimates
 *
 * Track every dollar in and out per deal.
 * See exactly where your estimates are wrong.
 * Get tighter on every future deal.
 */
import { useState, useEffect } from 'react'
import {
  getDealPLs, createDealPL, updateDealPL, deleteDealPL,
  upsertLineItem, deleteLineItem, analyzeDeal, getAllPLStats,
  DealPL, PLLineItem, PLCategory, DealSummary,
} from '../lib/dealPL'
import { getPipeline } from '../lib/pipeline'

const fmt$ = (n: number, abs = false) => {
  const v = abs ? Math.abs(n) : n
  if (v === 0) return '—'
  return (n < 0 && !abs ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString()
}
const fmtPct = (n: number) => isFinite(n) && Math.abs(n) < 10000 ? n.toFixed(1) + '%' : '—'
const fmtDays = (n: number | null) => n !== null ? `${n}d` : '—'

const CATEGORY_CONFIG: Record<PLCategory, { label: string; icon: string; color: string; isRevenue: boolean }> = {
  acquisition: { label: 'Acquisition',    icon: '🏠', color: '#1B3A8C', isRevenue: false },
  financing:   { label: 'Financing',      icon: '🏦', color: '#534AB7', isRevenue: false },
  rehab:       { label: 'Rehab',          icon: '🔨', color: '#C45E1A', isRevenue: false },
  holding:     { label: 'Holding Costs',  icon: '⏱️', color: '#8A5700', isRevenue: false },
  selling:     { label: 'Selling Costs',  icon: '📋', color: '#C0341D', isRevenue: false },
  revenue:     { label: 'Revenue',        icon: '💰', color: '#1A7A4A', isRevenue: true  },
}

// ── Variance badge ─────────────────────────────────────────────────────────────
function VarianceBadge({ est, act }: { est: number; act: number }) {
  if (!act || !est) return null
  const v = act - est
  const pct = Math.round((v / est) * 100)
  const isRevenue = false
  const over = isRevenue ? v < 0 : v > 0
  if (Math.abs(pct) < 2) return <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: '#EDFAF3', color: '#1A7A4A' }}>✓ on target</span>
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: over ? '#FEF0ED' : '#EDFAF3', color: over ? '#C0341D' : '#1A7A4A' }}>
      {over ? '+' : '-'}{Math.abs(pct)}% {over ? 'over' : 'under'}
    </span>
  )
}

// ── Line Item Row ─────────────────────────────────────────────────────────────
function LineItemRow({ item, dealId, isRevenue, onUpdate, onDelete }: {
  item: PLLineItem; dealId: string; isRevenue: boolean
  onUpdate: () => void; onDelete: () => void
}) {
  const [estVal, setEst] = useState(item.estimated)
  const [actVal, setAct] = useState(item.actual)
  const [editing, setEditing] = useState(false)

  const save = () => {
    upsertLineItem(dealId, { ...item, estimated: estVal, actual: actVal })
    onUpdate()
    setEditing(false)
  }

  const variance = actVal - estVal
  const varColor = isRevenue
    ? (variance >= 0 ? '#1A7A4A' : '#C0341D')
    : (variance <= 0 ? '#1A7A4A' : '#C0341D')

  return (
    <div className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
      {/* Label */}
      <div className="flex-1 text-xs font-medium" style={{ color: 'var(--sgc-black)' }}>{item.label}</div>

      {/* Estimated */}
      <div className="w-28">
        {editing ? (
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>$</span>
            <input type="number" value={estVal} onChange={e => setEst(parseFloat(e.target.value)||0)}
              className="w-full rounded-lg border text-xs py-1 pl-4 pr-2 outline-none"
              style={{ borderColor: 'var(--sgc-navy)40' }} />
          </div>
        ) : (
          <div className="text-xs text-right" style={{ color: 'var(--sgc-gray-mid)' }}>
            {fmt$(estVal) || '—'}
          </div>
        )}
      </div>

      {/* Actual */}
      <div className="w-28">
        {editing ? (
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>$</span>
            <input type="number" value={actVal} onChange={e => setAct(parseFloat(e.target.value)||0)}
              className="w-full rounded-lg border text-xs py-1 pl-4 pr-2 outline-none"
              style={{ borderColor: '#1A7A4A40' }} autoFocus />
          </div>
        ) : (
          <div className="text-xs font-bold text-right"
            style={{ color: actVal > 0 ? 'var(--sgc-black)' : 'var(--sgc-gray-mid)' }}>
            {actVal > 0 ? fmt$(actVal) : 'enter actual'}
          </div>
        )}
      </div>

      {/* Variance */}
      <div className="w-20 text-right">
        {actVal > 0 && estVal > 0 && (
          <span className="text-[10px] font-bold" style={{ color: varColor }}>
            {variance > 0 ? '+' : ''}{fmt$(variance, true)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1 w-14 justify-end">
        {editing ? (
          <>
            <button onClick={save}
              className="text-[10px] px-2 py-1 rounded border-none cursor-pointer font-bold text-white"
              style={{ background: '#1A7A4A' }}>✓</button>
            <button onClick={() => setEditing(false)}
              className="text-[10px] px-2 py-1 rounded border-none cursor-pointer"
              style={{ background: 'var(--sgc-gray-border)' }}>✕</button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)}
              className="text-[10px] px-2 py-1 rounded border-none cursor-pointer"
              style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>✏️</button>
            <button onClick={onDelete}
              className="text-[10px] px-2 py-1 rounded border-none cursor-pointer"
              style={{ background: '#FEF0ED', color: '#C0341D' }}>✕</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Deal Detail View ──────────────────────────────────────────────────────────
function DealDetail({ deal: initial, onBack, onUpdate }: {
  deal: DealPL; onBack: () => void; onUpdate: () => void
}) {
  const [deal,    setDeal]    = useState(initial)
  const [summary, setSummary] = useState<DealSummary>(() => analyzeDeal(initial))
  const [newLabel, setNewLabel] = useState('')
  const [newCat,   setNewCat]   = useState<PLCategory>('rehab')
  const [activeTab, setTab]     = useState<PLCategory>('acquisition')

  const refresh = () => {
    const updated = getDealPLs().find(d => d.id === deal.id)
    if (updated) { setDeal(updated); setSummary(analyzeDeal(updated)) }
    onUpdate()
  }

  const addItem = () => {
    if (!newLabel.trim()) return
    upsertLineItem(deal.id, {
      id:        `item-${Date.now()}`,
      category:  newCat,
      label:     newLabel.trim(),
      estimated: 0,
      actual:    0,
    })
    setNewLabel('')
    refresh()
  }

  const s = summary
  const categories: PLCategory[] = ['acquisition','financing','rehab','holding','selling','revenue']

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Back + status bar */}
      <div className="flex-shrink-0 bg-white border-b px-5 py-3 flex items-center gap-3"
        style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <button onClick={onBack}
          className="text-sm font-semibold cursor-pointer bg-transparent border-none"
          style={{ color: 'var(--sgc-navy)' }}>
          ← Back
        </button>
        <div className="flex-1">
          <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>{deal.address}</div>
          <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
            {deal.city}, {deal.state} · {deal.purchaseDate && new Date(deal.purchaseDate).toLocaleDateString()}
            {s.holdDays !== null && ` · ${s.holdDays} day hold`}
          </div>
        </div>
        <select className="text-xs rounded-lg border px-2 py-1.5 outline-none cursor-pointer"
          style={{ borderColor: 'var(--sgc-gray-border)' }}
          value={deal.status}
          onChange={e => { updateDealPL(deal.id, { status: e.target.value as any }); refresh() }}>
          {['active','listed','under_contract','closed'].map(s => (
            <option key={s} value={s}>{s.replace('_',' ')}</option>
          ))}
        </select>
      </div>

      {/* Summary strip */}
      <div className="flex-shrink-0 grid border-b" style={{ gridTemplateColumns: 'repeat(5,1fr)', borderColor: 'var(--sgc-gray-border)', background: 'white' }}>
        {[
          { l: 'Revenue',         est: s.totalRevenue.est,  act: s.totalRevenue.act,  c: '#1A7A4A' },
          { l: 'Total Costs',     est: s.totalCosts.est,    act: s.totalCosts.act,    c: '#C0341D' },
          { l: 'Net Profit',      est: s.netProfit.est,     act: s.netProfit.act,     c: s.netProfit.act >= 0 ? '#1A7A4A' : '#C0341D' },
          { l: 'ROI',             est: s.roi.est,           act: s.roi.act,           c: '#1B3A8C', isPct: true },
          { l: 'Rehab Accuracy',  est: null,                act: s.rehabAccuracy,     c: s.rehabAccuracy >= 90 ? '#1A7A4A' : s.rehabAccuracy >= 75 ? '#C45E1A' : '#C0341D', isPct: true },
        ].map((m, i) => (
          <div key={m.l} className={`p-3 ${i < 4 ? 'border-r' : ''}`} style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
            {m.l === 'Rehab Accuracy' ? (
              <div className="text-lg font-bold" style={{ color: m.c }}>
                {m.act > 0 ? `${Math.round(m.act)}%` : '—'}
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="text-lg font-bold" style={{ color: m.act !== 0 ? m.c : 'var(--sgc-gray-mid)' }}>
                  {m.act !== 0 ? (m.isPct ? fmtPct(m.act as number) : fmt$(m.act as number)) : '—'}
                  <span className="text-[9px] font-normal ml-1" style={{ color: 'var(--sgc-gray-mid)' }}>act</span>
                </div>
                {m.est !== null && m.est !== 0 && (
                  <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                    {m.isPct ? fmtPct(m.est) : fmt$(m.est)} est
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Category tabs + line items */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white">
        {/* Category nav */}
        <div className="flex border-b flex-shrink-0 overflow-x-auto" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          {categories.map(cat => {
            const cfg = CATEGORY_CONFIG[cat]
            const catData = s.byCategory[cat]
            const hasData = catData.act > 0 || catData.est > 0
            return (
              <button key={cat} onClick={() => setTab(cat)}
                className="px-3 py-2.5 flex items-center gap-1.5 text-xs font-semibold border-b-2 cursor-pointer bg-transparent border-x-0 border-t-0 whitespace-nowrap flex-shrink-0"
                style={activeTab === cat
                  ? { borderBottomColor: cfg.color, color: cfg.color }
                  : { borderBottomColor: 'transparent', color: 'var(--sgc-gray-mid)' }}>
                {cfg.icon} {cfg.label}
                {hasData && (
                  <span className="text-[9px] px-1 py-0.5 rounded-full font-bold"
                    style={{ background: cfg.color + '20', color: cfg.color }}>
                    {fmt$(catData.act || catData.est)}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Line items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Column headers */}
          <div className="flex items-center gap-3 mb-1 pb-2 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="flex-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>Line Item</div>
            <div className="w-28 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: 'var(--sgc-gray-mid)' }}>Estimated</div>
            <div className="w-28 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: 'var(--sgc-gray-mid)' }}>Actual</div>
            <div className="w-20 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: 'var(--sgc-gray-mid)' }}>Variance</div>
            <div className="w-14"/>
          </div>

          {/* Items for active category */}
          {deal.items
            .filter(i => i.category === activeTab)
            .map(item => (
              <LineItemRow
                key={item.id}
                item={item}
                dealId={deal.id}
                isRevenue={activeTab === 'revenue'}
                onUpdate={refresh}
                onDelete={() => { deleteLineItem(deal.id, item.id); refresh() }}
              />
            ))}

          {/* Category totals */}
          {(() => {
            const cat = s.byCategory[activeTab]
            const cfg = CATEGORY_CONFIG[activeTab]
            if (!cat.est && !cat.act) return null
            return (
              <div className="flex items-center gap-3 py-2.5 mt-1 border-t-2" style={{ borderColor: cfg.color + '40' }}>
                <div className="flex-1 text-xs font-bold" style={{ color: cfg.color }}>
                  {cfg.label} Total
                </div>
                <div className="w-28 text-xs font-bold text-right" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {fmt$(cat.est)}
                </div>
                <div className="w-28 text-xs font-bold text-right" style={{ color: cfg.color }}>
                  {fmt$(cat.act)}
                </div>
                <div className="w-20 text-right">
                  {cat.act > 0 && cat.est > 0 && (
                    <span className="text-[10px] font-bold"
                      style={{ color: (activeTab === 'revenue' ? cat.act >= cat.est : cat.act <= cat.est) ? '#1A7A4A' : '#C0341D' }}>
                      {cat.variance > 0 ? '+' : ''}{fmt$(cat.variance)}
                    </span>
                  )}
                </div>
                <div className="w-14"/>
              </div>
            )
          })()}

          {/* Add item */}
          <div className="mt-4 pt-3 border-t flex gap-2" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder={`Add ${CATEGORY_CONFIG[activeTab].label} line item...`}
              className="flex-1 rounded-xl border text-xs px-3 py-2 outline-none"
              style={{ borderColor: 'var(--sgc-gray-border)' }} />
            <button onClick={addItem}
              className="px-3 py-2 rounded-xl text-xs font-bold text-white border-none cursor-pointer"
              style={{ background: CATEGORY_CONFIG[activeTab].color }}>
              + Add
            </button>
          </div>

          {/* Biggest overruns insight */}
          {s.biggestOverruns.length > 0 && activeTab === 'rehab' && (
            <div className="mt-4 p-3 rounded-xl" style={{ background: '#FEF7EA' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#8A5700' }}>
                ⚠ Biggest Overruns on This Deal
              </div>
              {s.biggestOverruns.map(o => (
                <div key={o.label} className="flex justify-between text-xs py-0.5">
                  <span style={{ color: '#8A5700' }}>{o.label}</span>
                  <span className="font-bold" style={{ color: '#C0341D' }}>+{fmt$(o.variance)} over</span>
                </div>
              ))}
              <div className="text-[10px] mt-2" style={{ color: '#8A5700' }}>
                Use this to adjust your estimates on the next deal
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── New Deal Modal ────────────────────────────────────────────────────────────
function NewDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const pipeline = getPipeline().filter(l => ['under_contract','closed_won'].includes(l.stage))
  const [usePipeline, setUsePipeline] = useState(pipeline.length > 0)
  const [leadId,   setLeadId]   = useState(pipeline[0]?.id || '')
  const [address,  setAddress]  = useState('')
  const [city,     setCity]     = useState('')
  const [state,    setState]    = useState('VA')
  const [zip,      setZip]      = useState('')
  const [purchase, setPurchase] = useState('')
  const [listDate, setListDate] = useState('')
  const [saleDate, setSaleDate] = useState('')
  const [status,   setStatus]   = useState<DealPL['status']>('active')

  useEffect(() => {
    if (usePipeline && leadId) {
      const lead = pipeline.find(l => l.id === leadId)
      if (lead) {
        setAddress(lead.address)
        setCity(lead.city)
        setState(lead.state)
        setZip(lead.zip)
      }
    }
  }, [leadId, usePipeline])

  const usePlugin = usePipeline

  const handleCreate = () => {
    const deal = createDealPL({
      address:  address || 'Unknown',
      city, state, zip,
      purchaseDate: purchase,
      listDate:     listDate || undefined,
      saleDate:     saleDate || undefined,
      status,
      notes: '',
      pipelineLeadId: usePipeline ? leadId : undefined,
    })
    // Pre-fill purchase price from pipeline
    if (usePipeline && leadId) {
      const lead = pipeline.find(l => l.id === leadId)
      if (lead?.maxOffer) {
        const item = deal.items.find(i => i.label === 'Purchase Price')
        if (item) upsertLineItem(deal.id, { ...item, estimated: lead.maxOffer })
        const rev = deal.items.find(i => i.label === 'Sale Price')
        if (rev && lead.estimatedARV) upsertLineItem(deal.id, { ...rev, estimated: lead.estimatedARV })
        const rehab = deal.items.find(i => i.label === 'Misc / Contingency')
        if (rehab && lead.estimatedRehab) upsertLineItem(deal.id, { ...rehab, estimated: lead.estimatedRehab })
      }
    }
    onCreated(deal.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b flex justify-between" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>+ New Deal P&L</div>
          <button onClick={onClose} className="text-xl cursor-pointer bg-transparent border-none" style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
        </div>
        <div className="p-5 space-y-3">
          {pipeline.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setUsePipeline(true)}
                className="py-2 rounded-xl border text-xs font-semibold cursor-pointer"
                style={usePlugin ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' } : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                From Pipeline
              </button>
              <button onClick={() => setUsePipeline(false)}
                className="py-2 rounded-xl border text-xs font-semibold cursor-pointer"
                style={!usePlugin ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' } : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                New Deal
              </button>
            </div>
          )}

          {usePlugin && pipeline.length > 0 ? (
            <select className="w-full rounded-xl border text-sm px-3 py-2.5 outline-none"
              style={{ borderColor: 'var(--sgc-gray-border)' }}
              value={leadId} onChange={e => setLeadId(e.target.value)}>
              {pipeline.map(l => <option key={l.id} value={l.id}>{l.address} — {l.city}</option>)}
            </select>
          ) : (
            <div className="space-y-2">
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                placeholder="123 Oak Street"
                className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                style={{ borderColor: 'var(--sgc-gray-border)' }} />
              <div className="grid grid-cols-3 gap-2">
                <input type="text" value={city} onChange={e => setCity(e.target.value)}
                  placeholder="City"
                  className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                  style={{ borderColor: 'var(--sgc-gray-border)' }} />
                <div className="grid grid-cols-2 gap-1">
                  {['VA','NC'].map(s => (
                    <button key={s} onClick={() => setState(s)}
                      className="py-2 rounded-xl border text-xs font-bold cursor-pointer"
                      style={state === s ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' } : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                      {s}
                    </button>
                  ))}
                </div>
                <input type="text" value={zip} onChange={e => setZip(e.target.value)}
                  placeholder="Zip"
                  className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                  style={{ borderColor: 'var(--sgc-gray-border)' }} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {[
              { l: 'Purchase Date', v: purchase, set: setPurchase },
              { l: 'List Date',     v: listDate, set: setListDate },
              { l: 'Sale Date',     v: saleDate, set: setSaleDate },
            ].map(f => (
              <div key={f.l}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{f.l}</div>
                <input type="date" value={f.v} onChange={e => f.set(e.target.value)}
                  className="w-full rounded-xl border text-xs px-2 py-2 outline-none"
                  style={{ borderColor: 'var(--sgc-gray-border)' }} />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>
              Create Deal P&L
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function DealPLTracker() {
  const [deals,    setDeals]    = useState<DealPL[]>([])
  const [selected, setSelected] = useState<DealPL | null>(null)
  const [showNew,  setShowNew]  = useState(false)

  const refresh = () => {
    const all = getDealPLs()
    setDeals(all)
    if (selected) {
      const updated = all.find(d => d.id === selected.id)
      if (updated) setSelected(updated)
    }
  }
  useEffect(() => { refresh() }, [])

  const stats = getAllPLStats()

  if (selected) {
    return (
      <div className="h-full overflow-hidden">
        <DealDetail
          deal={selected}
          onBack={() => { setSelected(null); refresh() }}
          onUpdate={refresh}
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(5,1fr)', borderColor: 'var(--sgc-gray-border)' }}>
          {[
            { l: 'Total Deals',     v: stats.total,                   c: 'var(--sgc-navy)'  },
            { l: 'Closed',          v: stats.closed,                  c: '#1A7A4A'           },
            { l: 'Active',          v: stats.active,                  c: '#C45E1A'           },
            { l: 'Total Profit',    v: stats.totalProfit > 0 ? fmt$(stats.totalProfit) : '—', c: '#1A7A4A' },
            { l: 'Rehab Accuracy',  v: stats.avgRehabAccuracy < 100 ? `${Math.round(stats.avgRehabAccuracy)}%` : '—', c: stats.avgRehabAccuracy >= 90 ? '#1A7A4A' : '#C45E1A' },
          ].map((s, i) => (
            <div key={s.l} className={`p-3 ${i < 4 ? 'border-r' : ''}`} style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
              <div className="text-xl font-bold" style={{ color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
        {stats.topOverrunCategory && (
          <div className="px-5 py-2 text-xs flex items-center gap-2" style={{ background: '#FEF7EA' }}>
            <span style={{ color: '#8A5700' }}>💡 Your most common overrun:</span>
            <span className="font-bold" style={{ color: '#C0341D' }}>
              {stats.topOverrunCategory} — avg ${Math.round(stats.topOverrunAvg).toLocaleString()} over estimate
            </span>
            <span style={{ color: '#8A5700' }}>· Adjust your estimates accordingly</span>
          </div>
        )}
        <div className="flex justify-end px-5 py-3">
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: 'var(--sgc-navy)' }}>
            + New Deal P&L
          </button>
        </div>
      </div>

      {/* Deal list */}
      <div className="flex-1 overflow-y-auto p-5">
        {deals.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto px-8">
            <div className="text-5xl mb-4">📊</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Deal P&L Tracker</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--sgc-gray-mid)' }}>
              Track every dollar in and out per deal — estimated vs actual. After 3 deals you'll know exactly where your estimates are wrong and get tighter on every future one.
            </p>
            <div className="space-y-3 w-full mb-6 text-left">
              {[
                { icon: '🎯', t: 'Estimated vs Actual', d: 'Enter your estimates upfront, update actuals as you spend. See variance per line item.' },
                { icon: '🔨', t: 'Rehab Accuracy Score', d: 'How close were your rehab estimates? Reveals your systematic blind spots.' },
                { icon: '💡', t: 'Overrun Intelligence', d: 'Which categories always run over? Use this to add buffer to future deals.' },
              ].map(s => (
                <div key={s.t} className="flex gap-3 bg-white rounded-xl border p-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <span className="text-2xl">{s.icon}</span>
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
              Start Tracking Your First Deal →
            </button>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {deals.map(d => {
              const s = analyzeDeal(d)
              const statusColor = d.status === 'closed' ? '#1A7A4A' : d.status === 'under_contract' ? '#8A5700' : '#1B3A8C'
              return (
                <div key={d.id} onClick={() => setSelected(d)}
                  className="bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-all"
                  style={{ borderColor: d.status === 'closed' ? '#1A7A4A30' : 'var(--sgc-gray-border)' }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate" style={{ color: 'var(--sgc-black)' }}>{d.address}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                        {d.city}, {d.state} · {d.purchaseDate && new Date(d.purchaseDate).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize flex-shrink-0"
                      style={{ background: statusColor + '20', color: statusColor }}>
                      {d.status.replace('_',' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { l: 'Revenue', v: s.totalRevenue.act || s.totalRevenue.est, isAct: s.totalRevenue.act > 0, c: '#1A7A4A' },
                      { l: 'Costs',   v: s.totalCosts.act   || s.totalCosts.est,   isAct: s.totalCosts.act   > 0, c: '#C0341D' },
                      { l: 'Profit',  v: s.netProfit.act    || s.netProfit.est,    isAct: s.netProfit.act    !== 0, c: s.netProfit.act >= 0 || s.netProfit.est >= 0 ? '#1A7A4A' : '#C0341D' },
                    ].map(m => (
                      <div key={m.l} className="text-center p-2 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
                        <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                        <div className="text-sm font-bold" style={{ color: m.v !== 0 ? m.c : 'var(--sgc-gray-mid)' }}>
                          {m.v !== 0 ? fmt$(m.v) : '—'}
                        </div>
                        {!m.isAct && m.v !== 0 && <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>est</div>}
                      </div>
                    ))}
                  </div>
                  {s.holdDays !== null && (
                    <div className="mt-2 text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                      {s.holdDays} day hold · {s.rehabAccuracy < 100 ? `${Math.round(s.rehabAccuracy)}% rehab accuracy` : 'no actuals yet'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showNew && (
        <NewDealModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => { refresh(); const d = getDealPLs().find(x => x.id === id); if (d) setSelected(d) }}
        />
      )}
    </div>
  )
}
