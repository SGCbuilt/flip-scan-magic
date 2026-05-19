import { AnalyzedProperty } from '../types'

const REHAB_RANGES = {
  light:  { mid: 15000 },
  medium: { mid: 50000 },
  heavy:  { mid: 112500 },
  gut:    { mid: 225000 }
}

export function analyzeProperty(
  p: any,
  rehabLevel: string,
  holdMonths: number,
  finRate: number,
  avgPsf: number | null
): AnalyzedProperty | null {
  try {
    const price = p.price || p.listPrice || 0
    if (!price) return null

    const sqft = p.squareFootage || p.livingArea || p.sqft || 0
    const beds = p.bedrooms || 0
    const baths = p.bathrooms || 0
    const dom = p.daysOnMarket || 0
    const addr = p.formattedAddress || `${p.addressLine1 || ''} ${p.city || ''}`.trim()
    const rehab = REHAB_RANGES[rehabLevel as keyof typeof REHAB_RANGES] || REHAB_RANGES.medium

    const arv = avgPsf && sqft ? avgPsf * sqft * 1.05 : price + rehab.mid + price * 0.15
    const rehabCost = rehab.mid
    const closingBuyNum = price * 0.03
    const holdingCost = price * (finRate / 100) * (holdMonths / 12)
    const sellingComm = arv * 0.06
    const closingSell = arv * 0.02
    const totalInvested = price + rehabCost + closingBuyNum + holdingCost
    const netProceeds = arv - sellingComm - closingSell
    const profit = netProceeds - totalInvested
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0
    const annualizedROI = roi / (holdMonths / 12)
    const momsRule = arv * 0.70 - rehabCost
    const underMoms = price <= momsRule
    const spread = arv - price
    const equityPct = arv > 0 ? ((arv - price) / arv) * 100 : 0

    let score = 0
    score += Math.min(30, Math.max(0, roi * 0.8))
    score += dom > 60 ? 20 : dom > 30 ? 12 : dom > 14 ? 6 : 0
    score += underMoms ? 25 : Math.max(0, 25 - ((price - momsRule) / momsRule) * 50)
    score += Math.min(15, equityPct * 0.3)
    score += profit > 50000 ? 10 : profit > 30000 ? 7 : profit > 15000 ? 4 : 0
    score = Math.min(100, Math.max(0, Math.round(score)))

    const scoreGrade: 'A' | 'B' | 'C' | 'D' = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D'
    const scoreClass = score >= 80 ? 'text-green-400' : score >= 65 ? 'text-amber-400' : score >= 50 ? 'text-orange-400' : 'text-red-400'

    const tags: { text: string; color: string }[] = []
    if (dom > 60) tags.push({ text: `${dom}d on market`, color: 'amber' })
    if (underMoms) tags.push({ text: '70% Rule ✓', color: 'green' })
    if (roi > 20) tags.push({ text: `${roi.toFixed(0)}% ROI`, color: 'green' })
    if (p.yearBuilt && p.yearBuilt < 1980) tags.push({ text: `Built ${p.yearBuilt}`, color: 'blue' })
    if (profit < 0) tags.push({ text: 'Thin margin', color: 'red' })
    if (p.propertyType) tags.push({ text: p.propertyType, color: 'purple' })

    return {
      id: p.id || addr,
      raw: p, addr,
      city: p.city || '', state: p.state || '', zip: p.zipCode || '',
      price, arv, sqft, beds, baths, dom,
      propType: p.propertyType || 'Unknown',
      yearBuilt: p.yearBuilt, lot: p.lotSize,
      lat: p.latitude, lng: p.longitude,
      rehabCost, holdingCost, closingBuyNum, totalInvested,
      profit, roi, annualizedROI, momsRule, underMoms,
      spread, equityPct, flipScore: score, scoreGrade, scoreClass,
      tags, sellingComm, closingSell, holdMonths
    }
  } catch {
    return null
  }
}

export function sortResults(arr: AnalyzedProperty[], key: string): AnalyzedProperty[] {
  return [...arr].sort((a, b) => {
    if (key === 'score') return b.flipScore - a.flipScore
    if (key === 'profit') return b.profit - a.profit
    if (key === 'price') return a.price - b.price
    if (key === 'dom') return b.dom - a.dom
    return 0
  })
}
