const RENTCAST_API_KEY = 'a03153e34276e4d75b0548add458816de'
const BASE = 'https://api.rentcast.io/v1'

export async function fetchListings(params: Record<string, string>): Promise<any[]> {
  const qs = new URLSearchParams({ ...params, limit: '50', status: 'Active' })
  const res = await fetch(`${BASE}/listings/sale?${qs}`, {
    headers: { 'X-Api-Key': RENTCAST_API_KEY }
  })
  if (!res.ok) throw new Error(`RentCast ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.listings || data.data || [])
}

export async function fetchMarketStats(params: Record<string, string>): Promise<any | null> {
  try {
    const qs = new URLSearchParams(params)
    const res = await fetch(`${BASE}/markets?${qs}`, {
      headers: { 'X-Api-Key': RENTCAST_API_KEY }
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchComparables(
  address: string,
  beds: number,
  baths: number,
  propertyType: string
): Promise<any[]> {
  const qs = new URLSearchParams({
    address,
    bedrooms: String(beds),
    bathrooms: String(baths),
    propertyType,
    compCount: '5',
    maxRadius: '0.5'
  })
  const res = await fetch(`${BASE}/properties/comparables/sale?${qs}`, {
    headers: { 'X-Api-Key': RENTCAST_API_KEY }
  })
  if (!res.ok) throw new Error(`Comps error ${res.status}`)
  const data = await res.json()
  return data.comparables || data.data || data || []
}
