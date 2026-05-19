import { AnalyzedProperty, SearchParams } from '../types'

const REHAB = {
  light:  { mid: 15000,  psf: 10 },
  medium: { mid: 50000,  psf: 25 },
  heavy:  { mid: 112500, psf: 55 },
  gut:    { mid: 225000, psf: 110 },
  custom: { mid: 0,      psf: 0 }
}

export function analyzeProperty(
  p: any,
  params: SearchParams,
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
    const rehabInfo = REHAB[params.rehabLevel] || REHAB.medium
    const rehabCost = params.rehabLevel === 'custom'
      ? params.customRehabCost
      : sqft > 0
        ? Math.min(sqft * rehabInfo.psf, rehabInfo.mid * 2)
        : rehabInfo.mid

    // ARV calculation - three scenarios
    let arvBase = 0
    if (avgPsf && sqft) {
      arvBase = avgPsf * sqft
    } else {
      arvBase = price + rehabCost + price * 0.12
    }

    const arv = params.arvMethod === 'conservative' ? arvBase * 0.93
      : params.arvMethod === 'aggressive' ? arvBase * 1.08
      : arvBase * 1.0

    const arvConservative = arvBase * 0.92
    const arvAggressive = arvBase * 1.10

    const closingBuyPct = params.closingCostBuyPct / 100
    const closingBuyNum = price * closingBuyPct
    const downPayment = price * (params.downPaymentPct / 100)
    const loanAmount = price - downPayment
    const holdingCost = loanAmount * (params.financingRate / 100) * (params.holdMonths / 12)
    const sellingComm = arv * (params.agentCommissionPct / 100)
    const closingSell = arv * (params.closingCostSellPct / 100)
    const totalInvested = price + rehabCost + closingBuyNum + holdingCost
    const totalCash = downPayment + rehabCost + closingBuyNum + holdingCost * 0.5
    const netProceeds = arv - sellingComm - closingSell
    const profit = netProceeds - totalInvested
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0
    const annualizedROI = params.holdMonths > 0 ? roi / (params.holdMonths / 12) : roi
    const cashOnCash = totalCash > 0 ? (profit / totalCash) * 100 : 0
    const momsRule = arv * 0.70 - rehabCost
    const underMoms = price <= momsRule
    const spread = arv - price
    const equityPct = arv > 0 ? ((arv - price) / arv) * 100 : 0
    const profitMargin = arv > 0 ? (profit / arv) * 100 : 0

    // Scoring breakdown (each 0–100, weighted)
    const roiScore = Math.min(100, Math.max(0, roi * 2.5))
    const domScore = dom > 90 ? 100 : dom > 60 ? 80 : dom > 30 ? 50 : dom > 14 ? 25 : 0
    const rule70Score = underMoms ? 100 : Math.max(0, 100 - ((price - momsRule) / Math.max(momsRule, 1)) * 200)
    const equityScore = Math.min(100, equityPct * 3)
    const profitScore = profit > 60000 ? 100 : profit > 40000 ? 80 : profit > 25000 ? 60 : profit > 10000 ? 35 : 0

    const scoreBreakdown = {
      roi: Math.round(roiScore),
      dom: Math.round(domScore),
      rule70: Math.round(rule70Score),
      equity: Math.round(equityScore),
      profit: Math.round(profitScore),
    }

    const flipScore = Math.min(100, Math.max(0, Math.round(
      roiScore * 0.30 +
      domScore * 0.18 +
      rule70Score * 0.25 +
      equityScore * 0.12 +
      profitScore * 0.15
    )))

    const scoreGrade: 'A' | 'B' | 'C' | 'D' = flipScore >= 80 ? 'A' : flipScore >= 65 ? 'B' : flipScore >= 50 ? 'C' : 'D'
    const scoreClass = flipScore >= 80 ? 'text-green-400' : flipScore >= 65 ? 'text-blue-900' : flipScore >= 50 ? 'text-orange-400' : 'text-red-400'

    // Opportunity signals
    const signals: string[] = []
    if (underMoms) signals.push('✅ Passes 70% rule')
    if (dom > 60) signals.push(`⏰ ${dom} days stale — motivated seller`)
    if (dom > 90) signals.push('🔥 90+ DOM — deep discount possible')
    if (equityPct > 25) signals.push(`💰 ${equityPct.toFixed(0)}% equity gap`)
    if (roi > 20) signals.push(`📈 ${roi.toFixed(1)}% ROI`)
    if (roi > 30) signals.push('🚀 High return deal')
    if (p.yearBuilt && p.yearBuilt < 1970) signals.push(`🏚️ Pre-1970 — distressed potential`)
    if (p.priceChangedDate || p.priceReduced) signals.push('⬇️ Price reduced')
    if (profit > 50000) signals.push(`💵 ${Math.round(profit / 1000)}K+ profit potential`)
    if (cashOnCash > 25) signals.push(`🏦 ${cashOnCash.toFixed(0)}% cash-on-cash`)

    // Strategy tag
    let strategy = 'Fix & Flip'
    if (params.strategy === 'brrrr') strategy = 'BRRRR'
    else if (params.strategy === 'wholesale') strategy = 'Wholesale'
    else if (params.strategy === 'luxury') strategy = 'Luxury Flip'
    else if (price < 150000) strategy = 'Wholesale'
    else if (annualizedROI > 35) strategy = 'Fix & Flip'

    const tags: { text: string; color: string }[] = []
    if (dom > 60) tags.push({ text: `${dom}d on mkt`, color: 'amber' })
    if (underMoms) tags.push({ text: '70% ✓', color: 'green' })
    if (roi > 20) tags.push({ text: `${roi.toFixed(0)}% ROI`, color: 'green' })
    if (p.yearBuilt && p.yearBuilt < 1980) tags.push({ text: `${p.yearBuilt}`, color: 'blue' })
    if (profit < 5000) tags.push({ text: 'Thin', color: 'red' })
    if (p.priceReduced) tags.push({ text: 'Price ↓', color: 'purple' })
    tags.push({ text: strategy, color: 'purple' })

    return {
      id: p.id || addr,
      raw: p, addr,
      city: p.city || '', state: p.state || '', zip: p.zipCode || '',
      price, arv, arvConservative, arvAggressive,
      sqft, beds, baths, dom,
      propType: p.propertyType || 'Unknown',
      yearBuilt: p.yearBuilt, lot: p.lotSize,
      lat: p.latitude, lng: p.longitude,
      priceReduced: p.priceReduced || false,
      rehabCost, holdingCost, closingBuyNum, totalInvested, totalCash,
      profit, roi, annualizedROI, cashOnCash, momsRule, underMoms,
      spread, equityPct, profitMargin,
      flipScore, scoreGrade, scoreClass, scoreBreakdown,
      signals, tags, sellingComm, closingSell, holdMonths: params.holdMonths, strategy
    }
  } catch {
    return null
  }
}

export function sortResults(arr: AnalyzedProperty[], key: string): AnalyzedProperty[] {
  return [...arr].sort((a, b) => {
    if (key === 'score') return b.flipScore - a.flipScore
    if (key === 'profit') return b.profit - a.profit
    if (key === 'roi') return b.roi - a.roi
    if (key === 'price') return a.price - b.price
    if (key === 'dom') return b.dom - a.dom
    if (key === 'equity') return b.equityPct - a.equityPct
    return 0
  })
}
