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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(deals)) } catch {}
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
