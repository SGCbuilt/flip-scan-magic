/**
 * List Stacking Engine
 *
 * Cross-references all lead sources to find properties appearing
 * in multiple signals simultaneously. A property with:
 *   - Code violation + absentee owner + below-assessed sale
 *   = 3x stronger signal than any one alone
 *
 * Sources crossed:
 *   - Lead Radar (all government API sources)
 *   - Drive for Dollars captures
 *   - Pipeline CRM (existing leads)
 *   - Wholesale deals
 *
 * Matching logic: fuzzy address match (street number + first word of street name)
 * Stack score: base score × signal multipliers
 */

import { Lead } from './leadRadar'

export interface StackedLead {
  id:            string
  address:       string
  city:          string
  state:         string
  zip:           string
  // All signals found for this property
  signals:       StackSignal[]
  signalCount:   number
  stackScore:    number   // 0-100, higher = more motivated
  tier:          'triple+' | 'double' | 'single'
  // Best data from any signal
  lat:           number | null
  lng:           number | null
  county:        string
  // Distress summary
  distressSummary: string
  investorNotes:   string[]
  firstSeen:     string
  lastSeen:      string
}

export interface StackSignal {
  sourceId:    string
  sourceName:  string
  signalType:  string
  signalLabel: string
  description: string
  severity:    string
  filedDate:   string
  score:       number
}

// ── Address normalizer ─────────────────────────────────────────────────────────
// Extracts "123 OAK" from "123 Oak Street, Norfolk VA 23501"
function normalizeAddress(addr: string): string {
  if (!addr) return ''
  const clean = addr.toUpperCase()
    .replace(/\b(STREET|ST|AVENUE|AVE|ROAD|RD|DRIVE|DR|LANE|LN|COURT|CT|PLACE|PL|BOULEVARD|BLVD|WAY|CIRCLE|CIR|TRAIL|TRL)\b\.?/g, '')
    .replace(/,.*$/, '')          // remove city/state
    .replace(/[^A-Z0-9\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ')
    .trim()
  // Return first 2 tokens: number + street name start
  const parts = clean.split(' ')
  return parts.slice(0, 2).join(' ')
}

function cityKey(city: string, state: string): string {
  return `${city.toUpperCase().trim()}::${state.toUpperCase().trim()}`
}

// ── Score multipliers for stacked signals ─────────────────────────────────────
const SEVERITY_SCORE: Record<string, number> = {
  critical: 90, high: 75, medium: 55, low: 35
}

const TYPE_MULTIPLIER: Record<string, number> = {
  fire_damage:     1.4,
  tax_delinquent:  1.3,
  probate:         1.3,
  foreclosure:     1.3,
  vacant:          1.2,
  code_violation:  1.1,
  building_permit: 1.0,
  eviction:        1.2,
}

function computeStackScore(signals: StackSignal[]): number {
  if (!signals.length) return 0
  // Base: highest individual score
  const base = Math.max(...signals.map(s => s.score))
  // Stack bonus: each additional signal adds 15%
  const stackBonus = (signals.length - 1) * 15
  // Type diversity bonus: different signal types = more distressed
  const uniqueTypes = new Set(signals.map(s => s.signalType)).size
  const diversityBonus = (uniqueTypes - 1) * 10
  return Math.min(100, Math.round(base + stackBonus + diversityBonus))
}

function buildDistressSummary(signals: StackSignal[]): string {
  const types = [...new Set(signals.map(s => s.signalLabel.split('—')[0].trim()))]
  if (signals.length === 1) return signals[0].description.slice(0, 120)
  return `${signals.length} signals: ${types.join(' + ')}`
}

function buildInvestorNotes(signals: StackSignal[]): string[] {
  const notes: string[] = []
  const types = signals.map(s => s.signalType)

  if (signals.length >= 3)
    notes.push(`🔥 Triple signal — extremely high motivation probability`)
  else if (signals.length === 2)
    notes.push(`⚡ Double signal — strong motivation, contact immediately`)

  if (types.includes('fire_damage'))
    notes.push('Fire damage — insurance complications, seller wants quick exit')
  if (types.includes('tax_delinquent'))
    notes.push('Tax delinquent — financial pressure, needs cash now')
  if (types.includes('vacant') || signals.some(s => s.signalLabel.toLowerCase().includes('vacant')))
    notes.push('Vacant — holding costs bleeding owner, highly motivated')
  if (types.includes('code_violation') && types.includes('building_permit'))
    notes.push('Violation + permit — owner tried to fix but may have run out of money')
  if (signals.some(s => s.severity === 'critical'))
    notes.push('Critical severity — structural/safety issue, owner may not be able to sell retail')

  return notes
}

// ── Main stacking function ─────────────────────────────────────────────────────
export function stackLeads(radarLeads: Lead[]): StackedLead[] {
  // Also pull Drive for Dollars captures
  let d4dLeads: any[] = []
  try {
    d4dLeads = JSON.parse(localStorage.getItem('flipscan_d4d_v1') || '[]')
  } catch {}

  // Build unified signal list
  interface RawSignal {
    address:    string
    city:       string
    state:      string
    zip:        string
    lat:        number | null
    lng:        number | null
    county:     string
    sourceId:   string
    sourceName: string
    signalType: string
    signalLabel:string
    description:string
    severity:   string
    filedDate:  string
    score:      number
  }

  const allSignals: RawSignal[] = []

  // Radar leads
  radarLeads.forEach(l => {
    allSignals.push({
      address:    l.address,
      city:       l.city,
      state:      l.state,
      zip:        l.zip,
      lat:        l.lat,
      lng:        l.lng,
      county:     l.county,
      sourceId:   l.source,
      sourceName: l.source,
      signalType: l.signalType,
      signalLabel:l.signalLabel,
      description:l.description,
      severity:   l.severity,
      filedDate:  l.filedDate,
      score:      l.investorScore,
    })
  })

  // Drive for Dollars captures
  d4dLeads.forEach((cap: any) => {
    if (!cap.address) return
    allSignals.push({
      address:    cap.address,
      city:       cap.city || '',
      state:      cap.state || '',
      zip:        cap.zip || '',
      lat:        null,
      lng:        null,
      county:     '',
      sourceId:   'drive_for_dollars',
      sourceName: 'Drive for Dollars',
      signalType: 'code_violation',
      signalLabel:'Drive for Dollars — Field Observation',
      description:cap.notes || 'Visual distress observed while driving',
      severity:   'medium',
      filedDate:  cap.capturedAt?.split('T')[0] || '',
      score:      cap.motivation?.score || 50,
    })
  })

  // Group by normalized address + city+state
  const groups = new Map<string, RawSignal[]>()

  allSignals.forEach(sig => {
    const normAddr = normalizeAddress(sig.address)
    const ck       = cityKey(sig.city, sig.state)
    const key      = `${normAddr}::${ck}`
    if (!key.trim() || normAddr.length < 3) return
    if (!groups.has(key)) groups.set(key, [])
    const group = groups.get(key)!
    // Deduplicate exact same source+type+date
    const isDupe = group.some(
      s => s.sourceId === sig.sourceId && s.signalType === sig.signalType && s.filedDate === sig.filedDate
    )
    if (!isDupe) group.push(sig)
  })

  // Build stacked leads
  const stacked: StackedLead[] = []

  groups.forEach((sigs, key) => {
    const primary = sigs[0]
    const signals: StackSignal[] = sigs.map(s => ({
      sourceId:    s.sourceId,
      sourceName:  s.sourceName,
      signalType:  s.signalType,
      signalLabel: s.signalLabel,
      description: s.description,
      severity:    s.severity,
      filedDate:   s.filedDate,
      score:       s.score,
    }))

    const stackScore = computeStackScore(signals)
    const tier: StackedLead['tier'] =
      signals.length >= 3 ? 'triple+' :
      signals.length >= 2 ? 'double'  : 'single'

    stacked.push({
      id:              `stack-${key.replace(/[^a-z0-9]/gi, '-').slice(0,40)}`,
      address:         primary.address,
      city:            primary.city,
      state:           primary.state,
      zip:             primary.zip,
      signals,
      signalCount:     signals.length,
      stackScore,
      tier,
      lat:             sigs.find(s => s.lat)?.lat || null,
      lng:             sigs.find(s => s.lng)?.lng || null,
      county:          primary.county,
      distressSummary: buildDistressSummary(signals),
      investorNotes:   buildInvestorNotes(signals),
      firstSeen:       signals.reduce((min, s) => s.filedDate < min ? s.filedDate : min, signals[0].filedDate),
      lastSeen:        signals.reduce((max, s) => s.filedDate > max ? s.filedDate : max, signals[0].filedDate),
    })
  })

  // Sort: tier desc, then score desc
  return stacked.sort((a, b) => {
    const tierOrder = { 'triple+': 0, 'double': 1, 'single': 2 }
    const td = tierOrder[a.tier] - tierOrder[b.tier]
    if (td !== 0) return td
    return b.stackScore - a.stackScore
  })
}
