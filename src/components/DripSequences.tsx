import { useEscapeKey } from '../lib/useEscapeKey'
/**
 * Drip Sequences — Automated Multi-Touch Follow-Up
 *
 * Visual timeline of every automated touchpoint on every lead.
 * Scripts pre-written, editable per touch.
 * One tap to call, text, or email directly from the sequence.
 */
import { useState, useEffect } from 'react'
import {
  getDripSequences, getDripSequence, createDripSequence,
  completeTouch, skipTouch, pauseSequence, resumeSequence,
  markConverted, deleteSequence, getDueTodayDrip, getDripStats,
  hasActiveSequence, DRIP_TEMPLATES,
  DripSequence, DripTouch, TouchType, DripTemplate,
} from '../lib/drip'
import { getPipeline } from '../lib/pipeline'

// ── Helpers ───────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<TouchType, { icon: string; label: string; color: string; bg: string }> = {
  call:      { icon: '📞', label: 'Phone Call',     color: '#1A7A4A', bg: '#EDFAF3' },
  sms:       { icon: '💬', label: 'Text Message',   color: '#1B3A8C', bg: '#EEF2FB' },
  email:     { icon: '✉️', label: 'Email',           color: '#534AB7', bg: '#EEEDFE' },
  voicemail: { icon: '📣', label: 'Voicemail',       color: '#C45E1A', bg: '#FEF3EA' },
  mail:      { icon: '📬', label: 'Direct Mail',     color: '#8A5700', bg: '#FEF7EA' },
}

function dayLabel(scheduledDate: string): string {
  const today     = new Date(); today.setHours(0,0,0,0)
  const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const d         = new Date(scheduledDate); d.setHours(0,0,0,0)
  const diff      = Math.round((d.getTime() - today.getTime()) / 86400000)

  if (diff < 0)  return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `In ${diff} days`
}

function isOverdue(scheduledDate: string): boolean {
  return new Date(scheduledDate) < new Date(new Date().toDateString())
}

function isToday(scheduledDate: string): boolean {
  return scheduledDate === new Date().toISOString().split('T')[0]
}

// ── Script Modal ──────────────────────────────────────────────────────────────
function ScriptModal({ touch, sequence, onClose, onComplete }: {
  touch:    DripTouch
  sequence: DripSequence
  onClose:  () => void
  onComplete: () => void
}) {
  const tc  = TYPE_CONFIG[touch.type]
  const [outcome, setOutcome] = useState('')
  const [notes,   setNotes]   = useState('')
  const [script,  setScript]  = useState(touch.script)
  useEscapeKey(onClose)

  const handleComplete = () => {
    completeTouch(sequence.id, touch.id, outcome || 'completed', notes)
    onComplete()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        {/* Header */}
        <div className="p-5 border-b flex items-start justify-between"
          style={{ borderColor: 'var(--sgc-gray-border)', background: tc.bg }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{tc.icon}</span>
              <span className="font-bold text-sm" style={{ color: tc.color }}>{tc.label}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: tc.color, color: 'white' }}>
                {dayLabel(touch.scheduledDate)}
              </span>
            </div>
            <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>{touch.title}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              {sequence.address} · {sequence.ownerName || 'Unknown owner'}
            </div>
          </div>
          <button onClick={onClose} className="text-xl cursor-pointer bg-transparent border-none" aria-label="Close" style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Quick action buttons */}
          <div className="flex gap-2 flex-wrap">
            {sequence.phone && touch.type === 'call' && (
              <a href={`tel:${sequence.phone}`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold no-underline flex-1 justify-center"
                style={{ background: '#1A7A4A', color: 'white' }}>
                📞 Call {sequence.phone}
              </a>
            )}
            {touch.smsUrl && (
              <a href={touch.smsUrl}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold no-underline flex-1 justify-center"
                style={{ background: '#1B3A8C', color: 'white' }}>
                💬 Open Text
              </a>
            )}
            {touch.mailtoUrl && (
              <a href={touch.mailtoUrl}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold no-underline flex-1 justify-center"
                style={{ background: '#534AB7', color: 'white' }}>
                ✉️ Open Email
              </a>
            )}
          </div>

          {/* Script */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>
                {touch.type === 'call' ? 'Call Script' : touch.type === 'sms' ? 'Text Message' : touch.type === 'email' ? 'Email Body' : 'Script'}
              </div>
              <button onClick={() => navigator.clipboard.writeText(script)}
                className="text-[10px] px-2 py-1 rounded border-none cursor-pointer font-semibold"
                style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
                Copy
              </button>
            </div>
            <textarea
              value={script} onChange={e => setScript(e.target.value)}
              className="w-full rounded-xl border text-xs px-4 py-3 outline-none resize-none leading-relaxed font-mono"
              style={{ borderColor: 'var(--sgc-gray-border)', minHeight: 160 }} />
          </div>

          {/* Outcome */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              Outcome
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {[
                'No answer',
                'Left voicemail',
                'Connected — interested',
                'Connected — not interested',
                'Wrong number',
                'Callback requested',
              ].map(o => (
                <button key={o} onClick={() => setOutcome(o)}
                  className="py-2 px-3 rounded-xl border text-xs font-medium cursor-pointer text-left"
                  style={outcome === o
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {o}
                </button>
              ))}
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded-xl border text-xs px-3 py-2 outline-none resize-none"
              style={{ borderColor: 'var(--sgc-gray-border)', minHeight: 50 }}
              placeholder="Additional notes..." />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleComplete}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: '#1A7A4A' }}>
              ✓ Mark Complete
            </button>
            <button onClick={() => { skipTouch(sequence.id, touch.id); onComplete(); onClose() }}
              className="px-4 py-3 rounded-xl text-sm border-none cursor-pointer"
              style={{ background: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sequence Card ─────────────────────────────────────────────────────────────
function SequenceCard({ seq, onUpdate }: { seq: DripSequence; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [activeTouch, setActiveTouch] = useState<DripTouch | null>(null)
  const today = new Date().toISOString().split('T')[0]

  const pending   = seq.touches.filter(t => t.status === 'pending')
  const overdue   = pending.filter(t => t.scheduledDate < today)
  const dueToday  = pending.filter(t => t.scheduledDate === today)
  const completed = seq.touches.filter(t => t.status === 'completed')
  const progress  = Math.round((completed.length / seq.touches.length) * 100)
  const nextTouch = pending.sort((a,b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]

  const statusColor =
    seq.status === 'converted' ? '#1A7A4A' :
    seq.status === 'paused'    ? '#8A5700' :
    seq.status === 'active'    ? '#1B3A8C' : 'var(--sgc-gray-mid)'

  const urgency = overdue.length > 0 ? 'overdue' : dueToday.length > 0 ? 'today' : 'upcoming'

  return (
    <div className="bg-white rounded-2xl border overflow-hidden"
      style={{ borderColor: urgency === 'overdue' ? '#C0341D40' : urgency === 'today' ? '#C45E1A40' : 'var(--sgc-gray-border)' }}>
      {/* Top stripe */}
      <div className="h-1" style={{
        background: urgency === 'overdue' ? '#C0341D' : urgency === 'today' ? '#C45E1A' : 'var(--sgc-navy)'
      }}/>

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm" style={{ color: 'var(--sgc-black)' }}>{seq.address}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              {seq.ownerName || 'Unknown owner'}
              {seq.phone && ` · ${seq.phone}`}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: statusColor + '20', color: statusColor }}>
                {seq.status.charAt(0).toUpperCase() + seq.status.slice(1)}
              </span>
              {overdue.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#FEF0ED', color: '#C0341D' }}>
                  {overdue.length} overdue
                </span>
              )}
              {dueToday.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#FEF3EA', color: '#C45E1A' }}>
                  {dueToday.length} due today
                </span>
              )}
              <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                {DRIP_TEMPLATES.find(t => t.id === seq.templateId)?.name}
              </span>
            </div>
          </div>
          {/* Progress ring */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--sgc-gray-border)" strokeWidth="2.5"/>
                <circle cx="18" cy="18" r="15.9" fill="none" stroke={statusColor} strokeWidth="2.5"
                  strokeDasharray={`${progress} ${100-progress}`} strokeLinecap="round"/>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-black" style={{ color: statusColor }}>{progress}%</span>
              </div>
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              {completed.length}/{seq.touches.length}
            </div>
          </div>
        </div>

        {/* Next touch */}
        {nextTouch && seq.status === 'active' && (
          <button
            onClick={() => setActiveTouch(nextTouch)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border mb-3 cursor-pointer text-left"
            style={{
              borderColor: isOverdue(nextTouch.scheduledDate) ? '#C0341D40' : isToday(nextTouch.scheduledDate) ? '#C45E1A40' : 'var(--sgc-gray-border)',
              background: isOverdue(nextTouch.scheduledDate) ? '#FEF0ED' : isToday(nextTouch.scheduledDate) ? '#FEF3EA' : 'var(--sgc-gray-light)',
            }}>
            <span className="text-xl">{TYPE_CONFIG[nextTouch.type].icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{ color: 'var(--sgc-black)' }}>{nextTouch.title}</div>
              <div className="text-[10px]" style={{ color: isOverdue(nextTouch.scheduledDate) ? '#C0341D' : isToday(nextTouch.scheduledDate) ? '#C45E1A' : 'var(--sgc-gray-mid)' }}>
                {dayLabel(nextTouch.scheduledDate)} · Tap to execute
              </div>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 text-white"
              style={{ background: isOverdue(nextTouch.scheduledDate) ? '#C0341D' : isToday(nextTouch.scheduledDate) ? '#C45E1A' : 'var(--sgc-navy)' }}>
              Go →
            </span>
          </button>
        )}

        {/* Progress bar */}
        <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'var(--sgc-gray-light)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: statusColor }}/>
        </div>

        {/* Action row */}
        <div className="flex gap-2 flex-wrap">
          {seq.status === 'active' && (
            <button onClick={() => { pauseSequence(seq.id); onUpdate() }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer"
              style={{ background: '#FEF7EA', color: '#8A5700' }}>⏸ Pause</button>
          )}
          {seq.status === 'paused' && (
            <button onClick={() => { resumeSequence(seq.id); onUpdate() }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer"
              style={{ background: '#EDFAF3', color: '#1A7A4A' }}>▶ Resume</button>
          )}
          {seq.status !== 'converted' && (
            <button onClick={() => { markConverted(seq.id); onUpdate() }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer"
              style={{ background: '#EDFAF3', color: '#1A7A4A' }}>🎉 Converted!</button>
          )}
          <button onClick={() => setExpanded(e => !e)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer ml-auto"
            style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
            {expanded ? '▲ Hide' : '▼ All Touches'}
          </button>
          <button onClick={() => { if(confirm('Delete this sequence?')) { deleteSequence(seq.id); onUpdate() } }}
            className="text-xs px-2 py-1.5 rounded-lg border-none cursor-pointer"
            style={{ background: '#FEF0ED', color: '#C0341D' }}>✕</button>
        </div>

        {/* Expanded touch timeline */}
        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>
              Full Sequence Timeline
            </div>
            {seq.touches.map((touch, i) => {
              const tc = TYPE_CONFIG[touch.type]
              const done = touch.status === 'completed'
              const skip = touch.status === 'skipped'
              return (
                <div key={touch.id}
                  onClick={() => touch.status === 'pending' && setActiveTouch(touch)}
                  className="flex items-start gap-3 p-2.5 rounded-xl border transition-all"
                  style={{
                    borderColor: done ? '#1A7A4A30' : skip ? 'var(--sgc-gray-border)' : isOverdue(touch.scheduledDate) ? '#C0341D30' : isToday(touch.scheduledDate) ? '#C45E1A30' : 'var(--sgc-gray-border)',
                    background: done ? '#EDFAF3' : skip ? 'var(--sgc-gray-light)' : 'white',
                    cursor: touch.status === 'pending' ? 'pointer' : 'default',
                    opacity: skip ? 0.5 : 1,
                  }}>
                  {/* Status icon */}
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-sm mt-0.5"
                    style={{ background: done ? '#1A7A4A' : skip ? 'var(--sgc-gray-border)' : tc.bg }}>
                    {done ? <span className="text-white text-xs">✓</span>
                     : skip ? <span className="text-xs">—</span>
                     : <span>{tc.icon}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: done ? '#1A7A4A' : 'var(--sgc-black)' }}>
                        {touch.title}
                      </span>
                      {touch.status === 'pending' && (
                        <span className="text-[9px] font-bold"
                          style={{ color: isOverdue(touch.scheduledDate) ? '#C0341D' : isToday(touch.scheduledDate) ? '#C45E1A' : 'var(--sgc-gray-mid)' }}>
                          {dayLabel(touch.scheduledDate)}
                        </span>
                      )}
                      {done && touch.outcome && (
                        <span className="text-[9px]" style={{ color: '#1A7A4A' }}>{touch.outcome}</span>
                      )}
                    </div>
                    {done && touch.notes && (
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{touch.notes}</div>
                    )}
                  </div>
                  {touch.status === 'pending' && (
                    <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: 'var(--sgc-navy)' }}>Tap →</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {activeTouch && (
        <ScriptModal
          touch={activeTouch}
          sequence={seq}
          onClose={() => setActiveTouch(null)}
          onComplete={() => { onUpdate(); setActiveTouch(null) }}
        />
      )}
    </div>
  )
}

// ── New Sequence Modal ────────────────────────────────────────────────────────
function NewSequenceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const pipeline = getPipeline().filter(l => !['closed_won','closed_lost','pass'].includes(l.stage))
  useEscapeKey(onClose)
  const [leadId,      setLeadId]      = useState(pipeline[0]?.id || '')
  const [useManual,   setUseManual]   = useState(pipeline.length === 0)
  const [address,     setAddress]     = useState('')
  const [ownerName,   setOwnerName]   = useState('')
  const [phone,       setPhone]       = useState('')
  const [email,       setEmail]       = useState('')
  const [templateId,  setTemplateId]  = useState('motivated_seller')

  const lead = pipeline.find(l => l.id === leadId)

  const handleCreate = () => {
    const params = useManual ? { leadId: `manual-${Date.now()}`, address, ownerName, phone, email }
      : {
          leadId:    lead?.id || '',
          address:   lead?.address || '',
          ownerName: lead?.ownerName || '',
          phone:     lead?.phones?.find(p => !p.dnc)?.number || '',
          email:     lead?.emails?.[0]?.address || '',
        }
    createDripSequence({ ...params, templateId })
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="p-5 border-b flex justify-between" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>+ Start Drip Sequence</div>
          <button onClick={onClose} className="text-xl cursor-pointer bg-transparent border-none" aria-label="Close" style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Source */}
          {pipeline.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setUseManual(false)}
                className="py-2 rounded-xl border text-xs font-semibold cursor-pointer"
                style={!useManual ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' } : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                From Pipeline
              </button>
              <button onClick={() => setUseManual(true)}
                className="py-2 rounded-xl border text-xs font-semibold cursor-pointer"
                style={useManual ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' } : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                Custom Contact
              </button>
            </div>
          )}

          {!useManual && pipeline.length > 0 ? (
            <select className="w-full rounded-xl border text-sm px-3 py-2.5 outline-none"
              style={{ borderColor: 'var(--sgc-gray-border)' }}
              value={leadId} onChange={e => setLeadId(e.target.value)}>
              {pipeline.filter(l => !hasActiveSequence(l.id)).map(l => (
                <option key={l.id} value={l.id}>{l.address} — {l.ownerName || 'No owner'}</option>
              ))}
            </select>
          ) : (
            <div className="space-y-2">
              {[
                { l: 'Address',    v: address,   s: setAddress },
                { l: 'Owner Name', v: ownerName, s: setOwnerName },
                { l: 'Phone',      v: phone,     s: setPhone },
                { l: 'Email',      v: email,     s: setEmail },
              ].map(f => (
                <div key={f.l}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{f.l}</div>
                  <input type="text" value={f.v} onChange={e => f.s(e.target.value)}
                    className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                    style={{ borderColor: 'var(--sgc-gray-border)' }} />
                </div>
              ))}
            </div>
          )}

          {/* Template */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>Sequence Template</div>
            <div className="space-y-2">
              {DRIP_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setTemplateId(t.id)}
                  className="w-full text-left p-3 rounded-xl border cursor-pointer"
                  style={templateId === t.id
                    ? { borderColor: 'var(--sgc-navy)', background: 'var(--sgc-navy-pale)' }
                    : { borderColor: 'var(--sgc-gray-border)', background: 'white' }}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-bold" style={{ color: templateId === t.id ? 'var(--sgc-navy)' : 'var(--sgc-black)' }}>
                      {t.name}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: templateId === t.id ? 'var(--sgc-navy)' : 'var(--sgc-gray-border)', color: templateId === t.id ? 'white' : 'var(--sgc-gray-mid)' }}>
                      {t.touches.length} touches
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{t.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate}
              disabled={!useManual && !lead && pipeline.length > 0}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>
              ▶ Start Sequence
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
export default function DripSequences() {
  const [sequences, setSequences] = useState<DripSequence[]>([])
  const [showNew,   setShowNew]   = useState(false)
  const [filter,    setFilter]    = useState<'all' | 'active' | 'due' | 'converted'>('active')

  const refresh = () => setSequences(getDripSequences())
  useEffect(() => { refresh() }, [])

  const stats   = getDripStats()
  const dueToday = getDueTodayDrip()
  const today    = new Date().toISOString().split('T')[0]

  const displayed = sequences.filter(s => {
    if (filter === 'active')    return s.status === 'active' || s.status === 'paused'
    if (filter === 'due')       return s.status === 'active' && s.touches.some(t => t.status === 'pending' && t.scheduledDate <= today)
    if (filter === 'converted') return s.status === 'converted'
    return true
  })

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        {/* Stats strip */}
        <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(5,1fr)', borderColor: 'var(--sgc-gray-border)' }}>
          {[
            { l: 'Active Sequences', v: stats.active,        c: 'var(--sgc-navy)' },
            { l: 'Due Today',        v: stats.dueToday,      c: stats.dueToday > 0 ? '#C45E1A' : 'var(--sgc-gray-mid)' },
            { l: 'Converted',        v: stats.converted,     c: '#1A7A4A' },
            { l: 'Total Sequences',  v: stats.total,         c: 'var(--sgc-black)' },
            { l: 'Conv Rate',        v: `${stats.conversionRate}%`, c: '#534AB7' },
          ].map((s, i) => (
            <div key={s.l} className={`p-3 ${i < 4 ? 'border-r' : ''}`} style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
              <div className="text-xl font-bold" style={{ color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="flex gap-1">
            {([
              { v: 'active',    l: 'Active' },
              { v: 'due',       l: `Due Today (${stats.dueToday})` },
              { v: 'converted', l: 'Converted' },
              { v: 'all',       l: 'All' },
            ] as const).map(f => (
              <button key={f.v} onClick={() => setFilter(f.v)}
                className="text-[10px] px-2.5 py-1.5 rounded border cursor-pointer whitespace-nowrap"
                style={filter === f.v
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {f.l}
              </button>
            ))}
          </div>
          <button onClick={() => setShowNew(true)}
            className="ml-auto px-4 py-2 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: 'var(--sgc-navy)' }}>
            + New Sequence
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* Due today alert */}
        {dueToday.length > 0 && filter !== 'due' && (
          <button onClick={() => setFilter('due')}
            className="w-full mb-4 p-4 rounded-2xl flex items-center gap-3 border-none cursor-pointer text-left"
            style={{ background: '#C45E1A', color: 'white' }}>
            <span className="text-2xl">⏰</span>
            <div>
              <div className="font-bold">{dueToday.length} drip touch{dueToday.length > 1 ? 'es' : ''} due today</div>
              <div className="text-xs opacity-80 mt-0.5">
                {dueToday.slice(0,3).map(d => d.sequence.address).join(' · ')}
                {dueToday.length > 3 && ` + ${dueToday.length - 3} more`}
              </div>
            </div>
            <span className="ml-auto font-bold text-sm">View →</span>
          </button>
        )}

        {displayed.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto px-8">
            <div className="text-6xl mb-5">🔄</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Drip Sequences</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--sgc-gray-mid)' }}>
              Automated multi-touch follow-up that runs on every lead. Add a lead once — the system schedules every call, text, and email automatically over 60 days. Scripts pre-written, editable per touch.
            </p>
            <div className="space-y-3 w-full mb-6 text-left">
              {DRIP_TEMPLATES.map(t => (
                <div key={t.id} className="flex gap-3 bg-white rounded-xl border p-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <div>
                    <div className="text-sm font-bold mb-0.5" style={{ color: 'var(--sgc-navy)' }}>{t.name}</div>
                    <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{t.description}</div>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {t.touches.slice(0,5).map((touch, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full"
                          style={{ background: TYPE_CONFIG[touch.type].bg, color: TYPE_CONFIG[touch.type].color }}>
                          Day {touch.day} {TYPE_CONFIG[touch.type].icon}
                        </span>
                      ))}
                      {t.touches.length > 5 && <span className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>+{t.touches.length-5} more</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowNew(true)}
              className="px-8 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>
              Start Your First Sequence →
            </button>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
            {displayed.map(seq => (
              <SequenceCard key={seq.id} seq={seq} onUpdate={refresh} />
            ))}
          </div>
        )}
      </div>

      {showNew && <NewSequenceModal onClose={() => setShowNew(false)} onCreated={refresh} />}
    </div>
  )
}
