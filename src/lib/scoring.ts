import { AnalyzedProperty, SearchParams } from '../types'
import { RawListing } from './rentcast'

const REHAB: Record<string, { mid: number; psf: number }> = {
  light:  { mid: 15000,  psf: 10  },
  medium: { mid: 50000,  psf: 25  },
  heavy:  { mid: 112500, psf: 55  },
  gut:    { mid: 225000, psf: 110 },
  custom: { mid: 0,      psf: 0   },
}

export function analyzeProperty(
  raw: RawListing,
  params: SearchParams,
  avgPsf: number | null
): AnalyzedProperty | null {
  try {
    const p = raw.data

    // Price — use list price, or AVM, or assessed value
    const price = p.price || p.listPrice || p.assessedValue || p.lastSalePrice || 0
    if (!price || price < 1000) return null

    const sqft      = p.squareFootage || p.livingArea || p.sqft || 0
    const beds      = p.bedrooms      || 0
    const baths     = p.bathrooms     || 0
    const dom       = p.daysOnMarket  || p.daysOld || 0
    const addr      = p.formattedAddress
                   || `${p.addressLine1 || ''}, ${p.city || ''}, ${p.state || ''}`.replace(/^,\s*/, '')
    const rehabInfo = REHAB[params.rehabLevel] || REHAB.medium
    const rehabCost = params.rehabLevel === 'custom'
      ? params.customRehabCost
      : sqft > 0
        ? Math.min(rehabInfo.mid * 1.5, Math.max(rehabInfo.mid * 0.5, sqft * rehabInfo.psf))
        : rehabInfo.mid

    // ARV — use market PSF if available, then adjust by method
    let arvBase = 0
    if (avgPsf && sqft) {
      arvBase = avgPsf * sqft
    } else if (p.price) {
      // If it's a real listing, project based on rehab + typical margin
      arvBase = price * 1.20 + rehabCost * 0.8
    } else {
      // Property record — use assessed value + rehab premium
      arvBase = price * 1.25 + rehabCost
    }

    // Source bonus — off-market / distressed get 5–15% discount assumption baked in
    if (raw.source === 'foreclosure')   arvBase *= 1.12  // deeper below market
    if (raw.source === 'short_sale')    arvBase *= 1.08
    if (raw.source === 'off_market')    arvBase *= 1.10
    if (raw.source === 'corporate_owned') arvBase *= 1.08

    const arv = params.arvMethod === 'conservative' ? arvBase * 0.92
              : params.arvMethod === 'aggressive'    ? arvBase * 1.10
              : arvBase

    const arvConservative = arvBase * 0.90
    const arvAggressive   = arvBase * 1.12

    // Costs
    const closingBuyPct = params.closingCostBuyPct / 100
    const closingBuyNum = price * closingBuyPct
    const downPayment   = price * (params.downPaymentPct / 100)
    const loanAmt       = price - downPayment
    const holdingCost   = loanAmt * (params.financingRate / 100) * (params.holdMonths / 12)
    const sellingComm   = arv * (params.agentCommissionPct / 100)
    const closingSell   = arv * (params.closingCostSellPct / 100)
    const totalInvested = price + rehabCost + closingBuyNum + holdingCost
    const totalCash     = downPayment + rehabCost + closingBuyNum + (holdingCost * 0.5)
    const netProceeds   = arv - sellingComm - closingSell
    const profit        = netProceeds - totalInvested
    const roi           = totalInvested > 0 ? (profit / totalInvested) * 100 : 0
    const annualizedROI = params.holdMonths > 0 ? roi / (params.holdMonths / 12) : roi
    const cashOnCash    = totalCash > 0 ? (profit / totalCash) * 100 : 0
    const momsRule      = arv * 0.70 - rehabCost
    const underMoms     = price <= momsRule
    const spread        = arv - price
    const equityPct     = arv > 0 ? ((arv - price) / arv) * 100 : 0
    const profitMargin  = arv > 0 ? (profit / arv) * 100 : 0

    // Source score bonus
    const sourceBonuses: Record<string, number> = {
      foreclosure:    15,
      short_sale:     10,
      off_market:     12,
      corporate_owned: 8,
      property_record: 5,
      active_mls:      0,
    }
    const sourceBonus = sourceBonuses[raw.source] || 0

    // Individual score dimensions
    const roiScore    = Math.min(100, Math.max(0, roi * 2.5))
    const domScore    = dom > 120 ? 100 : dom > 90 ? 85 : dom > 60 ? 65 : dom > 30 ? 40 : dom > 14 ? 20 : 5
    const rule70Score = underMoms ? 100 : Math.max(0, 100 - ((price - momsRule) / Math.max(momsRule, 1)) * 180)
    const equityScore = Math.min(100, equityPct * 3.5)
    const profitScore = profit > 80000 ? 100 : profit > 50000 ? 80 : profit > 30000 ? 60 : profit > 15000 ? 35 : profit > 5000 ? 15 : 0

    const scoreBreakdown = {
      roi:    Math.round(roiScore),
      dom:    Math.round(domScore),
      rule70: Math.round(rule70Score),
      equity: Math.round(equityScore),
      profit: Math.round(profitScore),
    }

    const rawScore = (
      roiScore    * 0.30 +
      domScore    * 0.15 +
      rule70Score * 0.28 +
      equityScore * 0.12 +
      profitScore * 0.15
    ) + sourceBonus

    const flipScore   = Math.min(100, Math.max(0, Math.round(rawScore)))
    const scoreGrade: 'A' | 'B' | 'C' | 'D' = flipScore >= 80 ? 'A' : flipScore >= 65 ? 'B' : flipScore >= 50 ? 'C' : 'D'
    const scoreClass  = flipScore >= 80 ? 'text-green-400' : flipScore >= 65 ? 'text-amber-400' : flipScore >= 50 ? 'text-orange-400' : 'text-red-400'

    // Opportunity signals
    const signals: string[] = []
    if (raw.source === 'foreclosure')     signals.push('🔨 Bank-owned / Foreclosure')
    if (raw.source === 'short_sale')      signals.push('📉 Short sale — pre-foreclosure')
    if (raw.source === 'off_market')      signals.push('🔒 Recently off-market')
    if (raw.source === 'corporate_owned') signals.push('🏢 Corporate-owned — motivated seller')
    if (raw.source === 'property_record') signals.push('📋 Off-market — public record')
    if (underMoms)    signals.push('✅ Passes 70% rule')
    if (dom > 90)     signals.push(`🔥 ${dom}d stale — deep discount possible`)
    else if (dom > 60) signals.push(`⏰ ${dom}d on market — motivated seller`)
    if (equityPct > 25) signals.push(`💰 ${equityPct.toFixed(0)}% equity gap`)
    if (roi > 25)     signals.push(`📈 ${roi.toFixed(1)}% projected ROI`)
    if (profit > 50000) signals.push(`💵 $${Math.round(profit / 1000)}K+ profit potential`)
    if (cashOnCash > 30) signals.push(`🏦 ${cashOnCash.toFixed(0)}% cash-on-cash`)
    if (p.yearBuilt && p.yearBuilt < 1970) signals.push(`🏚️ Pre-1970 — distressed potential`)
    if (p.priceChangedDate || p.priceReduced) signals.push('⬇️ Price reduced')

    // Strategy
    let strategy = 'Fix & Flip'
    if (params.strategy === 'brrrr')     strategy = 'BRRRR'
    else if (params.strategy === 'wholesale') strategy = 'Wholesale'
    else if (params.strategy === 'luxury')   strategy = 'Luxury Flip'
    else if (price < 150000)             strategy = 'Wholesale'

    // Tags
    const tags: { text: string; color: string }[] = []
    const sourceColors: Record<string, string> = {
      foreclosure: 'red', short_sale: 'orange', off_market: 'purple',
      corporate_owned: 'blue', property_record: 'blue', active_mls: 'purple'
    }
    tags.push({ text: raw.sourceLabel.replace(/^[^\s]+ /, ''), color: sourceColors[raw.source] || 'purple' })
    if (dom > 60)   tags.push({ text: `${dom}d stale`, color: 'amber' })
    if (underMoms)  tags.push({ text: '70% ✓', color: 'green' })
    if (roi > 20)   tags.push({ text: `${roi.toFixed(0)}% ROI`, color: 'green' })
    if (p.yearBuilt && p.yearBuilt < 1980) tags.push({ text: `${p.yearBuilt}`, color: 'blue' })
    if (profit < 5000) tags.push({ text: 'Thin', color: 'red' })

    return {
      id: p.id || addr,
      raw: p,
      addr,
      city:  p.city  || '',
      state: p.state || '',
      zip:   p.zipCode || '',
      price, arv, arvConservative, arvAggressive,
      sqft, beds, baths, dom,
      propType:    p.propertyType || 'Unknown',
      yearBuilt:   p.yearBuilt,
      lot:         p.lotSize,
      lat:         p.latitude,
      lng:         p.longitude,
      priceReduced: !!(p.priceChangedDate || p.priceReduced),
      source:      raw.source,
      sourceLabel: raw.sourceLabel,
      listingType: p.listingType,
      mlsNumber:   p.mlsNumber,
      ownerType:   p.owner?.type,
      rehabCost, holdingCost, closingBuyNum,
      totalInvested, totalCash,
      profit, roi, annualizedROI, cashOnCash,
      momsRule, underMoms, spread, equityPct, profitMargin,
      flipScore, scoreGrade, scoreClass, scoreBreakdown,
      signals, tags,
      sellingComm, closingSell,
      holdMonths: params.holdMonths,
      strategy,
    }
  } catch {
    return null
  }
}

export function sortResults(arr: AnalyzedProperty[], key: string): AnalyzedProperty[] {
  return [...arr].sort((a, b) => {
    if (key === 'score')  return b.flipScore - a.flipScore
    if (key === 'profit') return b.profit    - a.profit
    if (key === 'roi')    return b.roi       - a.roi
    if (key === 'price')  return a.price     - b.price
    if (key === 'dom')    return b.dom       - a.dom
    if (key === 'equity') return b.equityPct - a.equityPct
    return 0
  })
}
