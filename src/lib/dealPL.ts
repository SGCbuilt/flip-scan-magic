import { syncWrite } from './cloudSync'
/**
 * Deal P&L Tracker
 *
 * Tracks actual vs estimated costs per closed deal.
 * Reveals where your estimates are off so every future deal is more accurate.
 *
 * Categories:
 *   Acquisition  — purchase price, closing costs, transfer taxes
 *   Financing    — hard money interest, points, extension fees
 *   Rehab        — by system (actual vs estimate)
 *   Holding      — property tax, insurance, utilities, security
 *   Selling      — agent commissions, closing costs, concessions
 *   Revenue      — sale price, any rental income during hold
 *
 * Storage: localStorage — persists between sessions
 */

export type PLCategory =
  | 'acquisition'
  | 'financing'
  | 'rehab'
  | 'holding'
  | 'selling'
  | 'revenue'

export interface PLLineItem {
  id:          string
  category:    PLCategory
  label:       string
  estimated:   number
  actual:      number
  notes?:      string
}

export interface DealPL {
  id:           string
  // Property info
  address:      string
  city:         string
  state:        string
  zip:          string
  // Key dates
  purchaseDate: string
  listDate?:    string
  saleDate?:    string
  // Status
  status:       'active' | 'listed' | 'under_contract' | 'closed'
  // Line items
  items:        PLLineItem[]
  // Notes
  notes:        string
  // Metadata
  createdAt:    string
  updatedAt:    string
  // Linked pipeline lead
  pipelineLeadId?: string
}

const STORAGE_KEY = 'flipscan_pl_v1'

function load(): DealPL[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function save(deals: DealPL[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(deals)); syncWrite('flipscan_pl_v1', deals) } catch {}
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export function getDealPLs(): DealPL[] {
  return load().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getDealPL(id: string): DealPL | null {
  return load().find(d => d.id === id) || null
}

export function createDealPL(params: Omit<DealPL, 'id' | 'items' | 'createdAt' | 'updatedAt'>): DealPL {
  const deal: DealPL = {
    ...params,
    id:        `pl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    items:     getDefaultItems(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  save([deal, ...load()])
  return deal
}

export function updateDealPL(id: string, updates: Partial<DealPL>): DealPL | null {
  const all = load()
  const idx = all.findIndex(d => d.id === id)
  if (idx < 0) return null
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() }
  save(all)
  return all[idx]
}

export function deleteDealPL(id: string): void {
  save(load().filter(d => d.id !== id))
}

export function upsertLineItem(dealId: string, item: PLLineItem): void {
  const all = load()
  const idx = all.findIndex(d => d.id === dealId)
  if (idx < 0) return
  const itemIdx = all[idx].items.findIndex(i => i.id === item.id)
  if (itemIdx >= 0) {
    all[idx].items[itemIdx] = item
  } else {
    all[idx].items.push(item)
  }
  all[idx].updatedAt = new Date().toISOString()
  save(all)
}

export function deleteLineItem(dealId: string, itemId: string): void {
  const all = load()
  const idx = all.findIndex(d => d.id === dealId)
  if (idx < 0) return
  all[idx].items = all[idx].items.filter(i => i.id !== itemId)
  all[idx].updatedAt = new Date().toISOString()
  save(all)
}

// ── Default line items for a new deal ─────────────────────────────────────────
function newItem(category: PLCategory, label: string, estimated = 0): PLLineItem {
  return {
    id:        `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}-${label.slice(0,4)}`,
    category, label, estimated, actual: 0,
  }
}

export function getDefaultItems(): PLLineItem[] {
  return [
    // Acquisition
    newItem('acquisition', 'Purchase Price'),
    newItem('acquisition', 'Closing Costs (Buy)'),
    newItem('acquisition', 'Transfer Tax / Recording'),
    // Financing
    newItem('financing', 'Hard Money Points'),
    newItem('financing', 'Hard Money Interest'),
    newItem('financing', 'Extension Fees'),
    // Rehab
    newItem('rehab', 'Roof'),
    newItem('rehab', 'HVAC'),
    newItem('rehab', 'Electrical'),
    newItem('rehab', 'Plumbing'),
    newItem('rehab', 'Kitchen'),
    newItem('rehab', 'Bathrooms'),
    newItem('rehab', 'Flooring'),
    newItem('rehab', 'Paint'),
    newItem('rehab', 'Windows / Doors'),
    newItem('rehab', 'Exterior'),
    newItem('rehab', 'Landscaping'),
    newItem('rehab', 'Demo / Cleanout'),
    newItem('rehab', 'Misc / Contingency'),
    // Holding
    newItem('holding', 'Property Taxes'),
    newItem('holding', 'Insurance'),
    newItem('holding', 'Utilities'),
    newItem('holding', 'Security / Misc'),
    // Selling
    newItem('selling', 'Listing Agent Commission'),
    newItem('selling', 'Buyer Agent Commission'),
    newItem('selling', 'Closing Costs (Sell)'),
    newItem('selling', 'Seller Concessions'),
    newItem('selling', 'Staging'),
    // Revenue
    newItem('revenue', 'Sale Price'),
    newItem('revenue', 'Rental Income (if any)'),
  ]
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export interface DealSummary {
  totalRevenue:     { est: number; act: number }
  totalCosts:       { est: number; act: number }
  netProfit:        { est: number; act: number }
  roi:              { est: number; act: number }  // % on cash invested
  totalInvested:    { est: number; act: number }  // acquisition + rehab + financing
  holdDays:         number | null
  byCategory:       Record<PLCategory, { est: number; act: number; variance: number; variancePct: number }>
  biggestOverruns:  { label: string; variance: number }[]  // where estimate was most wrong
  rehabAccuracy:    number  // % accurate on rehab (0-100, 100 = perfect)
}

export function analyzeDeal(deal: DealPL): DealSummary {
  const byCategory: DealSummary['byCategory'] = {} as any
  const categories: PLCategory[] = ['acquisition','financing','rehab','holding','selling','revenue']

  categories.forEach(cat => {
    const items = deal.items.filter(i => i.category === cat)
    const est = items.reduce((s, i) => s + i.estimated, 0)
    const act = items.reduce((s, i) => s + i.actual, 0)
    const variance = act - est
    const variancePct = est > 0 ? (variance / est) * 100 : 0
    byCategory[cat] = { est, act, variance, variancePct }
  })

  const revEst = byCategory.revenue.est
  const revAct = byCategory.revenue.act
  const costCategories: PLCategory[] = ['acquisition','financing','rehab','holding','selling']
  const costEst = costCategories.reduce((s, c) => s + byCategory[c].est, 0)
  const costAct = costCategories.reduce((s, c) => s + byCategory[c].act, 0)

  const profitEst = revEst - costEst
  const profitAct = revAct - costAct

  const investedEst = byCategory.acquisition.est + byCategory.rehab.est + byCategory.financing.est
  const investedAct = byCategory.acquisition.act + byCategory.rehab.act + byCategory.financing.act

  const roiEst = investedEst > 0 ? (profitEst / investedEst) * 100 : 0
  const roiAct = investedAct > 0 ? (profitAct / investedAct) * 100 : 0

  // Hold days
  let holdDays: number | null = null
  if (deal.purchaseDate && deal.saleDate) {
    holdDays = Math.round(
      (new Date(deal.saleDate).getTime() - new Date(deal.purchaseDate).getTime()) / 86400000
    )
  }

  // Biggest overruns (cost items only, sorted by variance desc)
  const overruns = deal.items
    .filter(i => i.category !== 'revenue' && i.actual > i.estimated && i.estimated > 0)
    .map(i => ({ label: i.label, variance: i.actual - i.estimated }))
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 5)

  // Rehab accuracy
  const rehabItems = deal.items.filter(i => i.category === 'rehab' && i.estimated > 0 && i.actual > 0)
  let rehabAccuracy = 100
  if (rehabItems.length > 0) {
    const avgError = rehabItems.reduce((s, i) => s + Math.abs((i.actual - i.estimated) / i.estimated), 0) / rehabItems.length
    rehabAccuracy = Math.max(0, Math.round((1 - avgError) * 100))
  }

  return {
    totalRevenue:    { est: revEst,    act: revAct    },
    totalCosts:      { est: costEst,   act: costAct   },
    netProfit:       { est: profitEst, act: profitAct },
    roi:             { est: roiEst,    act: roiAct    },
    totalInvested:   { est: investedEst, act: investedAct },
    holdDays,
    byCategory,
    biggestOverruns: overruns,
    rehabAccuracy,
  }
}

export function getAllPLStats() {
  const deals  = load()
  const closed = deals.filter(d => d.status === 'closed')
  let totalProfit = 0, totalRevenue = 0, totalCosts = 0
  let rehabAccuracySum = 0, rehabCount = 0
  const overruns: Record<string, number[]> = {}

  closed.forEach(d => {
    const s = analyzeDeal(d)
    totalProfit  += s.netProfit.act
    totalRevenue += s.totalRevenue.act
    totalCosts   += s.totalCosts.act
    if (s.rehabAccuracy < 100) { rehabAccuracySum += s.rehabAccuracy; rehabCount++ }
    s.biggestOverruns.forEach(o => {
      if (!overruns[o.label]) overruns[o.label] = []
      overruns[o.label].push(o.variance)
    })
  })

  const topOverrun = Object.entries(overruns)
    .map(([label, vals]) => ({ label, avg: vals.reduce((s,v) => s+v, 0) / vals.length }))
    .sort((a,b) => b.avg - a.avg)[0]

  return {
    total:            deals.length,
    closed:           closed.length,
    active:           deals.filter(d => d.status !== 'closed').length,
    totalProfit,
    avgProfit:        closed.length > 0 ? totalProfit / closed.length : 0,
    avgRehabAccuracy: rehabCount > 0 ? rehabAccuracySum / rehabCount : 100,
    topOverrunCategory: topOverrun?.label || null,
    topOverrunAvg:      topOverrun?.avg    || 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEAL COSTING INTELLIGENCE
// Learns from your closed deals and surfaces actionable patterns
// ─────────────────────────────────────────────────────────────────────────────

export interface CategoryPattern {
  category:       string
  label:          string
  avgVariancePct: number    // + = you underestimate, - = you overestimate
  avgVariance$:   number    // dollar amount
  trend:          'over' | 'under' | 'accurate'
  confidence:     'high' | 'medium' | 'low'  // based on # of data points
  dataPoints:     number
  suggestedBuffer: number   // % to add to next estimate
  insight:        string    // plain English explanation
}

export interface CostingIntelligence {
  dealsAnalyzed:    number
  hasEnoughData:    boolean  // true when 2+ closed deals with actuals
  patterns:         CategoryPattern[]
  topBias:          CategoryPattern | null   // your biggest systematic error
  topAccurate:      CategoryPattern | null   // what you nail consistently
  rehabBias:        number                   // overall rehab underestimate %
  suggestedRehabBuffer: number               // recommended % to add to all rehab estimates
  estimatedAccuracy: number                  // 0-100, overall how accurate are you
  smartAdjustments: SmartAdjustment[]       // specific $ adjustments for next estimate
  generatedAt:      string
}

export interface SmartAdjustment {
  lineItemLabel:  string
  category:       string
  avgActual:      number
  avgEstimate:    number
  biasDirection:  'over' | 'under'
  biasPct:        number
  suggestedMultiplier: number  // multiply next estimate by this
  confidence:     'high' | 'medium' | 'low'
  rule:           string  // "When you estimate $X for kitchen, actual is typically $X*1.18"
}

export function buildCostingIntelligence(): CostingIntelligence {
  const closed = load().filter(d => d.status === 'closed')
  const withActuals = closed.filter(d => d.items.some(i => i.actual > 0 && i.estimated > 0))

  if (withActuals.length === 0) {
    return {
      dealsAnalyzed: 0, hasEnoughData: false, patterns: [],
      topBias: null, topAccurate: null,
      rehabBias: 0, suggestedRehabBuffer: 10,
      estimatedAccuracy: 0, smartAdjustments: [],
      generatedAt: new Date().toISOString(),
    }
  }

  // ── Collect variance data per line item label ─────────────────────────────
  const itemData: Record<string, { est: number[]; act: number[]; cat: string }> = {}

  for (const deal of withActuals) {
    for (const item of deal.items) {
      if (item.estimated <= 0 || item.actual <= 0) continue
      const key = item.label.toLowerCase().trim()
      if (!itemData[key]) itemData[key] = { est: [], act: [], cat: item.category }
      itemData[key].est.push(item.estimated)
      itemData[key].act.push(item.actual)
    }
  }

  // ── Collect category-level variance data ──────────────────────────────────
  const catData: Record<string, { variances: number[]; variances$: number[] }> = {}
  for (const deal of withActuals) {
    const summary = analyzeDeal(deal)
    for (const [cat, data] of Object.entries(summary.byCategory)) {
      if (data.est <= 0 || data.act <= 0) continue
      if (!catData[cat]) catData[cat] = { variances: [], variances$: [] }
      catData[cat].variances.push((data.act - data.est) / data.est * 100)
      catData[cat].variances$.push(data.act - data.est)
    }
  }

  // ── Build category patterns ───────────────────────────────────────────────
  const CATEGORY_LABELS: Record<string, string> = {
    acquisition: 'Acquisition', financing: 'Financing', rehab: 'Rehab',
    holding: 'Holding Costs', selling: 'Selling Costs', revenue: 'Revenue',
  }

  const patterns: CategoryPattern[] = []
  for (const [cat, data] of Object.entries(catData)) {
    if (data.variances.length === 0) continue
    const avg = data.variances.reduce((s, v) => s + v, 0) / data.variances.length
    const avg$ = data.variances$.reduce((s, v) => s + v, 0) / data.variances$.length
    const trend: CategoryPattern['trend'] = avg > 5 ? 'over' : avg < -5 ? 'under' : 'accurate'
    const confidence: CategoryPattern['confidence'] =
      data.variances.length >= 5 ? 'high' :
      data.variances.length >= 3 ? 'medium' : 'low'

    const buffer = trend === 'over' ? Math.min(Math.round(avg * 1.1), 30) : 0

    const insight = trend === 'accurate'
      ? `Your ${CATEGORY_LABELS[cat]?.toLowerCase() || cat} estimates are consistently accurate (±5%).`
      : trend === 'over'
      ? `You underestimate ${CATEGORY_LABELS[cat]?.toLowerCase() || cat} by ${avg.toFixed(0)}% on average. Add ${buffer}% buffer to future estimates.`
      : `You overestimate ${CATEGORY_LABELS[cat]?.toLowerCase() || cat} by ${Math.abs(avg).toFixed(0)}% — you have room to bid more aggressively.`

    patterns.push({
      category: cat, label: CATEGORY_LABELS[cat] || cat,
      avgVariancePct: Math.round(avg * 10) / 10,
      avgVariance$: Math.round(avg$),
      trend, confidence,
      dataPoints: data.variances.length,
      suggestedBuffer: buffer,
      insight,
    })
  }

  patterns.sort((a, b) => Math.abs(b.avgVariancePct) - Math.abs(a.avgVariancePct))

  // ── Build line-item smart adjustments ─────────────────────────────────────
  const smartAdjustments: SmartAdjustment[] = []
  for (const [label, data] of Object.entries(itemData)) {
    if (data.est.length < 2) continue // need 2+ data points
    const avgEst = data.est.reduce((s, v) => s + v, 0) / data.est.length
    const avgAct = data.act.reduce((s, v) => s + v, 0) / data.act.length
    const biasPct = ((avgAct - avgEst) / avgEst) * 100
    if (Math.abs(biasPct) < 8) continue // ignore small noise

    const confidence: SmartAdjustment['confidence'] =
      data.est.length >= 4 ? 'high' : data.est.length >= 2 ? 'medium' : 'low'

    const multiplier = Math.round((avgAct / avgEst) * 100) / 100

    smartAdjustments.push({
      lineItemLabel:   label.charAt(0).toUpperCase() + label.slice(1),
      category:        data.cat,
      avgActual:       Math.round(avgAct),
      avgEstimate:     Math.round(avgEst),
      biasDirection:   biasPct > 0 ? 'over' : 'under',
      biasPct:         Math.round(Math.abs(biasPct)),
      suggestedMultiplier: multiplier,
      confidence,
      rule: biasPct > 0
        ? `When you estimate $${Math.round(avgEst/1000)}k for ${label}, actual is typically $${Math.round(avgAct/1000)}k (${Math.round(biasPct)}% more)`
        : `When you estimate $${Math.round(avgEst/1000)}k for ${label}, actual is typically $${Math.round(avgAct/1000)}k (${Math.round(Math.abs(biasPct))}% less)`,
    })
  }

  smartAdjustments.sort((a, b) => b.biasPct - a.biasPct)

  // ── Rehab bias ────────────────────────────────────────────────────────────
  const rehabPattern = patterns.find(p => p.category === 'rehab')
  const rehabBias = rehabPattern?.avgVariancePct || 0
  const suggestedRehabBuffer = rehabBias > 0
    ? Math.min(Math.round(rehabBias * 1.1), 25)
    : 10 // default 10% contingency

  // ── Overall accuracy ──────────────────────────────────────────────────────
  const allVariances = Object.values(catData)
    .flatMap(d => d.variances)
    .filter(v => isFinite(v))
  const avgAbsVariance = allVariances.length > 0
    ? allVariances.reduce((s, v) => s + Math.abs(v), 0) / allVariances.length
    : 0
  const estimatedAccuracy = Math.max(0, Math.round(100 - avgAbsVariance))

  const topBias    = patterns.filter(p => p.trend !== 'accurate')[0] || null
  const topAccurate = patterns.filter(p => p.trend === 'accurate' && p.dataPoints >= 2)[0] || null

  return {
    dealsAnalyzed: withActuals.length,
    hasEnoughData: withActuals.length >= 2,
    patterns,
    topBias,
    topAccurate,
    rehabBias: Math.round(rehabBias * 10) / 10,
    suggestedRehabBuffer,
    estimatedAccuracy,
    smartAdjustments,
    generatedAt: new Date().toISOString(),
  }
}

// ── Apply intelligence to a new estimate ─────────────────────────────────────
// Returns adjusted estimates using learned multipliers
export function applyIntelligence(
  items: PLLineItem[],
  intel: CostingIntelligence
): { itemId: string; original: number; adjusted: number; multiplier: number; rule: string; biasDirection: 'over'|'under'; biasPct: number }[] {
  if (!intel.hasEnoughData) return []
  const results = []
  for (const item of items) {
    if (item.estimated <= 0) continue
    const key = item.label.toLowerCase().trim()
    const adj = intel.smartAdjustments.find(a =>
      a.lineItemLabel.toLowerCase() === key || key.includes(a.lineItemLabel.toLowerCase())
    )
    if (!adj || adj.confidence === 'low') continue
    const adjusted = Math.round(item.estimated * adj.suggestedMultiplier)
    if (Math.abs(adjusted - item.estimated) < 100) continue
    results.push({
      itemId:        item.id,
      original:      item.estimated,
      adjusted,
      multiplier:    adj.suggestedMultiplier,
      rule:          adj.rule,
      biasDirection: adj.biasDirection,
      biasPct:       adj.biasPct,
    })
  }
  return results
}
