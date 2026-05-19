export interface SearchParams {
  city: string
  propertyType: string
  minPrice: number
  maxPrice: number
  bedrooms: number
  bathrooms: number
  daysOnMarketMax: number
  minFlipScore: number
  minEquity: number
  rehabLevel: 'light' | 'medium' | 'heavy' | 'gut'
  holdMonths: number
  financingRate: number
}

export interface AnalyzedProperty {
  id: string
  raw: any
  addr: string
  city: string
  state: string
  zip: string
  price: number
  arv: number
  sqft: number
  beds: number
  baths: number
  dom: number
  propType: string
  yearBuilt?: number
  lot?: number
  lat?: number
  lng?: number
  rehabCost: number
  holdingCost: number
  closingBuyNum: number
  totalInvested: number
  profit: number
  roi: number
  annualizedROI: number
  momsRule: number
  underMoms: boolean
  spread: number
  equityPct: number
  flipScore: number
  scoreGrade: 'A' | 'B' | 'C' | 'D'
  scoreClass: string
  tags: { text: string; color: string }[]
  sellingComm: number
  closingSell: number
  holdMonths: number
}

export interface MarketStats {
  averagePrice?: number
  averagePricePerSquareFoot?: number
  averageDaysOnMarket?: number
  saleData?: {
    averagePrice?: number
    averagePricePerSquareFoot?: number
    averageDaysOnMarket?: number
  }
}

export type SortKey = 'score' | 'profit' | 'price' | 'dom'
export type TabId = 'list' | 'market' | 'calc'
