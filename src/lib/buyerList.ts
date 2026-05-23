/**
 * Buyer List Manager
 *
 * Stores your wholesale buyer contacts with their buy box criteria.
 * When you create a wholesale deal, the system filters which buyers
 * match and lets you blast the deal summary to all of them at once.
 *
 * Storage: localStorage — private to your browser
 */

export type BuyerType = 'cash' | 'hard_money' | 'conventional' | 'any'
export type PropertyPref = 'sfr' | 'multi' | 'both' | 'any'
export type RehabPref = 'turnkey' | 'light' | 'heavy' | 'any'

export interface Buyer {
  id:            string
  name:          string
  company?:      string
  email:         string
  phone:         string
  // Buy box
  states:        string[]     // ['VA','NC'] or ['all']
  counties:      string[]     // specific counties or [] for all
  minARV:        number
  maxARV:        number
  maxPrice:      number       // max they'll pay for assignment
  buyerType:     BuyerType
  propertyPref:  PropertyPref
  rehabPref:     RehabPref
  // Tracking
  addedAt:       string
  lastContactAt?: string
  dealsShared:   number
  dealsClosed:   number
  totalPaid:     number       // total assignment fees paid to you
  notes:         string
  active:        boolean
}

const STORAGE_KEY = 'flipscan_buyers_v1'

function load(): Buyer[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function save(buyers: Buyer[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(buyers)) } catch {}
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export function getBuyers(activeOnly = true): Buyer[] {
  const all = load()
  return activeOnly ? all.filter(b => b.active) : all
}

export function addBuyer(b: Omit<Buyer, 'id' | 'addedAt' | 'dealsShared' | 'dealsClosed' | 'totalPaid'>): Buyer {
  const buyer: Buyer = {
    ...b,
    id:          `buyer-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
    addedAt:     new Date().toISOString(),
    dealsShared: 0,
    dealsClosed: 0,
    totalPaid:   0,
  }
  save([buyer, ...load()])
  return buyer
}

export function updateBuyer(id: string, updates: Partial<Buyer>): void {
  const all = load()
  const idx = all.findIndex(b => b.id === id)
  if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; save(all) }
}

export function deleteBuyer(id: string): void {
  save(load().filter(b => b.id !== id))
}

export function recordDealShared(buyerIds: string[]): void {
  const all = load()
  buyerIds.forEach(id => {
    const b = all.find(x => x.id === id)
    if (b) { b.dealsShared++; b.lastContactAt = new Date().toISOString() }
  })
  save(all)
}

export function recordDealClosed(buyerId: string, fee: number): void {
  const all = load()
  const b = all.find(x => x.id === buyerId)
  if (b) { b.dealsClosed++; b.totalPaid += fee; b.lastContactAt = new Date().toISOString() }
  save(all)
}

// ── Match buyers to a deal ────────────────────────────────────────────────────
export interface BuyerMatch {
  buyer:  Buyer
  score:  number    // 0-100 match score
  reasons: string[] // why they match
  misses:  string[] // what doesn't quite fit
}

export function matchBuyers(deal: {
  state:      string
  county?:    string
  arv:        number
  askingPrice:number
  rehab:      number
  propertyType?: string
}): BuyerMatch[] {
  const buyers = getBuyers(true)
  const results: BuyerMatch[] = []

  for (const buyer of buyers) {
    let score = 60
    const reasons: string[] = []
    const misses:  string[] = []

    // State match
    const stateMatch = buyer.states.includes('all') || buyer.states.includes(deal.state)
    if (!stateMatch) continue  // hard filter — skip if wrong state
    reasons.push(`Buys in ${deal.state}`)

    // County match
    if (buyer.counties.length > 0 && deal.county) {
      if (buyer.counties.some(c => deal.county!.toLowerCase().includes(c.toLowerCase()))) {
        score += 10; reasons.push(`Targets ${deal.county} County`)
      }
    }

    // ARV range
    if (deal.arv > 0) {
      if (buyer.minARV > 0 && deal.arv < buyer.minARV) {
        score -= 20; misses.push(`ARV ${Math.round(deal.arv/1000)}k below their ${Math.round(buyer.minARV/1000)}k min`)
      } else if (buyer.maxARV > 0 && deal.arv > buyer.maxARV) {
        score -= 20; misses.push(`ARV ${Math.round(deal.arv/1000)}k above their ${Math.round(buyer.maxARV/1000)}k max`)
      } else {
        score += 15; reasons.push(`ARV in buy box`)
      }
    }

    // Price range
    if (buyer.maxPrice > 0 && deal.askingPrice > buyer.maxPrice) {
      score -= 25; misses.push(`Your price ${Math.round(deal.askingPrice/1000)}k above their ${Math.round(buyer.maxPrice/1000)}k max`)
    } else if (deal.askingPrice > 0) {
      score += 10; reasons.push(`Price fits their budget`)
    }

    // Rehab preference
    const rehabPct = deal.arv > 0 ? (deal.rehab / deal.arv) * 100 : 0
    if (buyer.rehabPref === 'turnkey' && rehabPct > 10) {
      score -= 15; misses.push(`Heavy rehab — they prefer turnkey`)
    } else if (buyer.rehabPref === 'light' && rehabPct > 25) {
      score -= 10; misses.push(`Heavy rehab — they prefer light work`)
    } else if (buyer.rehabPref === 'heavy') {
      score += 10; reasons.push(`They buy heavy rehab deals`)
    } else if (buyer.rehabPref !== 'any') {
      score += 5
    }

    // Track record bonus
    if (buyer.dealsClosed > 0)  { score += 10; reasons.push(`Closed ${buyer.dealsClosed} deal${buyer.dealsClosed>1?'s':''} with you`) }
    if (buyer.dealsClosed > 3)  score += 5
    if (buyer.dealsShared > 5)  reasons.push(`Engaged — receives your deals regularly`)

    score = Math.min(100, Math.max(0, score))
    results.push({ buyer, score, reasons, misses })
  }

  return results.sort((a, b) => b.score - a.score)
}

export function getBuyerStats() {
  const all = load()
  const active = all.filter(b => b.active)
  const topBuyer = active.sort((a,b) => b.dealsClosed - a.dealsClosed)[0]
  return {
    total:       all.length,
    active:      active.length,
    cash:        active.filter(b => b.buyerType === 'cash').length,
    totalFeesPaid: active.reduce((s,b) => s + b.totalPaid, 0),
    topBuyer:    topBuyer || null,
  }
}
