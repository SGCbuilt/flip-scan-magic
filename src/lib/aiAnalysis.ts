import { AnalyzedProperty } from '../types'
import { supabase } from '@/integrations/supabase/client'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString()

export type AIProvider = 'gemini' | 'claude'

export interface DealVariants {
  flip: { verdict: string; maxOffer: number; projectedProfit: number; roiPct: number; reasoning: string }
  wholesale: { verdict: string; assignmentFeeLow: number; assignmentFeeHigh: number; buyerProfile: string; reasoning: string }
  rental: { verdict: string; monthlyRent: number; monthlyCashflow: number; capRatePct: number; refiPotential: string; reasoning: string }
  rehabTiers: {
    light:  { scope: string; cost: number; arvImpact: number }
    medium: { scope: string; cost: number; arvImpact: number }
    heavy:  { scope: string; cost: number; arvImpact: number }
  }
  recommendedStrategy: 'flip' | 'wholesale' | 'rental'
  topRisk: string
}

function buildPrompt(p: AnalyzedProperty): string {
  const margin = p.arv > 0 ? ((p.profit / p.arv) * 100).toFixed(1) : '0'
  const rehabPerSqft = p.sqft ? (p.rehabCost / p.sqft).toFixed(0) : 'n/a'
  const age = p.yearBuilt ? new Date().getFullYear() - p.yearBuilt : null

  return `Analyze this VA/NC fix-and-flip opportunity as an SGC acquisitions analyst.

DEAL SNAPSHOT
- Address: ${p.addr}, ${p.city}, ${p.state}
- List: ${fmt(p.price)}   ARV: ${fmt(p.arv)}
- Beds/Baths/Sqft: ${p.beds}/${p.baths}/${p.sqft || '?'}
- Year built: ${p.yearBuilt || '?'}${age ? ` (${age} yrs)` : ''}   Type: ${p.propType}
- DOM: ${p.dom ?? '?'}

ECONOMICS
- Rehab est: ${fmt(p.rehabCost)} (${rehabPerSqft} /sqft)
- All-in: ${fmt(p.totalInvested)}
- Net profit: ${fmt(p.profit)}   ROI: ${p.roi.toFixed(1)}%   Margin: ${margin}% of ARV
- 70% rule max: ${fmt(p.momsRule)} → ${p.underMoms ? 'PASSES' : `FAILS by ${fmt(p.price - p.momsRule)}`}
- Grade: ${p.scoreGrade} (${p.flipScore}/100)

Return EXACTLY these 6 tight bullets, no preamble, no restatement of inputs:
• VERDICT — Pursue / Negotiate / Pass, one sentence why, anchored to a number above.
• RISK — the single biggest risk (structural age, thin margin, market, unknowns).
• REHAB REALITY CHECK — is ${fmt(p.rehabCost)} realistic given age/sqft? Adjust up or down with a number.
• NEGOTIATION ANGLE — specific leverage (DOM, condition, market comp) with a target concession in $.
• MAX OFFER — a single number and how you got there (not just the 70% rule).
• EXIT — flip / BRRRR / wholesale-assign, with the expected buyer profile.`
}

export async function getAIAnalysis(
  property: AnalyzedProperty,
  provider: AIProvider = 'gemini'
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-analysis', {
    body: { prompt: buildPrompt(property), provider },
  })
  if (error) throw new Error(error.message || 'AI request failed')
  if (data?.error) throw new Error(data.error)
  return data?.text || 'No analysis returned.'
}

export async function getDealVariants(
  p: AnalyzedProperty,
  provider: AIProvider = 'gemini'
): Promise<DealVariants> {
  const deal = {
    address: `${p.addr}, ${p.city}, ${p.state} ${p.zip}`,
    listPrice: p.price,
    arv: p.arv,
    arvConservative: p.arvConservative,
    arvAggressive: p.arvAggressive,
    beds: p.beds, baths: p.baths, sqft: p.sqft,
    yearBuilt: p.yearBuilt || null,
    propertyType: p.propType,
    daysOnMarket: p.dom,
    estRehabCost: p.rehabCost,
    rehabPerSqft: p.sqft ? Math.round(p.rehabCost / p.sqft) : null,
    seventyPctMax: p.momsRule,
    currentFlipProfit: p.profit,
    currentROI: p.roi,
    flipScore: p.flipScore,
  }
  const { data, error } = await supabase.functions.invoke('ai-analysis', {
    body: { mode: 'variants', deal, provider },
  })
  if (error) throw new Error(error.message || 'AI variants request failed')
  if (data?.error) throw new Error(data.error)
  if (!data?.variants) throw new Error('No variants returned')
  return data.variants as DealVariants
}

// ── PHOTOS ────────────────────────────────────────────────────────────────
export interface PhotosResult {
  photos: string[]
  source: 'rentcast' | 'firecrawl' | 'none'
  count: number
}

export async function getPropertyPhotos(p: AnalyzedProperty): Promise<PhotosResult> {
  const { data, error } = await supabase.functions.invoke('property-photos', {
    body: { address: p.addr, city: p.city, state: p.state, zip: p.zip },
  })
  if (error) throw new Error(error.message || 'Photo fetch failed')
  if (data?.error && !data?.photos?.length) throw new Error(data.error)
  return { photos: data?.photos || [], source: data?.source || 'none', count: data?.count || 0 }
}

// ── DEEP SCAN (photos + permits + distress + strategies + AI summary) ─────
export interface DeepScanResult {
  address: string
  generatedAt: string
  photos: { list: string[]; source: string; count: number }
  permits: {
    permits: Array<{ title?: string; url?: string; description?: string }>
    violations: Array<{ title?: string; url?: string; description?: string }>
    source: string
  }
  distress: {
    signals: Array<{ title?: string; url?: string; description?: string; flags: string[] }>
    source: string
  }
  variants: DealVariants | null
  summary: string
}

export async function runDeepScan(p: AnalyzedProperty): Promise<DeepScanResult> {
  const deal = {
    address: `${p.addr}, ${p.city}, ${p.state} ${p.zip}`,
    listPrice: p.price, arv: p.arv,
    beds: p.beds, baths: p.baths, sqft: p.sqft,
    yearBuilt: p.yearBuilt || null, propertyType: p.propType,
    daysOnMarket: p.dom, estRehabCost: p.rehabCost,
    seventyPctMax: p.momsRule, currentFlipProfit: p.profit,
    currentROI: p.roi, flipScore: p.flipScore,
  }
  const { data, error } = await supabase.functions.invoke('deep-scan', {
    body: { address: p.addr, city: p.city, state: p.state, zip: p.zip, deal },
  })
  if (error) throw new Error(error.message || 'Deep scan failed')
  if (data?.error) throw new Error(data.error)
  return data as DeepScanResult
}

// ── Per-step deep-scan helpers (for real-time progress UI) ────────────────
export async function fetchDeepScanPermits(p: AnalyzedProperty) {
  const { data, error } = await supabase.functions.invoke('deep-scan', {
    body: { mode: 'permits', address: p.addr, city: p.city, state: p.state, zip: p.zip },
  })
  if (error) throw new Error(error.message || 'Permits fetch failed')
  return data as { permits: any[]; violations: any[]; source: string }
}

export async function fetchDeepScanDistress(p: AnalyzedProperty) {
  const { data, error } = await supabase.functions.invoke('deep-scan', {
    body: { mode: 'distress', address: p.addr, city: p.city, state: p.state, zip: p.zip },
  })
  if (error) throw new Error(error.message || 'Distress fetch failed')
  return data as { signals: any[]; source: string }
}

export async function fetchDeepScanSummary(p: AnalyzedProperty, context: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('deep-scan', {
    body: { mode: 'summary', address: p.addr, city: p.city, state: p.state, zip: p.zip, context },
  })
  if (error) throw new Error(error.message || 'Summary generation failed')
  return (data?.summary as string) || ''
}

export function generateQuickInsight(p: AnalyzedProperty): string {
  const lines: string[] = []
  if (p.flipScore >= 80) lines.push('🔥 Strong deal — scores in the top tier.')
  else if (p.flipScore >= 65) lines.push('✅ Good opportunity — above-average flip score.')
  else if (p.flipScore >= 50) lines.push('⚠️ Marginal deal — proceed with caution.')
  else lines.push('❌ Weak deal — numbers don\'t work at list price.')
  if (p.underMoms) lines.push(`List price is ${fmt(p.momsRule - p.price)} below the 70% rule max offer.`)
  else lines.push(`List price exceeds the 70% rule by ${fmt(p.price - p.momsRule)} — negotiate down or pass.`)
  if (p.dom > 60) lines.push(`Property has been sitting ${p.dom} days — seller may be motivated.`)
  if (p.roi > 25) lines.push(`At ${p.roi.toFixed(1)}% ROI, this exceeds typical flip thresholds.`)
  else if (p.roi < 10) lines.push(`ROI of ${p.roi.toFixed(1)}% is thin — factor in unexpected overruns.`)
  if (p.yearBuilt && p.yearBuilt < 1978) lines.push(`Built in ${p.yearBuilt} — budget for lead/asbestos testing.`)
  return lines.join(' ')
}
