/**
 * Follow-Up Task Engine
 * 
 * Auto-schedules next actions based on contact outcomes.
 * Ensures no lead falls through due to forgotten callbacks.
 * 
 * Rules:
 *   no_answer    → call back in 3 days, try different time
 *   left_vm      → follow up in 5 days if no callback
 *   connected    → schedule next touchpoint within 24hrs
 *   not_interested → re-contact in 60 days (circumstances change)
 *   interested   → follow up within 24 hours — HOT
 *   callback     → call at requested time + 15 min buffer
 */

export type TaskType =
  | 'call'
  | 'sms'
  | 'email'
  | 'mail_letter'
  | 'drive_by'
  | 'make_offer'
  | 'follow_up_offer'

export interface FollowUpTask {
  id:         string
  leadId:     string
  address:    string
  ownerName:  string
  phone?:     string
  taskType:   TaskType
  dueDate:    string      // ISO date
  dueTime?:   string      // "9:00 AM"
  priority:   'urgent' | 'high' | 'normal' | 'low'
  note:       string
  completed:  boolean
  completedAt?: string
  createdAt:  string
}

const STORAGE_KEY = 'flipscan_tasks_v1'

function load(): FollowUpTask[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function save(tasks: FollowUpTask[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)) } catch {}
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

// ── Auto-generate task from contact outcome ───────────────────────────────────
export function generateFollowUpTask(params: {
  leadId:    string
  address:   string
  ownerName: string
  phone?:    string
  outcome:   'no_answer' | 'left_vm' | 'connected' | 'not_interested' | 'interested' | 'callback'
  contactMethod: string
  notes?:    string
}): FollowUpTask | null {
  const { leadId, address, ownerName, phone, outcome, contactMethod, notes } = params
  const now  = new Date()

  const configs: Record<typeof outcome, {
    days: number; type: TaskType; priority: FollowUpTask['priority']; note: string; time?: string
  }> = {
    no_answer:      { days: 3,  type: 'call',    priority: 'normal', note: `No answer on ${contactMethod}. Try different time. ${notes||''}`.trim(), time: '10:00 AM' },
    left_vm:        { days: 5,  type: 'call',    priority: 'normal', note: `Left VM on ${contactMethod}. Follow up if no callback. ${notes||''}`.trim(), time: '9:00 AM' },
    connected:      { days: 1,  type: 'call',    priority: 'high',   note: `Had conversation. Next touchpoint. ${notes||''}`.trim(), time: '9:00 AM' },
    not_interested: { days: 60, type: 'call',    priority: 'low',    note: `Not interested today. Circumstances change — re-engage in 60 days. ${notes||''}`.trim() },
    interested:     { days: 1,  type: 'call',    priority: 'urgent', note: `🔥 INTERESTED — follow up within 24 hours. ${notes||''}`.trim(), time: '8:30 AM' },
    callback:       { days: 0,  type: 'call',    priority: 'urgent', note: `Owner requested callback. ${notes||''}`.trim(), time: '9:00 AM' },
  }

  const cfg = configs[outcome]
  const due = addDays(now, cfg.days)

  return {
    id:        `task-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    leadId, address, ownerName, phone,
    taskType:  cfg.type,
    dueDate:   due.toISOString().split('T')[0],
    dueTime:   cfg.time,
    priority:  cfg.priority,
    note:      cfg.note,
    completed: false,
    createdAt: now.toISOString(),
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export function getTasks(filter?: { leadId?: string; completed?: boolean; dueBefore?: Date }): FollowUpTask[] {
  let tasks = load()
  if (filter?.leadId)   tasks = tasks.filter(t => t.leadId === filter.leadId)
  if (filter?.completed !== undefined) tasks = tasks.filter(t => t.completed === filter.completed)
  if (filter?.dueBefore) tasks = tasks.filter(t => new Date(t.dueDate) <= filter.dueBefore!)
  return tasks.sort((a, b) => {
    const pa = { urgent: 0, high: 1, normal: 2, low: 3 }
    const pd = pa[a.priority] - pa[b.priority]
    if (pd !== 0) return pd
    return a.dueDate.localeCompare(b.dueDate)
  })
}

export function getDueTodayAndOverdue(): FollowUpTask[] {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return getTasks({ completed: false, dueBefore: today })
}

export function addTask(task: FollowUpTask): void {
  const tasks = load()
  tasks.unshift(task)
  save(tasks)
}

export function completeTask(id: string): void {
  const tasks = load()
  const t = tasks.find(t => t.id === id)
  if (t) { t.completed = true; t.completedAt = new Date().toISOString() }
  save(tasks)
}

export function deleteTask(id: string): void {
  save(load().filter(t => t.id !== id))
}

export function addManualTask(params: Omit<FollowUpTask, 'id' | 'completed' | 'createdAt'>): FollowUpTask {
  const task: FollowUpTask = {
    ...params,
    id:        `task-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    completed: false,
    createdAt: new Date().toISOString(),
  }
  addTask(task)
  return task
}

export function getTaskStats() {
  const tasks = load()
  const today = new Date(); today.setHours(0,0,0,0)
  const overdue = tasks.filter(t => !t.completed && new Date(t.dueDate) < today)
  const dueToday = tasks.filter(t => !t.completed && t.dueDate === today.toISOString().split('T')[0])
  const upcoming = tasks.filter(t => !t.completed && new Date(t.dueDate) > today)
  const urgent = tasks.filter(t => !t.completed && t.priority === 'urgent')
  return { overdue: overdue.length, dueToday: dueToday.length, upcoming: upcoming.length, urgent: urgent.length, total: tasks.filter(t => !t.completed).length }
}
