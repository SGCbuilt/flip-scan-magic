/**
 * AI Motivation Score Engine
 * 
 * Uses Claude AI (temperature=0) to analyze every available signal about a lead
 * and produce a 0-100 motivation probability with written explanation.
 * 
 * Inputs: signal data + skip trace data + property data
 * Output: score, tier, primary driver, recommended first action, best call time
 * 
 * Same lead + same data = same score every time (temperature=0)
 */

import { Lead } from './leadRadar'
import { SkipTraceResult } from './skipTrace'

export interface MotivationScore {
  score:           number       // 0-100
  tier:            'critical' | 'hot' | 'warm' | 'cold'
  primaryDriver:   string       // "Absentee owner with 12yr-old structural violation"
  explanation:     string       // 2-3 sentence investor analysis
  recommendedAction: string     // "Call immediately — this owner wants out"
  bestCallTime:    string       // "Weekday morning 8-10am"
  redFlags:        string[]     // reasons NOT to pursue
  greenFlags:      string[]     // reasons TO pursue
  suggestedOffer:  string       // "Start at 55-60% of ARV"
  urgency:         'immediate' | 'this_week' | 'this_month' | 'low'
  computedAt:      string
}

function getApiKey(): string {
  try { return localStorage.getItem('fscan_anthropic') || '' } catch { return '' }
}

export async function computeMotivationScore(
  lead: Lead,
  trace?: SkipTraceResult | null
): Promise<MotivationScore | null> {
  const key = getApiKey()
  if (!key) return null

  // Build rich context for Claude
  const ctx = {
    signal: {
      type:        lead.signalType,
      label:       lead.signalLabel,
      description: lead.description,
      severity:    lead.severity,
      status:      lead.status,
      filedDate:   lead.filedDate,
      daysOpen:    lead.filedDate
        ? Math.floor((Date.now() - new Date(lead.filedDate).getTime()) / 86400000)
        : null,
      city:        lead.city,
      state:       lead.state,
      county:      lead.county,
      source:      lead.source,
    },
    owner: trace?.hit ? {
      name:        trace.owner?.name || '',
      hasPhone:    trace.phones?.filter(p => !p.dnc && !p.litigator).length || 0,
      hasEmail:    trace.emails?.length || 0,
      isOnDNC:     trace.phones?.some(p => p.dnc) || false,
      mailingDiffFromProperty: trace.owner?.mailingAddr
        ? !trace.owner.mailingAddr.toLowerCase().includes(lead.city.toLowerCase())
        : null,  // true = absentee owner
    } : null,
    property: trace?.property ? {
      estimatedValue:   trace.property.estimatedValue,
      equity:           trace.property.equity,
      equityPct:        trace.property.equityPct,
      mortgageBalance:  trace.property.mortgageBalance,
      lastSalePrice:    trace.property.lastSalePrice,
      lastSaleDate:     trace.property.lastSaleDate,
      yearsSinceLastSale: trace.property.lastSaleDate
        ? Math.floor((Date.now() - new Date(trace.property.lastSaleDate).getTime()) / (365.25*86400000))
        : null,
      taxStatus:    trace.property.taxStatus,
      vacant:       trace.property.vacant,
      absenteeOwner:trace.property.absenteeOwner,
      yearBuilt:    trace.property.yearBuilt,
      propertyType: trace.property.propertyType,
      beds:         trace.property.beds,
      sqft:         trace.property.sqft,
    } : null,
  }

  const prompt = `You are a senior real estate investment analyst specializing in fix-and-flip acquisitions in Virginia and North Carolina.

A motivated seller signal has been detected. Analyze ALL available data and produce a seller motivation probability score.

LEAD DATA:
${JSON.stringify(ctx, null, 2)}

SCORING CRITERIA (consider all that apply):
- Signal severity and type (structural violation = higher motivation than cosmetic)
- How long the violation/issue has been open (longer = more distressed)
- Absentee owner (mailing address in different city = higher motivation)
- Equity position (more equity = more room for a deal, but less desperate)
- Negative equity / upside down = extremely motivated
- Tax delinquent status = urgent financial pressure
- Vacant property = holding costs bleeding owner dry
- Years since last sale (longer = more likely to have emotional attachment OR fatigue)
- Age/condition signals in property data
- Owner reachability (has working phone, not on DNC)
- Multiple stacked signals = multiply motivation score

Return ONLY valid JSON, no markdown:
{
  "score": <0-100 motivation probability>,
  "tier": "<critical|hot|warm|cold>",
  "primaryDriver": "<one sentence: the single biggest motivation signal>",
  "explanation": "<2-3 sentences: investor-focused analysis of why this owner is likely motivated to sell>",
  "recommendedAction": "<specific next action: call immediately, send direct mail, drive by first, etc.>",
  "bestCallTime": "<when to call based on property type and owner profile>",
  "redFlags": ["<reason to be cautious>"],
  "greenFlags": ["<strong positive signal>"],
  "suggestedOffer": "<starting offer range as % of ARV or estimated value>",
  "urgency": "<immediate|this_week|this_month|low>"
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) return null
    const d = await res.json()
    const text = (d?.content?.[0]?.text || '').trim()
    const parsed = JSON.parse(text)
    return { ...parsed, computedAt: new Date().toISOString() }
  } catch (e: any) {
    console.error('[MotivationScore]', e?.message)
    return null
  }
}
