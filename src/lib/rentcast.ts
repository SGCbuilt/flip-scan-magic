/**
 * RentCast API Client — v2
 *
 * Key facts from docs:
 * - /listings/sale  → Active + Inactive listings (MLS + Foreclosure + Short Sale)
 * - /properties     → 140M property records (off-market data, owner info, AVM)
 * - /avm/value      → Home value estimate for a specific address
 * - status param: "Active" | "Inactive" (recently sold / delisted)
 * - listingType: "Standard" | "Foreclosure" | "Short Sale" | "New Construction"
 * - daysOld supports ranges: "1-30", "30-90", "90+" etc
 * - squareFootage supports ranges: "800-2000"
 * - price supports ranges: "100000-400000"
 * - yearBuilt supports ranges: "1900-1990"
 * - radius max = 100 miles
 * - limit max = 500
 */

import { supabase } from '@/integrations/supabase/client'

// ── State name → 2-letter abbrev ──────────────────────────────────────────
const STATES: Record<string, string> = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
  'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
  'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
  'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC','washington dc':'DC','washington d.c.':'DC','dc':'DC'
}
export function normalizeState(s: string): string {
  const l = s.trim().toLowerCase()
  return STATES[l] || s.trim().toUpperCase().slice(0, 2)
}

// ── Build location params for any search mode ─────────────────────────────
export function buildLocationParams(
  mode: string,
  query: string,
  radius: number
): Record<string, string> {
  const q = query.trim()
  const p: Record<string, string> = {}

  if (mode === 'zip' || /^\d{5}(-\d{4})?$/.test(q)) {
    // single zip OR multiple comma-separated zips — use first for API, filter rest client-side
    const firstZip = q.split(',')[0].trim().slice(0, 5)
    p.zipCode = firstZip

  } else if (mode === 'state') {
    p.state = normalizeState(q)

  } else if (mode === 'address') {
    p.address = q
    if (radius > 0) p.radius = String(Math.min(radius, 100))

  } else {
    // city mode — handles: "Norfolk, VA" | "Norfolk VA" | "Norfolk"
    const byComma = q.split(',').map(s => s.trim())
    if (byComma.length >= 2) {
      p.city = byComma[0]
      p.state = normalizeState(byComma[1])
    } else {
      const words = q.split(/\s+/)
      const last = words[words.length - 1]
      if (last.length === 2 && /^[A-Za-z]{2}$/.test(last)) {
        p.city = words.slice(0, -1).join(' ')
        p.state = last.toUpperCase()
      } else {
        p.city = q
      }
    }
    if (radius > 0) p.radius = String(Math.min(radius, 100))
  }

  return p
}

// ── Generic GET helper — routes through Lovable Cloud edge function ──────
async function get(path: string, params: Record<string, string>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('rentcast', {
    body: { path, params },
  })
  if (error) throw new Error(`RentCast [${path}]: ${error.message}`)
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(`RentCast [${path}]: ${String(data.error)}`)
  }
  return data
}

// ── ACTIVE MLS listings (Standard + Foreclosure + Short Sale) ────────────
export async function fetchActiveListings(
  locParams: Record<string, string>,
  filters: {
    minPrice?: number; maxPrice?: number
    bedrooms?: number; bathrooms?: number
    minSqft?: number; maxSqft?: number
    minYear?: number; maxYear?: number
    propertyType?: string
    maxDom?: number; minDom?: number
    listingType?: string   // "Foreclosure" | "Short Sale" | "Standard"
  }
): Promise<any[]> {
  const p: Record<string, string> = {
    ...locParams,
    status: 'Active',
    limit: '500',
  }

  // Price range (RentCast range syntax: "min-max")
  if (filters.minPrice || filters.maxPrice) {
    const lo = filters.minPrice || 1
    const hi = filters.maxPrice || 99999999
    p.price = `${lo}-${hi}`
  }

  // Bedrooms / bathrooms
  if (filters.bedrooms) p.bedrooms = `${filters.bedrooms}+`
  if (filters.bathrooms) p.bathrooms = `${filters.bathrooms}+`

  // SqFt range
  if (filters.minSqft || filters.maxSqft) {
    const lo = filters.minSqft || 1
    const hi = filters.maxSqft || 99999
    p.squareFootage = `${lo}-${hi}`
  }

  // Year built range
  if (filters.minYear || filters.maxYear) {
    const lo = filters.minYear || 1800
    const hi = filters.maxYear || new Date().getFullYear()
    p.yearBuilt = `${lo}-${hi}`
  }

  // Property type
  if (filters.propertyType) p.propertyType = filters.propertyType

  // Days on market range
  if (filters.minDom || filters.maxDom) {
    const lo = filters.minDom || 1
    const hi = filters.maxDom || 9999
    p.daysOld = lo > 1 ? `${lo}-${hi}` : `1-${hi}`
  }

  const data = await get('/listings/sale', p)
  let arr: any[] = Array.isArray(data) ? data : (data.listings || data.data || [])

  // Filter by listing type client-side if requested
  if (filters.listingType && filters.listingType !== 'all') {
    arr = arr.filter(x => (x.listingType || '').toLowerCase() === filters.listingType!.toLowerCase())
  }

  return arr
}

// ── INACTIVE / recently removed listings (expired, sold, delisted) ────────
export async function fetchInactiveListings(
  locParams: Record<string, string>,
  filters: { minPrice?: number; maxPrice?: number; propertyType?: string }
): Promise<any[]> {
  const p: Record<string, string> = {
    ...locParams,
    status: 'Inactive',
    limit: '200',
    daysOld: '1-90',   // removed in last 90 days — recently off-market
  }
  if (filters.minPrice || filters.maxPrice) {
    p.price = `${filters.minPrice || 1}-${filters.maxPrice || 99999999}`
  }
  if (filters.propertyType) p.propertyType = filters.propertyType

  try {
    const data = await get('/listings/sale', p)
    const arr: any[] = Array.isArray(data) ? data : (data.listings || data.data || [])
    return arr.map(x => ({ ...x, _source: 'recently_off_market' }))
  } catch {
    return []
  }
}

// ── PROPERTY RECORDS — off-market, absentee owners, corporate owned ───────
export async function fetchPropertyRecords(
  locParams: Record<string, string>,
  filters: {
    minPrice?: number; maxPrice?: number
    propertyType?: string
    ownerType?: 'Individual' | 'Organization'
    bedrooms?: number
    minYear?: number; maxYear?: number
    limit?: number
  }
): Promise<any[]> {
  const p: Record<string, string> = {
    ...locParams,
    limit: String(filters.limit || 200),
  }

  if (filters.propertyType) p.propertyType = filters.propertyType
  if (filters.ownerType) p['owner.type'] = filters.ownerType
  if (filters.bedrooms) p.bedrooms = `${filters.bedrooms}+`
  if (filters.minYear || filters.maxYear) {
    p.yearBuilt = `${filters.minYear || 1800}-${filters.maxYear || 2024}`
  }

  try {
    const data = await get('/properties', p)
    const arr: any[] = Array.isArray(data) ? data : (data.properties || data.data || [])
    // Property records don't have a list price — use assessed value or AVM
    return arr.map(x => ({
      ...x,
      _source: 'property_record',
      price: x.assessedValue || x.taxAssessedValue || x.lastSalePrice || 0,
      formattedAddress: x.formattedAddress || `${x.addressLine1}, ${x.city}, ${x.state}`,
      daysOnMarket: 0,
    }))
  } catch {
    return []
  }
}

// ── AVM — get home value estimate for a specific address ──────────────────
export async function fetchAVM(address: string): Promise<{ value: number; low: number; high: number } | null> {
  try {
    const data = await get('/avm/value', { address })
    return {
      value: data.price || data.priceRangeLow || 0,
      low:   data.priceRangeLow  || 0,
      high:  data.priceRangeHigh || 0,
    }
  } catch {
    return null
  }
}

// ── MARKET STATS ──────────────────────────────────────────────────────────
export async function fetchMarketStats(locParams: Record<string, string>): Promise<any | null> {
  // Markets endpoint only works with zipCode or city+state
  const safeParams: Record<string, string> = {}
  if (locParams.zipCode)  safeParams.zipCode = locParams.zipCode
  else if (locParams.city) {
    safeParams.city = locParams.city
    if (locParams.state) safeParams.state = locParams.state
  } else if (locParams.state) {
    safeParams.state = locParams.state
  }
  if (!safeParams.zipCode && !safeParams.city && !safeParams.state) return null

  try {
    return await get('/markets', safeParams)
  } catch {
    return null
  }
}

// ── COMPARABLES ───────────────────────────────────────────────────────────
export async function fetchComparables(
  address: string, beds: number, baths: number, propertyType: string
): Promise<any[]> {
  try {
    const data = await get('/properties/comparables/sale', {
      address,
      bedrooms: String(beds),
      bathrooms: String(baths),
      propertyType,
      compCount: '8',
      maxRadius: '1',
    })
    return data.comparables || data.data || data || []
  } catch {
    return []
  }
}

// ── MASTER SEARCH — runs multiple sources in parallel ─────────────────────
export interface SearchOptions {
  mode: string
  query: string
  radius: number
  sources: {
    activeMLS: boolean
    foreclosures: boolean
    shortSales: boolean
    recentlyOffMarket: boolean
    propertyRecords: boolean
    corporateOwned: boolean
  }
  filters: {
    minPrice?: number; maxPrice?: number
    bedrooms?: number; bathrooms?: number
    minSqft?: number; maxSqft?: number
    minYear?: number; maxYear?: number
    propertyType?: string
    maxDom?: number; minDom?: number
  }
}

export interface RawListing {
  data: any
  source: string
  sourceLabel: string
}

export async function masterSearch(opts: SearchOptions): Promise<{ listings: RawListing[]; errors: string[] }> {
  const locParams = buildLocationParams(opts.mode, opts.query, opts.radius)
  const errors: string[] = []
  const allListings: RawListing[] = []
  const seen = new Set<string>()

  const add = (arr: any[], source: string, label: string) => {
    arr.forEach(item => {
      const key = item.id || item.formattedAddress || JSON.stringify(item).slice(0, 80)
      if (!seen.has(key)) {
        seen.add(key)
        allListings.push({ data: item, source, sourceLabel: label })
      }
    })
  }

  const tasks: Promise<void>[] = []

  // Active listings — one fetch shared across MLS / Foreclosure / Short Sale
  // (RentCast returns all listing types in /listings/sale; splitting client-side
  // avoids triplicate API calls that trigger rate limits / billing errors.)
  if (opts.sources.activeMLS || opts.sources.foreclosures || opts.sources.shortSales) {
    tasks.push(
      fetchActiveListings(locParams, { ...opts.filters })
        .then(arr => {
          const byType = (t: string) =>
            arr.filter(x => (x.listingType || '').toLowerCase() === t.toLowerCase())
          if (opts.sources.foreclosures) {
            add(byType('Foreclosure'), 'foreclosure', '🔨 Foreclosure')
          }
          if (opts.sources.shortSales) {
            add(byType('Short Sale'), 'short_sale', '📉 Short Sale')
          }
          if (opts.sources.activeMLS) {
            // Standard MLS = everything that isn't Foreclosure / Short Sale
            const std = arr.filter(x => {
              const lt = (x.listingType || '').toLowerCase()
              return lt !== 'foreclosure' && lt !== 'short sale'
            })
            add(std, 'active_mls', '🏠 Active MLS')
          }
        })
        .catch(e => {
          if (opts.sources.activeMLS) errors.push(`Active MLS: ${e.message}`)
          if (opts.sources.foreclosures) errors.push(`Foreclosures: ${e.message}`)
          if (opts.sources.shortSales) errors.push(`Short Sales: ${e.message}`)
        })
    )
  }

  // Recently Off-Market
  if (opts.sources.recentlyOffMarket) {
    tasks.push(
      fetchInactiveListings(locParams, opts.filters)
        .then(arr => add(arr, 'off_market', '🔒 Recently Off-Market'))
        .catch(e => { errors.push(`Off-market: ${e.message}`) })
    )
  }

  // Property Records (all owners — potential direct mail targets)
  if (opts.sources.propertyRecords) {
    tasks.push(
      fetchPropertyRecords(locParams, { ...opts.filters, ownerType: 'Individual' })
        .then(arr => add(arr, 'property_record', '📋 Property Record'))
        .catch(e => { errors.push(`Property records: ${e.message}`) })
    )
  }

  // Corporate / Organization owned (often motivated to sell)
  if (opts.sources.corporateOwned) {
    tasks.push(
      fetchPropertyRecords(locParams, { ...opts.filters, ownerType: 'Organization', limit: 100 })
        .then(arr => add(arr, 'corporate_owned', '🏢 Corporate Owned'))
        .catch(e => { errors.push(`Corporate owned: ${e.message}`) })
    )
  }

  await Promise.allSettled(tasks)

  return { listings: allListings, errors }
}
