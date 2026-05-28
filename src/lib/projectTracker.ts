import { syncWrite } from './cloudSync'
/**
 * Project Phase Tracker
 *
 * Tracks the construction timeline of every flip from close to sale.
 * 8 phase dates per deal. After 3 deals, you know your personal
 * critical path. After 8, the system predicts delays before they happen.
 *
 * The insight no platform has: the rehab phase is a DATA ASSET,
 * not just a cost center. Every day tracked = future accuracy.
 *
 * Phases (critical path order):
 *   1. Close Date         — day 0, money starts burning
 *   2. Demo Start         — when crew enters property
 *   3. Rough-In Complete  — mechanical, electrical, plumbing rough
 *   4. Inspections Passed — municipal sign-offs (the wild card)
 *   5. Drywall Complete   — walls closed, visible progress
 *   6. Paint Complete     — finishes underway
 *   7. Punch List Done    — final walkthrough complete
 *   8. List Date          — property hits market
 *   9. Sale Date          — closing day, carry cost stops
 */

export interface Phase {
  id:          string
  label:       string
  description: string
  targetDays:  number   // days after close date (your model)
  icon:        string
  category:    'acquisition' | 'construction' | 'finish' | 'exit'
}

export const PHASES: Phase[] = [
  { id: 'close',        label: 'Close Date',          description: 'Property closes, carry cost clock starts',                  targetDays: 0,   icon: '🔑', category: 'acquisition'  },
  { id: 'demo',         label: 'Demo Start',           description: 'Crew enters, demo and cleanout begins',                    targetDays: 5,   icon: '🔨', category: 'construction' },
  { id: 'roughin',      label: 'Rough-In Complete',    description: 'MEP rough-in done, ready for inspection',                  targetDays: 30,  icon: '⚡', category: 'construction' },
  { id: 'inspection',   label: 'Inspections Passed',   description: 'Municipal sign-offs complete — the wild card',            targetDays: 42,  icon: '📋', category: 'construction' },
  { id: 'drywall',      label: 'Drywall Complete',     description: 'Walls closed, house starts to look finished',              targetDays: 52,  icon: '🏗️', category: 'construction' },
  { id: 'paint',        label: 'Paint Complete',       description: 'Interior paint done, finishes installing',                 targetDays: 65,  icon: '🎨', category: 'finish'       },
  { id: 'punchlist',    label: 'Punch List Done',      description: 'Final walkthrough, all items resolved',                    targetDays: 80,  icon: '✅', category: 'finish'       },
  { id: 'listed',       label: 'List Date',            description: 'Property active on market',                                targetDays: 90,  icon: '📸', category: 'exit'         },
  { id: 'sold',         label: 'Sale Date',            description: 'Closing day — carry cost clock stops',                     targetDays: 120, icon: '💰', category: 'exit'         },
]

export interface PhaseDate {
  phaseId:      string
  planned:      string | null   // ISO date (your model before closing)
  actual:       string | null   // ISO date (what actually happened)
  notes?:       string
  delayReason?: string          // 'permit' | 'contractor' | 'material' | 'scope_change' | 'weather' | 'other'
}

export interface ProjectTimeline {
  id:           string
  dealId?:      string          // links to Pipeline CRM lead
  address:      string
  city:         string
  state:        string
  // Financial
  purchasePrice:   number
  loanAmount:      number
  loanRatePct:     number       // annualized interest rate (e.g. 11 for 11%)
  loanPointsPct:   number       // origination points (e.g. 2 for 2 points)
  rehabBudget:     number
  arvTarget:       number
  // GC advantage
  isGCOwner:       boolean      // true = you're the GC (always true for SGC)
  retailGCMarkup:  number       // % a non-GC investor would pay on top (default 22)
  // Phase dates
  phases:          PhaseDate[]
  // Status
  status:          'planning' | 'active' | 'listed' | 'sold' | 'paused'
  createdAt:       string
  updatedAt:       string
}

const STORAGE_KEY = 'flipscan_projects_v1'

function load(): ProjectTimeline[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function save(projects: ProjectTimeline[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); syncWrite('flipscan_projects_v1', projects) } catch {}
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export function getProjects(): ProjectTimeline[] {
  return load().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getProject(id: string): ProjectTimeline | null {
  return load().find(p => p.id === id) || null
}

export function createProject(params: Omit<ProjectTimeline, 'id' | 'phases' | 'createdAt' | 'updatedAt'>): ProjectTimeline {
  const closePhase = params.status !== 'planning' ? params : params
  const closeDate = new Date()

  // Build planned dates from close date + target days
  const phases: PhaseDate[] = PHASES.map(phase => {
    const planned = new Date(closeDate)
    planned.setDate(planned.getDate() + phase.targetDays)
    return {
      phaseId: phase.id,
      planned: planned.toISOString().split('T')[0],
      actual:  phase.id === 'close' ? closeDate.toISOString().split('T')[0] : null,
    }
  })

  const project: ProjectTimeline = {
    ...params,
    id:        `proj-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
    phases,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  save([project, ...load()])
  return project
}

export function updateProject(id: string, updates: Partial<ProjectTimeline>): void {
  const all = load()
  const idx = all.findIndex(p => p.id === id)
  if (idx < 0) return
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() }
  save(all)
}

export function updatePhase(projectId: string, phaseId: string, updates: Partial<PhaseDate>): void {
  const all = load()
  const proj = all.find(p => p.id === projectId)
  if (!proj) return
  const phase = proj.phases.find(ph => ph.phaseId === phaseId)
  if (phase) Object.assign(phase, updates)
  proj.updatedAt = new Date().toISOString()

  // Auto-update status based on phases
  const sold   = proj.phases.find(ph => ph.phaseId === 'sold')?.actual
  const listed = proj.phases.find(ph => ph.phaseId === 'listed')?.actual
  const close  = proj.phases.find(ph => ph.phaseId === 'close')?.actual
  if (sold)        proj.status = 'sold'
  else if (listed) proj.status = 'listed'
  else if (close)  proj.status = 'active'

  save(all)
}

export function deleteProject(id: string): void {
  save(load().filter(p => p.id !== id))
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface PhaseAnalysis {
  phaseId:      string
  label:        string
  plannedDays:  number | null   // days after close (planned)
  actualDays:   number | null   // days after close (actual)
  variance:     number | null   // actual - planned (+ = late)
  isComplete:   boolean
  isOverdue:    boolean
  daysUntil:    number | null   // days from today until planned
}

export interface ProjectAnalysis {
  projectId:       string
  totalPlannedDays: number
  totalActualDays: number | null
  currentDayNum:   number       // how many days since close
  daysOnSite:      number | null // demo to punch list
  carryDaysSoFar:  number
  dailyCarryCost:  number       // $ per day
  totalCarryCostSoFar: number
  gcAdvantage$:    number       // vs non-GC investor (saved by being your own GC)
  projectedExitDate: string | null
  projectedProfit: number | null
  phaseAnalyses:   PhaseAnalysis[]
  nextPhase:       Phase | null
  criticalDelay:   { phase: string; delayDays: number; costImpact: number } | null
  rehabAccuracyPct: number | null  // budget vs actual spend
  status:          ProjectTimeline['status']
}

export function analyzeProject(proj: ProjectTimeline): ProjectAnalysis {
  const closePhase = proj.phases.find(ph => ph.phaseId === 'close')
  const closeDate  = closePhase?.actual ? new Date(closePhase.actual) : null
  const today      = new Date()

  // Daily carry cost: loan interest + points amortized + property tax + insurance est
  const dailyInterest  = (proj.loanAmount * (proj.loanRatePct / 100)) / 365
  const pointsCost     = proj.loanAmount * (proj.loanPointsPct / 100)
  const holdMonths     = PHASES.find(p => p.id === 'sold')!.targetDays / 30
  const dailyTax       = (proj.arvTarget * 0.012) / 365    // est 1.2% annual tax
  const dailyInsurance = (proj.arvTarget * 0.006) / 365    // est 0.6% annual insurance
  const dailyCarryCost = dailyInterest + dailyTax + dailyInsurance

  const carryDaysSoFar = closeDate
    ? Math.floor((today.getTime() - closeDate.getTime()) / 86400000)
    : 0

  // GC advantage: what a non-GC investor would pay on rehab markup
  const gcAdvantage$ = proj.isGCOwner
    ? Math.round(proj.rehabBudget * (proj.retailGCMarkup / 100))
    : 0

  // Phase analyses
  const phaseAnalyses: PhaseAnalysis[] = PHASES.map(phase => {
    const phaseData   = proj.phases.find(ph => ph.phaseId === phase.id)
    const plannedDate = phaseData?.planned ? new Date(phaseData.planned) : null
    const actualDate  = phaseData?.actual  ? new Date(phaseData.actual)  : null
    const closeMs     = closeDate?.getTime() || 0

    const plannedDays = closeDate && plannedDate
      ? Math.round((plannedDate.getTime() - closeMs) / 86400000)
      : null

    const actualDays = closeDate && actualDate
      ? Math.round((actualDate.getTime() - closeMs) / 86400000)
      : null

    const variance  = actualDays !== null && plannedDays !== null ? actualDays - plannedDays : null
    const isComplete = !!phaseData?.actual
    const isOverdue  = !isComplete && plannedDate ? plannedDate < today : false
    const daysUntil  = !isComplete && plannedDate
      ? Math.round((plannedDate.getTime() - today.getTime()) / 86400000)
      : null

    return { phaseId: phase.id, label: phase.label, plannedDays, actualDays, variance, isComplete, isOverdue, daysUntil }
  })

  // Next incomplete phase
  const nextPhaseAnalysis = phaseAnalyses.find(pa => !pa.isComplete)
  const nextPhase = nextPhaseAnalysis ? PHASES.find(p => p.id === nextPhaseAnalysis.phaseId) || null : null

  // Critical delay (biggest variance so far)
  const delays = phaseAnalyses
    .filter(pa => pa.variance !== null && pa.variance > 0)
    .sort((a, b) => (b.variance || 0) - (a.variance || 0))
  const criticalDelay = delays[0]
    ? { phase: delays[0].label, delayDays: delays[0].variance!, costImpact: Math.round(delays[0].variance! * dailyCarryCost) }
    : null

  // Planned total
  const totalPlannedDays = PHASES.find(p => p.id === 'sold')!.targetDays

  // Actual total (if sold)
  const soldPhase = proj.phases.find(ph => ph.phaseId === 'sold')
  const actualSaleDate = soldPhase?.actual ? new Date(soldPhase.actual) : null
  const totalActualDays = closeDate && actualSaleDate
    ? Math.round((actualSaleDate.getTime() - closeDate.getTime()) / 86400000)
    : null

  // Days on site (demo to punch list)
  const demoActual     = proj.phases.find(ph => ph.phaseId === 'demo')?.actual
  const punchActual    = proj.phases.find(ph => ph.phaseId === 'punchlist')?.actual
  const daysOnSite     = demoActual && punchActual
    ? Math.round((new Date(punchActual).getTime() - new Date(demoActual).getTime()) / 86400000)
    : null

  // Projected exit (planned + current delays)
  const latestDelay = delays.reduce((sum, d) => sum + (d.variance || 0), 0)
  const projectedExitDate = closeDate
    ? new Date(closeDate.getTime() + (totalPlannedDays + latestDelay) * 86400000).toISOString().split('T')[0]
    : null

  // Projected profit
  const projectedTotalCarry = projectedExitDate && closeDate
    ? Math.round((new Date(projectedExitDate).getTime() - closeDate.getTime()) / 86400000) * dailyCarryCost + pointsCost
    : null

  const projectedProfit = projectedTotalCarry !== null
    ? Math.round(proj.arvTarget - proj.purchasePrice - proj.rehabBudget - projectedTotalCarry - proj.arvTarget * 0.08)
    : null

  return {
    projectId:        proj.id,
    totalPlannedDays,
    totalActualDays,
    currentDayNum:    carryDaysSoFar,
    daysOnSite,
    carryDaysSoFar,
    dailyCarryCost:   Math.round(dailyCarryCost),
    totalCarryCostSoFar: Math.round(carryDaysSoFar * dailyCarryCost + pointsCost),
    gcAdvantage$,
    projectedExitDate,
    projectedProfit,
    phaseAnalyses,
    nextPhase,
    criticalDelay,
    rehabAccuracyPct: null,
    status: proj.status,
  }
}

// ── Portfolio-level learning ───────────────────────────────────────────────────

export interface TimelinePattern {
  phaseId:         string
  label:           string
  avgVarianceDays: number        // your avg delay on this phase
  worstVariance:   number
  dataPoints:      number
  insight:         string
  isBottleneck:    boolean       // true if this is your most common delay
}

export interface PortfolioIntelligence {
  dealsTracked:        number
  avgHoldDays:         number | null
  avgDaysOnSite:       number | null
  avgCarryCostPerDeal: number | null
  gcAdvantageTotalSaved: number
  dailyCarryAvg:       number | null
  phasePatterns:       TimelinePattern[]
  bottleneck:          TimelinePattern | null
  suggestedModelAdjustments: { phaseId: string; label: string; addDays: number; reason: string }[]
  hasEnoughData:       boolean
}

export function buildPortfolioIntelligence(): PortfolioIntelligence {
  const projects = load().filter(p => p.status === 'sold' || p.status === 'listed')

  if (projects.length === 0) {
    return {
      dealsTracked: 0, avgHoldDays: null, avgDaysOnSite: null,
      avgCarryCostPerDeal: null, gcAdvantageTotalSaved: 0, dailyCarryAvg: null,
      phasePatterns: [], bottleneck: null, suggestedModelAdjustments: [],
      hasEnoughData: false,
    }
  }

  const analyses = projects.map(analyzeProject)

  // Avg hold days (sold only)
  const soldAnalyses = analyses.filter(a => a.totalActualDays !== null)
  const avgHoldDays  = soldAnalyses.length > 0
    ? Math.round(soldAnalyses.reduce((s, a) => s + a.totalActualDays!, 0) / soldAnalyses.length)
    : null

  // Avg days on site
  const siteAnalyses = analyses.filter(a => a.daysOnSite !== null)
  const avgDaysOnSite = siteAnalyses.length > 0
    ? Math.round(siteAnalyses.reduce((s, a) => s + a.daysOnSite!, 0) / siteAnalyses.length)
    : null

  // GC advantage total saved
  const gcAdvantageTotalSaved = projects.reduce((s, p) => s + Math.round(p.rehabBudget * (p.retailGCMarkup / 100)), 0)

  // Phase variance patterns
  const phaseVariances: Record<string, number[]> = {}
  for (const analysis of analyses) {
    for (const pa of analysis.phaseAnalyses) {
      if (pa.variance === null) continue
      if (!phaseVariances[pa.phaseId]) phaseVariances[pa.phaseId] = []
      phaseVariances[pa.phaseId].push(pa.variance)
    }
  }

  const phasePatterns: TimelinePattern[] = PHASES
    .filter(phase => phaseVariances[phase.id]?.length > 0)
    .map(phase => {
      const variances = phaseVariances[phase.id] || []
      const avg = variances.reduce((s, v) => s + v, 0) / variances.length
      const worst = Math.max(...variances)
      return {
        phaseId: phase.id,
        label:   phase.label,
        avgVarianceDays: Math.round(avg * 10) / 10,
        worstVariance:   worst,
        dataPoints:      variances.length,
        insight: avg > 3
          ? `Averages ${avg.toFixed(1)} days late — build ${Math.ceil(avg * 1.2)} extra days into your model`
          : avg < -2
          ? `Runs ${Math.abs(avg).toFixed(1)} days ahead of schedule — you're efficient here`
          : 'Running close to plan on this phase',
        isBottleneck: false,
      }
    })
    .sort((a, b) => b.avgVarianceDays - a.avgVarianceDays)

  if (phasePatterns.length > 0) phasePatterns[0].isBottleneck = true

  const bottleneck = phasePatterns.find(p => p.isBottleneck) || null

  // Suggested model adjustments
  const adjustments = phasePatterns
    .filter(p => p.avgVarianceDays > 2 && p.dataPoints >= 2)
    .map(p => ({
      phaseId: p.phaseId,
      label:   p.label,
      addDays: Math.ceil(p.avgVarianceDays * 1.1),
      reason:  `Your ${p.label.toLowerCase()} phase averages ${p.avgVarianceDays} days late across ${p.dataPoints} deals`,
    }))

  return {
    dealsTracked: projects.length,
    avgHoldDays,
    avgDaysOnSite,
    avgCarryCostPerDeal: analyses.length > 0
      ? Math.round(analyses.reduce((s, a) => s + a.totalCarryCostSoFar, 0) / analyses.length)
      : null,
    gcAdvantageTotalSaved,
    dailyCarryAvg: analyses.length > 0
      ? Math.round(analyses.reduce((s, a) => s + a.dailyCarryCost, 0) / analyses.length)
      : null,
    phasePatterns,
    bottleneck,
    suggestedModelAdjustments: adjustments,
    hasEnoughData: projects.length >= 2,
  }
}
