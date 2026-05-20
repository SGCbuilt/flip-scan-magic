/**
 * Market Analyzer — Data Sources
 *
 * Primary:   Claude AI (Anthropic API) — real market analysis for any city/zip
 * Secondary: RentCast Markets API (your existing key) — sale + rental trends
 * Optional:  Census API (free key from api.census.gov/data/key_signup.html)
 * Optional:  FRED API (free key from fred.stlouisfed.org/docs/api/api_key.html)
 *
 * Claude AI powers the core analysis — it has real knowledge of every US market
 * and returns structured JSON with demographics, crime context, development trends,
 * economic conditions, schools, and investor scores for any location.
 */

const RENTCAST_KEY = 'a03153e34276e4d75b0548add458816de'

// Keys stored in localStorage so user sets them once
export function getApiKeys() {
  const lsKey = typeof localStorage !== 'undefined' ? localStorage.getItem('flipscan_anthropic_key') : ''
  const envKey = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_ANTHROPIC_API_KEY : ''
  return {
    census:    typeof localStorage !== 'undefined' ? (localStorage.getItem('flipscan_census_key') || '') : '',
    fred:      typeof localStorage !== 'undefined' ? (localStorage.getItem('flipscan_fred_key') || '') : '',
    anthropic: lsKey || envKey || '',
  }
}
export function saveApiKey(provider: 'census' | 'fred' | 'anthropic', key: string) {
  localStorage.setItem(`flipscan_${provider}_key`, key)
}

async function safeFetch(url: string, opts?: RequestInit): Promise<any> {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// ── 1. Claude AI Market Analysis — primary data source ────────────────────────
export interface AIMarketData {
  // Demographics
  population: number
  populationGrowth: number      // % annual
  medianAge: number
  medianHouseholdIncome: number
  medianHomeValue: number
  ownerOccupancyRate: number
  vacancyRate: number
  unemploymentRate: number
  povertyRate: number
  collegeDegreeRate: number
  avgHouseholdSize: number
  medianRent: number

  // Real estate market
  homeValueChange1yr: number
  homeValueChange3yr: number
  homeValueChange5yr: number
  avgDaysOnMarket: number
  listToSaleRatio: number       // avg sale price / list price %
  inventoryMonths: number
  foreclosureRate: number       // % of sales

  // New development
  newPermitsYoY: number         // % change year over year
  majorDevelopments: string[]   // notable projects in area
  infrastructureProjects: string[]
  zoningTrends: string

  // Crime (relative scale, not rates)
  crimeIndexOverall: number     // 0-100, lower = safer (FBI-based knowledge)
  crimeVsNational: string       // "30% below national average"
  crimeTrend: 'improving' | 'stable' | 'worsening'
  violentCrimeIndex: number
  propertyCrimeIndex: number

  // Schools
  schoolRatingAvg: number       // 1-10
  topSchools: string[]
  schoolDistrictQuality: 'excellent' | 'good' | 'average' | 'poor'

  // Economy
  majorEmployers: string[]
  jobGrowthRate: number
  dominantIndustries: string[]
  economicOutlook: 'strong' | 'stable' | 'uncertain' | 'weak'

  // Investment signals
  investorScore: number
  flipScore: number
  brrrScore: number
  marketType: 'emerging' | 'established' | 'peak' | 'declining' | 'stable'
  signals: string[]
  risks: string[]
  opportunities: string[]
  summary: string

  // Source note
  dataNote: string
}

export async function fetchAIMarketAnalysis(location: string): Promise<AIMarketData | null> {
  const keys = getApiKeys()
  if (!keys.anthropic) return null

  const prompt = `You are a real estate market intelligence expert. Analyze the real estate market for "${location}" and return ONLY a valid JSON object with NO markdown, NO explanation, NO backticks — just the raw JSON.

Return this exact structure with real data you know about this market:

{
  "population": <number>,
  "populationGrowth": <annual % as decimal e.g. 2.3>,
  "medianAge": <number>,
  "medianHouseholdIncome": <number in dollars>,
  "medianHomeValue": <number in dollars>,
  "ownerOccupancyRate": <percentage 0-100>,
  "vacancyRate": <percentage 0-100>,
  "unemploymentRate": <percentage 0-100>,
  "povertyRate": <percentage 0-100>,
  "collegeDegreeRate": <percentage 0-100>,
  "avgHouseholdSize": <number>,
  "medianRent": <monthly dollars>,
  "homeValueChange1yr": <percentage e.g. 4.2 or -1.5>,
  "homeValueChange3yr": <percentage>,
  "homeValueChange5yr": <percentage>,
  "avgDaysOnMarket": <days>,
  "listToSaleRatio": <percentage e.g. 98.5>,
  "inventoryMonths": <months e.g. 2.1>,
  "foreclosureRate": <percentage of sales>,
  "newPermitsYoY": <percentage change>,
  "majorDevelopments": ["<project name>", ...],
  "infrastructureProjects": ["<project>", ...],
  "zoningTrends": "<brief description>",
  "crimeIndexOverall": <0-100 lower=safer>,
  "crimeVsNational": "<e.g. '25% below national average'>",
  "crimeTrend": "<improving|stable|worsening>",
  "violentCrimeIndex": <0-100>,
  "propertyCrimeIndex": <0-100>,
  "schoolRatingAvg": <1-10>,
  "topSchools": ["<school name>", ...],
  "schoolDistrictQuality": "<excellent|good|average|poor>",
  "majorEmployers": ["<employer>", ...],
  "jobGrowthRate": <percentage>,
  "dominantIndustries": ["<industry>", ...],
  "economicOutlook": "<strong|stable|uncertain|weak>",
  "investorScore": <0-100>,
  "flipScore": <0-100>,
  "brrrScore": <0-100>,
  "marketType": "<emerging|established|peak|declining|stable>",
  "signals": ["<opportunity signal>", ...],
  "risks": ["<risk factor>", ...],
  "opportunities": ["<specific opportunity for investors>", ...],
  "summary": "<2-3 sentence market summary for a real estate investor>",
  "dataNote": "AI analysis based on market knowledge through mid-2025. Verify current conditions with local sources."
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': keys.anthropic,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('Anthropic API error:', res.status, errText)
      return null
    }

    const data = await res.json()
    const text = data?.content?.[0]?.text || ''
    if (!text) { console.error('Empty response from Claude'); return null }

    // Strip any accidental markdown fences
    const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    return JSON.parse(clean)
  } catch (e) {
    console.error('Market AI error:', e)
    return null
  }
}

// ── 2. RentCast live market data ──────────────────────────────────────────────
export interface RentCastMarket {
  saleData: {
    averagePrice: number
    medianPrice: number
    averageDaysOnMarket: number
    totalListings: number
    newListings: number
    history: any[]
  } | null
  rentalData: {
    averageRent: number
    medianRent: number
    averageDaysOnMarket: number
    totalListings: number
    history: any[]
  } | null
}

export async function fetchRentCastMarket(zip?: string, city?: string, state?: string): Promise<RentCastMarket | null> {
  const params: Record<string, string> = { dataType: 'All', historyMonths: '18' }
  if (zip) params.zipCode = zip
  else if (city && state) { params.city = city; params.state = state }
  else return null

  const data = await safeFetch(
    `https://api.rentcast.io/v1/markets?${new URLSearchParams(params)}`,
    { headers: { 'X-Api-Key': RENTCAST_KEY } }
  )
  if (!data) return null
  return {
    saleData:   data.saleData   || data.sale   || null,
    rentalData: data.rentalData || data.rental  || null,
  }
}

// ── 3. Optional: Census API ───────────────────────────────────────────────────
export async function fetchCensusData(zip?: string, state?: string, censusKey?: string): Promise<any | null> {
  if (!censusKey || (!zip && !state)) return null
  const vars = 'B01003_001E,B19013_001E,B25077_001E,B25003_002E,B25003_001E,B25002_003E,B25002_001E,B01002_001E,B23025_003E,B23025_002E,B17001_002E,B17001_001E,B25064_001E,B25010_001E'
  const geo = zip
    ? `for=zip+code+tabulation+area:${zip}&in=state:*`
    : `for=state:${STATE_FIPS[state?.toUpperCase() || ''] || '51'}`
  const data = await safeFetch(`https://api.census.gov/data/2023/acs/acs5?get=${vars}&${geo}&key=${censusKey}`)
  return data
}

// ── 4. Optional: FRED API ─────────────────────────────────────────────────────
export async function fetchFREDSeries(seriesId: string, fredKey: string, limit = 24): Promise<any[] | null> {
  if (!fredKey || fredKey === 'YOUR_FRED_API_KEY') return null
  const data = await safeFetch(
    `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${fredKey}&file_type=json&sort_order=desc&limit=${limit}`
  )
  return data?.observations?.filter((o: any) => o.value !== '.') || null
}

// ── 5. Full area analysis ─────────────────────────────────────────────────────
export interface AreaAnalysis {
  location: string
  ai: AIMarketData | null
  rentcast: RentCastMarket | null
  fredMortgageRate: number | null
  errors: string[]
  hasApiKey: boolean
}

export async function analyzeArea(
  zip?: string, city?: string, state?: string
): Promise<AreaAnalysis> {
  const location = zip || [city, state].filter(Boolean).join(', ') || 'Unknown'
  const keys = getApiKeys()
  const errors: string[] = []

  const [aiResult, rentcastResult, fredResult] = await Promise.allSettled([
    fetchAIMarketAnalysis(location),
    fetchRentCastMarket(zip, city, state),
    keys.fred ? fetchFREDSeries('MORTGAGE30US', keys.fred, 1) : Promise.resolve(null),
  ])

  const ai       = aiResult.status       === 'fulfilled' ? aiResult.value       : null
  const rentcast = rentcastResult.status === 'fulfilled' ? rentcastResult.value : null
  const fredObs  = fredResult.status     === 'fulfilled' ? fredResult.value     : null

  if (!ai && !keys.anthropic) errors.push('Add your Anthropic API key in the panel on the left to enable AI analysis')
  if (!ai && keys.anthropic)  errors.push('AI analysis failed — open browser DevTools → Console to see the exact error')
  if (!rentcast)              errors.push('RentCast: no market data for this location — try a nearby city or zip')

  const mortgageRate = fredObs?.length ? parseFloat(fredObs[0].value) : null

  return { location, ai, rentcast, fredMortgageRate: mortgageRate, errors, hasApiKey: !!keys.anthropic }
}

const STATE_FIPS: Record<string, string> = {
  AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',
  FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',
  KY:'21',LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',
  MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',
  NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',
  SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',
  WI:'55',WY:'56',DC:'11',
}
