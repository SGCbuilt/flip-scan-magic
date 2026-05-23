/**
 * Comp Auto-Pull — RentCast Property Valuation
 * 
 * Calls RentCast /avm endpoint for instant AVM (Automated Valuation Model)
 * then /properties/search for nearby sold comps.
 * 
 * Direct browser call — RentCast supports CORS.
 * Returns: estimated value + 5 nearby comps with price/sqft
 */

const RENTCAST_KEY = 'a03153e34276e4d75b0548add458816de'

export interface Comp {
  address:       string
  city:          string
  state:         string
  zip:           string
  price:         number
  pricePerSqft:  number
  sqft:          number
  beds:          number
  baths:         number
  soldDate:      string
  distance:      number   // miles from subject
  correlation:   number   // 0-100 similarity score
}

export interface CompResult {
  address:        string
  estimatedValue: number
  priceLow:       number
  priceHigh:      number
  pricePerSqft:   number
  confidence:     'high' | 'medium' | 'low'
  comps:          Comp[]
  arvSuggestion:  number   // conservative ARV (use median of top comps)
  fetchedAt:      string
  error?:         string
}

async function rentcastFetch(path: string, params: Record<string,string>): Promise<any> {
  try {
    const res = await fetch(
      `https://api.rentcast.io/v1${path}?${new URLSearchParams(params)}`,
      { headers: { 'X-Api-Key': RENTCAST_KEY }, signal: AbortSignal.timeout(12000) }
    )
    return res.ok ? await res.json() : null
  } catch { return null }
}

export async function pullComps(
  address: string,
  city: string,
  state: string,
  zip?: string,
  beds?: number,
  baths?: number,
  sqft?: number
): Promise<CompResult | null> {
  const params: Record<string, string> = { address, city, state }
  if (zip)   params.zipCode     = zip
  if (beds)  params.bedrooms    = String(beds)
  if (baths) params.bathrooms   = String(baths)
  if (sqft)  params.squareFootage = String(sqft)

  // Run AVM + comps in parallel
  const [avmData, compsData] = await Promise.all([
    rentcastFetch('/avm/value', params),
    rentcastFetch('/avm/value/comps', { ...params, maxRadius: '1', limit: '8' }),
  ])

  if (!avmData?.price) return null

  const comps: Comp[] = (compsData?.comps || []).slice(0, 6).map((c: any) => ({
    address:      c.formattedAddress || c.address || '',
    city:         c.city || city,
    state:        c.state || state,
    zip:          c.zipCode || zip || '',
    price:        c.price || c.lastSalePrice || 0,
    pricePerSqft: c.pricePerSquareFoot || (c.price && c.squareFootage ? Math.round(c.price / c.squareFootage) : 0),
    sqft:         c.squareFootage || sqft || 0,
    beds:         c.bedrooms || beds || 0,
    baths:        c.bathrooms || baths || 0,
    soldDate:     c.lastSaleDate || c.soldDate || '',
    distance:     c.distance || 0,
    correlation:  c.correlation || c.score || 70,
  })).filter((c: Comp) => c.price > 0)

  // Conservative ARV: median of comps, or AVM if no comps
  const prices = comps.map(c => c.price).sort((a, b) => a - b)
  const medianPrice = prices.length > 0
    ? prices[Math.floor(prices.length / 2)]
    : avmData.price

  return {
    address,
    estimatedValue: avmData.price,
    priceLow:       avmData.priceLow   || avmData.price * 0.9,
    priceHigh:      avmData.priceHigh  || avmData.price * 1.1,
    pricePerSqft:   avmData.pricePerSquareFoot || 0,
    confidence:     avmData.score >= 80 ? 'high' : avmData.score >= 60 ? 'medium' : 'low',
    comps,
    arvSuggestion:  Math.round(medianPrice * 0.97), // slightly conservative
    fetchedAt:      new Date().toISOString(),
  }
}
