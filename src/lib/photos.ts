/**
 * Property photos & maps — all free, no API key needed.
 *
 * Google Maps embed (no key needed):
 *   https://www.google.com/maps/embed/v1/streetview?key=AIza... ← needs key
 *
 * Google Maps Street View iframe (no key - uses maps.google.com directly):
 *   https://www.google.com/maps?q=ADDR&output=embed
 *
 * Street View via Mapillary (free, open, no key for basic embed):
 *   Built into the open-source viewer
 *
 * Best approach: show Google Maps embed (satellite+street), link to Zillow/Redfin.
 */

export function googleMapsEmbedUrl(addr: string): string {
  const encoded = encodeURIComponent(addr)
  return `https://maps.google.com/maps?q=${encoded}&output=embed&z=17`
}

export function googleStreetViewUrl(addr: string): string {
  const encoded = encodeURIComponent(addr)
  return `https://www.google.com/maps?q=${encoded}&layer=c&output=embed`
}

export function zillowSearchUrl(addr: string): string {
  // Zillow deep-link for property search
  const encoded = encodeURIComponent(addr)
  return `https://www.zillow.com/homes/${encoded}_rb/`
}

export function redfinSearchUrl(addr: string): string {
  const encoded = encodeURIComponent(addr)
  return `https://www.redfin.com/query/${encoded}`
}

export function googleMapsLink(addr: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(addr)}`
}

export function realtorSearchUrl(addr: string): string {
  // Realtor.com
  const parts = addr.split(',').map(s => s.trim())
  const street = parts[0]?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || ''
  return `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(addr)}`
}

// Property photo placeholder with address label (used when no photo available)
export function generatePropertyPlaceholder(addr: string, source: string): string {
  const sourceColors: Record<string, string> = {
    foreclosure:     '7f1d1d',
    short_sale:      '7c2d12',
    off_market:      '4c1d95',
    corporate_owned: '78350f',
    active_mls:      '1e3a5f',
    property_record: '14532d',
  }
  const bg = sourceColors[source] || '1e3a5f'
  const street = addr.split(',')[0] || addr
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
      <rect width="400" height="200" fill="#${bg}22"/>
      <rect width="400" height="200" fill="none" stroke="#${bg}66" stroke-width="1"/>
      <polyline points="200,40 340,120 340,185 60,185 60,120" fill="none" stroke="#ffffff22" stroke-width="8" stroke-linejoin="round"/>
      <line x1="200" y1="40" x2="60" y2="120" stroke="#ffffff22" stroke-width="8" stroke-linejoin="round"/>
      <rect x="170" y="145" width="60" height="40" fill="none" stroke="#ffffff22" stroke-width="6"/>
      <text x="200" y="100" text-anchor="middle" fill="#ffffff99" font-size="13" font-family="monospace">${street.slice(0, 28)}</text>
    </svg>
  `)}`
}
