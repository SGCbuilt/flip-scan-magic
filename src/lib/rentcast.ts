import { supabase } from '@/integrations/supabase/client'

async function callRentcast(endpoint: 'listings' | 'markets' | 'comparables', params: Record<string, string>) {
  const { data, error } = await supabase.functions.invoke('rentcast', {
    body: { endpoint, params },
  })
  if (error) throw new Error(error.message)
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error))
  }
  return data
}

export async function fetchListings(params: Record<string, string>): Promise<any[]> {
  const data = await callRentcast('listings', { ...params, limit: '50', status: 'Active' })
  return Array.isArray(data) ? data : (data?.listings || data?.data || [])
}

export async function fetchMarketStats(params: Record<string, string>): Promise<any | null> {
  try {
    return await callRentcast('markets', params)
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
  const data = await callRentcast('comparables', {
    address,
    bedrooms: String(beds),
    bathrooms: String(baths),
    propertyType,
    compCount: '5',
    maxRadius: '0.5',
  })
  return data?.comparables || data?.data || data || []
}
