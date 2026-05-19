/**
 * DataFusion Engine — FlipScan Pro
 *
 * Takes raw leads from multiple providers, deduplicates by address,
 * cross-references signals, and produces a single unified FusedLead
 * with a combined confidence score.
 *
 * The logic:
 *   1. Normalize every provider's format into a common RawLead
 *   2. Match records by address (fuzzy match — handles "St" vs "Street")
 *   3. Merge matched records, layering in each provider's unique data
 *   4. Score: more providers agreeing = higher confidence + higher score
 *   5. Rank by fusion score descending
 *
 * Example:
 *   ATTOM says: pre-foreclosure, 42% equity
 *   BatchLeads says: absentee owner, tax delinquent, phone: 555-1234
 *   RentCast says: 87 days on market, listed at $195k
 *   → FusedLead: address confirmed by 3 sources, all signals merged,
 *     owner phone from BatchLeads, price from RentCast, equity from ATTOM
 *     → fusion score 94/100
 */

export interface RawLead {
  // Identity
  id: string
  source: string
  sourceLabel: string
  rawData: any

  // Location
  addr: string           // "123 Main St"
  addrFull: string       // "123 Main St, Norfolk, VA 23501"
  city: string
  state: string
  zip: string
  lat?: number
  lng?: number
  county?: string

  // Property
  price: number
  estimatedValue?: number
  beds: number
  baths: number
  sqft: number
  yearBuilt?: number
  propertyType?: string
  lotSize?: number

  // Financials
  equity?: number
  equityPct?: number
  mortgageBalance?: number
  assessedValue?: number
  lastSalePrice?: number
  lastSaleDate?: string
  hoaFee?: number

  // Owner
  ownerName?: string
  ownerPhone?: string
  ownerEmail?: string
  ownerMailing?: string
  ownerOccupied?: boolean
  absenteeOwner?: boolean
  yearsOwned?: number

  // Distress signals
  preForeclosure?: boolean
  foreclosure?: boolean
  shortSale?: boolean
  taxDelinquent?: boolean
  taxOwed?: number
  lien?: boolean
  vacant?: boolean
  codeViolation?: boolean
  bankruptcy?: boolean
  divorce?: boolean
  probate?: boolean
  priceReduced?: boolean

  // Market
  daysOnMarket?: number
  dom?: number
  listedDate?: string
  mlsNumber?: string
  listingType?: string

  // Scores (provider-supplied)
  motivationScore?: number
  distressScore?: number
  batchRankScore?: number

  signals: string[]
}

export interface FusedLead {
  // Fusion metadata
  fusionId: string
  fusionScore: number        // 0–100, our combined confidence score
  sourcesCount: number       // how many providers confirmed this property
  sources: string[]          // ['attom', 'batchleads', 'rentcast']
  sourceLabels: string[]
  conflictsDetected: string[] // e.g. "Price differs: ATTOM $195k vs BatchLeads $210k"
  fusedAt: string

  // Best-available data (winner from each provider)
  addr: string
  addrFull: string
  city: string
  state: string
  zip: string
  lat?: number
  lng?: number
  county?: string

  // Property (best available, prefer MLS > ATTOM > other)
  price: number
  estimatedValue?: number
  beds: number
  baths: number
  sqft: number
  yearBuilt?: number
  propertyType?: string
  lotSize?: number

  // Financials (best available)
  equity?: number
  equityPct?: number
  assessedValue?: number
  lastSalePrice?: number
  lastSaleDate?: string

  // Owner (merged from all sources — BatchLeads has best contact data)
  ownerName?: string
  ownerPhone?: string
  ownerEmail?: string
  ownerMailing?: string
  ownerOccupied?: boolean
  absenteeOwner?: boolean
  yearsOwned?: number

  // All distress signals (union of all providers)
  preForeclosure: boolean
  foreclosure: boolean
  shortSale: boolean
  taxDelinquent: boolean
  taxOwed?: number
  lien: boolean
  vacant: boolean
  codeViolation: boolean
  bankruptcy: boolean
  priceReduced: boolean

  // Market data (best available — prefer RentCast/MLS)
  daysOnMarket?: number
  listedDate?: string
  mlsNumber?: string
  listingType?: string

  // All signals merged and deduplicated
  signals: string[]

  // Deal analysis
  distressSignalCount: number
  contactInfoComplete: boolean
  hasPhoneNumber: boolean
  hasEmailAddress: boolean
  hasOwnerAddress: boolean

  // Raw data from each provider
  rawBySource: Record<string, any>
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDRESS NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

const ABBREVS: Record<string, string> = {
  'street': 'st', 'avenue': 'ave', 'boulevard': 'blvd', 'drive': 'dr',
  'road': 'rd', 'lane': 'ln', 'court': 'ct', 'place': 'pl', 'circle': 'cir',
  'trail': 'trl', 'way': 'wy', 'terrace': 'ter', 'parkway': 'pkwy',
  'north': 'n', 'south': 's', 'east': 'e', 'west': 'w',
  'northwest': 'nw', 'northeast': 'ne', 'southwest': 'sw', 'southeast': 'se',
  'apartment': 'apt', 'suite': 'ste', 'unit': 'unit', 'floor': 'fl',
}

function normalizeAddr(addr: string): string {
  if (!addr) return ''
  let a = addr.toLowerCase().trim()
  // Replace punctuation
  a = a.replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim()
  // Expand abbreviations to canonical form
  Object.entries(ABBREVS).forEach(([full, abbr]) => {
    a = a.replace(new RegExp(`\\b${full}\\b`, 'g'), abbr)
    a = a.replace(new RegExp(`\\b${abbr}\\.?\\b`, 'g'), abbr)
  })
  return a.trim()
}

function addressKey(lead: RawLead): string {
  // Primary key: normalized street + zip (most reliable)
  const street = normalizeAddr(lead.addr)
  const zip    = (lead.zip || '').replace(/\D/g, '').slice(0, 5)
  if (street && zip) return `${street}::${zip}`

  // Fallback: street + city + state
  const city  = (lead.city || '').toLowerCase().trim()
  const state = (lead.state || '').toUpperCase().trim()
  if (street && city) return `${street}::${city}::${state}`

  // Last resort: full address normalized
  return normalizeAddr(lead.addrFull || lead.addr)
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

function addressMatch(a: RawLead, b: RawLead): boolean {
  const ka = addressKey(a)
  const kb = addressKey(b)
  if (ka === kb) return true
  // Fuzzy match: within edit distance 3 for similar addresses
  if (ka.slice(0, 5) === kb.slice(0, 5)) {  // same zip prefix
    return levenshtein(ka, kb) <= 3
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// RAW LEAD NORMALIZER
// Converts any provider's JSON into a standard RawLead
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeToRawLead(item: any, source: string, sourceLabel: string): RawLead | null {
  // Extract address pieces
  const addr   = item.address || item.formattedAddress || item.propertyAddress
                 || item.Address || item.streetAddress || item.street_address
                 || `${item.addressLine1 || item.address1 || ''} ${item.addressLine2 || ''}`.trim()
  const city   = item.city   || item.City   || item.propertyCity   || ''
  const state  = item.state  || item.State  || item.propertyState  || ''
  const zip    = (item.zip   || item.zipCode || item.ZipCode || item.postalCode || item.zip_code || '').toString().slice(0, 5)

  if (!addr && !item.latitude) return null  // skip records with no location

  const addrFull = item.formattedAddress
    || `${addr}${city ? ', ' + city : ''}${state ? ', ' + state : ''}${zip ? ' ' + zip : ''}`.trim()

  // Price / value
  const price = pick(item,
    'price', 'listPrice', 'list_price', 'estimatedValue', 'estimated_value',
    'assessedValue', 'marketValue', 'market_value', 'appraisedValue'
  ) || 0

  // Financials
  const equity    = pick(item, 'equity', 'equityAmount', 'equity_amount') || 0
  const equityRaw = pick(item, 'equityPercent', 'equityPercentage', 'equity_percent') || 0
  const ltv       = pick(item, 'ltv', 'LTV', 'loanToValue') || 0
  const equityPct = equityRaw || (ltv ? 100 - ltv : equity && price ? (equity / price) * 100 : 0)

  // Owner contact
  const ownerName  = item.ownerName  || item.owner?.name  || item.Owner      || item['Owner Name']  || item.owner_name  || ''
  const ownerPhone = item.ownerPhone || item.owner?.phone || item.phone       || item.phoneNumber    || item.phone_number || ''
  const ownerEmail = item.ownerEmail || item.owner?.email || item.email       || item.emailAddress   || item.email_address || ''

  // Distress signals
  const preForeclosure = !!(item.preForeclosure || item.pre_foreclosure || item.nod || item.lis_pendens || item.lisPendens)
  const foreclosure    = !!(item.foreclosure || item.isForeclosure || item.reo || item.bankOwned || item.bank_owned)
  const shortSale      = !!(item.shortSale    || item.short_sale    || item.is_short_sale)
  const taxDelinquent  = !!(item.taxDelinquent || item.tax_delinquent || item.isDelinquent)
  const taxOwed        = pick(item, 'taxDelinquentAmount', 'taxOwed', 'tax_owed', 'delinquentTaxes') || 0
  const vacant         = !!(item.vacant || item.isVacant || item.vacancyFlag || item.vacancy_flag)
  const absentee       = !!(item.absenteeOwner || item.absentee_owner || item.absentee || item.isAbsentee)
  const lien           = !!(item.lien || item.hasLien || item.lien_amount)
  const codeViolation  = !!(item.codeViolation || item.code_violation || item.violation)
  const bankruptcy     = !!(item.bankruptcy || item.isBankruptcy || item.bk)
  const priceReduced   = !!(item.priceReduced || item.price_reduced || item.priceChangedDate)

  // Build signals
  const signals: string[] = []
  if (foreclosure)   signals.push('🔨 Foreclosure / Bank-Owned')
  if (preForeclosure) signals.push('⚠️ Pre-Foreclosure / NOD Filed')
  if (shortSale)     signals.push('📉 Short Sale')
  if (taxDelinquent) signals.push(`💸 Tax Delinquent${taxOwed > 0 ? ` — $${Math.round(taxOwed).toLocaleString()}` : ''}`)
  if (vacant)        signals.push('🏚️ Vacant Property')
  if (absentee)      signals.push('📭 Absentee Owner')
  if (lien)          signals.push('🔗 Lien on Property')
  if (codeViolation) signals.push('🚧 Code Violation')
  if (bankruptcy)    signals.push('⚖️ Bankruptcy Filing')
  if (priceReduced)  signals.push('⬇️ Price Reduced')
  if (equityPct > 40) signals.push(`💰 ${Math.round(equityPct)}% Equity`)
  if (ownerPhone)    signals.push('📞 Owner Phone Available')
  if (ownerEmail)    signals.push('✉️ Owner Email Available')
  if ((item.daysOnMarket || item.dom || 0) > 60)
    signals.push(`⏰ ${item.daysOnMarket || item.dom}d on Market`)

  return {
    id: `${source}-${item.id || item.propertyId || item.parcelId || Math.random().toString(36).slice(2)}`,
    source, sourceLabel, rawData: item,
    addr, addrFull, city, state, zip,
    lat: item.latitude  || item.lat,
    lng: item.longitude || item.lng || item.lon,
    county: item.county || item.County,
    price,
    estimatedValue: pick(item, 'estimatedValue', 'estimated_value', 'avm', 'avmValue') || 0,
    beds: pick(item, 'bedrooms', 'beds', 'Bedrooms') || 0,
    baths: pick(item, 'bathrooms', 'baths', 'Bathrooms') || 0,
    sqft: pick(item, 'squareFootage', 'sqft', 'livingArea', 'living_area', 'SquareFootage') || 0,
    yearBuilt: pick(item, 'yearBuilt', 'year_built', 'YearBuilt'),
    propertyType: item.propertyType || item.property_type || item.PropertyType,
    lotSize: pick(item, 'lotSize', 'lot_size', 'LotSize'),
    equity, equityPct,
    mortgageBalance: pick(item, 'mortgageBalance', 'mortgage_balance', 'loanBalance'),
    assessedValue: pick(item, 'assessedValue', 'assessed_value', 'taxAssessedValue'),
    lastSalePrice: pick(item, 'lastSalePrice', 'last_sale_price', 'salePrice'),
    lastSaleDate: item.lastSaleDate || item.last_sale_date || item.saleDate,
    ownerName, ownerPhone, ownerEmail,
    ownerMailing: item.ownerMailingAddress || item.owner_mailing_address || item.mailingAddress,
    ownerOccupied: item.ownerOccupied || item.owner_occupied,
    absenteeOwner: absentee,
    yearsOwned: pick(item, 'yearsOwned', 'years_owned', 'ownershipYears'),
    preForeclosure, foreclosure, shortSale, taxDelinquent, taxOwed,
    lien, vacant, codeViolation, bankruptcy, priceReduced,
    daysOnMarket: item.daysOnMarket || item.dom || item.days_on_market,
    listedDate: item.listedDate || item.listed_date || item.listDate,
    mlsNumber: item.mlsNumber || item.mls_number || item.mlsId,
    listingType: item.listingType || item.listing_type,
    motivationScore: pick(item, 'motivationScore', 'motivation_score'),
    distressScore: pick(item, 'distressScore', 'distress_score'),
    batchRankScore: pick(item, 'batchRankScore', 'batch_rank', 'batchRank'),
    signals,
  }
}

function pick(obj: any, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (v !== null && v !== undefined && v !== '') {
      const n = parseFloat(v)
      if (!isNaN(n)) return n
    }
  }
  return undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// FUSION SCORING
// ─────────────────────────────────────────────────────────────────────────────

function calcFusionScore(leads: RawLead[]): number {
  let score = 0

  // Multi-source confirmation bonus (40 pts max)
  const n = leads.length
  if (n >= 3) score += 40
  else if (n === 2) score += 25
  else score += 0

  // Distress signal count (30 pts max)
  const distressFlags = [
    'preForeclosure', 'foreclosure', 'shortSale', 'taxDelinquent',
    'vacant', 'lien', 'codeViolation', 'bankruptcy'
  ] as const
  const distressCount = distressFlags.filter(f => leads.some(l => l[f])).length
  score += Math.min(30, distressCount * 8)

  // Contact data quality (15 pts max)
  const hasPhone = leads.some(l => l.ownerPhone)
  const hasEmail = leads.some(l => l.ownerEmail)
  if (hasPhone) score += 8
  if (hasEmail) score += 7

  // Financial data quality (10 pts max)
  const hasEquity = leads.some(l => (l.equityPct || 0) > 0)
  const hasPrice  = leads.some(l => l.price > 0)
  if (hasEquity) score += 5
  if (hasPrice)  score += 5

  // Provider-supplied motivation scores (5 pts max)
  const extScores = leads.map(l => l.motivationScore || l.distressScore || l.batchRankScore || 0).filter(s => s > 0)
  if (extScores.length) score += Math.min(5, Math.round((extScores.reduce((a, b) => a + b, 0) / extScores.length) / 20))

  return Math.min(100, Math.max(0, Math.round(score)))
}

// ─────────────────────────────────────────────────────────────────────────────
// MERGE LEADS
// Takes all RawLeads for the same property and merges them into one FusedLead
// ─────────────────────────────────────────────────────────────────────────────

function mergeLeads(group: RawLead[]): FusedLead {
  // Sort by source priority: prefer MLS/RentCast for price, ATTOM for equity, BatchLeads for contacts
  const priorityOrder = ['rentcast', 'attom', 'batchleads', 'propstream', 'resimpli', 'dealmachine', 'custom']
  const sorted = [...group].sort((a, b) =>
    priorityOrder.indexOf(a.source) - priorityOrder.indexOf(b.source)
  )

  // Best address: longest / most complete
  const bestAddr = sorted.reduce((best, l) =>
    (l.addrFull?.length || 0) > (best.addrFull?.length || 0) ? l : best
  )

  // Best price: prefer MLS/active listing price
  const mlsLead   = sorted.find(l => l.mlsNumber || l.listingType)
  const priceWinner = mlsLead || sorted.find(l => l.price > 0) || sorted[0]

  // Best contact: BatchLeads has highest skip-trace accuracy
  const blLead     = sorted.find(l => l.source === 'batchleads')
  const contactWinner = blLead || sorted.find(l => l.ownerPhone || l.ownerEmail) || sorted[0]

  // Best equity: ATTOM or any source with equity data
  const equityWinner = sorted.find(l => (l.equityPct || 0) > 0) || sorted[0]

  // Detect conflicts
  const conflicts: string[] = []
  const prices = sorted.map(l => l.price).filter(p => p > 0)
  if (prices.length > 1) {
    const min = Math.min(...prices), max = Math.max(...prices)
    if (max / min > 1.15) {  // > 15% variance = flag it
      conflicts.push(`Price varies by ${Math.round((max/min - 1) * 100)}%: ${prices.map(p => '$' + Math.round(p/1000) + 'k').join(' vs ')}`)
    }
  }

  // Union of all signals, deduplicated
  const allSignals = [...new Set(sorted.flatMap(l => l.signals))]

  // Union of all distress flags
  const anyTrue = (key: keyof RawLead) => sorted.some(l => l[key] === true)

  const contactInfoComplete = !!(
    contactWinner.ownerPhone && contactWinner.ownerEmail && contactWinner.ownerName
  )

  const distressSignalCount = [
    anyTrue('preForeclosure'), anyTrue('foreclosure'), anyTrue('shortSale'),
    anyTrue('taxDelinquent'), anyTrue('vacant'), anyTrue('lien'),
    anyTrue('codeViolation'), anyTrue('bankruptcy'),
  ].filter(Boolean).length

  // Fusion score
  const fusionScore = calcFusionScore(sorted)

  return {
    fusionId: `fused-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fusionScore,
    sourcesCount: sorted.length,
    sources: sorted.map(l => l.source),
    sourceLabels: sorted.map(l => l.sourceLabel),
    conflictsDetected: conflicts,
    fusedAt: new Date().toISOString(),

    addr: bestAddr.addr,
    addrFull: bestAddr.addrFull,
    city: bestAddr.city,
    state: bestAddr.state,
    zip: bestAddr.zip,
    lat: sorted.find(l => l.lat)?.lat,
    lng: sorted.find(l => l.lng)?.lng,
    county: sorted.find(l => l.county)?.county,

    price: priceWinner.price,
    estimatedValue: equityWinner.estimatedValue || priceWinner.estimatedValue,
    beds: sorted.find(l => l.beds > 0)?.beds || 0,
    baths: sorted.find(l => l.baths > 0)?.baths || 0,
    sqft: sorted.find(l => l.sqft > 0)?.sqft || 0,
    yearBuilt: sorted.find(l => l.yearBuilt)?.yearBuilt,
    propertyType: sorted.find(l => l.propertyType)?.propertyType,
    lotSize: sorted.find(l => l.lotSize)?.lotSize,

    equity: equityWinner.equity,
    equityPct: equityWinner.equityPct,
    assessedValue: sorted.find(l => l.assessedValue)?.assessedValue,
    lastSalePrice: sorted.find(l => l.lastSalePrice)?.lastSalePrice,
    lastSaleDate: sorted.find(l => l.lastSaleDate)?.lastSaleDate,

    ownerName: contactWinner.ownerName,
    ownerPhone: contactWinner.ownerPhone,
    ownerEmail: contactWinner.ownerEmail,
    ownerMailing: contactWinner.ownerMailing,
    ownerOccupied: sorted.find(l => l.ownerOccupied !== undefined)?.ownerOccupied,
    absenteeOwner: anyTrue('absenteeOwner'),
    yearsOwned: sorted.find(l => l.yearsOwned)?.yearsOwned,

    preForeclosure: anyTrue('preForeclosure'),
    foreclosure:    anyTrue('foreclosure'),
    shortSale:      anyTrue('shortSale'),
    taxDelinquent:  anyTrue('taxDelinquent'),
    taxOwed: sorted.reduce((max, l) => Math.max(max, l.taxOwed || 0), 0) || undefined,
    lien:           anyTrue('lien'),
    vacant:         anyTrue('vacant'),
    codeViolation:  anyTrue('codeViolation'),
    bankruptcy:     anyTrue('bankruptcy'),
    priceReduced:   anyTrue('priceReduced'),

    daysOnMarket: sorted.find(l => l.daysOnMarket)?.daysOnMarket,
    listedDate: sorted.find(l => l.listedDate)?.listedDate,
    mlsNumber: sorted.find(l => l.mlsNumber)?.mlsNumber,
    listingType: sorted.find(l => l.listingType)?.listingType,

    signals: allSignals,
    distressSignalCount,
    contactInfoComplete,
    hasPhoneNumber: !!(contactWinner.ownerPhone),
    hasEmailAddress: !!(contactWinner.ownerEmail),
    hasOwnerAddress: !!(contactWinner.ownerMailing),

    rawBySource: Object.fromEntries(sorted.map(l => [l.source, l.rawData])),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT: fuse()
// Input:  raw JSON from any number of providers
// Output: deduplicated, merged, scored FusedLead[]
// ─────────────────────────────────────────────────────────────────────────────

export interface FuseInput {
  source: string
  sourceLabel: string
  data: any   // raw API response
}

export interface FuseResult {
  leads: FusedLead[]
  stats: {
    totalRaw: number
    totalUnique: number
    multiSourceMatches: number    // properties found in 2+ sources
    tripleSourceMatches: number   // properties found in 3+ sources
    withPhoneNumber: number
    withEmailAddress: number
    highConfidence: number        // fusion score >= 70
    distressSignals: Record<string, number>
    sourceBreakdown: Record<string, number>
    conflictsFound: number
    processingMs: number
  }
}

export function fuse(inputs: FuseInput[]): FuseResult {
  const t0 = Date.now()

  // Step 1: Normalize all raw data into RawLead[]
  const allRaw: RawLead[] = []
  const sourceBreakdown: Record<string, number> = {}

  for (const input of inputs) {
    const arr = Array.isArray(input.data)
      ? input.data
      : input.data?.leads || input.data?.properties || input.data?.results
        || input.data?.data || input.data?.records || []

    const normalized = arr
      .map((item: any) => normalizeToRawLead(item, input.source, input.sourceLabel))
      .filter((l: RawLead | null): l is RawLead => l !== null)

    allRaw.push(...normalized)
    sourceBreakdown[input.source] = normalized.length
  }

  // Step 2: Group by address (deduplicate)
  const groups: Map<string, RawLead[]> = new Map()
  const unmatched: RawLead[] = []

  for (const lead of allRaw) {
    const key = addressKey(lead)
    if (!key) { unmatched.push(lead); continue }

    // Check if any existing group matches this lead
    let matched = false
    for (const [gKey, group] of groups) {
      if (gKey === key || addressMatch(lead, group[0])) {
        group.push(lead)
        matched = true
        break
      }
    }
    if (!matched) groups.set(key, [lead])
  }

  // Add unmatched as solo groups
  unmatched.forEach((l, i) => groups.set(`unmatched-${i}`, [l]))

  // Step 3: Merge each group into a FusedLead
  const fused: FusedLead[] = []
  for (const group of groups.values()) {
    fused.push(mergeLeads(group))
  }

  // Step 4: Sort by fusion score descending
  fused.sort((a, b) => b.fusionScore - a.fusionScore)

  // Step 5: Compute stats
  const distressSignals: Record<string, number> = {
    'Pre-Foreclosure': fused.filter(l => l.preForeclosure).length,
    'Foreclosure':     fused.filter(l => l.foreclosure).length,
    'Short Sale':      fused.filter(l => l.shortSale).length,
    'Tax Delinquent':  fused.filter(l => l.taxDelinquent).length,
    'Vacant':          fused.filter(l => l.vacant).length,
    'Absentee Owner':  fused.filter(l => l.absenteeOwner).length,
    'Lien':            fused.filter(l => l.lien).length,
    'Bankruptcy':      fused.filter(l => l.bankruptcy).length,
  }

  return {
    leads: fused,
    stats: {
      totalRaw: allRaw.length,
      totalUnique: fused.length,
      multiSourceMatches: fused.filter(l => l.sourcesCount >= 2).length,
      tripleSourceMatches: fused.filter(l => l.sourcesCount >= 3).length,
      withPhoneNumber: fused.filter(l => l.hasPhoneNumber).length,
      withEmailAddress: fused.filter(l => l.hasEmailAddress).length,
      highConfidence: fused.filter(l => l.fusionScore >= 70).length,
      distressSignals,
      sourceBreakdown,
      conflictsFound: fused.filter(l => l.conflictsDetected.length > 0).length,
      processingMs: Date.now() - t0,
    },
  }
}
