/**
 * Pipeline — Deal CRM with full intelligence suite
 * Kanban + List + Rehab Estimator + Comp Pull + Wholesale PDF + Follow-up Tasks + Drip
 */
import { useState, useEffect, useCallback } from 'react'
import {
  getPipeline, updatePipelineLead, addContactAttempt, addOffer,
  deletePipelineLead, getPipelineStats,
  PipelineLead, PipelineStage, ContactAttempt, Offer
} from '../lib/pipeline'
import { pullComps, CompResult } from '../lib/compPull'
import { calculateRehab, DEFAULT_SYSTEMS, RehabSystem, Condition } from '../lib/rehabEstimator'
import { generateFollowUpTask, addTask, getTasks, getDueTodayAndOverdue, completeTask, deleteTask, getTaskStats, FollowUpTask } from '../lib/followUpEngine'
import { generateWholesaleSummary } from '../lib/wholesalePDF'
import { createDripSequence, hasActiveSequence } from '../lib/drip'
import DealGradePanel from './DealGrade'
import RehabEstimator from './RehabEstimator'

const STAGE_CONFIG: Record<PipelineStage, { label: string; color: string; bg: string; icon: string }> = {
  new:            { label: 'New Lead',       color: '#534AB7', bg: '#EEEDFE', icon: '🆕' },
  researching:    { label: 'Researching',    color: '#1B3A8C', bg: '#EEF2FB', icon: '🔍' },
  contacted:      { label: 'Contacted',      color: '#C45E1A', bg: '#FEF3EA', icon: '📞' },
  negotiating:    { label: 'Negotiating',    color: '#8A5700', bg: '#FEF7EA', icon: '💬' },
  under_contract: { label: 'Under Contract', color: '#1A7A4A', bg: '#EDFAF3', icon: '✍️' },
  closed_won:     { label: 'Closed ✓',       color: '#1A7A4A', bg: '#EDFAF3', icon: '🏆' },
  closed_lost:    { label: 'Dead',           color: '#C0341D', bg: '#FEF0ED', icon: '✗'  },
  pass:           { label: 'Passed',         color: 'var(--sgc-gray-mid)', bg: 'var(--sgc-gray-light)', icon: '⏭️' },
}

const ACTIVE_STAGES: PipelineStage[] = ['new','researching','contacted','negotiating','under_contract']
const ALL_STAGES:    PipelineStage[] = ['new','researching','contacted','negotiating','under_contract','closed_won','closed_lost','pass']

const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'

// ── Contact Log Modal ─────────────────────────────────────────────────────────
function ContactModal({ lead, onClose, onSave }: {
  lead: PipelineLead
  onClose: () => void
  onSave: () => void
}) {
  const [method, setMethod] = useState<ContactAttempt['method']>('phone')
  const [phone,  setPhone]  = useState(lead.phones.find(p => !p.dnc && !p.litigator)?.number || '')
  const [email,  setEmail]  = useState(lead.emails[0]?.address || '')
  const [outcome, setOutcome] = useState<ContactAttempt['outcome']>('no_answer')
  const [notes,  setNotes]  = useState('')

  const handleSave = () => {
    addContactAttempt(lead.id, {
      date: new Date().toISOString(),
      method, phone: method === 'phone' || method === 'sms' ? phone : undefined,
      email: method === 'email' ? email : undefined,
      notes, outcome,
    })
    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div>
            <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>Log Contact Attempt</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{lead.address}</div>
          </div>
          <button onClick={onClose} className="text-xl cursor-pointer bg-transparent border-none" style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
        </div>
        <div className="p-5 space-y-4">
          {/* DNC warning */}
          {lead.phones.some(p => p.dnc || p.litigator) && (
            <div className="p-3 rounded-xl text-xs font-semibold" style={{ background: '#FEF0ED', color: '#C0341D' }}>
              ⚠ One or more numbers are DNC-flagged. Only call non-DNC numbers. TCPA violations: $500-$1,500 per call.
            </div>
          )}

          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>Method</div>
            <div className="grid grid-cols-5 gap-1.5">
              {(['phone','sms','email','door','mail'] as const).map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className="py-2 rounded-lg border text-xs font-medium cursor-pointer capitalize"
                  style={method === m
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {(method === 'phone' || method === 'sms') && (
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>Phone Number</div>
              <div className="space-y-1">
                {lead.phones.filter(p => !p.litigator).map((p, i) => (
                  <button key={i} onClick={() => !p.dnc && setPhone(p.number)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg border text-left cursor-pointer"
                    style={{
                      background: phone === p.number ? 'var(--sgc-navy-pale)' : 'white',
                      borderColor: phone === p.number ? 'var(--sgc-navy)40' : 'var(--sgc-gray-border)',
                      opacity: p.dnc ? 0.5 : 1,
                      cursor: p.dnc ? 'not-allowed' : 'pointer',
                    }}>
                    <span className="text-sm font-mono">{p.number}</span>
                    <span className="text-[10px] capitalize" style={{ color: 'var(--sgc-gray-mid)' }}>{p.type}</span>
                    {p.dnc && <span className="text-[10px] font-bold ml-auto" style={{ color: '#C0341D' }}>⛔ DNC</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>Outcome</div>
            <select className="w-full rounded-lg border text-sm px-3 py-2 outline-none"
              style={{ borderColor: 'var(--sgc-gray-border)' }}
              value={outcome} onChange={e => setOutcome(e.target.value as any)}>
              <option value="no_answer">No Answer</option>
              <option value="left_vm">Left Voicemail</option>
              <option value="connected">Connected & Spoke</option>
              <option value="not_interested">Not Interested</option>
              <option value="interested">Interested — Follow Up</option>
              <option value="callback">Requested Callback</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>Notes</div>
            <textarea
              className="w-full rounded-lg border text-sm px-3 py-2 outline-none resize-none"
              style={{ borderColor: 'var(--sgc-gray-border)' }}
              rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="What happened? What did they say?" />
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>Save Contact Log</button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm border-none cursor-pointer"
              style={{ background: 'var(--sgc-gray-border)' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Offer Modal ───────────────────────────────────────────────────────────────
function OfferModal({ lead, onClose, onSave }: {
  lead: PipelineLead; onClose: () => void; onSave: () => void
}) {
  const [amount,  setAmount]  = useState(lead.maxOffer || 0)
  const [arv,     setArv]     = useState(lead.estimatedARV || 0)
  const [rehab,   setRehab]   = useState(lead.estimatedRehab || 0)
  const [status,  setStatus]  = useState<Offer['status']>('pending')
  const [notes,   setNotes]   = useState('')

  const profit = arv - amount - rehab - (arv * 0.08)  // rough costs

  const handleSave = () => {
    addOffer(lead.id, { date: new Date().toISOString(), amount, arv, rehab, status, notes })
    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div>
            <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>Log Offer</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{lead.address}</div>
          </div>
          <button onClick={onClose} className="text-xl cursor-pointer bg-transparent border-none" style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
        </div>
        <div className="p-5 space-y-4">
          {[
            { l: 'Offer Amount', v: amount, set: setAmount },
            { l: 'ARV (After Repair Value)', v: arv, set: setArv },
            { l: 'Rehab Estimate', v: rehab, set: setRehab },
          ].map(f => (
            <div key={f.l}>
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{f.l}</div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>$</span>
                <input type="number" value={f.v} onChange={e => f.set(parseFloat(e.target.value)||0)}
                  className="w-full rounded-lg border text-sm py-2 pl-7 pr-3 outline-none"
                  style={{ borderColor: 'var(--sgc-gray-border)' }} />
              </div>
            </div>
          ))}

          {/* Quick math */}
          <div className="p-3 rounded-xl" style={{ background: profit > 0 ? '#EDFAF3' : '#FEF0ED' }}>
            <div className="text-xs font-semibold mb-1" style={{ color: profit > 0 ? '#1A7A4A' : '#C0341D' }}>
              Estimated Net Profit (rough)
            </div>
            <div className="text-2xl font-black" style={{ color: profit > 0 ? '#1A7A4A' : '#C0341D' }}>
              {fmt$(profit)}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              ARV − Offer − Rehab − 8% costs = {fmt$(profit)}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>Status</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['pending','accepted','rejected'] as const).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className="py-2 rounded-lg border text-xs font-medium cursor-pointer capitalize"
                  style={status === s
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Notes</div>
            <textarea className="w-full rounded-lg border text-sm px-3 py-2 outline-none resize-none"
              style={{ borderColor: 'var(--sgc-gray-border)' }}
              rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Counter offer, conditions, timeline..." />
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>Save Offer</button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm border-none cursor-pointer"
              style={{ background: 'var(--sgc-gray-border)' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Lead Card ─────────────────────────────────────────────────────────────────
function PipelineCard({ lead, onUpdate, onSelect }: {
  lead: PipelineLead
  onUpdate: () => void
  onSelect: () => void
}) {
  const sc = STAGE_CONFIG[lead.stage]
  const lastContact = lead.contacts[lead.contacts.length - 1]
  const daysSinceContact = lastContact
    ? Math.floor((Date.now() - new Date(lastContact.date).getTime()) / 86400000)
    : null

  return (
    <div onClick={onSelect}
      className="bg-white rounded-xl border cursor-pointer hover:shadow-md transition-all overflow-hidden"
      style={{ borderColor: lead.priority === 'hot' ? '#C0341D40' : 'var(--sgc-gray-border)' }}>
      {lead.priority === 'hot' && <div className="h-0.5 w-full bg-red-500" />}

      <div className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold truncate" style={{ color: 'var(--sgc-black)' }}>{lead.address}</div>
            <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{lead.city}, {lead.state} {lead.zip}</div>
          </div>
          <div className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-black flex-shrink-0"
            style={{ background: '#EEF2FB', color: 'var(--sgc-navy)' }}>
            {lead.investorScore}
          </div>
        </div>

        {/* Signal */}
        <div className="text-[10px] mb-2 px-2 py-1 rounded-full inline-block"
          style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
          {lead.signalLabel}
        </div>

        {/* Owner if we have it */}
        {lead.ownerName && (
          <div className="text-xs mb-1.5 font-medium" style={{ color: 'var(--sgc-navy)' }}>
            👤 {lead.ownerName}
            {lead.phones.find(p => !p.dnc) && ` · ${lead.phones.find(p => !p.dnc)?.number}`}
          </div>
        )}

        {/* Deal numbers */}
        {lead.estimatedARV > 0 && (
          <div className="grid grid-cols-3 gap-1 mb-2">
            {[
              { l: 'ARV', v: fmt$(lead.estimatedARV) },
              { l: 'Max Offer', v: fmt$(lead.maxOffer) },
              { l: 'Est Profit', v: fmt$(lead.estimatedProfit) },
            ].map(m => (
              <div key={m.l} className="text-center p-1 rounded" style={{ background: 'var(--sgc-gray-light)' }}>
                <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                <div className="text-[10px] font-bold" style={{ color: 'var(--sgc-navy)' }}>{m.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Stage + activity */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: sc.bg, color: sc.color }}>
            {sc.icon} {sc.label}
          </span>
          <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
            {lead.contacts.length > 0 && <span>{lead.contacts.length} contacts</span>}
            {daysSinceContact !== null && daysSinceContact > 3 && (
              <span style={{ color: '#C45E1A' }}>⏱ {daysSinceContact}d ago</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Lead Detail Drawer ────────────────────────────────────────────────────────
function LeadDrawer({ lead: initial, onClose, onUpdate }: {
  lead: PipelineLead; onClose: () => void; onUpdate: () => void
}) {
  const [lead, setLead] = useState(initial)
  const [showContact, setShowContact] = useState(false)
  const [showOffer,   setShowOffer]   = useState(false)
  const [activeTab,   setActiveTab]   = useState<'overview'|'contacts'|'offers'|'rehab'|'comps'|'notes'>('overview')
  const [notes, setNotes] = useState(initial.notes || '')
  const [arv,   setArv]   = useState(initial.estimatedARV || 0)
  const [rehab, setRehab] = useState(initial.estimatedRehab || 0)

  // Comp pull state
  const [comps,       setComps]       = useState<CompResult | null>(null)
  const [compsLoading,setCompsLoading]= useState(false)

  // Rehab estimator state
  const [rehabSqft,setRehabSqft]= useState(1200)
  const [rehabBeds,setRehabBeds]= useState(3)

  const handlePullComps = useCallback(async () => {
    setCompsLoading(true)
    setActiveTab('comps')
    const result = await pullComps(
      lead.address, lead.city, lead.state, lead.zip,
      undefined, undefined, rehabSqft
    )
    if (result) {
      setComps(result)
      // Auto-fill ARV with comp suggestion
      if (result.arvSuggestion > 0 && arv === 0) {
        setArv(result.arvSuggestion)
      }
    }
    setCompsLoading(false)
  }, [lead, rehabSqft, arv])

  const refresh = () => {
    const updated = getPipeline().find(l => l.id === lead.id)
    if (updated) setLead(updated)
    onUpdate()
  }

  const setStage = (stage: PipelineStage) => {
    updatePipelineLead(lead.id, { stage })
    refresh()
  }

  const setPriority = (priority: PipelineLead['priority']) => {
    updatePipelineLead(lead.id, { priority })
    refresh()
  }

  const saveNotes = () => {
    const maxOffer  = arv * 0.70 - rehab
    const profit    = arv - (maxOffer) - rehab - (arv * 0.08)
    updatePipelineLead(lead.id, {
      notes, estimatedARV: arv, estimatedRehab: rehab,
      maxOffer: Math.max(0, maxOffer), estimatedProfit: Math.max(0, profit)
    })
    refresh()
  }

  const sc = STAGE_CONFIG[lead.stage]

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[560px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start gap-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg" style={{ color: 'var(--sgc-navy)' }}>{lead.address}</div>
            <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>{lead.city}, {lead.state} {lead.zip}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: sc.bg, color: sc.color }}>
                {sc.icon} {sc.label}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{
                background: lead.priority === 'hot' ? '#FEF0ED' : lead.priority === 'warm' ? '#FEF7EA' : 'var(--sgc-gray-light)',
                color: lead.priority === 'hot' ? '#C0341D' : lead.priority === 'warm' ? '#8A5700' : 'var(--sgc-gray-mid)',
              }}>
                {lead.priority === 'hot' ? '🔥' : lead.priority === 'warm' ? '🌡️' : '❄️'} {lead.priority}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-xl cursor-pointer bg-transparent border-none flex-shrink-0" style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
        </div>

        {/* Action buttons */}
        <div className="px-5 py-3 border-b flex gap-2 flex-wrap" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <button onClick={() => setShowContact(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white border-none cursor-pointer"
            style={{ background: 'var(--sgc-navy)' }}>
            📞 Log Contact
          </button>
          <button onClick={() => setShowOffer(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border-none cursor-pointer"
            style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
            💰 Log Offer
          </button>
          <button onClick={handlePullComps} disabled={compsLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border-none cursor-pointer"
            style={{ background: '#EEF2FB', color: 'var(--sgc-navy)' }}>
            {compsLoading ? '⟳' : '🏠'} {compsLoading ? 'Pulling...' : comps ? 'Comps ✓' : 'Pull Comps'}
          </button>
          <button
            onClick={() => {
              if (hasActiveSequence(lead.id)) { alert('This lead already has an active drip sequence.'); return }
              createDripSequence({
                leadId:    lead.id,
                address:   lead.address,
                ownerName: lead.ownerName || '',
                phone:     lead.phones?.find(p => !p.dnc)?.number,
                email:     lead.emails?.[0]?.address,
                templateId: lead.priority === 'hot' ? 'hot_lead' : 'motivated_seller',
              })
              alert('✓ Drip sequence started! Go to Drip Sequences tab to track it.')
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border-none cursor-pointer"
            style={{ background: hasActiveSequence(lead.id) ? '#EDFAF3' : '#EEEDFE', color: hasActiveSequence(lead.id) ? '#1A7A4A' : '#534AB7' }}>
            {hasActiveSequence(lead.id) ? '✓ Drip Active' : '🔄 Start Drip'}
          </button>
          <a href="#wholesale" onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border-none cursor-pointer no-underline"
            style={{ background: '#FEF7EA', color: '#8A5700' }}>
            🏷️ Wholesale
          </a>
          {/* Priority toggles */}
          {(['hot','warm','cold'] as const).map(p => (
            <button key={p} onClick={() => setPriority(p)}
              className="px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer capitalize"
              style={lead.priority === p
                ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
              {p === 'hot' ? '🔥' : p === 'warm' ? '🌡️' : '❄️'} {p}
            </button>
          ))}
        </div>

        {/* Stage pipeline */}
        <div className="px-5 py-3 border-b overflow-x-auto" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="flex gap-1 min-w-max">
            {ALL_STAGES.map((s, i) => {
              const cfg = STAGE_CONFIG[s]
              const isActive = lead.stage === s
              return (
                <button key={s} onClick={() => setStage(s)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border cursor-pointer whitespace-nowrap"
                  style={isActive
                    ? { background: cfg.color, borderColor: cfg.color, color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {cfg.icon} {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex border-b px-5 overflow-x-auto" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          {(['overview','contacts','offers','rehab','comps','notes'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="px-3 py-2.5 text-xs font-semibold capitalize border-b-2 cursor-pointer bg-transparent border-x-0 border-t-0 whitespace-nowrap"
              style={activeTab === t
                ? { borderBottomColor: 'var(--sgc-navy)', color: 'var(--sgc-navy)' }
                : { borderBottomColor: 'transparent', color: 'var(--sgc-gray-mid)' }}>
              {t} {t === 'contacts' && lead.contacts.length > 0 ? `(${lead.contacts.length})` : ''}
              {t === 'offers' && lead.offers.length > 0 ? `(${lead.offers.length})` : ''}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">

          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Owner contact */}
              {(lead.ownerName || lead.phones.length > 0 || lead.emails.length > 0) && (
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)', background: 'var(--sgc-navy-pale)' }}>
                  <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>Owner Contact</div>
                  {lead.ownerName && <div className="font-bold mb-2" style={{ color: 'var(--sgc-black)' }}>👤 {lead.ownerName}</div>}
                  {lead.phones.filter(p => !p.litigator).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 mb-1">
                      <a href={`tel:${p.number}`} className="text-sm font-mono font-semibold" style={{ color: p.dnc ? '#C0341D' : 'var(--sgc-navy)' }}>
                        📞 {p.number}
                      </a>
                      <span className="text-[10px] capitalize" style={{ color: 'var(--sgc-gray-mid)' }}>{p.type}</span>
                      {p.dnc && <span className="text-[10px] font-bold" style={{ color: '#C0341D' }}>⛔ DNC</span>}
                    </div>
                  ))}
                  {lead.emails.map((e, i) => (
                    <div key={i} className="text-sm mb-1">
                      <a href={`mailto:${e.address}`} style={{ color: 'var(--sgc-navy)' }}>✉️ {e.address}</a>
                    </div>
                  ))}
                  {lead.mailingAddr && <div className="text-xs mt-2" style={{ color: 'var(--sgc-gray-mid)' }}>📬 Mailing: {lead.mailingAddr}</div>}
                </div>
              )}

              {/* Deal numbers */}
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>Deal Analysis</div>
                <div className="space-y-2">
                  {[
                    { l: 'ARV', key: 'arv', v: arv, set: setArv },
                    { l: 'Rehab', key: 'rehab', v: rehab, set: setRehab },
                  ].map(f => (
                    <div key={f.l} className="flex items-center gap-3">
                      <span className="text-xs w-16" style={{ color: 'var(--sgc-gray-mid)' }}>{f.l}</span>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>$</span>
                        <input type="number" value={f.v}
                          onChange={e => f.set(parseFloat(e.target.value)||0)}
                          className="w-full rounded-lg border text-sm py-1.5 pl-5 pr-2 outline-none"
                          style={{ borderColor: 'var(--sgc-gray-border)' }} />
                      </div>
                    </div>
                  ))}
                  <button onClick={saveNotes}
                    className="w-full py-2 rounded-lg text-xs font-bold text-white border-none cursor-pointer mt-1"
                    style={{ background: 'var(--sgc-navy)' }}>Update Deal Math</button>
                </div>
                {arv > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { l: 'Max Offer (70%)', v: fmt$(Math.max(0, arv*0.70 - rehab)), c: '#1B3A8C' },
                      { l: 'Est Profit',      v: fmt$(Math.max(0, arv - (arv*0.70-rehab) - rehab - arv*0.08)), c: '#1A7A4A' },
                      { l: 'Inv Score',       v: `${lead.investorScore}/100`, c: '#534AB7' },
                    ].map(m => (
                      <div key={m.l} className="text-center p-2 rounded-lg" style={{ background: 'var(--sgc-gray-light)' }}>
                        <div className="text-[9px] mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                        <div className="text-sm font-bold" style={{ color: m.c }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Signal info */}
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>Lead Signal</div>
                <div className="text-sm" style={{ color: 'var(--sgc-black)' }}>{lead.signalLabel}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>Source: {lead.source}</div>
              </div>

              {/* GC Deal Grade */}
              <DealGradePanel
                compact={false}
                input={{
                  address:       lead.address,
                  city:          lead.city,
                  state:         lead.state,
                  estimatedValue:lead.estimatedARV || undefined,
                  arvSuggestion: lead.estimatedARV || undefined,
                  estimatedRehab:lead.estimatedRehab || undefined,
                  signalType:    lead.signalType,
                  signalLabel:   lead.signalLabel,
                  severity:      lead.severity,
                  compsCount:    comps?.comps?.length || undefined,
                  arvPriceLow:   comps?.priceLow || undefined,
                  arvPriceHigh:  comps?.priceHigh || undefined,
                }}
              />
            </div>
          )}

          {activeTab === 'contacts' && (
            <div className="space-y-3">
              <button onClick={() => setShowContact(true)}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                style={{ background: 'var(--sgc-navy)' }}>+ Log New Contact Attempt</button>
              {lead.contacts.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>No contacts logged yet</div>
              ) : [...lead.contacts].reverse().map(c => (
                <div key={c.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold capitalize" style={{ color: 'var(--sgc-navy)' }}>
                      {c.method === 'phone' ? '📞' : c.method === 'sms' ? '💬' : c.method === 'email' ? '✉️' : c.method === 'door' ? '🚪' : '📬'} {c.method}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                      {new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-xs font-semibold mb-1" style={{
                    color: c.outcome === 'interested' ? '#1A7A4A' : c.outcome === 'connected' ? '#1B3A8C' : 'var(--sgc-gray-mid)'
                  }}>
                    {c.outcome.replace('_', ' ')}
                  </div>
                  {c.phone && <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{c.phone}</div>}
                  {c.notes && <div className="text-xs mt-1" style={{ color: 'var(--sgc-black)' }}>{c.notes}</div>}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'offers' && (
            <div className="space-y-3">
              <button onClick={() => setShowOffer(true)}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                style={{ background: 'var(--sgc-navy)' }}>+ Log New Offer</button>
              {lead.offers.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>No offers logged yet</div>
              ) : [...lead.offers].reverse().map(o => (
                <div key={o.id} className="rounded-xl border p-4" style={{
                  borderColor: o.status === 'accepted' ? '#1A7A4A40' : o.status === 'rejected' ? '#C0341D40' : 'var(--sgc-gray-border)'
                }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xl font-black" style={{ color: 'var(--sgc-navy)' }}>{fmt$(o.amount)}</div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
                      style={{
                        background: o.status === 'accepted' ? '#EDFAF3' : o.status === 'rejected' ? '#FEF0ED' : 'var(--sgc-gray-light)',
                        color: o.status === 'accepted' ? '#1A7A4A' : o.status === 'rejected' ? '#C0341D' : 'var(--sgc-gray-mid)',
                      }}>
                      {o.status}
                    </span>
                  </div>
                  <div className="text-xs space-y-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                    <div>ARV: {fmt$(o.arv)} · Rehab: {fmt$(o.rehab)}</div>
                    <div>Est profit: {fmt$(o.arv - o.amount - o.rehab - o.arv * 0.08)}</div>
                    <div>{new Date(o.date).toLocaleDateString()}</div>
                  </div>
                  {o.notes && <div className="text-xs mt-2" style={{ color: 'var(--sgc-black)' }}>{o.notes}</div>}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-3">
              <textarea
                className="w-full rounded-xl border text-sm p-4 outline-none resize-none"
                style={{ borderColor: 'var(--sgc-gray-border)', minHeight: 200 }}
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Property notes, neighborhood observations, owner situation, deal notes..." />
              <button onClick={saveNotes}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                style={{ background: 'var(--sgc-navy)' }}>Save Notes</button>
              <button onClick={() => {
                if (confirm('Remove this lead from pipeline?')) {
                  deletePipelineLead(lead.id)
                  onUpdate()
                  onClose()
                }
              }} className="w-full py-2.5 rounded-xl text-sm font-medium border cursor-pointer"
                style={{ borderColor: '#C0341D40', color: '#C0341D', background: 'transparent' }}>
                Remove from Pipeline
              </button>
            </div>
          )}

          {/* ── REHAB TAB ── */}
          {activeTab === 'rehab' && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>
                Renovation Cost Estimator — VA/NC Market Rates
              </div>
              <RehabEstimator
                address={lead.address}
                city={lead.city}
                state={lead.state}
                zip={lead.zip}
                initialARV={arv}
                initialSqft={rehabSqft}
                initialBeds={rehabBeds}
                compact={true}
                onRehabChange={(cost) => {
                  setRehab(cost)
                  updatePipelineLead(lead.id, { estimatedRehab: cost, maxOffer: Math.max(0, arv * 0.70 - cost) })
                }}
              />
            </div>
          )}

          {/* ── COMPS TAB ── */}
          {activeTab === 'comps' && (
            <div className="space-y-4">
              <button onClick={handlePullComps} disabled={compsLoading}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                style={{ background: compsLoading ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)' }}>
                {compsLoading ? '⟳ Pulling comps from RentCast...' : '🏠 Pull Live Comps + ARV'}
              </button>

              {comps && (
                <>
                  {/* AVM card */}
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sgc-navy)30' }}>
                    <div className="px-4 py-3" style={{ background: 'var(--sgc-navy)' }}>
                      <div className="text-xs font-bold text-white uppercase tracking-wider mb-1">RentCast AVM Estimate</div>
                      <div className="text-3xl font-black text-white">
                        ${Math.round(comps.estimatedValue / 1000)}k
                      </div>
                      <div className="text-xs text-white/70 mt-0.5">
                        Range ${Math.round(comps.priceLow/1000)}k – ${Math.round(comps.priceHigh/1000)}k · {comps.confidence} confidence
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                      <div className="text-center p-3 rounded-xl" style={{ background: '#EDFAF3' }}>
                        <div className="text-[10px] font-semibold mb-1" style={{ color: '#1A7A4A' }}>Conservative ARV</div>
                        <div className="text-2xl font-black" style={{ color: '#1A7A4A' }}>
                          ${Math.round(comps.arvSuggestion / 1000)}k
                        </div>
                        <div className="text-[9px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>median comps − 3%</div>
                      </div>
                      <div className="text-center p-3 rounded-xl" style={{ background: 'var(--sgc-navy-pale)' }}>
                        <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--sgc-navy)' }}>70% Rule MAO</div>
                        <div className="text-2xl font-black" style={{ color: 'var(--sgc-navy)' }}>
                          ${Math.round(comps.arvSuggestion * 0.70 / 1000)}k
                        </div>
                        <div className="text-[9px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>before rehab deduct</div>
                      </div>
                    </div>
                    <div className="px-4 pb-3">
                      <button
                        onClick={() => { setArv(comps.arvSuggestion); setActiveTab('overview') }}
                        className="w-full py-2 rounded-lg text-xs font-bold text-white border-none cursor-pointer"
                        style={{ background: '#1A7A4A' }}>
                        ✓ Use This ARV in Deal Math
                      </button>
                    </div>
                  </div>

                  {/* Comps list */}
                  {comps.comps.length > 0 && (
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>
                        Sold Comps ({comps.comps.length})
                      </div>
                      <div className="space-y-2">
                        {comps.comps.slice(0, 6).map((c, i) => (
                          <div key={i} className="rounded-xl border p-3" style={{
                            borderColor: i === 0 ? 'var(--sgc-navy)30' : 'var(--sgc-gray-border)',
                            background: i === 0 ? '#EEF2FB' : 'white'
                          }}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold truncate" style={{ color: 'var(--sgc-black)' }}>
                                  {i === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded mr-1 font-bold" style={{ background: 'var(--sgc-navy)', color: 'white' }}>BEST</span>}
                                  {c.address}
                                </div>
                                <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                                  {c.beds}bd · {c.baths}ba
                                  {c.sqft > 0 && ` · ${c.sqft.toLocaleString()} sqft`}
                                  {c.distance > 0 && ` · ${c.distance.toFixed(2)}mi away`}
                                </div>
                                {c.soldDate && (
                                  <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                                    Sold {new Date(c.soldDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </div>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-sm font-black" style={{ color: 'var(--sgc-navy)' }}>
                                  ${Math.round(c.price / 1000)}k
                                </div>
                                {c.pricePerSqft > 0 && (
                                  <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                                    ${c.pricePerSqft}/sqft
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[9px] p-2 rounded-lg" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                    Source: RentCast AVM · Fetched {new Date(comps.fetchedAt).toLocaleString()} · Always verify with your own comp analysis before making offers.
                  </div>
                </>
              )}

              {!comps && !compsLoading && (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                  Click "Pull Live Comps" to fetch RentCast AVM data and sold comparables for this address.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showContact && <ContactModal lead={lead} onClose={() => setShowContact(false)} onSave={refresh} />}
      {showOffer   && <OfferModal   lead={lead} onClose={() => setShowOffer(false)}   onSave={refresh} />}
    </>
  )
}

// ── Main Pipeline Component ───────────────────────────────────────────────────
export default function Pipeline() {
  const [leads,        setLeads]       = useState<PipelineLead[]>([])
  const [selectedLead, setSelected]    = useState<PipelineLead | null>(null)
  const [viewMode,     setViewMode]    = useState<'kanban'|'list'>('kanban')
  const [filterStage,  setFilterStage] = useState<PipelineStage | 'all'>('all')
  const [searchText,   setSearch]      = useState('')

  const refresh = () => setLeads(getPipeline())
  useEffect(() => { refresh() }, [])

  const stats = getPipelineStats()

  const displayLeads = leads
    .filter(l => filterStage === 'all' || l.stage === filterStage)
    .filter(l => !searchText || l.address.toLowerCase().includes(searchText.toLowerCase()) ||
                 l.ownerName?.toLowerCase().includes(searchText.toLowerCase()))

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* Header */}
      <div className="flex-shrink-0 border-b bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        {/* Stats strip */}
        <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(6,1fr)', borderColor: 'var(--sgc-gray-border)' }}>
          {[
            { l: 'Total Leads',      v: stats.total,                   c: 'var(--sgc-navy)' },
            { l: 'Active Deals',     v: stats.active,                  c: '#1B3A8C'         },
            { l: '🔥 Hot',           v: stats.hotLeads,                c: '#C0341D'         },
            { l: 'Under Contract',   v: stats.stages.under_contract,   c: '#1A7A4A'         },
            { l: 'Closed Won',       v: stats.stages.closed_won,       c: '#1A7A4A'         },
            { l: 'Closed Profit',    v: stats.totalClosedProfit > 0 ? fmt$(stats.totalClosedProfit) : '—', c: '#1A7A4A' },
          ].map((s, i) => (
            <div key={s.l} className={`p-3 ${i < 5 ? 'border-r' : ''}`} style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
              <div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 px-5 py-3 flex-wrap">
          <input className="text-xs px-3 py-1.5 rounded-lg border outline-none w-40"
            style={{ borderColor: 'var(--sgc-gray-border)' }}
            placeholder="Search leads..." value={searchText} onChange={e => setSearch(e.target.value)} />

          <div className="flex gap-1 overflow-x-auto">
            {(['all', ...ACTIVE_STAGES, 'closed_won'] as const).map(s => (
              <button key={s} onClick={() => setFilterStage(s as any)}
                className="text-[10px] px-2.5 py-1 rounded border cursor-pointer whitespace-nowrap"
                style={filterStage === s
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {s === 'all' ? 'All' : STAGE_CONFIG[s as PipelineStage]?.label || s}
                {s !== 'all' && stats.stages[s as PipelineStage] > 0 && ` (${stats.stages[s as PipelineStage]})`}
              </button>
            ))}
          </div>

          <div className="ml-auto flex gap-1">
            {(['kanban','list'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer capitalize"
                style={viewMode === m
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {m === 'kanban' ? '⊞ Kanban' : '☰ List'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {leads.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="text-5xl mb-4">🎯</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Pipeline Empty</h3>
            <p className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
              Go to Lead Radar → find a lead → click "Add to Pipeline".<br />
              Every lead you're tracking appears here.
            </p>
          </div>
        ) : viewMode === 'kanban' ? (
          // Kanban view
          <div className="flex gap-4 h-full overflow-x-auto pb-4">
            {ACTIVE_STAGES.map(stage => {
              const stageLeads = displayLeads.filter(l => l.stage === stage)
              const cfg = STAGE_CONFIG[stage]
              return (
                <div key={stage} className="flex-shrink-0 w-72 flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm">{cfg.icon}</span>
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label}</span>
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {stageLeads.length}
                    </span>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto">
                    {stageLeads.map(l => (
                      <PipelineCard key={l.id} lead={l} onUpdate={refresh}
                        onSelect={() => setSelected(l)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // List view
          <div className="space-y-2">
            {displayLeads.map(l => (
              <div key={l.id} onClick={() => setSelected(l)}
                className="bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all flex items-center gap-4"
                style={{ borderColor: 'var(--sgc-gray-border)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                  style={{ background: '#EEF2FB', color: 'var(--sgc-navy)' }}>{l.investorScore}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate" style={{ color: 'var(--sgc-black)' }}>{l.address}</div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{l.city}, {l.state} · {l.signalLabel}</div>
                </div>
                {l.ownerName && <div className="text-xs hidden md:block" style={{ color: 'var(--sgc-navy)' }}>👤 {l.ownerName}</div>}
                <div className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                  style={{ background: STAGE_CONFIG[l.stage].bg, color: STAGE_CONFIG[l.stage].color }}>
                  {STAGE_CONFIG[l.stage].label}
                </div>
                <div className="text-xs flex-shrink-0" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {l.contacts.length} contacts
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          onClose={() => setSelected(null)}
          onUpdate={refresh}
        />
      )}
    </div>
  )
}
