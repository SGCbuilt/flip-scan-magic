import { AnalyzedProperty } from '../types'
import { supabase } from '@/integrations/supabase/client'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString()

export type AIProvider = 'gemini' | 'claude'

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
