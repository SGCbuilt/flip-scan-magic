// Free geocoder — OpenStreetMap Nominatim (no key required).
// Restricted to US to keep results relevant for VA/NC driving.
export interface AddressSuggestion {
  label: string
  address: string
  city: string
  state: string
  zip: string
  lat: number
  lng: number
}

let ctrl: AbortController | null = null

export async function suggestAddresses(query: string): Promise<AddressSuggestion[]> {
  const q = query.trim()
  if (q.length < 3) return []
  if (ctrl) ctrl.abort()
  ctrl = new AbortController()
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=us&q=${encodeURIComponent(q)}`
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Accept-Language': 'en-US' },
    })
    if (!res.ok) return []
    const rows = await res.json() as any[]
    return rows.map(r => {
      const a = r.address || {}
      const streetNum = a.house_number || ''
      const street = a.road || a.pedestrian || ''
      const address = [streetNum, street].filter(Boolean).join(' ')
      const city = a.city || a.town || a.village || a.hamlet || a.suburb || ''
      const state = a.state_code || (a.state ? a.state.slice(0, 2).toUpperCase() : '')
      const zip = a.postcode || ''
      return {
        label: r.display_name as string,
        address, city, state, zip,
        lat: parseFloat(r.lat), lng: parseFloat(r.lon),
      }
    }).filter(s => s.address)
  } catch {
    return []
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<AddressSuggestion | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'en-US' } })
    if (!res.ok) return null
    const r = await res.json()
    const a = r.address || {}
    return {
      label: r.display_name,
      address: [a.house_number, a.road].filter(Boolean).join(' '),
      city: a.city || a.town || a.village || a.hamlet || '',
      state: a.state_code || (a.state ? a.state.slice(0, 2).toUpperCase() : ''),
      zip: a.postcode || '',
      lat, lng,
    }
  } catch { return null }
}