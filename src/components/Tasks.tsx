/**
 * Tasks — Daily Follow-Up Command Center
 *
 * Your morning screen. Shows exactly what needs to happen today.
 * Every contact logged in Pipeline auto-generates the next task here.
 *
 * View: Today | Overdue | Upcoming | Completed
 * Actions: Complete, Snooze, Edit, Add manual task
 * Badge: Red dot on tab when overdue tasks exist
 */
import { useState, useEffect, useCallback } from 'react'
import {
  getTasks, getDueTodayAndOverdue, addTask, completeTask,
  deleteTask, addManualTask, getTaskStats,
  FollowUpTask, TaskType,
} from '../lib/followUpEngine'
import { getPipeline } from '../lib/pipeline'

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  urgent: { label: '🔥 Urgent',  color: '#C0341D', bg: '#FEF0ED', border: '#C0341D40' },
  high:   { label: '⚡ High',    color: '#C45E1A', bg: '#FEF3EA', border: '#C45E1A40' },
  normal: { label: '→ Normal',   color: '#1B3A8C', bg: '#EEF2FB', border: '#1B3A8C30' },
  low:    { label: '↓ Low',      color: 'var(--sgc-gray-mid)', bg: 'var(--sgc-gray-light)', border: 'var(--sgc-gray-border)' },
}

const TASK_TYPE_CONFIG: Record<TaskType, { icon: string; label: string; color: string }> = {
  call:           { icon: '📞', label: 'Phone Call',   color: '#1A7A4A' },
  sms:            { icon: '💬', label: 'Text Message',  color: '#1B3A8C' },
  email:          { icon: '✉️', label: 'Email',         color: '#534AB7' },
  mail_letter:    { icon: '📬', label: 'Direct Mail',   color: '#8A5700' },
  drive_by:       { icon: '🚗', label: 'Drive By',      color: '#C45E1A' },
  make_offer:     { icon: '💰', label: 'Make Offer',    color: '#1A7A4A' },
  follow_up_offer:{ icon: '🤝', label: 'Follow Up Offer', color: '#C45E1A' },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0,0,0,0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const taskDay = new Date(iso); taskDay.setHours(0,0,0,0)

  if (taskDay.getTime() === today.getTime())    return 'Today'
  if (taskDay.getTime() === tomorrow.getTime()) return 'Tomorrow'
  if (taskDay < today) {
    const days = Math.floor((today.getTime() - taskDay.getTime()) / 86400000)
    return `${days}d overdue`
  }
  const days = Math.floor((taskDay.getTime() - today.getTime()) / 86400000)
  if (days <= 7) return `In ${days} days`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isOverdue(dueDate: string): boolean {
  const today = new Date(); today.setHours(0,0,0,0)
  return new Date(dueDate) < today
}

function isToday(dueDate: string): boolean {
  const today = new Date().toISOString().split('T')[0]
  return dueDate === today
}

// ── New Task Modal ─────────────────────────────────────────────────────────────
function NewTaskModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const pipeline = getPipeline().filter(l => !['closed_won','closed_lost','pass'].includes(l.stage))

  const [leadId,    setLeadId]   = useState(pipeline[0]?.id || '')
  const [address,   setAddress]  = useState('')
  const [ownerName, setOwner]    = useState('')
  const [phone,     setPhone]    = useState('')
  const [taskType,  setType]     = useState<TaskType>('call')
  const [priority,  setPriority] = useState<FollowUpTask['priority']>('normal')
  const [dueDate,   setDue]      = useState(new Date().toISOString().split('T')[0])
  const [dueTime,   setTime]     = useState('9:00 AM')
  const [note,      setNote]     = useState('')
  const [manual,    setManual]   = useState(false)  // true = custom address, false = from pipeline

  useEffect(() => {
    if (!manual) {
      const lead = pipeline.find(l => l.id === leadId)
      if (lead) {
        setAddress(lead.address)
        setOwner(lead.ownerName || '')
        setPhone(lead.phones?.find(p => !p.dnc)?.number || '')
      }
    }
  }, [leadId, manual])

  const handleSave = () => {
    addManualTask({
      leadId:   manual ? `manual-${Date.now()}` : leadId,
      address:  address || 'No address',
      ownerName,
      phone:    phone || undefined,
      taskType,
      priority,
      dueDate,
      dueTime:  dueTime || undefined,
      note,
    })
    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div>
            <div className="font-bold" style={{ color: 'var(--sgc-navy)' }}>+ New Task</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Schedule a follow-up action</div>
          </div>
          <button onClick={onClose} className="text-xl cursor-pointer bg-transparent border-none" style={{ color: 'var(--sgc-gray-mid)' }}>✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Source toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setManual(false)}
              className="py-2 rounded-xl border text-xs font-semibold cursor-pointer"
              style={!manual
                ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
              From Pipeline
            </button>
            <button onClick={() => setManual(true)}
              className="py-2 rounded-xl border text-xs font-semibold cursor-pointer"
              style={manual
                ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
              Custom Address
            </button>
          </div>

          {/* Lead selector or manual address */}
          {!manual && pipeline.length > 0 ? (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Pipeline Lead</div>
              <select className="w-full rounded-xl border text-sm px-3 py-2.5 outline-none"
                style={{ borderColor: 'var(--sgc-gray-border)' }}
                value={leadId} onChange={e => setLeadId(e.target.value)}>
                {pipeline.map(l => (
                  <option key={l.id} value={l.id}>{l.address} — {l.ownerName || 'No owner'}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Address</div>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="123 Oak Street, Norfolk VA"
                  className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                  style={{ borderColor: 'var(--sgc-gray-border)' }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Owner Name</div>
                  <input type="text" value={ownerName} onChange={e => setOwner(e.target.value)}
                    placeholder="Owner name"
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
              </div>
            </div>
          )}

          {/* Task type */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>Task Type</div>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(TASK_TYPE_CONFIG) as TaskType[]).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className="py-2 rounded-xl border text-[10px] font-bold cursor-pointer flex flex-col items-center gap-0.5"
                  style={taskType === t
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  <span className="text-base">{TASK_TYPE_CONFIG[t].icon}</span>
                  <span>{TASK_TYPE_CONFIG[t].label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Priority + due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>Priority</div>
              <div className="space-y-1.5">
                {(['urgent','high','normal','low'] as const).map(p => (
                  <button key={p} onClick={() => setPriority(p)}
                    className="w-full py-1.5 rounded-xl border text-xs font-semibold cursor-pointer text-left px-3"
                    style={priority === p
                      ? { background: PRIORITY_CONFIG[p].color, borderColor: PRIORITY_CONFIG[p].color, color: 'white' }
                      : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {PRIORITY_CONFIG[p].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Due Date</div>
                <input type="date" value={dueDate} onChange={e => setDue(e.target.value)}
                  className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                  style={{ borderColor: 'var(--sgc-gray-border)' }} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Time (optional)</div>
                <select className="w-full rounded-xl border text-sm px-3 py-2 outline-none"
                  style={{ borderColor: 'var(--sgc-gray-border)' }}
                  value={dueTime} onChange={e => setTime(e.target.value)}>
                  {['8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM',
                    '12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Note */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Note</div>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              className="w-full rounded-xl border text-sm px-3 py-2 outline-none resize-none"
              style={{ borderColor: 'var(--sgc-gray-border)', minHeight: 70 }}
              placeholder="What to say, what to ask, context from last call..." />
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
              style={{ background: 'var(--sgc-navy)' }}>Save Task</button>
            <button onClick={onClose}
              className="px-4 py-3 rounded-xl text-sm border-none cursor-pointer"
              style={{ background: 'var(--sgc-gray-border)' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onComplete, onDelete, onSnooze }: {
  task:       FollowUpTask
  onComplete: (id: string) => void
  onDelete:   (id: string) => void
  onSnooze:   (id: string, days: number) => void
}) {
  const pc  = PRIORITY_CONFIG[task.priority]
  const tc  = TASK_TYPE_CONFIG[task.taskType]
  const due = formatDate(task.dueDate)
  const overdue = isOverdue(task.dueDate)
  const today   = isToday(task.dueDate)
  const [showSnooze, setShowSnooze] = useState(false)

  return (
    <div className="bg-white rounded-2xl border overflow-hidden transition-all hover:shadow-md"
      style={{ borderColor: overdue ? '#C0341D40' : task.priority === 'urgent' ? '#C0341D30' : pc.border }}>

      {/* Priority stripe */}
      <div className="h-1" style={{ background: pc.color }}/>

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          {/* Task type icon */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
            style={{ background: pc.bg }}>
            {tc.icon}
          </div>

          <div className="flex-1 min-w-0">
            {/* Address */}
            <div className="font-bold text-sm leading-tight" style={{ color: 'var(--sgc-black)' }}>
              {task.address}
            </div>
            {/* Owner */}
            {task.ownerName && (
              <div className="text-xs mt-0.5 font-medium" style={{ color: 'var(--sgc-navy)' }}>
                👤 {task.ownerName}
              </div>
            )}
            {/* Task type + due */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: pc.bg, color: pc.color }}>
                {pc.label}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: tc.color }}>
                {tc.icon} {tc.label}
              </span>
              <span className="text-[10px] font-bold ml-auto"
                style={{ color: overdue ? '#C0341D' : today ? '#C45E1A' : 'var(--sgc-gray-mid)' }}>
                {overdue && '⚠ '}{due}
                {task.dueTime && ` at ${task.dueTime}`}
              </span>
            </div>
          </div>
        </div>

        {/* Note */}
        {task.note && (
          <div className="text-xs mb-3 px-3 py-2 rounded-xl leading-relaxed"
            style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-black)' }}>
            {task.note}
          </div>
        )}

        {/* Phone quick-dial */}
        {task.phone && (
          <a href={`tel:${task.phone}`}
            className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3 no-underline"
            style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
            <span>📞</span>
            <span className="font-mono font-bold text-sm">{task.phone}</span>
            <span className="text-[10px] ml-auto font-semibold">Tap to Call</span>
          </a>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {/* Complete */}
          <button onClick={() => onComplete(task.id)}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: '#1A7A4A' }}>
            ✓ Done
          </button>

          {/* Snooze */}
          <div className="relative">
            <button onClick={() => setShowSnooze(s => !s)}
              className="px-3 py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer"
              style={{ background: '#EEF2FB', color: 'var(--sgc-navy)' }}>
              ⏰
            </button>
            {showSnooze && (
              <div className="absolute bottom-full right-0 mb-1 bg-white rounded-xl border shadow-lg overflow-hidden z-10 w-32"
                style={{ borderColor: 'var(--sgc-gray-border)' }}>
                {[
                  { l: '1 day',   d: 1 },
                  { l: '2 days',  d: 2 },
                  { l: '3 days',  d: 3 },
                  { l: '1 week',  d: 7 },
                  { l: '2 weeks', d: 14 },
                ].map(s => (
                  <button key={s.d} onClick={() => { onSnooze(task.id, s.d); setShowSnooze(false) }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer border-none bg-white border-b"
                    style={{ borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-black)' }}>
                    +{s.l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Delete */}
          <button onClick={() => { if (confirm('Delete this task?')) onDelete(task.id) }}
            className="px-3 py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer"
            style={{ background: '#FEF0ED', color: '#C0341D' }}>
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Tasks Component ──────────────────────────────────────────────────────
type ViewFilter = 'today' | 'overdue' | 'upcoming' | 'all' | 'completed'

export default function Tasks() {
  const [tasks,    setTasks]    = useState<FollowUpTask[]>([])
  const [view,     setView]     = useState<ViewFilter>('today')
  const [showNew,  setShowNew]  = useState(false)
  const [filterType, setFilter] = useState<TaskType | 'all'>('all')

  const refresh = useCallback(() => setTasks(getTasks()), [])
  useEffect(() => { refresh() }, [refresh])

  const stats = getTaskStats()

  // Snooze — push due date forward
  const handleSnooze = (id: string, days: number) => {
    const all = getTasks()
    const task = all.find(t => t.id === id)
    if (!task) return
    const newDate = new Date(task.dueDate)
    newDate.setDate(newDate.getDate() + days)
    // Rebuild with new date
    deleteTask(id)
    addTask({ ...task, dueDate: newDate.toISOString().split('T')[0] })
    refresh()
  }

  const handleComplete = (id: string) => {
    completeTask(id)
    refresh()
  }

  const handleDelete = (id: string) => {
    deleteTask(id)
    refresh()
  }

  // Filter tasks by view
  const today = new Date().toISOString().split('T')[0]
  const todayStart = new Date(); todayStart.setHours(0,0,0,0)

  const displayed = tasks
    .filter(t => {
      if (view === 'today')     return !t.completed && t.dueDate === today
      if (view === 'overdue')   return !t.completed && new Date(t.dueDate) < todayStart
      if (view === 'upcoming')  return !t.completed && new Date(t.dueDate) > todayStart && t.dueDate !== today
      if (view === 'completed') return t.completed
      return !t.completed  // 'all'
    })
    .filter(t => filterType === 'all' || t.taskType === filterType)

  const urgentOverdue = tasks.filter(t => !t.completed && isOverdue(t.dueDate))

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>

        {/* Stats strip */}
        <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(5,1fr)', borderColor: 'var(--sgc-gray-border)' }}>
          {[
            { l: '🔥 Urgent',     v: stats.urgent,   c: '#C0341D', view: 'all'      },
            { l: '⚠ Overdue',    v: stats.overdue,  c: '#C0341D', view: 'overdue'  },
            { l: '📅 Due Today', v: stats.dueToday, c: '#C45E1A', view: 'today'    },
            { l: '📆 Upcoming',  v: stats.upcoming, c: '#1B3A8C', view: 'upcoming' },
            { l: '✓ Total Open', v: stats.total,    c: 'var(--sgc-navy)', view: 'all' },
          ].map((s, i) => (
            <button key={s.l}
              onClick={() => setView(s.view as ViewFilter)}
              className={`p-3 text-left border-none cursor-pointer ${i < 4 ? 'border-r' : ''}`}
              style={{
                borderColor: 'var(--sgc-gray-border)',
                background: view === s.view ? 'var(--sgc-navy-pale)' : 'white'
              }}>
              <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
              <div className="text-xl font-bold" style={{ color: s.c }}>{s.v}</div>
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 px-5 py-3 flex-wrap">
          {/* View filter */}
          <div className="flex gap-1">
            {([
              { v: 'today',     l: '📅 Today' },
              { v: 'overdue',   l: '⚠ Overdue' },
              { v: 'upcoming',  l: '📆 Upcoming' },
              { v: 'all',       l: 'All Open' },
              { v: 'completed', l: '✓ Done' },
            ] as const).map(btn => (
              <button key={btn.v} onClick={() => setView(btn.v)}
                className="text-[10px] px-2.5 py-1.5 rounded border cursor-pointer whitespace-nowrap"
                style={view === btn.v
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {btn.l}
                {btn.v === 'today'    && stats.dueToday > 0 && ` (${stats.dueToday})`}
                {btn.v === 'overdue'  && stats.overdue  > 0 && ` (${stats.overdue})`}
                {btn.v === 'upcoming' && stats.upcoming > 0 && ` (${stats.upcoming})`}
                {btn.v === 'all'      && stats.total    > 0 && ` (${stats.total})`}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <div className="flex gap-1 ml-2">
            <button onClick={() => setFilter('all')}
              className="text-[10px] px-2 py-1 rounded border cursor-pointer"
              style={filterType === 'all'
                ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
              All Types
            </button>
            {(['call','sms','email','make_offer'] as TaskType[]).map(t => (
              <button key={t} onClick={() => setFilter(t)}
                className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                style={filterType === t
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {TASK_TYPE_CONFIG[t].icon} {TASK_TYPE_CONFIG[t].label}
              </button>
            ))}
          </div>

          <button onClick={() => setShowNew(true)}
            className="ml-auto px-4 py-2 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: 'var(--sgc-navy)' }}>
            + New Task
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">

        {/* Overdue alert banner */}
        {urgentOverdue.length > 0 && view !== 'overdue' && view !== 'completed' && (
          <div className="mb-4 p-4 rounded-2xl flex items-center gap-3 cursor-pointer"
            style={{ background: '#C0341D', color: 'white' }}
            onClick={() => setView('overdue')}>
            <span className="text-2xl flex-shrink-0">⚠</span>
            <div className="flex-1">
              <div className="font-bold text-sm">
                {urgentOverdue.length} overdue task{urgentOverdue.length > 1 ? 's' : ''} — deals are slipping
              </div>
              <div className="text-xs opacity-80 mt-0.5">
                {urgentOverdue.slice(0,3).map(t => t.address).join(' · ')}
                {urgentOverdue.length > 3 && ` + ${urgentOverdue.length - 3} more`}
              </div>
            </div>
            <span className="text-white font-bold text-sm flex-shrink-0">View →</span>
          </div>
        )}

        {/* Empty states */}
        {displayed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center max-w-sm mx-auto">
            {view === 'today' && stats.total === 0 ? (
              <>
                <div className="text-5xl mb-4">✅</div>
                <div className="text-lg font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>No tasks yet</div>
                <div className="text-sm mb-4" style={{ color: 'var(--sgc-gray-mid)' }}>
                  Tasks are auto-created when you log contacts in Pipeline. Every outcome schedules the next action automatically.
                </div>
                <button onClick={() => setShowNew(true)}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                  style={{ background: 'var(--sgc-navy)' }}>+ Add First Task</button>
              </>
            ) : view === 'today' ? (
              <>
                <div className="text-5xl mb-4">🎉</div>
                <div className="text-lg font-bold mb-2" style={{ color: '#1A7A4A' }}>Nothing due today!</div>
                <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {stats.upcoming > 0 ? `${stats.upcoming} task${stats.upcoming > 1 ? 's' : ''} coming up — you're ahead.` : 'All clear.'}
                </div>
              </>
            ) : view === 'completed' ? (
              <>
                <div className="text-5xl mb-4">📋</div>
                <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>No completed tasks yet</div>
              </>
            ) : (
              <>
                <div className="text-5xl mb-4">👍</div>
                <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>No {view} tasks</div>
              </>
            )}
          </div>
        )}

        {/* Task grid */}
        {displayed.length > 0 && (
          <>
            {/* Section label */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--sgc-navy)' }}>
                {view === 'today'     && `Today — ${displayed.length} task${displayed.length > 1 ? 's' : ''}`}
                {view === 'overdue'   && `⚠ Overdue — ${displayed.length} task${displayed.length > 1 ? 's' : ''}`}
                {view === 'upcoming'  && `Upcoming — ${displayed.length} task${displayed.length > 1 ? 's' : ''}`}
                {view === 'all'       && `All Open — ${displayed.length} task${displayed.length > 1 ? 's' : ''}`}
                {view === 'completed' && `Completed — ${displayed.length} task${displayed.length > 1 ? 's' : ''}`}
              </div>
              {view === 'today' && (
                <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
              )}
            </div>

            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
              {displayed.map(task => (
                view === 'completed' ? (
                  /* Completed task — simplified */
                  <div key={task.id} className="bg-white rounded-xl border p-3 flex items-center gap-3 opacity-60"
                    style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <span className="text-green-500 text-xl flex-shrink-0">✓</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--sgc-black)' }}>{task.address}</div>
                      <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                        {TASK_TYPE_CONFIG[task.taskType].icon} {TASK_TYPE_CONFIG[task.taskType].label}
                        {task.completedAt && ` · done ${new Date(task.completedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(task.id)}
                      className="text-xs px-2 py-1 rounded border-none cursor-pointer"
                      style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                    onSnooze={handleSnooze}
                  />
                )
              ))}
            </div>
          </>
        )}
      </div>

      {showNew && <NewTaskModal onClose={() => setShowNew(false)} onSave={refresh} />}
    </div>
  )
}
