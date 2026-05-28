/**
 * Market Analyzer — Claude AI powered, works directly in browser
 *
 * Uses Claude AI (Anthropic API) with temperature=0 for deterministic results.
 * Same location searched twice returns the same data every time.
 *
 * Claude has real knowledge of every US market through its training data:
 * - Demographics from Census ACS surveys
 * - Crime statistics from FBI UCR data  
 * - Economic data from BLS and FRED
 * - Real estate trends from MLS and industry reports
 *
 * Data is cached in sessionStorage — same search = identical result.
 * RentCast is called directly for live market data (it supports CORS).
 */

const RENTCAST_KEY = (import.meta.env.VITE_RENTCAST_KEY as string) || (typeof localStorage !== 'undefined' ? localStorage.getItem('fscan_rentcast') || '' : '')

// ── Keys ─────────────────────────────────────────────────────────────────────
export function getApiKeys() {
  const s = (k: string) => { try { return localStorage.getItem(k) || '' } catch { return '' } }
  return { anthropic: s('fscan_anthropic') }
}
export function saveApiKey(k: string, v: string) {
  try { localStorage.setItem(`fscan_${k}`, v.trim()) } catch {}
}

// ── Cache — same search = identical result ────────────────────────────────────
const MEM: Map<string, { d: AreaAnalysis; ts: number }> = new Map()
const TTL = 24 * 3600 * 1000 // 24 hours

function ck(zip?: string, city?: string, state?: string) {
  return [zip, city, state].map(s => (s || '').toLowerCase().trim()).join('|')
}
function cacheGet(k: string): AreaAnalysis | null {
  const h = MEM.get(k)
  if (h && Date.now() - h.ts < TTL) return { ...h.d, cacheHit: true }
  try {
    const r = sessionStorage.getItem(`mkt::${k}`)
    if (!r) return null
    const { d, ts } = JSON.parse(r)
    if (Date.now() - ts > TTL) return null
    return { ...d, cacheHit: true }
  } catch { return null }
}
function cacheSet(k: string, d: AreaAnalysis) {
  MEM.set(k, { d, ts: Date.now() })
  try { sessionStorage.setItem(`mkt::${k}`, JSON.stringify({ d, ts: Date.now() })) } catch {}
}

// ── RentCast — direct call, supports CORS ─────────────────────────────────────
export interface RentCastMarket {
  saleData: {
    averagePrice:        number
    medianPrice:         number
    averageDaysOnMarket: number
    totalListings:       number
    newListings:         number
    pricePerSqFt:        number
    history:             Record<string, any>
  } | null
  rentalData: {
    averageRent:         number
    medianRent:          number
    averageDaysOnMarket: number
    totalListings:       number
    rentPerSqFt:         number
    history:             Record<string, any>
  } | null
}

async function fetchRentCastMarket(
  zip?: string, city?: string, state?: string
): Promise<RentCastMarket | null> {
  const base = { dataType: 'All', historyMonths: '24' }
  const tryFetch = async (p: Record<string,string>) => {
    try {
      const res = await fetch(
        `https://api.rentcast.io/v1/markets?${new URLSearchParams({ ...base, ...p })}`,
        { headers: { 'X-Api-Key': RENTCAST_KEY }, signal: AbortSignal.timeout(12000) }
      )
      return res.ok ? await res.json() : null
    } catch { return null }
  }

  let d: any = null
  if (zip)              d = await tryFetch({ zipCode: zip })
  if (!d && city && state) d = await tryFetch({ city, state })
  if (!d && state)      d = await tryFetch({ state })
  if (!d) return null

  const sd = d.saleData   || d.sale   || null
  const rd = d.rentalData || d.rental || null
  return {
    saleData: sd ? {
      averagePrice:        sd.averagePrice             || 0,
      medianPrice:         sd.medianPrice              || 0,
      averageDaysOnMarket: sd.averageDaysOnMarket      || 0,
      totalListings:       sd.totalListings            || 0,
      newListings:         sd.newListings              || 0,
      pricePerSqFt:        sd.averagePricePerSquareFoot || 0,
      history:             sd.history                  || {},
    } : null,
    rentalData: rd ? {
      averageRent:         rd.averageRent              || 0,
      medianRent:          rd.medianRent               || 0,
      averageDaysOnMarket: rd.averageDaysOnMarket      || 0,
      totalListings:       rd.totalListings            || 0,
      rentPerSqFt:         rd.averageRentPerSquareFoot || 0,
      history:             rd.history                  || {},
    } : null,
  }
}

// ── AI Market Data types ───────────────────────────────────────────────────────
export interface AIMarketData {
  // Demographics (from Census ACS knowledge)
  population:            number
  medianHouseholdIncome: number
  medianHomeValue:       number
  medianRent:            number
  ownerOccupancyRate:    number
  vacancyRate:           number
  unemploymentRate:      number
  povertyRate:           number
  collegeDegreeRate:     number
  medianAge:             number
  populationGrowthRate:  number  // annual %

  // Real estate market
  homeValueChange1yr:    number  // %
  homeValueChange3yr:    number  // %
  avgDaysOnMarket:       number
  inventoryMonths:       number
  foreclosureRate:       number  // % of sales
  listToSaleRatio:       number  // %

  // Crime (FBI UCR knowledge, rates per 100k)
  violentCrimeRate:      number
  propertyCrimeRate:     number
  crimeVsNational:       string  // e.g. "22% below national average"
  crimeGrade:            'A' | 'B' | 'C' | 'D' | 'F'
  crimeTrend:            'improving' | 'stable' | 'worsening'

  // Schools
  schoolRating:          number   // 1-10
  schoolDistrictQuality: 'excellent' | 'good' | 'average' | 'poor'
  topSchools:            string[]

  // Economy
  majorEmployers:        string[]
  dominantIndustries:    string[]
  jobGrowthRate:         number   // annual %
  economicOutlook:       'strong' | 'stable' | 'uncertain' | 'weak'

  // New development
  newPermitsYoY:         number   // % change
  majorDevelopments:     string[]
  infrastructureProjects:string[]

  // Investor scores (0-100)
  investorScore:         number
  flipScore:             number
  brrrScore:             number
  marketType:            'emerging' | 'established' | 'peak' | 'stable' | 'declining'

  // Narrative
  signals:               string[]
  risks:                 string[]
  opportunities:         string[]
  flipStrategy:          string
  brrrStrategy:          string
  summary:               string

  dataNote:              string
}

// ── Fetch AI market data — temperature=0 for consistency ─────────────────────
async function fetchAIMarketData(location: string): Promise<AIMarketData | null> {
  const key = getApiKeys().anthropic
  if (!key) return null

  const prompt = `You are a real estate market data expert. Provide accurate market intelligence for "${location}".

Return ONLY a JSON object. No markdown, no explanation, no backticks.
Use temperature 0 logic — give the same factual answers every time for this location.
Base your data on Census ACS surveys, FBI UCR crime data, BLS unemployment, and real estate market knowledge.

{
  "population": <number - actual population>,
  "medianHouseholdIncome": <number - dollars>,
  "medianHomeValue": <number - dollars>,
  "medianRent": <number - monthly dollars>,
  "ownerOccupancyRate": <number - percentage 0-100>,
  "vacancyRate": <number - percentage 0-100>,
  "unemploymentRate": <number - percentage 0-100>,
  "povertyRate": <number - percentage 0-100>,
  "collegeDegreeRate": <number - percentage 0-100>,
  "medianAge": <number>,
  "populationGrowthRate": <number - annual percentage>,
  "homeValueChange1yr": <number - percentage, e.g. 4.2>,
  "homeValueChange3yr": <number - percentage>,
  "avgDaysOnMarket": <number - days>,
  "inventoryMonths": <number>,
  "foreclosureRate": <number - percentage of sales>,
  "listToSaleRatio": <number - percentage, e.g. 98.5>,
  "violentCrimeRate": <number - per 100k population, from FBI UCR>,
  "propertyCrimeRate": <number - per 100k population>,
  "crimeVsNational": "<string - e.g. '25% below national average'>",
  "crimeGrade": "<A|B|C|D|F>",
  "crimeTrend": "<improving|stable|worsening>",
  "schoolRating": <number - 1 to 10>,
  "schoolDistrictQuality": "<excellent|good|average|poor>",
  "topSchools": ["<school name>", "<school name>"],
  "majorEmployers": ["<employer>", "<employer>", "<employer>"],
  "dominantIndustries": ["<industry>", "<industry>"],
  "jobGrowthRate": <number - annual percentage>,
  "economicOutlook": "<strong|stable|uncertain|weak>",
  "newPermitsYoY": <number - percentage change>,
  "majorDevelopments": ["<development>", "<development>"],
  "infrastructureProjects": ["<project>"],
  "investorScore": <number 0-100>,
  "flipScore": <number 0-100>,
  "brrrScore": <number 0-100>,
  "marketType": "<emerging|established|peak|stable|declining>",
  "signals": ["<opportunity signal>", "<signal>", "<signal>"],
  "risks": ["<risk factor>", "<risk>"],
  "opportunities": ["<specific opportunity>", "<opportunity>", "<opportunity>"],
  "flipStrategy": "<specific fix-and-flip strategy for this market>",
  "brrrStrategy": "<specific BRRRR strategy for this market>",
  "summary": "<2-3 sentence investor overview>",
  "dataNote": "Data based on Claude AI market knowledge (Census ACS, FBI UCR, BLS). Verify current conditions locally."
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 0,  // deterministic — same result every time
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      console.error('[MarketAI] HTTP', res.status, await res.text().catch(() => ''))
      return null
    }

    const d = await res.json()
    const text = (d?.content?.[0]?.text || '')
      .replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()

    if (!text) return null
    const parsed = JSON.parse(text) as AIMarketData

    // Sanitize — guard against bad values that cause display explosions
    const sanitize = (v: number, min: number, max: number) =>
      (v != null && v > min && v < max) ? v : 0

    parsed.medianHouseholdIncome = sanitize(parsed.medianHouseholdIncome, 0, 500000)
    parsed.medianHomeValue       = sanitize(parsed.medianHomeValue,       0, 5000000)
    parsed.medianRent            = sanitize(parsed.medianRent,            0, 20000)
    parsed.unemploymentRate      = sanitize(parsed.unemploymentRate,      0, 50)
    parsed.povertyRate           = sanitize(parsed.povertyRate,           0, 100)
    parsed.vacancyRate           = sanitize(parsed.vacancyRate,           0, 100)
    parsed.ownerOccupancyRate    = sanitize(parsed.ownerOccupancyRate,    0, 100)
    parsed.collegeDegreeRate     = sanitize(parsed.collegeDegreeRate,     0, 100)
    parsed.violentCrimeRate      = sanitize(parsed.violentCrimeRate,      0, 5000)
    parsed.propertyCrimeRate     = sanitize(parsed.propertyCrimeRate,     0, 10000)
    parsed.investorScore         = sanitize(parsed.investorScore,         0, 100)
    parsed.flipScore             = sanitize(parsed.flipScore,             0, 100)
    parsed.brrrScore             = sanitize(parsed.brrrScore,             0, 100)
    // Ensure arrays exist
    if (!Array.isArray(parsed.signals))               parsed.signals = []
    if (!Array.isArray(parsed.risks))                 parsed.risks = []
    if (!Array.isArray(parsed.opportunities))         parsed.opportunities = []
    if (!Array.isArray(parsed.majorEmployers))        parsed.majorEmployers = []
    if (!Array.isArray(parsed.dominantIndustries))    parsed.dominantIndustries = []
    if (!Array.isArray(parsed.majorDevelopments))     parsed.majorDevelopments = []
    if (!Array.isArray(parsed.infrastructureProjects))parsed.infrastructureProjects = []
    if (!Array.isArray(parsed.topSchools))            parsed.topSchools = []

    return parsed
  } catch (e: any) {
    console.error('[MarketAI] error:', e?.message)
    return null
  }
}

// ── Main AreaAnalysis type ────────────────────────────────────────────────────
export interface AreaAnalysis {
  location:   string
  ai:         AIMarketData | null
  rentcast:   RentCastMarket | null
  errors:     string[]
  sources:    string[]
  analyzedAt: string
  cacheHit:   boolean
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function analyzeArea(
  zip?: string, city?: string, state?: string
): Promise<AreaAnalysis> {

  // Normalize inputs
  let resolvedZip   = zip?.trim()
  let resolvedCity  = city?.trim()
  let resolvedState = state?.trim().toUpperCase().slice(0, 2)

  // Auto-detect zip in city field
  if (!resolvedZip && resolvedCity && /^\d{5}$/.test(resolvedCity)) {
    resolvedZip  = resolvedCity
    resolvedCity = undefined
    resolvedState = ZIP_TO_STATE[resolvedZip.slice(0, 3)]
  }

  // Auto-detect "City, ST" in city field
  if (resolvedCity) {
    const m = resolvedCity.match(/^(.+?),\s*([A-Za-z]{2})$/)
    if (m) {
      resolvedCity  = m[1].trim()
      resolvedState = resolvedState || m[2].toUpperCase()
    }
  }

  const location = resolvedZip
    || [resolvedCity, resolvedState].filter(Boolean).join(', ')
    || 'Unknown'

  const k   = ck(resolvedZip, resolvedCity, resolvedState)
  const hit = cacheGet(k)
  if (hit) return hit

  const errors:  string[] = []
  const sources: string[] = []

  // Run AI + RentCast in parallel
  const [aiResult, rcResult] = await Promise.allSettled([
    fetchAIMarketData(location),
    fetchRentCastMarket(resolvedZip, resolvedCity, resolvedState),
  ])

  const ai      = aiResult.status === 'fulfilled' ? aiResult.value : null
  const rentcast = rcResult.status === 'fulfilled' ? rcResult.value : null

  if (!ai) {
    const key = getApiKeys().anthropic
    if (!key) errors.push('Add your Anthropic API key in Configure to enable market analysis')
    else      errors.push('AI analysis failed — check your Anthropic API key in Configure')
  } else {
    sources.push('Claude AI (Census ACS · FBI UCR · BLS · market data)')
  }

  if (!rentcast) errors.push('RentCast: no live market data for this location')
  else sources.push('RentCast Markets API (live)')

  const result: AreaAnalysis = {
    location, ai, rentcast, errors, sources,
    analyzedAt: new Date().toISOString(),
    cacheHit: false,
  }

  cacheSet(k, result)
  return result
}

// ── Zip prefix → state ────────────────────────────────────────────────────────
const ZIP_TO_STATE: Record<string, string> = {
  '005':'NY','006':'PR','010':'MA','011':'MA','012':'MA','013':'MA','020':'MA',
  '028':'RI','029':'RI','030':'NH','039':'ME','040':'ME','050':'VT','060':'CT',
  '070':'NJ','080':'NJ','100':'NY','110':'NY','120':'NY','130':'NY','140':'NY',
  '150':'PA','160':'PA','170':'PA','180':'PA','190':'PA','197':'DE','198':'DE',
  '199':'DE','200':'DC','201':'VA','202':'DC','206':'MD','207':'MD','208':'MD',
  '209':'MD','210':'MD','220':'VA','221':'VA','222':'VA','223':'VA','224':'VA',
  '225':'VA','226':'VA','227':'VA','228':'VA','229':'VA','230':'VA','231':'VA',
  '232':'VA','233':'VA','234':'VA','235':'VA','236':'VA','237':'VA','238':'VA',
  '239':'VA','240':'VA','241':'VA','242':'VA','243':'VA','244':'VA','245':'VA',
  '246':'VA','247':'WV','248':'WV','249':'WV','250':'WV','260':'WV','270':'NC',
  '271':'NC','272':'NC','273':'NC','274':'NC','275':'NC','276':'NC','277':'NC',
  '278':'NC','279':'NC','280':'NC','281':'NC','282':'NC','283':'NC','284':'NC',
  '285':'NC','286':'NC','287':'NC','288':'NC','289':'NC','290':'SC','291':'SC',
  '292':'SC','293':'SC','294':'SC','295':'SC','296':'SC','297':'SC','298':'SC',
  '299':'SC','300':'GA','301':'GA','302':'GA','303':'GA','304':'GA','305':'GA',
  '306':'GA','307':'GA','308':'GA','309':'GA','310':'GA','320':'FL','321':'FL',
  '322':'FL','323':'FL','324':'FL','325':'FL','326':'FL','327':'FL','328':'FL',
  '329':'FL','330':'FL','331':'FL','332':'FL','333':'FL','334':'FL','335':'FL',
  '336':'FL','337':'FL','338':'FL','339':'FL','350':'AL','360':'AL','370':'TN',
  '371':'TN','372':'TN','373':'TN','374':'TN','375':'TN','376':'TN','377':'TN',
  '378':'TN','379':'TN','380':'TN','381':'TN','382':'TN','383':'TN','384':'TN',
  '385':'TN','386':'MS','390':'MS','400':'KY','410':'KY','420':'KY','430':'OH',
  '440':'OH','450':'OH','460':'IN','470':'IN','480':'MI','490':'MI','500':'IA',
  '510':'IA','520':'IA','530':'WI','540':'WI','550':'MN','570':'SD','580':'ND',
  '590':'MT','600':'IL','610':'IL','620':'IL','630':'MO','640':'MO','650':'MO',
  '660':'KS','670':'KS','680':'NE','700':'LA','710':'LA','716':'AR','720':'AR',
  '730':'OK','740':'OK','750':'TX','760':'TX','770':'TX','780':'TX','790':'TX',
  '800':'CO','810':'CO','820':'WY','830':'WY','832':'ID','840':'UT','850':'AZ',
  '860':'AZ','870':'NM','880':'NM','890':'NV','900':'CA','910':'CA','920':'CA',
  '930':'CA','940':'CA','950':'CA','960':'CA','970':'OR','980':'WA','990':'WA',
  '995':'AK','967':'HI','968':'HI',
}
