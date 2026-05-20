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

function buildMarketPrompt(location: string): string {
  return `You are a real estate market intelligence expert. Analyze the real estate market for "${location}" and return ONLY a valid JSON object — no markdown, no explanation, no backticks, just raw JSON.

Use your knowledge to provide real, accurate estimates for this specific location. If it is a zip code, identify the city/neighborhood it belongs to.

Return exactly this structure:
{
  "population": 0,
  "populationGrowth": 0.0,
  "medianAge": 0,
  "medianHouseholdIncome": 0,
  "medianHomeValue": 0,
  "ownerOccupancyRate": 0.0,
  "vacancyRate": 0.0,
  "unemploymentRate": 0.0,
  "povertyRate": 0.0,
  "collegeDegreeRate": 0.0,
  "avgHouseholdSize": 0.0,
  "medianRent": 0,
  "homeValueChange1yr": 0.0,
  "homeValueChange3yr": 0.0,
  "homeValueChange5yr": 0.0,
  "avgDaysOnMarket": 0,
  "listToSaleRatio": 0.0,
  "inventoryMonths": 0.0,
  "foreclosureRate": 0.0,
  "newPermitsYoY": 0.0,
  "majorDevelopments": ["string"],
  "infrastructureProjects": ["string"],
  "zoningTrends": "string",
  "crimeIndexOverall": 0,
  "crimeVsNational": "string",
  "crimeTrend": "stable",
  "violentCrimeIndex": 0,
  "propertyCrimeIndex": 0,
  "schoolRatingAvg": 0.0,
  "topSchools": ["string"],
  "schoolDistrictQuality": "good",
  "majorEmployers": ["string"],
  "jobGrowthRate": 0.0,
  "dominantIndustries": ["string"],
  "economicOutlook": "stable",
  "investorScore": 0,
  "flipScore": 0,
  "brrrScore": 0,
  "marketType": "stable",
  "signals": ["string"],
  "risks": ["string"],
  "opportunities": ["string"],
  "summary": "string",
  "dataNote": "AI analysis based on training data through early 2025. Verify with local sources."
}`
}

export async function fetchAIMarketAnalysis(location: string): Promise<AIMarketData | null> {
  try {
    // Route through the Lovable Cloud edge function — key stays server-side, no CORS.
    const { supabase } = await import('@/integrations/supabase/client')
    const { data, error } = await supabase.functions.invoke('ai-analysis', {
      body: { prompt: buildMarketPrompt(location), provider: 'claude' },
    })

    if (error) {
      console.error('[MarketAnalyzer] edge function error:', error.message)
      return null
    }
    const text = data?.text || ''
    if (!text) { console.error('[MarketAnalyzer] Empty AI response'); return null }

    // Strip markdown fences if Claude added any
    const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    const parsed = JSON.parse(clean)
    return parsed as AIMarketData
  } catch (e: any) {
    console.error('[MarketAnalyzer] AI error:', e?.message || e)
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
  const tryFetch = async (params: Record<string, string>) => {
    const data = await safeFetch(
      `https://api.rentcast.io/v1/markets?${new URLSearchParams({ ...params, dataType: 'All', historyMonths: '18' })}`,
      { headers: { 'X-Api-Key': RENTCAST_KEY } }
    )
    return data
  }

  let data: any = null

  // Try zip first, then city+state, then state alone
  if (zip) data = await tryFetch({ zipCode: zip })
  if (!data && city && state) data = await tryFetch({ city, state })
  if (!data && state) data = await tryFetch({ state })
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

  if (!ai)       errors.push('AI analysis failed — check the ai-analysis edge function logs')
  if (!rentcast) errors.push('RentCast: no live data for this exact location')

  const mortgageRate = fredObs?.length ? parseFloat(fredObs[0].value) : null

  return { location, ai, rentcast, fredMortgageRate: mortgageRate, errors, hasApiKey: true }
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
