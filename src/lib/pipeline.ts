import { syncWrite } from './cloudSync'
/**
 * Deal Pipeline — CRM layer for FlipScan Pro
 * 
 * Stores leads through the full deal lifecycle.
 * Persisted in localStorage (client-side, private to your browser).
 * 
 * Pipeline stages:
 *   new        → just found, not yet contacted
 *   researching → pulling comps, running numbers  
 *   contacted  → reached out to owner
 *   negotiating → active offer discussion
 *   under_contract → accepted offer, in due diligence
 *   closed_won → deal closed, property acquired
 *   closed_lost → deal dead, reason logged
 *   pass       → passing on this one
 */

export type PipelineStage = 
  | 'new'
  | 'researching'
  | 'contacted'
  | 'negotiating'
  | 'under_contract'
  | 'closed_won'
  | 'closed_lost'
  | 'pass'

export interface ContactAttempt {
  id:        string
  date:      string
  method:    'phone' | 'sms' | 'email' | 'door' | 'mail'
  phone?:    string
  email?:    string
  notes:     string
  outcome:   'no_answer' | 'left_vm' | 'connected' | 'not_interested' | 'interested' | 'callback'
}

export interface Offer {
  id:        string
  date:      string
  amount:    number
  arv:       number
  rehab:     number
  status:    'pending' | 'countered' | 'accepted' | 'rejected' | 'expired'
  notes:     string
}

export interface PipelineLead {
  id:          string    // matches Lead.id from leadRadar
  addedAt:     string
  updatedAt:   string
  stage:       PipelineStage
  priority:    'hot' | 'warm' | 'cold'
  
  // Property
  address:     string
  city:        string
  state:       string
  zip:         string
  county:      string
  signalType:  string
  signalLabel: string
  investorScore: number
  severity:    string
  source:      string
  
  // Owner contact (from skip trace)
  ownerName:   string
  phones:      { number: string; type: string; dnc: boolean; litigator: boolean }[]
  emails:      { address: string }[]
  mailingAddr: string
  
  // Deal analysis
  estimatedARV:    number
  estimatedRehab:  number
  estimatedProfit: number
  maxOffer:        number  // auto-calculated: ARV*0.70 - rehab
  
  // Activity
  contacts:    ContactAttempt[]
  offers:      Offer[]
  notes:       string       // general notes
  tags:        string[]
  
  // Tracking
  assignedTo:  string
  closedDate?: string
  closePrice?: number
}

const STORAGE_KEY = 'flipscan_pipeline_v2'

function load(): PipelineLead[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function save(leads: PipelineLead[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(leads)); syncWrite('flipscan_pipeline_v2', leads) } catch {}
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export function getPipeline(): PipelineLead[] {
  return load()
}

export function getPipelineLead(id: string): PipelineLead | null {
  return load().find(l => l.id === id) || null
}

export function isInPipeline(id: string): boolean {
  return load().some(l => l.id === id)
}

export function addToPipeline(lead: Omit<PipelineLead, 'addedAt' | 'updatedAt' | 'contacts' | 'offers'>): PipelineLead {
  const all = load()
  if (all.find(l => l.id === lead.id)) return all.find(l => l.id === lead.id)!

  const full: PipelineLead = {
    ...lead,
    addedAt:  new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    contacts: [],
    offers:   [],
  }
  save([full, ...all])
  return full
}

export function updatePipelineLead(id: string, updates: Partial<PipelineLead>): PipelineLead | null {
  const all = load()
  const idx = all.findIndex(l => l.id === id)
  if (idx < 0) return null
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() }
  save(all)
  return all[idx]
}

import { generateFollowUpTask, addTask } from './followUpEngine'

export function addContactAttempt(leadId: string, attempt: Omit<ContactAttempt, 'id'>): void {
  const all = load()
  const idx = all.findIndex(l => l.id === leadId)
  if (idx < 0) return
  const lead = all[idx]
  all[idx].contacts.push({ ...attempt, id: `ca-${Date.now()}` })
  all[idx].updatedAt = new Date().toISOString()
  // Auto-advance stage
  if (all[idx].stage === 'new' || all[idx].stage === 'researching') {
    all[idx].stage = 'contacted'
  }
  if (attempt.outcome === 'interested' && all[idx].stage === 'contacted') {
    all[idx].stage = 'negotiating'
  }
  save(all)

  // Auto-generate follow-up task based on outcome
  const task = generateFollowUpTask({
    leadId,
    address:       lead.address,
    ownerName:     lead.ownerName || 'Unknown Owner',
    phone:         attempt.method === 'phone' || attempt.method === 'sms' ? (attempt as any).phone : undefined,
    outcome:       attempt.outcome as any,
    contactMethod: attempt.method,
    notes:         attempt.notes,
  })
  if (task) addTask(task)
}

export function addOffer(leadId: string, offer: Omit<Offer, 'id'>): void {
  const all = load()
  const idx = all.findIndex(l => l.id === leadId)
  if (idx < 0) return
  all[idx].offers.push({ ...offer, id: `off-${Date.now()}` })
  all[idx].updatedAt = new Date().toISOString()
  if (offer.status === 'accepted') all[idx].stage = 'under_contract'
  save(all)
}

export function deletePipelineLead(id: string): void {
  save(load().filter(l => l.id !== id))
}

export function getPipelineStats() {
  const all = load()
  const stages: Record<PipelineStage, number> = {
    new: 0, researching: 0, contacted: 0, negotiating: 0,
    under_contract: 0, closed_won: 0, closed_lost: 0, pass: 0
  }
  let totalProfit = 0
  for (const l of all) {
    stages[l.stage]++
    if (l.stage === 'closed_won' && l.closePrice) totalProfit += l.closePrice
  }
  return {
    total: all.length,
    active: all.filter(l => !['closed_won','closed_lost','pass'].includes(l.stage)).length,
    stages,
    totalClosedProfit: totalProfit,
    hotLeads: all.filter(l => l.priority === 'hot').length,
  }
}
