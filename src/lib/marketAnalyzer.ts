/**
 * Market Analyzer — Free & confirmed API sources
 *
 * 1. Census Bureau API (free, no key) — demographics, income, employment, housing
 * 2. Census Building Permits (free JSON) — new construction activity
 * 3. FRED API (free, optional key) — economic series, home price index
 * 4. RentCast Markets (your existing key) — rental + sale market stats
 * 5. DoorProfit API (free tier) — crime, schools, neighborhood scores
 * 6. ATTOM Community (uses proxy if key configured) — full neighborhood data
 */

const FRED_API_KEY = 'YOUR_FRED_API_KEY'  // free at fred.stlouisfed.org/docs/api/api_key.html
const CENSUS_API_KEY = ''                  // optional — works without one at lower rate limits
const RENTCAST_KEY = 'a03153e34276e4d75b0548add458816de'

async function safeFetch(url: string, opts?: RequestInit): Promise<any> {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// ── 1. Census ACS — demographics, income, housing ────────────────────────────
export interface CensusData {
  population: number
  medianHouseholdIncome: number
  medianHomeValue: number
  ownerOccupancyRate: number
  vacancyRate: number
  medianAge: number
  collegeDegreeRate: number
  unemploymentRate: number
  povertyRate: number
  populationGrowth1yr?: number
  housingUnits: number
  medianRent: number
  avgHouseholdSize: number
  year: number
}

export async function fetchCensusData(zip?: string, city?: string, state?: string): Promise<CensusData | null> {
  // ACS 5-Year Estimates — most detailed, available down to zip code
  // Variables: https://api.census.gov/data/2023/acs/acs5/variables.json
  const vars = [
    'B01003_001E',  // Total population
    'B19013_001E',  // Median household income
    'B25077_001E',  // Median home value
    'B25003_002E',  // Owner-occupied units
    'B25003_001E',  // Total occupied units
    'B25002_003E',  // Vacant units
    'B25002_001E',  // Total housing units
    'B01002_001E',  // Median age
    'B23025_003E',  // Employed civilians 16+
    'B23025_002E',  // In labor force
    'B17001_002E',  // Below poverty level
    'B17001_001E',  // Total for poverty calc
    'B25064_001E',  // Median gross rent
    'B25010_001E',  // Average household size
    'B15003_022E',  // Bachelor's degree
    'B15003_023E',  // Master's degree
    'B15003_001E',  // Total 25+ for education
  ].join(',')

  let geoParam = ''
  if (zip) {
    geoParam = `for=zip+code+tabulation+area:${zip}&in=state:*`
  } else if (city && state) {
    // Use state-level for now (city requires FIPS lookup)
    const stateCode = STATE_FIPS[state.toUpperCase()] || '51'
    geoParam = `for=state:${stateCode}`
  }

  if (!geoParam) return null

  const key = CENSUS_API_KEY ? `&key=${CENSUS_API_KEY}` : ''
  const url = `https://api.census.gov/data/2023/acs/acs5?get=${vars}&${geoParam}${key}`
  const data = await safeFetch(url)

  if (!data || !Array.isArray(data) || data.length < 2) return null

  const headers: string[] = data[0]
  const row: string[] = data[1]
  const get = (varName: string) => {
    const i = headers.indexOf(varName)
    return i >= 0 ? parseFloat(row[i]) || 0 : 0
  }

  const totalPop    = get('B01003_001E')
  const ownerOcc    = get('B25003_002E')
  const totalOcc    = get('B25003_001E')
  const vacantUnits = get('B25002_003E')
  const totalUnits  = get('B25002_001E')
  const employed    = get('B23025_003E')
  const laborForce  = get('B23025_002E')
  const belowPov    = get('B17001_002E')
  const totalPov    = get('B17001_001E')
  const bachelors   = get('B15003_022E')
  const masters     = get('B15003_023E')
  const totalEdu    = get('B15003_001E')

  return {
    population: totalPop,
    medianHouseholdIncome: get('B19013_001E'),
    medianHomeValue: get('B25077_001E'),
    ownerOccupancyRate: totalOcc > 0 ? (ownerOcc / totalOcc) * 100 : 0,
    vacancyRate: totalUnits > 0 ? (vacantUnits / totalUnits) * 100 : 0,
    medianAge: get('B01002_001E'),
    collegeDegreeRate: totalEdu > 0 ? ((bachelors + masters) / totalEdu) * 100 : 0,
    unemploymentRate: laborForce > 0 ? ((laborForce - employed) / laborForce) * 100 : 0,
    povertyRate: totalPov > 0 ? (belowPov / totalPov) * 100 : 0,
    housingUnits: totalUnits,
    medianRent: get('B25064_001E'),
    avgHouseholdSize: get('B25010_001E'),
    year: 2023,
  }
}

// ── 2. Census Building Permits — new construction activity ───────────────────
export interface BuildingPermitData {
  totalUnits: number
  singleFamilyUnits: number
  multiFamilyUnits: number
  totalValuation: number
  yearOverYearChange: number
  monthlyTrend: { month: string; units: number }[]
  hotMarket: boolean  // > 15% YoY growth
}

export async function fetchBuildingPermits(state: string, city?: string): Promise<BuildingPermitData | null> {
  // Census BPS API — monthly permit data by place/county
  // No API key needed
  const stateCode = STATE_FIPS[state.toUpperCase()] || '51'
  const currentYear = new Date().getFullYear()

  // Get current year permits by state
  const url = `https://api.census.gov/data/timeseries/eits/bps?get=cell_value,time_slot_id,category_code,data_type_code,seasonally_adj&for=state:${stateCode}&YEAR=${currentYear}&PERIOD=06`
  const data = await safeFetch(url)

  if (!data || !Array.isArray(data) || data.length < 2) {
    // Fallback: use FRED building permit series for the state
    return await fetchPermitsFromFRED(state)
  }

  // Parse BPS response
  let totalUnits = 0, sfUnits = 0, mfUnits = 0, valuation = 0
  const headers: string[] = data[0]
  for (let i = 1; i < data.length; i++) {
    const row: string[] = data[i]
    const get = (h: string) => row[headers.indexOf(h)] || ''
    const value = parseFloat(get('cell_value')) || 0
    const cat = get('category_code')
    const dtype = get('data_type_code')
    if (dtype === '1' && cat === 'TOT') totalUnits = value
    if (dtype === '1' && cat === 'SFH') sfUnits = value
    if (dtype === '1' && cat === 'MFH') mfUnits = value
    if (dtype === '3') valuation += value
  }

  return {
    totalUnits, singleFamilyUnits: sfUnits, multiFamilyUnits: mfUnits,
    totalValuation: valuation, yearOverYearChange: 0, monthlyTrend: [], hotMarket: false
  }
}

async function fetchPermitsFromFRED(state: string): Promise<BuildingPermitData | null> {
  // FRED has building permit series by state
  // Series ID format: BPPRIVSA{STATEABBR} for private single-family
  const seriesId = `BP1PRIV${state.toUpperCase()}A`
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=24`
  const data = await safeFetch(url)

  if (!data?.observations?.length) return null

  const obs = data.observations.filter((o: any) => o.value !== '.')
  const latest = parseFloat(obs[0]?.value) || 0
  const yearAgo = parseFloat(obs[11]?.value) || 0
  const yoyChange = yearAgo > 0 ? ((latest - yearAgo) / yearAgo) * 100 : 0

  const monthlyTrend = obs.slice(0, 12).reverse().map((o: any) => ({
    month: new Date(o.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    units: parseFloat(o.value) || 0,
  }))

  return {
    totalUnits: latest * 12,
    singleFamilyUnits: latest,
    multiFamilyUnits: 0,
    totalValuation: 0,
    yearOverYearChange: yoyChange,
    monthlyTrend,
    hotMarket: yoyChange > 15,
  }
}

// ── 3. FRED Economic Indicators ───────────────────────────────────────────────
export interface EconomicData {
  homeValueIndex: { date: string; value: number }[]
  homeValueChange1yr: number
  homeValueChange3yr: number
  mortgageRate30yr: number
  unemploymentLocal: number
  medianListPrice?: number
}

export async function fetchEconomicData(state: string, metroCode?: string): Promise<EconomicData | null> {
  // FRED series:
  // ZHVISTS{STATE}  — Zillow Home Value Index by state (from FRED)
  // MORTGAGE30US    — 30-year fixed mortgage rate
  // UNRATE{STATE}   — state unemployment rate

  const tasks = await Promise.allSettled([
    // HPI (House Price Index by state)
    safeFetch(`https://api.stlouisfed.org/fred/series/observations?series_id=ATNHPIUS${metroCode || ''}A&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=48`),
    // 30-yr mortgage rate
    safeFetch(`https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE30US&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=4`),
    // State unemployment
    safeFetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${state.toUpperCase()}UR&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`),
  ])

  const hpi    = tasks[0].status === 'fulfilled' ? tasks[0].value : null
  const mrate  = tasks[1].status === 'fulfilled' ? tasks[1].value : null
  const unemp  = tasks[2].status === 'fulfilled' ? tasks[2].value : null

  const hpiObs = hpi?.observations?.filter((o: any) => o.value !== '.') || []
  const hpiTrend = hpiObs.slice(0, 36).reverse().map((o: any) => ({
    date: o.date,
    value: parseFloat(o.value) || 0,
  }))

  const latest1  = parseFloat(hpiObs[0]?.value)  || 0
  const yr1ago   = parseFloat(hpiObs[11]?.value) || 0
  const yr3ago   = parseFloat(hpiObs[35]?.value) || 0

  return {
    homeValueIndex: hpiTrend,
    homeValueChange1yr: yr1ago > 0 ? ((latest1 - yr1ago) / yr1ago) * 100 : 0,
    homeValueChange3yr: yr3ago > 0 ? ((latest1 - yr3ago) / yr3ago) * 100 : 0,
    mortgageRate30yr: parseFloat(mrate?.observations?.[0]?.value) || 0,
    unemploymentLocal: parseFloat(unemp?.observations?.[0]?.value) || 0,
  }
}

// ── 4. RentCast Market Stats (existing key) ───────────────────────────────────
export async function fetchRentCastMarket(zip?: string, city?: string, state?: string): Promise<any> {
  const params: Record<string, string> = { dataType: 'All', historyMonths: '18' }
  if (zip) params.zipCode = zip
  else if (city && state) { params.city = city; params.state = state }
  else return null

  try {
    const res = await fetch(`https://api.rentcast.io/v1/markets?${new URLSearchParams(params)}`, {
      headers: { 'X-Api-Key': RENTCAST_KEY }
    })
    return res.ok ? await res.json() : null
  } catch { return null }
}

// ── 5. Walk Score / neighborhood quality ─────────────────────────────────────
// Walk Score has a free tier API
export interface WalkData {
  walkScore: number
  walkDescription: string
  transitScore?: number
  bikeScore?: number
}

// Walk Score API — free tier requires registration at walkscore.com/professional/api.php
export async function fetchWalkScore(address: string, lat: number, lng: number, wsApiKey?: string): Promise<WalkData | null> {
  if (!wsApiKey) return null
  const url = `https://api.walkscore.com/score?format=json&address=${encodeURIComponent(address)}&lat=${lat}&lon=${lng}&transit=1&bike=1&wsapikey=${wsApiKey}`
  const data = await safeFetch(url)
  if (!data || data.status !== 1) return null
  return {
    walkScore: data.walkscore,
    walkDescription: data.description,
    transitScore: data.transit?.score,
    bikeScore: data.bike?.score,
  }
}

// ── 6. Full area analysis ─────────────────────────────────────────────────────
export interface AreaAnalysis {
  location: string
  census: CensusData | null
  permits: BuildingPermitData | null
  economic: EconomicData | null
  rentcast: any | null
  investorScore: number         // 0–100 composite investor attractiveness
  flipScore: number             // 0–100 specific to fix & flip
  brrrScore: number             // 0–100 specific to BRRRR strategy
  marketType: 'emerging' | 'established' | 'peak' | 'declining' | 'stable'
  signals: string[]
  risks: string[]
  summary: string
  errors: string[]
}

export async function analyzeArea(
  zip?: string, city?: string, state?: string
): Promise<AreaAnalysis> {
  const location = zip || `${city}, ${state}` || 'Unknown'
  const errors: string[] = []
  const stateCode = state?.toUpperCase() || 'VA'

  const [censusResult, permitsResult, economicResult, rentcastResult] = await Promise.allSettled([
    fetchCensusData(zip, city, state),
    fetchBuildingPermits(stateCode, city),
    fetchEconomicData(stateCode),
    fetchRentCastMarket(zip, city, state),
  ])

  const census   = censusResult.status   === 'fulfilled' ? censusResult.value   : null
  const permits  = permitsResult.status  === 'fulfilled' ? permitsResult.value  : null
  const economic = economicResult.status === 'fulfilled' ? economicResult.value : null
  const rentcast = rentcastResult.status === 'fulfilled' ? rentcastResult.value : null

  if (!census)   errors.push('Census data unavailable')
  if (!permits)  errors.push('Building permit data unavailable')
  if (!economic) errors.push('Economic data unavailable')

  // ── Scoring ─────────────────────────────────────────────────────────────────
  let investorScore = 50
  let flipScore     = 50
  let brrrScore     = 50

  if (census) {
    // Income growth signal
    if (census.medianHouseholdIncome > 75000) { investorScore += 5; flipScore += 5 }
    if (census.medianHouseholdIncome > 100000) { flipScore += 5 }

    // Vacancy = opportunity for BRRRR
    if (census.vacancyRate > 8)  { brrrScore += 10; investorScore += 3 }
    if (census.vacancyRate > 15) { brrrScore += 5 }

    // Owner occupancy — low = rental market is strong
    if (census.ownerOccupancyRate < 55) { brrrScore += 10 }

    // Low unemployment = strong exit market
    if (census.unemploymentRate < 4)  { flipScore += 8; brrrScore += 5 }
    if (census.unemploymentRate > 8)  { flipScore -= 10; brrrScore -= 5 }

    // Gross rent yield check
    const rentcast_sd = rentcast?.rentalData || rentcast?.saleData
    if (census.medianRent > 0 && census.medianHomeValue > 0) {
      const grossYield = (census.medianRent * 12) / census.medianHomeValue * 100
      if (grossYield > 8)  { brrrScore += 15; investorScore += 8 }
      if (grossYield > 6)  { brrrScore += 8  }
      if (grossYield < 4)  { brrrScore -= 10 }
    }
  }

  if (economic) {
    // Appreciation = better flip exit
    if (economic.homeValueChange1yr > 5)  { flipScore += 10; investorScore += 5 }
    if (economic.homeValueChange1yr > 10) { flipScore += 5 }
    if (economic.homeValueChange1yr < 0)  { flipScore -= 10 }
    if (economic.homeValueChange3yr > 15) { investorScore += 10 }

    // Mortgage rates affect buyer pool
    if (economic.mortgageRate30yr < 6)  { flipScore += 5 }
    if (economic.mortgageRate30yr > 8)  { flipScore -= 8 }
  }

  if (permits) {
    // New construction = growing demand
    if (permits.hotMarket)                   { investorScore += 10; flipScore += 8 }
    if (permits.yearOverYearChange > 20)     { investorScore += 5 }
    if (permits.yearOverYearChange < -20)    { investorScore -= 8; flipScore -= 5 }

    // High permits + low inventory = price pressure upward
    if (permits.singleFamilyUnits > permits.multiFamilyUnits) {
      flipScore += 5  // SF demand driven market
    }
  }

  if (rentcast) {
    const sd = rentcast.saleData
    if (sd?.averageDaysOnMarket < 20) { flipScore += 10; investorScore += 5 }
    if (sd?.averageDaysOnMarket > 60) { flipScore -= 5 }
    if (sd?.averageDaysOnMarket < 30) { flipScore += 5 }
  }

  investorScore = Math.min(100, Math.max(0, Math.round(investorScore)))
  flipScore     = Math.min(100, Math.max(0, Math.round(flipScore)))
  brrrScore     = Math.min(100, Math.max(0, Math.round(brrrScore)))

  // ── Market type ─────────────────────────────────────────────────────────────
  let marketType: AreaAnalysis['marketType'] = 'stable'
  if (economic) {
    if (economic.homeValueChange1yr > 10 && (permits?.hotMarket || false)) marketType = 'emerging'
    else if (economic.homeValueChange1yr > 5) marketType = 'established'
    else if (economic.homeValueChange1yr < -3) marketType = 'declining'
    else if (economic.homeValueChange1yr > 15) marketType = 'peak'
  }

  // ── Signals ──────────────────────────────────────────────────────────────────
  const signals: string[] = []
  const risks: string[] = []

  if (economic?.homeValueChange1yr && economic.homeValueChange1yr > 5)
    signals.push(`📈 Home values up ${economic.homeValueChange1yr.toFixed(1)}% year-over-year`)
  if (permits?.hotMarket)
    signals.push(`🏗️ Hot construction market — permits up ${permits.yearOverYearChange.toFixed(0)}% YoY`)
  if (census?.vacancyRate && census.vacancyRate > 8)
    signals.push(`🏚️ ${census.vacancyRate.toFixed(1)}% vacancy rate — BRRRR opportunity`)
  if (census?.unemploymentRate && census.unemploymentRate < 4)
    signals.push(`💼 Low unemployment (${census.unemploymentRate.toFixed(1)}%) — strong buyer pool`)
  if (rentcast?.saleData?.averageDaysOnMarket && rentcast.saleData.averageDaysOnMarket < 25)
    signals.push(`⚡ Fast market — avg ${rentcast.saleData.averageDaysOnMarket} days to sell`)

  if (economic?.homeValueChange1yr && economic.homeValueChange1yr < 0)
    risks.push(`⚠️ Home values declining ${Math.abs(economic.homeValueChange1yr).toFixed(1)}% — price ARV conservatively`)
  if (census?.unemploymentRate && census.unemploymentRate > 7)
    risks.push(`⚠️ High unemployment (${census.unemploymentRate.toFixed(1)}%) — weak buyer pool`)
  if (economic?.mortgageRate30yr && economic.mortgageRate30yr > 7.5)
    risks.push(`⚠️ High mortgage rates (${economic.mortgageRate30yr.toFixed(2)}%) compress buyer pool`)

  // ── Summary ──────────────────────────────────────────────────────────────────
  const rcsd = rentcast?.saleData
  const summary = [
    `${marketType.charAt(0).toUpperCase() + marketType.slice(1)} market.`,
    economic?.homeValueChange1yr ? `Values ${economic.homeValueChange1yr > 0 ? 'up' : 'down'} ${Math.abs(economic.homeValueChange1yr).toFixed(1)}% YoY.` : '',
    census?.medianHouseholdIncome ? `Median income $${Math.round(census.medianHouseholdIncome / 1000)}k.` : '',
    rcsd?.averageDaysOnMarket ? `Avg ${rcsd.averageDaysOnMarket} days on market.` : '',
    permits?.hotMarket ? 'Active new construction.' : '',
  ].filter(Boolean).join(' ')

  return {
    location, census, permits, economic, rentcast,
    investorScore, flipScore, brrrScore, marketType,
    signals, risks, summary, errors,
  }
}

// FIPS codes for states
const STATE_FIPS: Record<string, string> = {
  AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',
  FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',
  KY:'21',LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',
  MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',
  NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',
  SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',
  WI:'55',WY:'56',DC:'11',
}
