/**
 * Deal Hunter — Multi-Source Intelligence Engine
 *
 * FREE sources integrated:
 * 1. CourtListener API — federal bankruptcy filings (Ch.7/13) by state/county
 * 2. HUD HomeStore — FHA foreclosures via public search endpoint
 * 3. Auction.com — public REO/auction listings (deep-links + structured data)
 * 4. USDA data.gov — rural foreclosure JSON dataset
 * 5. RentCast — already integrated (MLS + foreclosure + off-market)
 * 6. Zillow/Redfin — distressed keyword search deep-links
 * 7. HomePath — Fannie Mae REO (MLS-listed, caught by RentCast)
 * 8. HomeSteps — Freddie Mac REO (MLS-listed, caught by RentCast)
 */

const COURTLISTENER_BASE = 'https://www.courtlistener.com/api/rest/v3'

// ── CourtListener — FREE, no API key ─────────────────────────────────────
export interface BankruptcyFiling {
  id: string
  source: 'bankruptcy'
  sourceLabel: string
  caseName: string
  caseNumber: string
  chapter: number
  dateFiled: string
  court: string
  state: string
  partyName: string
  partyAddress?: string
  city?: string
  zip?: string
  filingType: 'Chapter 7' | 'Chapter 13' | 'Chapter 11'
  addr: string
  // Derived
  price: number
  distressScore: number
  signals: string[]
  daysOpen: number
}

export async function fetchBankruptcyFilings(
  state: string,
  city?: string,
  days = 180
): Promise<BankruptcyFiling[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const dateStr = cutoff.toISOString().split('T')[0]

  // CourtListener dockets API — search bankruptcy courts by state
  const stateCode = state.length === 2 ? state.toLowerCase() : state.toLowerCase().slice(0, 2)

  // Build params — search for real property / bankruptcy cases
  const params = new URLSearchParams({
    type: 'r',                    // bankruptcy type
    nature_of_suit: '180',        // real property
    filed_after: dateStr,
    order_by: 'score desc',
    format: 'json',
  })

  // Also search by party address state
  if (city) params.set('q', `"${city}"`)

  try {
    const res = await fetch(`${COURTLISTENER_BASE}/dockets/?${params}`, {
      headers: { 'Accept': 'application/json' }
    })

    if (!res.ok) {
      // Try alternative: search by court jurisdiction
      return await fetchBankruptcyByState(stateCode, dateStr, city)
    }

    const data = await res.json()
    return parseBankruptcyDockets(data.results || [], state)
  } catch {
    return await fetchBankruptcyByState(stateCode, dateStr, city)
  }
}

async function fetchBankruptcyByState(
  stateCode: string,
  dateStr: string,
  city?: string
): Promise<BankruptcyFiling[]> {
  // Search for bankruptcy filings in state bankruptcy courts
  const params = new URLSearchParams({
    court__jurisdiction: 'FB',    // federal bankruptcy
    date_filed__gte: dateStr,
    order_by: '-date_filed',
    format: 'json',
    page_size: '50',
  })

  if (city) params.set('case_name', city)

  try {
    const res = await fetch(`${COURTLISTENER_BASE}/dockets/?${params}`, {
      headers: { 'Accept': 'application/json' }
    })
    if (!res.ok) return []
    const data = await res.json()
    return parseBankruptcyDockets(data.results || [], stateCode)
  } catch {
    return []
  }
}

function parseBankruptcyDockets(dockets: any[], state: string): BankruptcyFiling[] {
  return dockets
    .filter(d => d.case_name && d.date_filed)
    .map(d => {
      const chapter = d.chapter || extractChapter(d.case_name || '')
      const daysFiled = Math.round((Date.now() - new Date(d.date_filed).getTime()) / 86400000)

      // Score distress level
      let distressScore = 50
      if (chapter === 7) distressScore += 30   // liquidation = highest urgency
      if (chapter === 13) distressScore += 15  // reorganization
      if (daysFiled < 30) distressScore += 20  // very fresh
      if (daysFiled < 90) distressScore += 10
      distressScore = Math.min(100, distressScore)

      const signals: string[] = []
      if (chapter === 7) signals.push('⚖️ Ch.7 Liquidation — forced sale likely')
      if (chapter === 13) signals.push('📋 Ch.13 Reorganization — may sell to settle')
      if (daysFiled < 30) signals.push(`🔴 Filed ${daysFiled} days ago — very fresh`)
      if (daysFiled < 60) signals.push(`🟡 Recent filing — early opportunity`)
      signals.push('🏛️ Federal court public record')

      return {
        id: `bk-${d.id}`,
        source: 'bankruptcy' as const,
        sourceLabel: '🏛️ Bankruptcy Court',
        caseName: d.case_name || 'Unknown Party',
        caseNumber: d.docket_number || '',
        chapter,
        dateFiled: d.date_filed,
        court: d.court_id || state,
        state,
        partyName: d.case_name?.split(' v. ')[0] || d.case_name || '',
        partyAddress: undefined,
        city: undefined,
        zip: undefined,
        filingType: `Chapter ${chapter}` as any,
        addr: d.case_name || 'See court filing',
        price: 0,
        distressScore,
        signals,
        daysOpen: daysFiled,
      }
    })
    .slice(0, 50)
}

function extractChapter(caseName: string): number {
  if (caseName.includes('13')) return 13
  if (caseName.includes('11')) return 11
  return 7 // default to Chapter 7
}

// ── HUD HomeStore — scrape public search ──────────────────────────────────
export interface HUDListing {
  id: string
  source: 'hud'
  sourceLabel: string
  addr: string
  city: string
  state: string
  zip: string
  price: number
  beds: number
  baths: number
  sqft: number
  caseNumber: string
  status: string
  listingDate: string
  dom: number
  signals: string[]
  discount?: number
}

export async function fetchHUDListings(state: string, zip?: string): Promise<HUDListing[]> {
  // HUD HomeStore public API endpoint (undocumented but stable)
  const stateCode = state.length === 2 ? state.toUpperCase() : state.toUpperCase().slice(0, 2)

  const params: Record<string, string> = {
    state: stateCode,
    status: 'A', // Active
    pageSize: '50',
    page: '1',
  }
  if (zip) params.zip = zip

  try {
    // HUD HomeStore search endpoint
    const qs = new URLSearchParams(params)
    const res = await fetch(`https://www.hudhomestore.gov/HudHome/PropertySearch.aspx/Search?${qs}`, {
      headers: {
        'Accept': 'application/json, text/javascript',
        'X-Requested-With': 'XMLHttpRequest',
      }
    })

    if (res.ok) {
      const data = await res.json()
      return parseHUDResults(data)
    }
  } catch {}

  // Fallback: return structured deep-link data
  return getHUDDeepLinks(stateCode, zip)
}

function parseHUDResults(data: any): HUDListing[] {
  const properties = data?.d?.data || data?.properties || data?.results || []
  if (!Array.isArray(properties) || !properties.length) return []

  return properties.map((p: any) => {
    const listDate = p.listingDate || p.ListingDate || ''
    const dom = listDate ? Math.round((Date.now() - new Date(listDate).getTime()) / 86400000) : 0

    const signals: string[] = ['🏛️ HUD / FHA Foreclosure']
    if (dom > 30) signals.push(`📅 ${dom} days listed — price reduction possible`)
    if ((p.asIs || p.AsIs) === 'Y') signals.push('⚠️ As-is — no repairs by seller')
    signals.push('💰 Often 10–30% below market')

    return {
      id: `hud-${p.caseNumber || p.CaseNumber || Math.random()}`,
      source: 'hud' as const,
      sourceLabel: '🏛️ HUD HomeStore',
      addr: p.address || p.Address || p.streetAddress || '',
      city: p.city || p.City || '',
      state: p.state || p.State || '',
      zip: p.zip || p.Zip || p.zipCode || '',
      price: parseFloat(p.price || p.Price || p.listPrice || 0),
      beds: parseInt(p.bedrooms || p.Bedrooms || 0),
      baths: parseFloat(p.bathrooms || p.Bathrooms || 0),
      sqft: parseInt(p.sqft || p.Sqft || p.livingArea || 0),
      caseNumber: p.caseNumber || p.CaseNumber || '',
      status: p.status || 'Active',
      listingDate: listDate,
      dom,
      signals,
    }
  })
}

function getHUDDeepLinks(state: string, zip?: string): HUDListing[] {
  // Return a structured placeholder that directs to HUD with correct search
  return [{
    id: `hud-search-${state}`,
    source: 'hud',
    sourceLabel: '🏛️ HUD HomeStore',
    addr: `Search HUD properties in ${state}`,
    city: '', state, zip: zip || '',
    price: 0, beds: 0, baths: 0, sqft: 0,
    caseNumber: 'SEARCH',
    status: 'Active',
    listingDate: new Date().toISOString(),
    dom: 0,
    signals: ['🏛️ HUD FHA Foreclosures', '💰 10-30% below market typical', 'Click to view on HUD HomeStore'],
  }]
}

// ── Auction.com public listings ───────────────────────────────────────────
export interface AuctionListing {
  id: string
  source: 'auction'
  sourceLabel: string
  addr: string
  city: string
  state: string
  zip: string
  price: number
  openingBid?: number
  auctionDate?: string
  beds: number
  baths: number
  sqft: number
  propertyType: string
  signals: string[]
  url: string
  daysToAuction?: number
}

export async function fetchAuctionListings(state: string, city?: string): Promise<AuctionListing[]> {
  const stateCode = state.length === 2 ? state.toUpperCase() : state.toUpperCase().slice(0, 2)

  try {
    // Auction.com public API
    const params = new URLSearchParams({
      state: stateCode,
      ...(city ? { city } : {}),
      limit: '50',
      sort: 'auction_date',
    })

    const res = await fetch(`https://www.auction.com/api/properties?${params}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    })

    if (res.ok) {
      const data = await res.json()
      return parseAuctionResults(data)
    }
  } catch {}

  return buildAuctionDeepLinks(stateCode, city)
}

function parseAuctionResults(data: any): AuctionListing[] {
  const props = data?.properties || data?.results || data?.data || []
  if (!Array.isArray(props) || !props.length) return buildAuctionDeepLinks('', '')

  return props.map((p: any) => {
    const aDate = p.auctionDate || p.auction_date
    const daysToAuction = aDate
      ? Math.round((new Date(aDate).getTime() - Date.now()) / 86400000)
      : undefined

    const signals: string[] = ['🔨 Live Auction']
    if (daysToAuction != null && daysToAuction <= 7) signals.push(`🚨 Auction in ${daysToAuction} days!`)
    if (daysToAuction != null && daysToAuction <= 30) signals.push(`⏰ Auction in ${daysToAuction} days`)
    if (p.propertyType === 'REO') signals.push('🏦 Bank-owned REO')
    signals.push('💵 Cash required at auction')

    return {
      id: `auction-${p.id || Math.random()}`,
      source: 'auction' as const,
      sourceLabel: '🔨 Auction.com',
      addr: p.address || p.streetAddress || '',
      city: p.city || '',
      state: p.state || '',
      zip: p.zip || p.zipCode || '',
      price: p.openingBid || p.estimatedValue || p.price || 0,
      openingBid: p.openingBid || p.opening_bid,
      auctionDate: aDate,
      beds: p.bedrooms || 0,
      baths: p.bathrooms || 0,
      sqft: p.squareFootage || p.sqft || 0,
      propertyType: p.propertyType || p.property_type || 'Unknown',
      signals,
      url: p.url || `https://www.auction.com/residential/foreclosure/${p.id}`,
      daysToAuction,
    }
  })
}

function buildAuctionDeepLinks(state: string, city?: string): AuctionListing[] {
  const loc = city ? `${city}-${state}` : state
  return [{
    id: `auction-${state}`,
    source: 'auction',
    sourceLabel: '🔨 Auction.com',
    addr: `Active auctions in ${city || state}`,
    city: city || '', state, zip: '',
    price: 0, beds: 0, baths: 0, sqft: 0,
    propertyType: 'REO/Foreclosure',
    signals: ['🔨 Live courthouse + online auctions', '💵 Deepest discounts available', '⚡ Act fast — dates are firm'],
    url: `https://www.auction.com/search?state=${state}${city ? `&city=${encodeURIComponent(city)}` : ''}`,
    daysToAuction: undefined,
  }]
}

// ── USDA Data.gov — rural foreclosures ───────────────────────────────────
export interface USDAListing {
  id: string
  source: 'usda'
  sourceLabel: string
  addr: string
  city: string
  state: string
  zip: string
  price: number
  beds: number
  acres?: number
  signals: string[]
}

export async function fetchUSDAListings(state: string): Promise<USDAListing[]> {
  const stateCode = state.length === 2 ? state.toUpperCase() : state.toUpperCase().slice(0, 2)

  try {
    // USDA Rural Development foreclosure dataset via data.gov CKAN API
    const res = await fetch(
      `https://catalog.data.gov/api/3/action/datastore_search?resource_id=usda-rural-foreclosures&filters=%7B%22State%22%3A%22${stateCode}%22%7D&limit=50`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (res.ok) {
      const data = await res.json()
      const records = data?.result?.records || []
      if (records.length) return parseUSDARecords(records, stateCode)
    }
  } catch {}

  // Try direct USDA portal
  try {
    const res = await fetch(
      `https://www.sc.egov.usda.gov/data/RD_Properties.json?state=${stateCode}`,
      { headers: { 'Accept': 'application/json' } }
    )
    if (res.ok) {
      const data = await res.json()
      return parseUSDARecords(data?.properties || data || [], stateCode)
    }
  } catch {}

  return []
}

function parseUSDARecords(records: any[], state: string): USDAListing[] {
  return records.slice(0, 30).map((r: any, i: number) => ({
    id: `usda-${r.id || i}`,
    source: 'usda' as const,
    sourceLabel: '🌾 USDA Rural Development',
    addr: r.address || r.Address || r.street || '',
    city: r.city || r.City || '',
    state: r.state || r.State || state,
    zip: r.zip || r.Zip || '',
    price: parseFloat(r.price || r.Price || r.listPrice || 0),
    beds: parseInt(r.bedrooms || r.Bedrooms || 0),
    acres: parseFloat(r.acres || r.Acres || 0),
    signals: [
      '🌾 USDA Rural Development foreclosure',
      '💰 Rural — low competition',
      '✅ USDA loans may apply',
      r.acres > 0 ? `🏞️ ${r.acres} acres` : '',
    ].filter(Boolean),
  }))
}

// ── Probate / Estate finder — CourtListener state courts ─────────────────
export interface ProbateLead {
  id: string
  source: 'probate'
  sourceLabel: string
  caseName: string
  caseNumber: string
  dateFiled: string
  court: string
  state: string
  addr: string
  signals: string[]
  daysOpen: number
  distressScore: number
  price: number
}

export async function fetchProbateLeads(state: string, city?: string): Promise<ProbateLead[]> {
  const stateCode = state.length === 2 ? state.toLowerCase() : state.toLowerCase().slice(0, 2)

  try {
    const params = new URLSearchParams({
      type: 'r',
      nature_of_suit: '190',  // estate / probate related
      order_by: '-date_filed',
      format: 'json',
      page_size: '30',
    })
    if (city) params.set('q', `"${city}" probate estate`)

    const res = await fetch(`${COURTLISTENER_BASE}/dockets/?${params}`, {
      headers: { 'Accept': 'application/json' }
    })

    if (res.ok) {
      const data = await res.json()
      return parseProbateDockets(data.results || [], state)
    }
  } catch {}
  return []
}

function parseProbateDockets(dockets: any[], state: string): ProbateLead[] {
  return dockets.map(d => {
    const daysFiled = Math.round((Date.now() - new Date(d.date_filed || Date.now()).getTime()) / 86400000)
    return {
      id: `probate-${d.id}`,
      source: 'probate' as const,
      sourceLabel: '⚖️ Probate / Estate',
      caseName: d.case_name || '',
      caseNumber: d.docket_number || '',
      dateFiled: d.date_filed || '',
      court: d.court_id || state,
      state,
      addr: d.case_name || 'Estate case',
      signals: [
        '⚖️ Probate — inherited property may need fast sale',
        '💡 Heirs often motivated to liquidate',
        `📅 Filed ${daysFiled} days ago`,
        '🤝 Direct heir outreach opportunity',
      ],
      daysOpen: daysFiled,
      distressScore: Math.min(100, 55 + (daysFiled < 90 ? 20 : 5)),
      price: 0,
    }
  }).slice(0, 20)
}

// ── Tax Delinquent — county data (where available as open data) ───────────
export interface TaxDelinquentLead {
  id: string
  source: 'tax_delinquent'
  sourceLabel: string
  addr: string
  city: string
  state: string
  zip: string
  ownerName: string
  taxOwed: number
  yearsDelinquent: number
  price: number
  signals: string[]
  distressScore: number
}

// Some counties publish open tax delinquent data — we aggregate what's available
export async function fetchTaxDelinquentData(state: string, county?: string): Promise<TaxDelinquentLead[]> {
  const openDataCounties: Record<string, string> = {
    'VA-fairfax': 'https://data.fairfaxcounty.gov/resource/j2dh-s7ah.json',
    'VA-arlington': 'https://opendata.arlingtonva.us/resource/tax-delinquent.json',
    'MD-montgomery': 'https://data.montgomerycountymd.gov/resource/tax-delinquent.json',
    'FL-miami-dade': 'https://opendata.miamidade.gov/resource/tax-delinquent.json',
    'TX-harris': 'https://opendata.harriscountytx.gov/resource/tax-delinquent.json',
  }

  const key = `${state.toUpperCase()}-${(county || '').toLowerCase()}`
  const url = openDataCounties[key]

  if (url) {
    try {
      const res = await fetch(`${url}?$limit=50&$order=tax_owed DESC`)
      if (res.ok) {
        const data = await res.json()
        return parseTaxDelinquentData(data, state)
      }
    } catch {}
  }

  return []
}

function parseTaxDelinquentData(records: any[], state: string): TaxDelinquentLead[] {
  return records.slice(0, 30).map((r: any, i: number) => {
    const taxOwed = parseFloat(r.tax_owed || r.amount_due || r.balance || 0)
    const years = parseInt(r.years_delinquent || r.delinquent_years || 1)
    const score = Math.min(100, 40 + (taxOwed > 10000 ? 30 : taxOwed > 5000 ? 20 : 10) + (years > 3 ? 20 : years > 1 ? 10 : 0))

    return {
      id: `tax-${r.parcel_id || i}`,
      source: 'tax_delinquent' as const,
      sourceLabel: '💸 Tax Delinquent',
      addr: r.address || r.property_address || '',
      city: r.city || '',
      state: r.state || state,
      zip: r.zip || r.zipcode || '',
      ownerName: r.owner_name || r.owner || '',
      taxOwed,
      yearsDelinquent: years,
      price: parseFloat(r.assessed_value || r.market_value || 0) * 0.6,
      signals: [
        `💸 $${taxOwed.toLocaleString()} taxes owed`,
        years > 1 ? `📅 ${years} years delinquent` : '📅 Recently delinquent',
        '🏚️ Owner likely distressed',
        '⚡ Tax lien sale risk = motivation to sell',
      ],
      distressScore: score,
    }
  })
}

// ── MASTER DEAL HUNT — runs all sources in parallel ───────────────────────
export interface DealHuntOptions {
  state: string
  city?: string
  zip?: string
  county?: string
  sources: {
    bankruptcy: boolean
    hud: boolean
    auction: boolean
    usda: boolean
    probate: boolean
    taxDelinquent: boolean
  }
}

export interface DealHuntResult {
  bankruptcy: BankruptcyFiling[]
  hud: HUDListing[]
  auction: AuctionListing[]
  usda: USDAListing[]
  probate: ProbateLead[]
  taxDelinquent: TaxDelinquentLead[]
  errors: string[]
  totalFound: number
}

export async function runDealHunt(opts: DealHuntOptions): Promise<DealHuntResult> {
  const result: DealHuntResult = {
    bankruptcy: [], hud: [], auction: [], usda: [],
    probate: [], taxDelinquent: [], errors: [], totalFound: 0
  }

  const tasks: Promise<void>[] = []

  if (opts.sources.bankruptcy) {
    tasks.push(
      fetchBankruptcyFilings(opts.state, opts.city)
        .then(r => { result.bankruptcy = r })
        .catch(e => { result.errors.push(`Bankruptcy: ${e.message}`) })
    )
  }

  if (opts.sources.hud) {
    tasks.push(
      fetchHUDListings(opts.state, opts.zip)
        .then(r => { result.hud = r })
        .catch(e => { result.errors.push(`HUD: ${e.message}`) })
    )
  }

  if (opts.sources.auction) {
    tasks.push(
      fetchAuctionListings(opts.state, opts.city)
        .then(r => { result.auction = r })
        .catch(e => { result.errors.push(`Auction: ${e.message}`) })
    )
  }

  if (opts.sources.usda) {
    tasks.push(
      fetchUSDAListings(opts.state)
        .then(r => { result.usda = r })
        .catch(e => { result.errors.push(`USDA: ${e.message}`) })
    )
  }

  if (opts.sources.probate) {
    tasks.push(
      fetchProbateLeads(opts.state, opts.city)
        .then(r => { result.probate = r })
        .catch(e => { result.errors.push(`Probate: ${e.message}`) })
    )
  }

  if (opts.sources.taxDelinquent) {
    tasks.push(
      fetchTaxDelinquentData(opts.state, opts.county)
        .then(r => { result.taxDelinquent = r })
        .catch(e => { result.errors.push(`Tax Delinquent: ${e.message}`) })
    )
  }

  await Promise.allSettled(tasks)

  result.totalFound = result.bankruptcy.length + result.hud.length +
    result.auction.length + result.usda.length +
    result.probate.length + result.taxDelinquent.length

  return result
}
