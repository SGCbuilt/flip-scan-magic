/**
 * Market Intelligence — RentCast /markets endpoint
 *
 * Key fields returned:
 * saleData:
 *   averagePrice, medianPrice, averagePricePerSquareFoot
 *   averageDaysOnMarket, medianDaysOnMarket
 *   totalListings, newListings
 *   history: [{ year, month, averagePrice, averageDaysOnMarket, totalListings, ... }]
 *
 * rentalData:
 *   averageRent, medianRent, averageRentPerSquareFoot
 *   averageDaysOnMarket, totalListings
 *   history: [{ year, month, averageRent, ... }]
 *
 * dataType param: "Sale" | "Rental" | "All"
 */

const KEY = (import.meta.env.VITE_RENTCAST_KEY as string) || (typeof localStorage !== 'undefined' ? localStorage.getItem('fscan_rentcast') || '' : '')
const BASE = 'https://api.rentcast.io/v1'
const H = { 'X-Api-Key': KEY }

async function get(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params)
  const res = await fetch(`${BASE}${path}?${qs}`, { headers: H })
  if (!res.ok) throw new Error(`RentCast ${res.status}`)
  return res.json()
}

export interface HistoricalPoint {
  year: number
  month: number
  label: string        // "Jan 24"
  avgPrice?: number
  medianPrice?: number
  avgRent?: number
  avgDom?: number
  totalListings?: number
  newListings?: number
  avgPsf?: number
  avgRentPsf?: number
}

export interface MarketIntelligence {
  zipCode?: string
  city?: string
  state?: string

  // Sale market
  sale: {
    avgPrice: number
    medianPrice: number
    minPrice: number
    maxPrice: number
    avgPsf: number
    avgDom: number
    medianDom: number
    totalListings: number
    newListings: number
    history: HistoricalPoint[]
  } | null

  // Rental market
  rental: {
    avgRent: number
    medianRent: number
    minRent: number
    maxRent: number
    avgRentPsf: number
    avgDom: number
    totalListings: number
    history: HistoricalPoint[]
  } | null

  // Derived intelligence
  intelligence: {
    marketType: 'strong-sellers' | 'sellers' | 'balanced' | 'buyers' | 'strong-buyers'
    marketScore: number          // 0=full buyers, 100=full sellers
    priceTrend: 'rising' | 'stable' | 'falling'
    priceTrendPct: number        // % change over last 6 months
    rentTrend: 'rising' | 'stable' | 'falling'
    rentTrendPct: number
    domTrend: 'decreasing' | 'stable' | 'increasing'
    grossYield: number           // avg rent / avg price * 12 * 100
    monthsOfSupply: number       // estimated
    signals: string[]
    summary: string
  }
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function parseHistory(arr: any[], type: 'sale' | 'rental'): HistoricalPoint[] {
  if (!Array.isArray(arr)) return []
  return arr
    .map(h => ({
      year: h.year,
      month: h.month,
      label: `${MONTHS[(h.month - 1) % 12]} ${String(h.year).slice(2)}`,
      avgPrice:      type === 'sale'   ? h.averagePrice            : undefined,
      medianPrice:   type === 'sale'   ? h.medianPrice             : undefined,
      avgRent:       type === 'rental' ? h.averageRent             : undefined,
      avgDom:        h.averageDaysOnMarket,
      totalListings: h.totalListings,
      newListings:   h.newListings,
      avgPsf:        type === 'sale'   ? h.averagePricePerSquareFoot : undefined,
      avgRentPsf:    type === 'rental' ? h.averageRentPerSquareFoot  : undefined,
    }))
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
    .slice(-18) // last 18 months
}

function trendPct(history: HistoricalPoint[], field: 'avgPrice' | 'avgRent', months = 6): number {
  const pts = history.filter(h => h[field] != null)
  if (pts.length < 2) return 0
  const recent = pts.slice(-1)[0][field]!
  const old = pts.slice(-(months + 1))[0][field]!
  if (!old) return 0
  return ((recent - old) / old) * 100
}

function calcMarketScore(avgDom: number, newListings: number, totalListings: number): number {
  // Low DOM + high new listings = sellers market (score → 100)
  // High DOM + low new listings = buyers market (score → 0)
  let score = 50
  if (avgDom < 20)  score += 25
  else if (avgDom < 35)  score += 12
  else if (avgDom > 90)  score -= 25
  else if (avgDom > 60)  score -= 12

  // Absorption rate proxy
  const absorption = totalListings > 0 ? newListings / totalListings : 0
  if (absorption > 0.4) score += 15
  else if (absorption > 0.2) score += 5
  else if (absorption < 0.1) score -= 15
  else if (absorption < 0.15) score -= 5

  return Math.min(100, Math.max(0, Math.round(score)))
}

function marketTypeFromScore(score: number): MarketIntelligence['intelligence']['marketType'] {
  if (score >= 75) return 'strong-sellers'
  if (score >= 60) return 'sellers'
  if (score >= 40) return 'balanced'
  if (score >= 25) return 'buyers'
  return 'strong-buyers'
}

export async function fetchMarketIntelligence(
  zipCode?: string,
  city?: string,
  state?: string
): Promise<MarketIntelligence | null> {
  const params: Record<string, string> = { dataType: 'All', historyMonths: '18' }
  if (zipCode) params.zipCode = zipCode
  else if (city && state) { params.city = city; params.state = state }
  else if (state) params.state = state
  else return null

  try {
    const data = await get('/markets', params)

    const sd = data.saleData || data.sale || null
    const rd = data.rentalData || data.rental || null

    const saleHistory   = parseHistory(sd?.history   || [], 'sale')
    const rentalHistory = parseHistory(rd?.history   || [], 'rental')

    const sale = sd ? {
      avgPrice:      sd.averagePrice            || 0,
      medianPrice:   sd.medianPrice             || 0,
      minPrice:      sd.minPrice                || 0,
      maxPrice:      sd.maxPrice                || 0,
      avgPsf:        sd.averagePricePerSquareFoot || 0,
      avgDom:        sd.averageDaysOnMarket      || 0,
      medianDom:     sd.medianDaysOnMarket       || 0,
      totalListings: sd.totalListings            || 0,
      newListings:   sd.newListings              || 0,
      history: saleHistory,
    } : null

    const rental = rd ? {
      avgRent:       rd.averageRent             || 0,
      medianRent:    rd.medianRent              || 0,
      minRent:       rd.minRent                 || 0,
      maxRent:       rd.maxRent                 || 0,
      avgRentPsf:    rd.averageRentPerSquareFoot || 0,
      avgDom:        rd.averageDaysOnMarket      || 0,
      totalListings: rd.totalListings            || 0,
      history: rentalHistory,
    } : null

    // Derived intelligence
    const priceTrendPct = trendPct(saleHistory, 'avgPrice', 6)
    const rentTrendPct  = trendPct(rentalHistory, 'avgRent', 6)
    const avgDom        = sale?.avgDom || 45

    const priceTrend: 'rising'|'stable'|'falling' =
      priceTrendPct > 2 ? 'rising' : priceTrendPct < -2 ? 'falling' : 'stable'
    const rentTrend: 'rising'|'stable'|'falling' =
      rentTrendPct > 2 ? 'rising' : rentTrendPct < -2 ? 'falling' : 'stable'

    // DOM trend — compare last 3mo vs prior 3mo
    const domHistory = saleHistory.filter(h => h.avgDom != null)
    const recentDom  = domHistory.slice(-3).map(h => h.avgDom!).reduce((s,n) => s+n, 0) / 3 || avgDom
    const olderDom   = domHistory.slice(-6,-3).map(h => h.avgDom!).reduce((s,n) => s+n, 0) / 3 || avgDom
    const domTrend: 'decreasing'|'stable'|'increasing' =
      recentDom < olderDom * 0.92 ? 'decreasing' :
      recentDom > olderDom * 1.08 ? 'increasing' : 'stable'

    const grossYield = (sale?.avgPrice && rental?.avgRent)
      ? (rental.avgRent * 12) / sale.avgPrice * 100 : 0

    const monthsOfSupply = sale ? (sale.totalListings / Math.max(sale.newListings, 1)) : 0

    const marketScore = sale
      ? calcMarketScore(sale.avgDom, sale.newListings, sale.totalListings)
      : 50
    const marketType  = marketTypeFromScore(marketScore)

    const signals: string[] = []
    if (avgDom < 25)    signals.push(`⚡ Fast market — avg ${avgDom} days to sell`)
    if (avgDom > 75)    signals.push(`🐢 Slow market — avg ${avgDom} days on market`)
    if (priceTrend === 'rising')  signals.push(`📈 Prices up ${priceTrendPct.toFixed(1)}% in 6 months`)
    if (priceTrend === 'falling') signals.push(`📉 Prices down ${Math.abs(priceTrendPct).toFixed(1)}% in 6 months`)
    if (rentTrend === 'rising')   signals.push(`🏠 Rents rising ${rentTrendPct.toFixed(1)}% — strong rental demand`)
    if (grossYield > 8) signals.push(`💰 ${grossYield.toFixed(1)}% gross yield — strong cash flow market`)
    if (grossYield > 0 && grossYield < 4) signals.push(`⚠️ Low ${grossYield.toFixed(1)}% yield — price-driven market`)
    if (monthsOfSupply < 3) signals.push(`📦 < 3 months supply — very low inventory`)
    if (monthsOfSupply > 6) signals.push(`📦 ${monthsOfSupply.toFixed(1)} months supply — buyer leverage`)
    if (domTrend === 'decreasing') signals.push(`⬇️ DOM falling — market heating up`)
    if (domTrend === 'increasing') signals.push(`⬆️ DOM rising — market cooling`)

    const marketLabels: Record<string, string> = {
      'strong-sellers': "Strong Seller's Market",
      'sellers':        "Seller's Market",
      'balanced':       'Balanced Market',
      'buyers':         "Buyer's Market",
      'strong-buyers':  "Strong Buyer's Market",
    }

    const summary = `${marketLabels[marketType]}. Prices ${priceTrend} (${priceTrendPct > 0 ? '+' : ''}${priceTrendPct.toFixed(1)}% / 6mo), avg ${avgDom} days on market.${grossYield > 0 ? ` Gross rental yield ${grossYield.toFixed(1)}%.` : ''}`

    return {
      zipCode, city, state,
      sale, rental,
      intelligence: {
        marketType, marketScore, priceTrend, priceTrendPct,
        rentTrend, rentTrendPct, domTrend, grossYield,
        monthsOfSupply, signals, summary,
      }
    }
  } catch (e) {
    console.error('Market intelligence error:', e)
    return null
  }
}

export async function fetchRentEstimate(
  address: string,
  propertyType: string,
  beds: number,
  baths: number,
  sqft: number
): Promise<{ rent: number; low: number; high: number } | null> {
  try {
    const params: Record<string, string> = { address }
    if (propertyType) params.propertyType = propertyType
    if (beds)  params.bedrooms  = String(beds)
    if (baths) params.bathrooms = String(baths)
    if (sqft)  params.squareFootage = String(sqft)

    const data = await get('/avm/rent', params)
    return {
      rent: data.rent || data.price || 0,
      low:  data.rentRangeLow  || data.priceLow  || 0,
      high: data.rentRangeHigh || data.priceHigh || 0,
    }
  } catch {
    return null
  }
}
