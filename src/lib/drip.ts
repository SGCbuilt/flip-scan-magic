import { syncWrite } from './cloudSync'
/**
 * Drip Sequence Engine
 *
 * Automated multi-touch follow-up sequences that run on every lead
 * without manual intervention. Once you add a lead to pipeline,
 * the engine schedules every touchpoint automatically.
 *
 * Default sequence (configurable per lead):
 *   Day 0  — Add to pipeline
 *   Day 1  — First call attempt (morning)
 *   Day 3  — Second call attempt (different time)
 *   Day 5  — SMS text message
 *   Day 7  — Third call + voicemail script
 *   Day 14 — Re-engage call ("following up on my offer")
 *   Day 21 — SMS check-in
 *   Day 30 — Final call before archive
 *   Day 60 — Re-engage (circumstances change)
 *
 * Each touch has:
 *   - Type: call | sms | email | mail | voicemail
 *   - Script/template pre-written and editable
 *   - Status: pending | completed | skipped
 *   - Outcome tracking
 *
 * Storage: localStorage (private, browser-side)
 */

export type TouchType = 'call' | 'sms' | 'email' | 'voicemail' | 'mail'
export type TouchStatus = 'pending' | 'completed' | 'skipped' | 'bounced'

export interface DripTouch {
  id:         string
  sequenceId: string
  leadId:     string
  day:        number         // days after sequence start
  scheduledDate: string      // ISO date
  type:       TouchType
  title:      string         // "Day 3 — Call Attempt #2"
  script:     string         // what to say / what to send
  status:     TouchStatus
  completedAt?: string
  outcome?:   string
  notes?:     string
  smsUrl?:    string         // pre-built sms: deep link
  mailtoUrl?: string         // pre-built mailto: deep link
}

export interface DripSequence {
  id:          string
  leadId:      string
  address:     string
  ownerName:   string
  phone?:      string
  email?:      string
  startedAt:   string
  pausedAt?:   string
  completedAt?: string
  status:      'active' | 'paused' | 'completed' | 'converted' | 'dead'
  touches:     DripTouch[]
  templateId:  string
  daysElapsed: number
}

// ── Templates ─────────────────────────────────────────────────────────────────
export interface DripTemplate {
  id:    string
  name:  string
  description: string
  touches: {
    day:    number
    type:   TouchType
    title:  string
    getScript: (params: { address: string; ownerName: string; agentName: string }) => string
  }[]
}

const AGENT = 'Albert Salomon — SGC General Contractors · (703) 944-9770'

export const DRIP_TEMPLATES: DripTemplate[] = [
  {
    id: 'motivated_seller',
    name: 'Motivated Seller — Standard',
    description: '8 touches over 60 days. Calls, texts, and email. Best for code violations and distressed signals.',
    touches: [
      {
        day: 1, type: 'call', title: 'Day 1 — First Call',
        getScript: ({ address, ownerName }) => `Hi, is this the owner of ${address}? My name is Albert Salomon — I'm a local contractor and real estate investor in the area. I noticed your property and I'm genuinely interested in making you a cash offer. I buy properties as-is — no repairs needed, no agent fees. Would you have a few minutes to chat? [If no answer: leave voicemail below]`,
      },
      {
        day: 1, type: 'voicemail', title: 'Day 1 — Voicemail Script',
        getScript: ({ address }) => `Hi, this message is for the owner of ${address}. My name is Albert Salomon — I'm a local real estate investor and licensed contractor. I'm interested in making a cash offer on your property, bought as-is with a quick close. No repairs, no agent fees, no hassle. Please call me back at (703) 944-9770 at your convenience. Again, that's Albert at (703) 944-9770. Thank you.`,
      },
      {
        day: 3, type: 'call', title: 'Day 3 — Second Call (try different time)',
        getScript: ({ address, ownerName }) => `Hi${ownerName ? ' ' + ownerName.split(' ')[0] : ''}, this is Albert Salomon — I called a couple days ago about your property at ${address}. I'm still very interested in making you a fair cash offer. I buy properties as-is, fast close, no commissions. Do you have 5 minutes to talk?`,
      },
      {
        day: 5, type: 'sms', title: 'Day 5 — First Text',
        getScript: ({ address, ownerName }) => `Hi${ownerName ? ' ' + ownerName.split(' ')[0] : ''}, this is Albert from SGC General Contractors. I tried calling about ${address}. I'm a local cash buyer — interested in a quick, as-is purchase. No agents, no repairs. Would you be open to a conversation? Reply YES or call (703) 944-9770.`,
      },
      {
        day: 7, type: 'call', title: 'Day 7 — Third Call + Offer Mention',
        getScript: ({ address, ownerName }) => `Hi${ownerName ? ' ' + ownerName.split(' ')[0] : ''}, Albert Salomon again about ${address}. I've done my research on the property and I'm prepared to make you a written cash offer. Takes 5 minutes to discuss. If now isn't good, when would be a better time to connect?`,
      },
      {
        day: 14, type: 'sms', title: 'Day 14 — Follow-Up Text',
        getScript: ({ address }) => `Hi, Albert here — following up on ${address}. Still interested in a cash purchase, as-is, fast close. Has your situation changed? Happy to talk numbers whenever works for you. (703) 944-9770`,
      },
      {
        day: 21, type: 'call', title: 'Day 21 — Re-Engage Call',
        getScript: ({ address, ownerName }) => `Hi${ownerName ? ' ' + ownerName.split(' ')[0] : ''}, Albert Salomon — I've been following up about ${address}. I want to make sure I haven't missed you. I'm still very interested and I'm ready to move quickly if the timing works for you. What would need to happen for a sale to make sense?`,
      },
      {
        day: 30, type: 'email', title: 'Day 30 — Email Outreach',
        getScript: ({ address, ownerName }) => `Subject: Cash offer for ${address}\n\nHi${ownerName ? ' ' + ownerName.split(' ')[0] : ''},\n\nI've been trying to reach you about your property at ${address}. I'm a local licensed contractor and real estate investor — I buy properties as-is with cash, fast close, no agent fees or commissions.\n\nI'm not here to pressure you. If the timing isn't right, that's completely fine — I just want you to know the option exists.\n\nIf you'd like to talk numbers or have any questions, please reply here or call me directly at (703) 944-9770.\n\nThank you for your time.\n\nAlbert Salomon\nSGC General Contractors\n(703) 944-9770 | projects@sgcbuilt.com | sgcbuilt.com`,
      },
      {
        day: 60, type: 'call', title: 'Day 60 — Long-Term Re-Engage',
        getScript: ({ address, ownerName }) => `Hi${ownerName ? ' ' + ownerName.split(' ')[0] : ''}, Albert Salomon — I called a couple months back about ${address}. Situations change and I wanted to check in. I'm still actively buying in your area and would love to make you an offer if now is a better time. No obligation at all.`,
      },
    ],
  },
  {
    id: 'absentee_owner',
    name: 'Absentee Owner — Lighter Touch',
    description: '5 touches over 30 days. For out-of-state landlords who may not know property condition.',
    touches: [
      {
        day: 1, type: 'call', title: 'Day 1 — Introduction',
        getScript: ({ address }) => `Hi, I'm looking for the owner of the property at ${address}. My name is Albert Salomon — I'm a local licensed contractor and investor in the area. I'd love to discuss a potential cash purchase of that property. Is now a good time to chat?`,
      },
      {
        day: 3, type: 'sms', title: 'Day 3 — Text Intro',
        getScript: ({ address }) => `Hi, this is Albert Salomon — local contractor/investor. I'm interested in making a cash offer on your property at ${address}. As-is purchase, fast close. Would love to connect when you have a moment. (703) 944-9770`,
      },
      {
        day: 7, type: 'call', title: 'Day 7 — Second Call',
        getScript: ({ address }) => `Hi, Albert Salomon again about your property at ${address}. I understand you may be managing it from out of the area — I can make the process very simple. Cash offer, as-is, handle all the paperwork. Happy to discuss at your convenience.`,
      },
      {
        day: 14, type: 'email', title: 'Day 14 — Email',
        getScript: ({ address, ownerName }) => `Subject: Your property at ${address}\n\nHi${ownerName ? ' ' + ownerName.split(' ')[0] : ''},\n\nI'm a local contractor and real estate investor reaching out about ${address}. As an out-of-area property owner, I thought you might appreciate a simple, hassle-free exit option.\n\nI offer: Cash purchase · As-is condition · Fast close (14-21 days) · No agent fees\n\nNo pressure at all. If you'd like to explore options, reach out anytime.\n\nAlbert Salomon · SGC General Contractors\n(703) 944-9770 | projects@sgcbuilt.com`,
      },
      {
        day: 30, type: 'call', title: 'Day 30 — Final Check-In',
        getScript: ({ address }) => `Hi, Albert Salomon — final follow-up about ${address}. I'll respect your time after this. If you ever want to explore a cash sale — now or in the future — my number is (703) 944-9770. I'm always buying in this area. No pressure.`,
      },
    ],
  },
  {
    id: 'hot_lead',
    name: 'Hot Lead — Aggressive 7-Day',
    description: 'Daily contact for 7 days. For critical/urgent signals — fire damage, tax delinquent.',
    touches: [
      { day: 0, type: 'call', title: 'Day 0 — Immediate Call', getScript: ({ address, ownerName }) => `Hi${ownerName ? ' ' + ownerName.split(' ')[0] : ''}, this is Albert Salomon — local contractor and cash buyer. I came across your property at ${address} and I'm calling to make a same-day offer. I buy properties as-is, cash, fast close. Is now a good time?` },
      { day: 0, type: 'sms', title: 'Day 0 — Immediate Text', getScript: ({ address }) => `Hi, Albert Salomon here — cash buyer + contractor. Interested in ${address}. Can close in 2 weeks, as-is, no repairs. Call or text: (703) 944-9770` },
      { day: 1, type: 'call', title: 'Day 1 — Morning Call', getScript: ({ address }) => `Good morning — Albert Salomon following up about ${address}. I made an offer yesterday — want to make sure you received my message. This is time-sensitive for me. Please call (703) 944-9770.` },
      { day: 2, type: 'sms', title: 'Day 2 — Text Follow-Up', getScript: ({ address }) => `Albert here — still very interested in ${address}. Cash, as-is, 14-day close. Reply YES to talk numbers. (703) 944-9770` },
      { day: 3, type: 'call', title: 'Day 3 — Third Attempt', getScript: ({ address }) => `Hi, Albert Salomon — third attempt about ${address}. I'm serious about this property and ready to make a written offer today. Please call me at your earliest convenience: (703) 944-9770` },
      { day: 5, type: 'call', title: 'Day 5 — Offer Call', getScript: ({ address }) => `Albert Salomon about ${address}. I've completed my analysis and I'm prepared to make you a specific written cash offer. Takes 10 minutes. Please call (703) 944-9770 — I'll make it worth your time.` },
      { day: 7, type: 'sms', title: 'Day 7 — Final Text', getScript: ({ address }) => `Final follow-up on ${address}. Albert Salomon, cash buyer. If timing ever works — I'm always reachable at (703) 944-9770. No pressure.` },
    ],
  },
]

// ── CRUD ──────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'flipscan_drip_v1'

function load(): DripSequence[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function save(seqs: DripSequence[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seqs)); syncWrite('flipscan_drip_v1', seqs) } catch {}
}

function buildSmsUrl(phone: string, body: string): string {
  return `sms:${phone}?body=${encodeURIComponent(body)}`
}

function buildMailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function createDripSequence(params: {
  leadId:    string
  address:   string
  ownerName: string
  phone?:    string
  email?:    string
  templateId?: string
}): DripSequence {
  const templateId = params.templateId || 'motivated_seller'
  const template   = DRIP_TEMPLATES.find(t => t.id === templateId) || DRIP_TEMPLATES[0]
  const startDate  = new Date()

  const touches: DripTouch[] = template.touches.map((t, i) => {
    const scheduled = new Date(startDate)
    scheduled.setDate(scheduled.getDate() + t.day)
    const script = t.getScript({ address: params.address, ownerName: params.ownerName, agentName: AGENT })
    return {
      id:            `touch-${Date.now()}-${i}`,
      sequenceId:    '',  // filled below
      leadId:        params.leadId,
      day:           t.day,
      scheduledDate: scheduled.toISOString().split('T')[0],
      type:          t.type,
      title:         t.title,
      script,
      status:        'pending' as TouchStatus,
      smsUrl:    t.type === 'sms'   && params.phone ? buildSmsUrl(params.phone, script) : undefined,
      mailtoUrl: t.type === 'email' && params.email ? buildMailtoUrl(params.email, `Cash offer — ${params.address}`, script) : undefined,
    }
  })

  const seq: DripSequence = {
    id:          `drip-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
    leadId:      params.leadId,
    address:     params.address,
    ownerName:   params.ownerName,
    phone:       params.phone,
    email:       params.email,
    startedAt:   startDate.toISOString(),
    status:      'active',
    touches:     touches.map(t => ({ ...t, sequenceId: '' })),
    templateId,
    daysElapsed: 0,
  }

  // Fill sequenceId
  seq.touches = seq.touches.map(t => ({ ...t, sequenceId: seq.id }))

  save([seq, ...load()])
  return seq
}

export function getDripSequences(): DripSequence[] {
  return load().sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function getDripSequence(id: string): DripSequence | null {
  return load().find(s => s.id === id) || null
}

export function getSequenceForLead(leadId: string): DripSequence | null {
  return load().find(s => s.leadId === leadId && s.status === 'active') || null
}

export function hasActiveSequence(leadId: string): boolean {
  return load().some(s => s.leadId === leadId && s.status === 'active')
}

export function completeTouch(sequenceId: string, touchId: string, outcome: string, notes?: string): void {
  const all = load()
  const seq = all.find(s => s.id === sequenceId)
  if (!seq) return
  const touch = seq.touches.find(t => t.id === touchId)
  if (!touch) return
  touch.status      = 'completed'
  touch.completedAt = new Date().toISOString()
  touch.outcome     = outcome
  touch.notes       = notes

  // Check if all touches done → complete sequence
  const allDone = seq.touches.every(t => t.status === 'completed' || t.status === 'skipped')
  if (allDone) seq.status = 'completed'

  save(all)
}

export function skipTouch(sequenceId: string, touchId: string): void {
  const all = load()
  const seq = all.find(s => s.id === sequenceId)
  if (!seq) return
  const touch = seq.touches.find(t => t.id === touchId)
  if (touch) touch.status = 'skipped'
  save(all)
}

export function markConverted(sequenceId: string): void {
  const all = load()
  const seq = all.find(s => s.id === sequenceId)
  if (seq) { seq.status = 'converted'; seq.completedAt = new Date().toISOString() }
  save(all)
}

export function pauseSequence(sequenceId: string): void {
  const all = load()
  const seq = all.find(s => s.id === sequenceId)
  if (seq) { seq.status = 'paused'; seq.pausedAt = new Date().toISOString() }
  save(all)
}

export function resumeSequence(sequenceId: string): void {
  const all = load()
  const seq = all.find(s => s.id === sequenceId)
  if (seq) { seq.status = 'active'; delete seq.pausedAt }
  save(all)
}

export function deleteSequence(id: string): void {
  save(load().filter(s => s.id !== id))
}

// ── Due today ─────────────────────────────────────────────────────────────────
export function getDueTodayDrip(): { sequence: DripSequence; touch: DripTouch }[] {
  const today = new Date().toISOString().split('T')[0]
  const result: { sequence: DripSequence; touch: DripTouch }[] = []

  for (const seq of load()) {
    if (seq.status !== 'active') continue
    for (const touch of seq.touches) {
      if (touch.status === 'pending' && touch.scheduledDate <= today) {
        result.push({ sequence: seq, touch })
      }
    }
  }

  return result.sort((a, b) => {
    // Calls first, then SMS, then email
    const order: Record<TouchType, number> = { call: 0, voicemail: 1, sms: 2, email: 3, mail: 4 }
    return order[a.touch.type] - order[b.touch.type]
  })
}

export function getDripStats() {
  const all = load()
  const active    = all.filter(s => s.status === 'active')
  const converted = all.filter(s => s.status === 'converted')
  const due       = getDueTodayDrip()
  return {
    total:        all.length,
    active:       active.length,
    converted:    converted.length,
    dueToday:     due.length,
    conversionRate: all.length > 0 ? Math.round((converted.length / all.length) * 100) : 0,
  }
}
