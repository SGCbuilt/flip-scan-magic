/**
 * Project Phase Tracker — Construction Timeline Intelligence
 *
 * The feature that turns your GC expertise into compounding data.
 * Every phase logged = future deal accuracy.
 *
 * The carry cost clock is always visible.
 * The GC advantage is always quantified.
 * The delay pattern is always learning.
 */
import { useState, useEffect } from 'react'
import {
  getProjects, createProject, updatePhase, updateProject, deleteProject,
  analyzeProject, buildPortfolioIntelligence,
  PHASES, Phase, ProjectTimeline, ProjectAnalysis,
} from '../lib/projectTracker'
import { getPipeline } from '../lib/pipeline'

const fmt$ = (n: number) => n >= 1000 ? '$' + Math.round(n).toLocaleString() : n > 0 ? '$' + Math.round(n) : '—'
const fmt$k = (n: number) => n >= 1000 ? '$' + Math.round(n / 1000) + 'k' : fmt$(n)

const CATEGORY_COLORS = {
  acquisition: '#1B3A8C',
  construction:'#C45E1A',
  finish:      '#534AB7',
  exit:        '#1A7A4A',
}

const DELAY_REASONS = [
  { v: 'permit',       l: '📋 Permit/Inspection delay' },
  { v: 'contractor',   l: '👷 Contractor scheduling' },
  { v: 'material',     l: '📦 Material lead time' },
  { v: 'scope_change', l: '🔍 Scope change discovered' },
  { v: 'weather',      l: '🌧️ Weather delay' },
  { v: 'other',        l: '• Other' },
]

// ── Carry Cost Clock ───────────────────────────────────────────────────────────
function CarryClock({ analysis }: { analysis: ProjectAnalysis }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const urgency = analysis.carryDaysSoFar > 110
    ? '#C0341D' : analysis.carryDaysSoFar > 80
    ? '#C45E1A' : '#1B3A8C'

  return (
    <div className="rounded-2xl p-4 text-white"
      style={{ background: `linear-gradient(135deg, ${urgency}, ${urgency}cc)` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold opacity-80 uppercase tracking-wider">⏱ Carry Cost Clock</div>
        <div className="text-xs opacity-70">Day {analysis.carryDaysSoFar}</div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="text-2xl font-black">{analysis.carryDaysSoFar}</div>
          <div className="text-[10px] opacity-75">Days Elapsed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-black">{fmt$k(analysis.totalCarryCostSoFar)}</div>
          <div className="text-[10px] opacity-75">Total Carry Cost</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-black">{fmt$(analysis.dailyCarryCost)}</div>
          <div className="text-[10px] opacity-75">Per Day Burning</div>
        </div>
      </div>
      {analysis.gcAdvantage$ > 0 && (
        <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between">
          <div className="text-xs opacity-80">🏗️ GC Advantage Saved (vs non-GC investor)</div>
          <div className="text-sm font-black">{fmt$k(analysis.gcAdvantage$)}</div>
        </div>
      )}
      {analysis.criticalDelay && (
        <div className="mt-2 text-[10px] font-semibold opacity-80">
          ⚠ {analysis.criticalDelay.phase}: +{analysis.criticalDelay.delayDays}d delay = {fmt$(analysis.criticalDelay.costImpact)} extra carry
        </div>
      )}
    </div>
  )
}

// ── Phase row ─────────────────────────────────────────────────────────────────
function PhaseRow({ phase, phaseData, analysis, projectId, isNext, onUpdate }: {
  phase:     Phase
  phaseData: import('../lib/projectTracker').PhaseDate
  analysis:  ProjectAnalysis
  projectId: string
  isNext:    boolean
  onUpdate:  () => void
}) {
  const pa = analysis.phaseAnalyses.find(p => p.phaseId === phase.id)
  const [editing, setEditing]     = useState(false)
  const [actualDate, setActual]   = useState(phaseData.actual || '')
  const [plannedDate, setPlanned] = useState(phaseData.planned || '')
  const [notes, setNotes]         = useState(phaseData.notes || '')
  const [delayReason, setDelay]   = useState(phaseData.delayReason || '')

  const catColor = CATEGORY_COLORS[phase.category]
  const isDone = !!phaseData.actual
  const isOverdue = pa?.isOverdue || false
  const variance = pa?.variance

  const handleSave = () => {
    updatePhase(projectId, phase.id, {
      actual:      actualDate || null,
      planned:     plannedDate,
      notes:       notes || undefined,
      delayReason: delayReason || undefined,
    })
    onUpdate()
    setEditing(false)
  }

  return (
    <div className={`border-b last:border-b-0 transition-all ${isNext && !isDone ? 'bg-blue-50/30' : ''}`}
      style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status indicator */}
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
          style={{
            background: isDone ? catColor : isOverdue ? '#FEF0ED' : isNext ? '#EEF2FB' : 'var(--sgc-gray-light)',
            color: isDone ? 'white' : isOverdue ? '#C0341D' : isNext ? '#1B3A8C' : 'var(--sgc-gray-mid)',
          }}>
          {isDone ? '✓' : phase.icon}
        </div>

        {/* Phase info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold" style={{ color: isDone ? catColor : 'var(--sgc-black)' }}>
              {phase.label}
            </span>
            {isNext && !isDone && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: '#EEF2FB', color: '#1B3A8C' }}>Next Up</span>
            )}
            {isOverdue && !isDone && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: '#FEF0ED', color: '#C0341D' }}>
                Overdue {pa?.daysUntil !== null ? `${Math.abs(pa!.daysUntil!)}d` : ''}
              </span>
            )}
            {pa && pa.variance !== null && pa.variance > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: '#FEF3EA', color: '#C45E1A' }}>
                +{pa.variance}d late · {fmt$(pa.variance * analysis.dailyCarryCost)} carry
              </span>
            )}
            {pa && pa.variance !== null && pa.variance < -1 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
                {Math.abs(pa.variance)}d ahead
              </span>
            )}
          </div>
          <div className="text-[10px] mt-0.5 flex items-center gap-2" style={{ color: 'var(--sgc-gray-mid)' }}>
            {phaseData.planned && <span>Plan: {phaseData.planned}</span>}
            {phaseData.actual  && <span className="font-semibold" style={{ color: catColor }}>Actual: {phaseData.actual}</span>}
            {phaseData.delayReason && <span>· {DELAY_REASONS.find(r => r.v === phaseData.delayReason)?.l}</span>}
          </div>
          {phaseData.notes && (
            <div className="text-[10px] mt-0.5 italic" style={{ color: 'var(--sgc-gray-mid)' }}>{phaseData.notes}</div>
          )}
        </div>

        {/* Edit button */}
        <button onClick={() => setEditing(e => !e)}
          className="text-[10px] px-2 py-1 rounded-lg border-none cursor-pointer flex-shrink-0"
          style={{
            background: isDone ? '#EDFAF3' : isNext ? '#EEF2FB' : 'var(--sgc-gray-light)',
            color: isDone ? '#1A7A4A' : isNext ? '#1B3A8C' : 'var(--sgc-gray-mid)',
          }}>
          {isDone ? '✓ Edit' : isNext ? '→ Log' : 'Edit'}
        </button>
      </div>

      {/* Edit panel */}
      {editing && (
        <div className="px-4 pb-4 pt-2 border-t space-y-3" style={{ borderColor: 'var(--sgc-gray-border)', background: 'var(--sgc-gray-light)' }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                Planned Date
              </div>
              <input type="date" value={plannedDate} onChange={e => setPlanned(e.target.value)}
                className="w-full rounded-xl border text-xs px-3 py-2 outline-none bg-white"
                style={{ borderColor: 'var(--sgc-gray-border)' }} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: catColor }}>
                ✓ Actual Date (when done)
              </div>
              <input type="date" value={actualDate} onChange={e => setActual(e.target.value)}
                className="w-full rounded-xl border text-xs px-3 py-2 outline-none bg-white"
                style={{ borderColor: catColor + '60' }} />
            </div>
          </div>
          {actualDate && pa?.variance !== null && ( pa?.variance ?? 0) > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                Delay Reason
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {DELAY_REASONS.map(r => (
                  <button key={r.v} onClick={() => setDelay(r.v)}
                    className="text-[10px] py-1.5 px-2 rounded-lg border cursor-pointer text-left"
                    style={delayReason === r.v
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {r.l}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Notes</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded-xl border text-xs px-3 py-2 outline-none resize-none bg-white"
              style={{ borderColor: 'var(--sgc-gray-border)', minHeight: 44 }}
              placeholder="What happened, what caused delay, what to do differently..." />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave}
              className="flex-1 py-2 rounded-xl text-xs font-bold text-white border-none cursor-pointer"
              style={{ background: catColor }}>
              Save Phase
            </button>
            <button onClick={() => setEditing(false)}
              className="px-4 py-2 rounded-xl text-xs border-none cursor-pointer"
              style={{ background: 'var(--sgc-gray-border)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Project Detail ─────────────────────────────────────────────────────────────
function ProjectDetail({ project, onBack, onUpdate }: {
  project: ProjectTimeline; onBack: () => void; onUpdate: () => void
}) {
  const [proj, setProj] = useState(project)
  const [analysis, setAnalysis] = useState(() => analyzeProject(project))

  const refresh = () => {
    const all = getProjects()
    const updated = all.find(p => p.id === project.id)
    if (updated) { setProj(updated); setAnalysis(analyzeProject(updated)) }
    onUpdate()
  }

  const nextPhaseId = analysis.nextPhase?.id

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Back bar */}
      <div className="flex-shrink-0 bg-white border-b px-5 py-3 flex items-center gap-3"
        style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <button onClick={onBack}
          className="text-sm font-semibold cursor-pointer bg-transparent border-none"
          style={{ color: 'var(--sgc-navy)' }}>← Back</button>
        <div className="flex-1">
          <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>{proj.address}</div>
          <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
            {proj.city}, {proj.state} · Day {analysis.carryDaysSoFar} · {fmt$(analysis.dailyCarryCost)}/day
          </div>
        </div>
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full capitalize"
          style={{ background: proj.status === 'sold' ? '#EDFAF3' : '#EEF2FB', color: proj.status === 'sold' ? '#1A7A4A' : '#1B3A8C' }}>
          {proj.status}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5 max-w-3xl mx-auto">

          {/* Carry clock */}
          <CarryClock analysis={analysis} />

          {/* Projected profit */}
          {analysis.projectedProfit !== null && (
            <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>
                Deal Math (Live)
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { l: 'ARV Target',    v: fmt$k(proj.arvTarget),          c: '#1A7A4A' },
                  { l: 'All-In Cost',   v: fmt$k(proj.purchasePrice + proj.rehabBudget), c: '#C0341D' },
                  { l: 'Projected Carry', v: fmt$k(analysis.totalCarryCostSoFar), c: '#C45E1A' },
                  { l: 'Est. Profit',   v: fmt$k(analysis.projectedProfit), c: analysis.projectedProfit >= 0 ? '#1A7A4A' : '#C0341D' },
                ].map(m => (
                  <div key={m.l} className="text-center">
                    <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                    <div className="text-lg font-black" style={{ color: m.c }}>{m.v}</div>
                  </div>
                ))}
              </div>
              {analysis.projectedExitDate && (
                <div className="mt-3 pt-3 border-t text-xs flex items-center gap-2" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <span style={{ color: 'var(--sgc-gray-mid)' }}>Projected sale:</span>
                  <span className="font-bold" style={{ color: 'var(--sgc-navy)' }}>{analysis.projectedExitDate}</span>
                  {analysis.criticalDelay && (
                    <span className="ml-auto text-[10px]" style={{ color: '#C45E1A' }}>
                      ⚠ {analysis.criticalDelay.delayDays}d delay = {fmt$(analysis.criticalDelay.costImpact)} extra
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Phase timeline */}
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="px-4 py-3 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--sgc-gray-border)', background: 'var(--sgc-gray-light)' }}>
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>
                Phase Timeline
              </div>
              <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                Tap any phase to log actual date
              </div>
            </div>
            {PHASES.map(phase => {
              const phaseData = proj.phases.find(ph => ph.phaseId === phase.id)!
              return (
                <PhaseRow
                  key={phase.id}
                  phase={phase}
                  phaseData={phaseData}
                  analysis={analysis}
                  projectId={proj.id}
                  isNext={phase.id === nextPhaseId}
                  onUpdate={refresh}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── New Project Modal ─────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const pipeline = getPipeline().filter(l => l.stage === 'under_contract' || l.stage === 'closed_won')
  const [usePipeline, setUsePipeline] = useState(pipeline.length > 0)
  const [leadId,     setLeadId]     = useState(pipeline[0]?.id || '')
  const [address,    setAddress]    = useState('')
  const [city,       setCity]       = useState('')
  const [state,      setState]      = useState('VA')
  const [purchase,   setPurchase]   = useState('')
  const [loan,       setLoan]       = useState('')
  const [rate,       setRate]       = useState('11')
  const [points,     setPoints]     = useState('2')
  const [rehab,      setRehab]      = useState('')
  const [arv,        setArv]        = useState('')

  const lead = pipeline.find(l => l.id === leadId)

  const handleCreate = () => {
    const finalAddress = usePipeline && lead ? lead.address : address
    createProject({
      dealId:          usePipeline ? leadId : undefined,
      address:         finalAddress || 'Unknown',
      city:            usePipeline && lead ? lead.city : city,
      state:           usePipeline && lead ? lead.state : state,
      purchasePrice:   parseFloat(purchase) || (lead?.maxOffer || 0),
      loanAmount:      parseFloat(loan) || Math.round((lead?.maxOffer || 0) * 0.85),
      loanRatePct:     parseFloat(rate) || 11,
      loanPointsPct:   parseFloat(points) || 2,
      rehabBudget:     parseFloat(rehab) || (lead?.estimatedRehab || 0),
      arvTarget:       parseFloat(arv) || (lead?.estimatedARV || 0),
      isGCOwner:       true,
      retailGCMarkup:  22,
      status:          'active',
    })
    onCreated()
    onClose()
  }

  const NumField = ({ label, value, set, prefix = '$' }: { label: string; value: string; set: (v: string) => void; prefix?: string }) => (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{prefix}</span>
        <input type="number" value={value} onChange={e => set(e.target.value)}
          className="w-full rounded-xl border text-sm py-2 pl-6 pr-3 outline-none"
          style={{ borderColor: 'var(--sgc-gray-border)' }} />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="p-5 border-b flex justify-between" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>⏱ New Project Timeline</div>
          <button onClick={onClose} className="text-xl cursor-pointer bg-transparent border-none" style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
        </div>
        <div className="p-5 space-y-4">
          {pipeline.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setUsePipeline(true)}
                className="py-2 rounded-xl border text-xs font-semibold cursor-pointer"
                style={usePipeline ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' } : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                From Pipeline
              </button>
              <button onClick={() => setUsePipeline(false)}
                className="py-2 rounded-xl border text-xs font-semibold cursor-pointer"
                style={!usePipeline ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' } : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                Manual Entry
              </button>
            </div>
          )}

          {usePipeline && pipeline.length > 0 ? (
            <select className="w-full rounded-xl border text-sm px-3 py-2.5 outline-none"
              style={{ borderColor: 'var(--sgc-gray-border)' }}
              value={leadId} onChange={e => setLeadId(e.target.value)}>
              {pipeline.map(l => <option key={l.id} value={l.id}>{l.address}</option>)}
            </select>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3">
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Address</div>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                  className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                  style={{ borderColor: 'var(--sgc-gray-border)' }} />
              </div>
              <div className="col-span-2">
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>City</div>
                <input type="text" value={city} onChange={e => setCity(e.target.value)}
                  className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                  style={{ borderColor: 'var(--sgc-gray-border)' }} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>State</div>
                <select className="w-full rounded-xl border text-sm px-3 py-2.5 outline-none"
                  style={{ borderColor: 'var(--sgc-gray-border)' }}
                  value={state} onChange={e => setState(e.target.value)}>
                  {['VA','NC','MD'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <NumField label="Purchase Price" value={purchase} set={setPurchase} />
            <NumField label="Loan Amount"    value={loan}     set={setLoan} />
            <NumField label="Interest Rate"  value={rate}     set={setRate}   prefix="%" />
            <NumField label="Points"         value={points}   set={setPoints} prefix="%" />
            <NumField label="Rehab Budget"   value={rehab}    set={setRehab} />
            <NumField label="ARV Target"     value={arv}      set={setArv} />
          </div>

          <div className="p-3 rounded-xl text-xs" style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
            🏗️ SGC GC Advantage: Your 22% markup savings vs non-GC investors will be tracked and displayed on every project.
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>
              Start Tracking
            </button>
            <button onClick={onClose}
              className="px-4 py-3 rounded-xl text-sm border-none cursor-pointer"
              style={{ background: 'var(--sgc-gray-border)' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Portfolio Intelligence Panel ───────────────────────────────────────────────
function PortfolioIntel() {
  const intel = buildPortfolioIntelligence()
  if (!intel.hasEnoughData) return null

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--sgc-navy)30' }}>
      <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--sgc-navy)' }}>
        <span className="text-white font-bold text-sm">🧠 Timeline Intelligence</span>
        <span className="text-white/60 text-xs">{intel.dealsTracked} deals · learning your patterns</span>
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        {[
          { l: 'Avg Hold Days', v: intel.avgHoldDays ? `${intel.avgHoldDays}d` : '—', c: '#1B3A8C' },
          { l: 'Avg Days On Site', v: intel.avgDaysOnSite ? `${intel.avgDaysOnSite}d` : '—', c: '#C45E1A' },
          { l: 'GC Savings Total', v: intel.gcAdvantageTotalSaved > 0 ? `$${Math.round(intel.gcAdvantageTotalSaved/1000)}k` : '—', c: '#1A7A4A' },
          { l: 'Avg Daily Carry', v: intel.dailyCarryAvg ? `$${intel.dailyCarryAvg}/d` : '—', c: '#C0341D' },
        ].map(m => (
          <div key={m.l} className="text-center p-2.5 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
            <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
            <div className="text-lg font-black" style={{ color: m.c }}>{m.v}</div>
          </div>
        ))}
      </div>
      {intel.bottleneck && (
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)', background: '#FEF3EA' }}>
          <div className="text-xs font-bold" style={{ color: '#C45E1A' }}>
            ⚠ Your Bottleneck: {intel.bottleneck.label}
          </div>
          <div className="text-xs mt-0.5" style={{ color: '#8A5700' }}>{intel.bottleneck.insight}</div>
        </div>
      )}
      {intel.suggestedModelAdjustments.length > 0 && (
        <div className="px-5 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>
            Suggested Model Adjustments
          </div>
          {intel.suggestedModelAdjustments.slice(0, 3).map(adj => (
            <div key={adj.phaseId} className="flex items-center gap-2 text-xs py-1">
              <span className="font-semibold" style={{ color: 'var(--sgc-black)' }}>{adj.label}:</span>
              <span style={{ color: '#C45E1A' }}>add {adj.addDays} days to your model</span>
              <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>({adj.reason})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ProjectTracker() {
  const [projects,  setProjects]  = useState<ProjectTimeline[]>([])
  const [selected,  setSelected]  = useState<ProjectTimeline | null>(null)
  const [showNew,   setShowNew]   = useState(false)

  const refresh = () => setProjects(getProjects())
  useEffect(() => { refresh() }, [])

  if (selected) {
    return <ProjectDetail project={selected} onBack={() => { setSelected(null); refresh() }} onUpdate={refresh} />
  }

  const active = projects.filter(p => p.status === 'active' || p.status === 'listed')
  const sold   = projects.filter(p => p.status === 'sold')

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(4,1fr)', borderColor: 'var(--sgc-gray-border)' }}>
          {[
            { l: 'Active Projects', v: active.length,  c: '#1B3A8C' },
            { l: 'Sold',            v: sold.length,    c: '#1A7A4A' },
            { l: 'GC Saved Total',  v: (() => {
              const i = buildPortfolioIntelligence()
              return i.gcAdvantageTotalSaved > 0 ? `$${Math.round(i.gcAdvantageTotalSaved/1000)}k` : '—'
            })(), c: '#1A7A4A' },
            { l: 'Avg Hold Days', v: (() => {
              const i = buildPortfolioIntelligence()
              return i.avgHoldDays ? `${i.avgHoldDays}d` : '—'
            })(), c: '#534AB7' },
          ].map((s, i) => (
            <div key={s.l} className={`p-3 ${i < 3 ? 'border-r' : ''}`} style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
              <div className="text-xl font-bold" style={{ color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end px-5 py-3">
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: 'var(--sgc-navy)' }}>
            ⏱ Track New Project
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <PortfolioIntel />

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center max-w-xl mx-auto px-8 py-16">
            <div className="text-6xl mb-5">⏱</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Project Phase Tracker</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--sgc-gray-mid)' }}>
              Every flip tracked = your personal construction database. After 3 deals, the system tells you exactly where you lose time and how much it costs. The carry cost clock shows the real dollar value of every day.
            </p>
            <div className="space-y-3 w-full mb-6 text-left">
              {[
                { icon: '⏱', t: 'Carry Cost Clock', d: 'See the exact dollar burning every day — $47/day makes timeline discipline visceral.' },
                { icon: '🏗️', t: 'GC Advantage Tracker', d: 'Quantifies exactly how much you save vs non-GC investors on every deal (typically $8-15k).' },
                { icon: '🧠', t: 'Bottleneck Intelligence', d: 'After 2 deals: which phase always runs late? Permits? Drywall? Add exact days to future models.' },
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
              Track Your First Project →
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {active.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>
                  Active Projects
                </div>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px,1fr))' }}>
                  {active.map(proj => {
                    const analysis = analyzeProject(proj)
                    const urgency = analysis.carryDaysSoFar > 110 ? '#C0341D' : analysis.carryDaysSoFar > 80 ? '#C45E1A' : '#1B3A8C'
                    return (
                      <div key={proj.id} onClick={() => setSelected(proj)}
                        className="bg-white rounded-2xl border overflow-hidden cursor-pointer hover:shadow-md transition-all"
                        style={{ borderColor: urgency + '40' }}>
                        <div className="h-1.5" style={{ background: urgency }}/>
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <div className="font-bold" style={{ color: 'var(--sgc-black)' }}>{proj.address}</div>
                              <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{proj.city}, {proj.state}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-2xl font-black" style={{ color: urgency }}>
                                {analysis.carryDaysSoFar}d
                              </div>
                              <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>elapsed</div>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {[
                              { l: '$/day', v: fmt$(analysis.dailyCarryCost), c: urgency },
                              { l: 'Carry so far', v: fmt$k(analysis.totalCarryCostSoFar), c: '#C0341D' },
                              { l: 'GC Saved', v: fmt$k(analysis.gcAdvantage$), c: '#1A7A4A' },
                            ].map(m => (
                              <div key={m.l} className="text-center p-2 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
                                <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                                <div className="text-sm font-bold" style={{ color: m.c }}>{m.v}</div>
                              </div>
                            ))}
                          </div>
                          {analysis.nextPhase && (
                            <div className="flex items-center gap-2 text-xs p-2 rounded-xl"
                              style={{ background: 'var(--sgc-navy-pale)' }}>
                              <span>{analysis.nextPhase.icon}</span>
                              <span className="font-semibold" style={{ color: 'var(--sgc-navy)' }}>Next: {analysis.nextPhase.label}</span>
                              {analysis.criticalDelay && (
                                <span className="ml-auto text-[10px]" style={{ color: '#C45E1A' }}>
                                  ⚠ +{analysis.criticalDelay.delayDays}d delay
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {sold.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: '#1A7A4A' }}>
                  Completed Deals
                </div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))' }}>
                  {sold.map(proj => {
                    const analysis = analyzeProject(proj)
                    return (
                      <div key={proj.id} onClick={() => setSelected(proj)}
                        className="bg-white rounded-xl border p-3 cursor-pointer hover:shadow-md opacity-80"
                        style={{ borderColor: '#1A7A4A30' }}>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-sm" style={{ color: 'var(--sgc-black)' }}>{proj.address}</div>
                            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                              {analysis.totalActualDays ? `${analysis.totalActualDays}d hold` : 'Sold'} ·
                              GC saved {fmt$k(analysis.gcAdvantage$)}
                            </div>
                          </div>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ background: '#EDFAF3', color: '#1A7A4A' }}>Sold ✓</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={() => { refresh(); setShowNew(false) }} />}
    </div>
  )
}
