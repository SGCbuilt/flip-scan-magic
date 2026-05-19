export interface SearchParams {
  city: string
  radius: number
  propertyType: string
  minPrice: number
  maxPrice: number
  bedrooms: number
  bathrooms: number
  minSqft: number
  maxSqft: number
  maxYearBuilt: number
  minYearBuilt: number
  daysOnMarketMax: number
  daysOnMarketMin: number
  priceReduced: boolean
  minFlipScore: number
  minProfit: number
  minROI: number
  strategy: 'flip' | 'brrrr' | 'wholesale' | 'luxury' | 'all'
  rehabLevel: 'light' | 'medium' | 'heavy' | 'gut' | 'custom'
  customRehabCost: number
  holdMonths: number
  financingRate: number
  downPaymentPct: number
  closingCostBuyPct: number
  closingCostSellPct: number
  agentCommissionPct: number
  arvMethod: 'auto' | 'conservative' | 'aggressive'
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
  arvConservative: number
  arvAggressive: number
  sqft: number
  beds: number
  baths: number
  dom: number
  propType: string
  yearBuilt?: number
  lot?: number
  lat?: number
  lng?: number
  priceReduced?: boolean
  rehabCost: number
  holdingCost: number
  closingBuyNum: number
  totalInvested: number
  totalCash: number
  profit: number
  roi: number
  annualizedROI: number
  cashOnCash: number
  momsRule: number
  underMoms: boolean
  spread: number
  equityPct: number
  profitMargin: number
  flipScore: number
  scoreGrade: 'A' | 'B' | 'C' | 'D'
  scoreClass: string
  scoreBreakdown: { roi: number; dom: number; rule70: number; equity: number; profit: number }
  signals: string[]
  tags: { text: string; color: string }[]
  sellingComm: number
  closingSell: number
  holdMonths: number
  strategy: string
}

export interface MarketStats {
  averagePrice?: number
  averagePricePerSquareFoot?: number
  averageDaysOnMarket?: number
  saleData?: { averagePrice?: number; averagePricePerSquareFoot?: number; averageDaysOnMarket?: number }
}

export type SortKey = 'score' | 'profit' | 'roi' | 'price' | 'dom' | 'equity'
export type TabId = 'list' | 'opportunities' | 'market' | 'calc'
export type ViewMode = 'cards' | 'table'
