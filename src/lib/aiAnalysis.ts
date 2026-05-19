import { AnalyzedProperty } from '../types'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString()

export async function getAIAnalysis(property: AnalyzedProperty): Promise<string> {
  // Add your Anthropic API key to .env as VITE_ANTHROPIC_API_KEY
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Set VITE_ANTHROPIC_API_KEY in your .env file')

  const prompt = `You are a real estate flip analyst. Analyze this flip opportunity and give a concise, actionable assessment. Be specific, data-driven, and direct.

Property: ${property.addr}, ${property.city}, ${property.state}
List Price: ${fmt(property.price)} | Est ARV: ${fmt(property.arv)}
Beds/Baths: ${property.beds}/${property.baths} | Sqft: ${property.sqft || 'unknown'}
Days on Market: ${property.dom || 'unknown'} | Year Built: ${property.yearBuilt || 'unknown'}
Property Type: ${property.propType}
Flip Score: ${property.flipScore}/100 | Grade: ${property.scoreGrade}
Est Rehab: ${fmt(property.rehabCost)} | Total Investment: ${fmt(property.totalInvested)}
Est Net Profit: ${fmt(property.profit)} | ROI: ${property.roi.toFixed(1)}%
70% Rule Max Offer: ${fmt(property.momsRule)} | ${property.underMoms ? 'PASSES 70% rule' : 'FAILS 70% rule'}

Provide exactly 5 bullet points:
• Deal summary & verdict
• Key risks
• Negotiation angle  
• Recommended max offer
• Best exit strategy`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!res.ok) throw new Error(`AI error ${res.status}`)
  const data = await res.json()
  return data.content?.[0]?.text || 'No analysis returned.'
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
