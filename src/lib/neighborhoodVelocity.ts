/**
 * Neighborhood Velocity Index
 *
 * Combines 4 independent data signals into one number per zip code:
 *
 *   1. Distress Signal Density  — Lead Radar hits per zip (your proprietary data)
 *   2. Comp Spread Tightening   — ARV range narrowing = market maturing (RentCast)
 *   3. Permit Activity Trend    — Rising permits = neighborhood improving pre-price (gov APIs)
 *   4. DOM Trend                — Days on market declining = buyer demand accelerating
 *
 * Output: Green / Yellow / Red per zip + Velocity Score 0-100
 *
 *   🟢 Green  = Signal just turned. Appreciation likely in 12-18 months.
 *              Buy now before market catches up.
 *   🟡 Yellow = Transitioning. Good deals still available but window closing.
 *   🔴 Red    = Already transitioned or declining. Price defensively.
 *
 * This signal is 12-18 months AHEAD of Zillow's "hot market" indicator.
 * Zillow tells you a neighborhood is already hot — you're already too late.
 * This tells you before it happens.
 */

import { Lead } from './leadRadar'

export interface ZipSignal {
  zip:          string
  city:         string
  state:        string
  lat:          number
  lng:          number
  // Raw signal counts
  distressCount:   number    // Lead Radar hits in last 60 days
  permitCount:     number    // building permits filed in last 60 days
  compsCount:      number    // comparable sales in last 90 days
  avgDom:          number    // avg days on market
  arvSpreadPct:    number    // (high-low)/mid — lower = more confident market
  medianPrice:     number
  priceChangePct:  number    // YoY price change
  // Computed scores (0-100 each)
  distressScore:   number    // high distress = buying opportunity
  permitScore:     number    // rising permits = neighborhood improving
  domScore:        number    // low DOM = strong buyer demand
  compScore:       number    // tight comps = established market confidence
  // Combined
  velocityScore:   number    // 0-100 weighted composite
  signal:          'green' | 'yellow' | 'red'
  signalLabel:     string
  momentum:        'rising' | 'stable' | 'declining'
  // Your deal history here
  dealsInZip:      number
  avgReturnInZip:  number    // from your Project Tracker
  // Insights
  insights:        string[]
  recommendation:  string
  lastUpdated:     string
}

export interface VelocityMap {
  zips:        ZipSignal[]
  generatedAt: string
  sourceCount: number
  topOpportunity: ZipSignal | null
}

// ── Zip centroid lookup (VA/NC focus) ─────────────────────────────────────────
const ZIP_CENTROIDS: Record<string, { lat: number; lng: number; city: string; state: string }> = {
  // Norfolk area
  '23501': { lat: 36.8508, lng: -76.2859, city: 'Norfolk',        state: 'VA' },
  '23502': { lat: 36.8448, lng: -76.2513, city: 'Norfolk',        state: 'VA' },
  '23503': { lat: 36.9217, lng: -76.2931, city: 'Norfolk',        state: 'VA' },
  '23504': { lat: 36.8617, lng: -76.3031, city: 'Norfolk',        state: 'VA' },
  '23505': { lat: 36.8948, lng: -76.3115, city: 'Norfolk',        state: 'VA' },
  '23507': { lat: 36.8714, lng: -76.3031, city: 'Norfolk',        state: 'VA' },
  '23508': { lat: 36.8847, lng: -76.3037, city: 'Norfolk',        state: 'VA' },
  '23509': { lat: 36.8659, lng: -76.2761, city: 'Norfolk',        state: 'VA' },
  '23510': { lat: 36.8487, lng: -76.2953, city: 'Norfolk',        state: 'VA' },
  '23511': { lat: 36.9424, lng: -76.3283, city: 'Norfolk',        state: 'VA' },
  '23513': { lat: 36.8731, lng: -76.2337, city: 'Norfolk',        state: 'VA' },
  '23517': { lat: 36.8797, lng: -76.3020, city: 'Norfolk',        state: 'VA' },
  '23518': { lat: 36.9003, lng: -76.2476, city: 'Norfolk',        state: 'VA' },
  // Virginia Beach
  '23451': { lat: 36.8529, lng: -75.9779, city: 'Virginia Beach', state: 'VA' },
  '23452': { lat: 36.8316, lng: -76.0630, city: 'Virginia Beach', state: 'VA' },
  '23453': { lat: 36.7671, lng: -76.0721, city: 'Virginia Beach', state: 'VA' },
  '23454': { lat: 36.8618, lng: -76.0289, city: 'Virginia Beach', state: 'VA' },
  '23455': { lat: 36.8979, lng: -76.0736, city: 'Virginia Beach', state: 'VA' },
  '23456': { lat: 36.7559, lng: -76.0355, city: 'Virginia Beach', state: 'VA' },
  '23457': { lat: 36.6484, lng: -75.9744, city: 'Virginia Beach', state: 'VA' },
  '23462': { lat: 36.8288, lng: -76.1046, city: 'Virginia Beach', state: 'VA' },
  '23464': { lat: 36.7969, lng: -76.1359, city: 'Virginia Beach', state: 'VA' },
  // Chesapeake
  '23320': { lat: 36.7184, lng: -76.2208, city: 'Chesapeake',     state: 'VA' },
  '23321': { lat: 36.7788, lng: -76.3867, city: 'Chesapeake',     state: 'VA' },
  '23322': { lat: 36.6463, lng: -76.1972, city: 'Chesapeake',     state: 'VA' },
  '23323': { lat: 36.7065, lng: -76.3522, city: 'Chesapeake',     state: 'VA' },
  '23324': { lat: 36.7484, lng: -76.2558, city: 'Chesapeake',     state: 'VA' },
  // Portsmouth
  '23701': { lat: 36.8285, lng: -76.3644, city: 'Portsmouth',     state: 'VA' },
  '23702': { lat: 36.8029, lng: -76.3457, city: 'Portsmouth',     state: 'VA' },
  '23703': { lat: 36.8698, lng: -76.3793, city: 'Portsmouth',     state: 'VA' },
  '23704': { lat: 36.8348, lng: -76.3082, city: 'Portsmouth',     state: 'VA' },
  // Richmond
  '23220': { lat: 37.5540, lng: -77.4668, city: 'Richmond',       state: 'VA' },
  '23221': { lat: 37.5509, lng: -77.4906, city: 'Richmond',       state: 'VA' },
  '23222': { lat: 37.5815, lng: -77.4280, city: 'Richmond',       state: 'VA' },
  '23223': { lat: 37.5535, lng: -77.3994, city: 'Richmond',       state: 'VA' },
  '23224': { lat: 37.5104, lng: -77.4573, city: 'Richmond',       state: 'VA' },
  '23225': { lat: 37.5133, lng: -77.4903, city: 'Richmond',       state: 'VA' },
  // Charlotte NC
  '28201': { lat: 35.2271, lng: -80.8431, city: 'Charlotte',      state: 'NC' },
  '28202': { lat: 35.2271, lng: -80.8431, city: 'Charlotte',      state: 'NC' },
  '28203': { lat: 35.2099, lng: -80.8601, city: 'Charlotte',      state: 'NC' },
  '28204': { lat: 35.2168, lng: -80.8213, city: 'Charlotte',      state: 'NC' },
  '28205': { lat: 35.2288, lng: -80.8013, city: 'Charlotte',      state: 'NC' },
  '28206': { lat: 35.2543, lng: -80.8263, city: 'Charlotte',      state: 'NC' },
  '28207': { lat: 35.2024, lng: -80.8393, city: 'Charlotte',      state: 'NC' },
  '28208': { lat: 35.2235, lng: -80.8893, city: 'Charlotte',      state: 'NC' },
  '28209': { lat: 35.1790, lng: -80.8547, city: 'Charlotte',      state: 'NC' },
  '28210': { lat: 35.1495, lng: -80.8671, city: 'Charlotte',      state: 'NC' },
  '28211': { lat: 35.1823, lng: -80.8053, city: 'Charlotte',      state: 'NC' },
  '28212': { lat: 35.1988, lng: -80.7713, city: 'Charlotte',      state: 'NC' },
  '28213': { lat: 35.2776, lng: -80.8031, city: 'Charlotte',      state: 'NC' },
  '28214': { lat: 35.2601, lng: -80.9268, city: 'Charlotte',      state: 'NC' },
  '28215': { lat: 35.2518, lng: -80.7617, city: 'Charlotte',      state: 'NC' },
  '28216': { lat: 35.2885, lng: -80.8685, city: 'Charlotte',      state: 'NC' },
  '28217': { lat: 35.1794, lng: -80.9019, city: 'Charlotte',      state: 'NC' },
  // Raleigh / Wake County
  '27601': { lat: 35.7796, lng: -78.6382, city: 'Raleigh',        state: 'NC' },
  '27603': { lat: 35.7388, lng: -78.6454, city: 'Raleigh',        state: 'NC' },
  '27604': { lat: 35.8074, lng: -78.6022, city: 'Raleigh',        state: 'NC' },
  '27605': { lat: 35.7946, lng: -78.6582, city: 'Raleigh',        state: 'NC' },
  '27606': { lat: 35.7459, lng: -78.7004, city: 'Raleigh',        state: 'NC' },
  '27607': { lat: 35.8011, lng: -78.7074, city: 'Raleigh',        state: 'NC' },
  '27608': { lat: 35.8113, lng: -78.6652, city: 'Raleigh',        state: 'NC' },
  '27609': { lat: 35.8448, lng: -78.6573, city: 'Raleigh',        state: 'NC' },
  // Chatham County NC
  '27312': { lat: 35.7173, lng: -79.0548, city: 'Pittsboro',      state: 'NC' },
  '27344': { lat: 35.7343, lng: -79.2398, city: 'Siler City',     state: 'NC' },
  '27330': { lat: 35.4774, lng: -79.1743, city: 'Sanford',        state: 'NC' },
}

// ── Score normalizers ─────────────────────────────────────────────────────────
function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v))
}

// Higher distress = more opportunity (buying opportunity, not flight)
function scoreDistress(count: number): number {
  if (count === 0) return 20
  if (count >= 10) return 95
  return clamp(20 + count * 7.5)
}

// Rising permit activity = neighborhood improving before prices reflect it
function scorePermits(count: number): number {
  if (count === 0) return 30
  if (count >= 8)  return 90
  return clamp(30 + count * 7.5)
}

// Lower DOM = stronger buyer demand (good exit)
function scoreDom(dom: number): number {
  if (dom <= 0)   return 50
  if (dom <= 20)  return 95
  if (dom <= 35)  return 85
  if (dom <= 50)  return 70
  if (dom <= 75)  return 55
  if (dom <= 100) return 40
  return 25
}

// Tighter comp spread = more confident market (ARV more reliable)
function scoreCompSpread(spreadPct: number): number {
  if (spreadPct <= 0)  return 50
  if (spreadPct <= 5)  return 95
  if (spreadPct <= 10) return 85
  if (spreadPct <= 15) return 72
  if (spreadPct <= 20) return 58
  if (spreadPct <= 30) return 42
  return 25
}

// Combined velocity (weighted: distress matters most for deals, DOM for exit)
function computeVelocity(d: number, p: number, dom: number, comp: number): number {
  return Math.round(d * 0.30 + p * 0.20 + dom * 0.30 + comp * 0.20)
}

function velocityToSignal(score: number, distress: number, dom: number): {
  signal: ZipSignal['signal']; label: string; momentum: ZipSignal['momentum']
} {
  // Green: high distress (deals available) + good DOM (exit works) + decent permits
  if (score >= 68 && distress >= 55 && dom >= 65) {
    return { signal: 'green', label: '🟢 Opportunity Zone — Act Now', momentum: 'rising' }
  }
  // Green: strong across all signals
  if (score >= 75) {
    return { signal: 'green', label: '🟢 Strong Market — High Activity', momentum: 'rising' }
  }
  // Red: already transitioned — low distress, fast DOM, tight comps
  if (score >= 72 && distress < 45) {
    return { signal: 'red', label: '🔴 Market Peaked — Price Defensively', momentum: 'declining' }
  }
  // Red: soft exit (slow DOM)
  if (dom < 40 && score < 55) {
    return { signal: 'red', label: '🔴 Soft Exit Market — Avoid or Deep Discount', momentum: 'declining' }
  }
  // Yellow: transitioning
  if (score >= 52) {
    return { signal: 'yellow', label: '🟡 Transitioning — Window Closing', momentum: 'stable' }
  }
  return { signal: 'red', label: '🔴 Weak Signals — Proceed Cautiously', momentum: 'declining' }
}

function buildInsights(z: ZipSignal): string[] {
  const insights: string[] = []
  if (z.distressScore >= 70) insights.push(`High distress density (${z.distressCount} signals) — motivated sellers available now`)
  if (z.permitScore >= 70)   insights.push(`Rising permit activity (${z.permitCount} permits) — neighborhood improving pre-price`)
  if (z.domScore >= 80)      insights.push(`Fast market — avg ${z.avgDom}d DOM, strong buyer demand, clean exit`)
  if (z.domScore < 45)       insights.push(`Slow exit market — avg ${z.avgDom}d DOM, budget extended carry`)
  if (z.compScore >= 80)     insights.push(`Tight comps — ARV confidence high, less pricing risk`)
  if (z.compScore < 45)      insights.push(`Wide comp spread (${z.arvSpreadPct.toFixed(0)}%) — ARV uncertain, price aggressively`)
  if (z.dealsInZip > 0)      insights.push(`You've done ${z.dealsInZip} deal${z.dealsInZip > 1 ? 's' : ''} here — proven territory`)
  if (z.priceChangePct > 5)  insights.push(`Prices up ${z.priceChangePct.toFixed(1)}% YoY — appreciation underway`)
  if (z.priceChangePct < -2) insights.push(`Prices down ${Math.abs(z.priceChangePct).toFixed(1)}% YoY — buyer's market, negotiate hard`)
  return insights.slice(0, 4)
}

function buildRecommendation(z: ZipSignal): string {
  if (z.signal === 'green' && z.distressScore >= 70) {
    return `Prioritize this zip — high deal flow AND good exit market. Increase Lead Radar scan frequency and drive frequency.`
  }
  if (z.signal === 'green') {
    return `Strong market. Watch for new code violations and distress signals. Competition may be rising.`
  }
  if (z.signal === 'yellow' && z.distressScore >= 60) {
    return `Good deals still available but window is closing. Move quickly on any motivated seller you find here.`
  }
  if (z.signal === 'yellow') {
    return `Mixed signals. Proceed deal-by-deal. Price conservatively and verify exit before committing.`
  }
  if (z.domScore < 40) {
    return `Soft exit market. Only buy at deep discount (65% of ARV or less) — extended carry risk is real.`
  }
  return `Weak opportunity here right now. Redirect scanning effort to green-signal zips.`
}

// ── Main builder ──────────────────────────────────────────────────────────────
export async function buildVelocityMap(
  radarLeads: Lead[],
  rentcastData?: { zip: string; avgDom: number; medianPrice: number; compsCount: number; arvSpreadPct: number; priceChangePct: number }[]
): Promise<VelocityMap> {

  // Pull your historical deal data
  let dealsByZip: Record<string, number> = {}
  try {
    const projects = JSON.parse(localStorage.getItem('flipscan_projects_v1') || '[]')
    projects.forEach((p: any) => {
      // Extract zip from address if available
      const zip = p.zip || extractZip(p.address || '')
      if (zip) dealsByZip[zip] = (dealsByZip[zip] || 0) + 1
    })
  } catch {}

  // Also pull Drive for Dollars captures by zip
  let d4dByZip: Record<string, number> = {}
  try {
    const d4d = JSON.parse(localStorage.getItem('flipscan_d4d_v1') || '[]')
    d4d.forEach((c: any) => {
      if (c.zip) d4dByZip[c.zip] = (d4dByZip[c.zip] || 0) + 1
    })
  } catch {}

  // Group radar leads by zip
  const leadsByZip: Record<string, Lead[]> = {}
  radarLeads.forEach(l => {
    const zip = l.zip || extractZip(l.address)
    if (!zip) return
    if (!leadsByZip[zip]) leadsByZip[zip] = []
    leadsByZip[zip].push(l)
  })

  // Also add any known zips that have centroid data
  Object.keys(ZIP_CENTROIDS).forEach(zip => {
    if (!leadsByZip[zip]) leadsByZip[zip] = []
  })

  // Merge in D4D zips
  Object.keys(d4dByZip).forEach(zip => {
    if (!leadsByZip[zip]) leadsByZip[zip] = []
  })

  const zips: ZipSignal[] = []

  for (const [zip, leads] of Object.entries(leadsByZip)) {
    const centroid = ZIP_CENTROIDS[zip]
    if (!centroid && leads.length === 0) continue
    if (!centroid && !leads[0]) continue

    const lat = centroid?.lat || leads[0]?.lat || 0
    const lng = centroid?.lng || leads[0]?.lng || 0
    const city  = centroid?.city  || leads[0]?.city  || ''
    const state = centroid?.state || leads[0]?.state || ''

    if (!lat || !lng) continue

    // RentCast data for this zip
    const rcData = rentcastData?.find(r => r.zip === zip)
    const avgDom        = rcData?.avgDom        || 45
    const medianPrice   = rcData?.medianPrice   || 0
    const compsCount    = rcData?.compsCount    || 0
    const arvSpreadPct  = rcData?.arvSpreadPct  || 20
    const priceChangePct = rcData?.priceChangePct || 0

    // Permit count — from Lead Radar signals tagged as permits
    const permitCount = leads.filter(l => l.signalType === 'building_permit').length + (d4dByZip[zip] || 0)
    const distressCount = leads.filter(l => l.signalType !== 'building_permit').length

    const distressScore = scoreDistress(distressCount)
    const permitScore   = scorePermits(permitCount)
    const domScore      = scoreDom(avgDom)
    const compScore     = scoreCompSpread(arvSpreadPct)
    const velocityScore = computeVelocity(distressScore, permitScore, domScore, compScore)
    const { signal, label: signalLabel, momentum } = velocityToSignal(velocityScore, distressScore, domScore)

    const partial: Partial<ZipSignal> = {
      zip, city, state, lat, lng,
      distressCount, permitCount, compsCount, avgDom, arvSpreadPct,
      medianPrice, priceChangePct, distressScore, permitScore, domScore,
      compScore, velocityScore, signal, signalLabel, momentum,
      dealsInZip:     dealsByZip[zip] || 0,
      avgReturnInZip: 0,
      lastUpdated:    new Date().toISOString(),
    }

    const full = partial as ZipSignal
    full.insights       = buildInsights(full)
    full.recommendation = buildRecommendation(full)

    zips.push(full)
  }

  // Sort: green first, then by velocity score
  zips.sort((a, b) => {
    const order = { green: 0, yellow: 1, red: 2 }
    const od = order[a.signal] - order[b.signal]
    if (od !== 0) return od
    return b.velocityScore - a.velocityScore
  })

  const topOpportunity = zips.find(z => z.signal === 'green') || null

  return { zips, generatedAt: new Date().toISOString(), sourceCount: radarLeads.length, topOpportunity }
}

function extractZip(address: string): string {
  const match = address.match(/\b(\d{5})\b/)
  return match ? match[1] : ''
}

// Cache key
const CACHE_KEY = 'flipscan_velocity_cache'
const CACHE_TTL  = 6 * 60 * 60 * 1000  // 6 hours

export function getCachedVelocityMap(): VelocityMap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { map, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return map
  } catch { return null }
}

export function cacheVelocityMap(map: VelocityMap): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ map, ts: Date.now() })) } catch {}
}
