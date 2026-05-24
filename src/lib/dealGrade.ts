/**
 * GC Deal Grade Engine
 *
 * Grades every property from a licensed contractor's perspective
 * BEFORE you make an offer. No platform does this.
 *
 * Grade: A / B / C / D
 *
 * Inputs (all available in FlipScan already):
 *   - Year built → building age risk scoring (code-based actuarial facts)
 *   - Permit history → what's been done, what hasn't, chronic problem flags
 *   - Rehab scope → your Costing Intelligence calibrated estimates
 *   - Comp data → ARV confidence band, DOM trend, exit pricing risk
 *   - Signal data → what the distress signal tells a GC (not just an investor)
 *
 * Output: Grade A/B/C/D + plain English GC analysis paragraph
 *         + specific risk flags + adjusted cost warnings
 *         + recommended inspection focus areas
 */

import { buildCostingIntelligence } from './dealPL'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DealGrade = 'A' | 'B' | 'C' | 'D'

export interface GCRisk {
  system:      string
  flag:        string        // "Knob-and-tube wiring likely"
  basis:       string        // "Pre-1950 construction — 76yr old electrical"
  costImpact:  [number, number]  // [low, high] additional cost range
  probability: 'certain' | 'likely' | 'possible'
  inspectionFocus: string   // "Have electrician inspect panel and visible wiring"
}

export interface PermitInsight {
  signal:   string
  detail:   string
  severity: 'green' | 'yellow' | 'red'
}

export interface DealGradeResult {
  grade:           DealGrade
  gradeColor:      string
  gradeBg:         string
  headline:        string        // "Grade B — Strong buy with known risks"
  summary:         string        // 2-3 sentence GC analysis
  gcRisks:         GCRisk[]      // building-age and permit-derived risk flags
  permitInsights:  PermitInsight[]
  compConfidence:  'strong' | 'moderate' | 'weak'
  domRisk:         'low' | 'medium' | 'high'
  inspectionFocus: string[]      // top 3 things to check in person
  adjustedRehabBuffer: number    // % to add to base estimate for this property
  totalRiskAdder:  [number, number]  // [low, high] total hidden cost risk
  recommendedAction: string
  gcNote:          string        // what a contractor notices that investors miss
  computedAt:      string
}

export interface DealGradeInput {
  address:     string
  city:        string
  state:       string
  yearBuilt?:  number
  sqft?:       number
  beds?:       number
  baths?:      number
  propertyType?: string
  // From skip trace / CAMA
  estimatedValue?: number
  lastSalePrice?:  number
  lastSaleDate?:   string
  mortgageBalance?: number
  // From comps
  arvSuggestion?:  number
  arvPriceLow?:    number
  arvPriceHigh?:   number
  compsCount?:     number
  avgDom?:         number        // avg days on market in area
  // From signal
  signalType?:     string
  signalLabel?:    string
  severity?:       string
  description?:    string
  // From rehab estimator
  estimatedRehab?: number
  // Permit history (future: from gov APIs; for now: derived from age + signal)
  permitHistory?:  string[]
}

// ─── Building Age Risk Database ───────────────────────────────────────────────
// Based on IRC, Virginia Uniform Statewide Building Code, NC State Building Code
// and RSMeans regional contractor data

interface AgeRisk {
  minYear: number
  maxYear: number
  risks: Omit<GCRisk, 'system'>[]
}

const AGE_RISKS: { system: string; ranges: AgeRisk[] }[] = [
  {
    system: 'Electrical',
    ranges: [
      {
        minYear: 0, maxYear: 1950,
        risks: [{
          flag: 'Knob-and-tube wiring almost certain',
          basis: 'Pre-1950 construction — K&T was standard until late 1940s',
          costImpact: [8000, 22000],
          probability: 'certain',
          inspectionFocus: 'Full electrical inspection required. Check panel, visible wiring in basement/attic. Budget for full rewire.',
        }],
      },
      {
        minYear: 1950, maxYear: 1965,
        risks: [{
          flag: 'Aluminum wiring possible (1950-1965 builds)',
          basis: 'Copper shortage era — aluminum wiring used in branch circuits, fire hazard if unaddressed',
          costImpact: [3500, 12000],
          probability: 'likely',
          inspectionFocus: 'Check outlets and panel for aluminum. Look for COPALUM connectors. Budget for pigtailing or rewire.',
        }],
      },
      {
        minYear: 1965, maxYear: 1973,
        risks: [{
          flag: 'Aluminum branch circuit wiring likely',
          basis: '1965-1973 peak aluminum wiring period — CPSC flagged these as fire risk',
          costImpact: [4000, 14000],
          probability: 'likely',
          inspectionFocus: 'Electrician must inspect all outlets, switches, junction boxes. COPALUM remediation or full rewire.',
        }],
      },
      {
        minYear: 1960, maxYear: 1980,
        risks: [{
          flag: 'Panel may be Federal Pacific / Zinsco (recall)',
          basis: '1960-1980 era — FPE Stab-Lok and Zinsco panels common, CPSC safety concerns',
          costImpact: [2500, 6000],
          probability: 'likely',
          inspectionFocus: 'Identify panel brand. FPE Stab-Lok or Zinsco = replace immediately. Budget $2,500-6,000.',
        }],
      },
    ],
  },
  {
    system: 'Plumbing',
    ranges: [
      {
        minYear: 0, maxYear: 1960,
        risks: [{
          flag: 'Galvanized steel supply lines — replacement likely needed',
          basis: 'Pre-1960 galvanized pipes corrode from inside, reducing flow and causing leaks',
          costImpact: [5000, 18000],
          probability: 'certain',
          inspectionFocus: 'Run all faucets. Check water pressure. Galvanized often looks fine outside but is fully occluded inside.',
        }],
      },
      {
        minYear: 1960, maxYear: 1978,
        risks: [{
          flag: 'Galvanized or early copper — inspect carefully',
          basis: 'Transition era, mix of materials. Galvanized connections to copper create electrolytic corrosion',
          costImpact: [3000, 12000],
          probability: 'likely',
          inspectionFocus: 'Check all accessible supply lines. Look for dielectric unions at galvanized-to-copper connections.',
        }],
      },
      {
        minYear: 1978, maxYear: 1995,
        risks: [{
          flag: 'Polybutylene (PB) pipe possible',
          basis: '1978-1995 era — PB pipe class action settlement, known to fail without warning',
          costImpact: [4000, 15000],
          probability: 'possible',
          inspectionFocus: 'Look for gray plastic supply lines (PB). Check at water heater, under sinks, in utility areas. Replace if found.',
        }],
      },
    ],
  },
  {
    system: 'Roofing',
    ranges: [
      {
        minYear: 0, maxYear: 1978,
        risks: [{
          flag: 'Original roof likely contains asbestos-backed materials',
          basis: 'Pre-1978 roofing products commonly contained asbestos in felt and shingles',
          costImpact: [1500, 6000],
          probability: 'possible',
          inspectionFocus: 'If original roof material visible, assume asbestos. Budget for abatement on tear-off. Get licensed abatement quote.',
        }],
      },
    ],
  },
  {
    system: 'Insulation / Hazmat',
    ranges: [
      {
        minYear: 0, maxYear: 1978,
        risks: [{
          flag: 'Lead paint disclosure required — remediation possible',
          basis: 'Pre-1978 construction — lead paint federally required disclosure, abatement needed if disturbed',
          costImpact: [1500, 8000],
          probability: 'certain',
          inspectionFocus: 'Lead paint test all surfaces being disturbed. EPA RRP certification required for contractors. Budget lead abatement.',
        }],
      },
      {
        minYear: 0, maxYear: 1980,
        risks: [{
          flag: 'Asbestos in insulation / floor tiles / ceiling tiles possible',
          basis: 'Pre-1980 — vermiculite insulation, vinyl floor tiles, acoustic ceiling tiles often contained asbestos',
          costImpact: [3000, 15000],
          probability: 'likely',
          inspectionFocus: 'Assume asbestos in any original floor tile, textured ceiling, or attic insulation. Test before disturbing.',
        }],
      },
    ],
  },
  {
    system: 'HVAC',
    ranges: [
      {
        minYear: 0, maxYear: 1975,
        risks: [{
          flag: 'Original HVAC system — full replacement budget required',
          basis: 'Equipment beyond 50 years, well past typical 15-20yr lifespan',
          costImpact: [5000, 12000],
          probability: 'certain',
          inspectionFocus: 'Budget for full HVAC replacement. Check if ductwork is functional or if full duct replacement also needed.',
        }],
      },
    ],
  },
  {
    system: 'Foundation',
    ranges: [
      {
        minYear: 0, maxYear: 1940,
        risks: [{
          flag: 'Pre-code foundation — stone, brick, or early poured concrete',
          basis: 'Pre-1940 foundations predate modern reinforcement and waterproofing codes',
          costImpact: [0, 40000],
          probability: 'possible',
          inspectionFocus: 'Structural engineer inspection recommended. Look for efflorescence, cracks wider than 1/4\", bowing walls.',
        }],
      },
      {
        minYear: 0, maxYear: 1960,
        risks: [{
          flag: 'Pier-and-beam or early slab — settling common',
          basis: 'Early foundation systems prone to moisture and settling issues in VA/NC clay soils',
          costImpact: [2000, 25000],
          probability: 'possible',
          inspectionFocus: 'Check all interior and exterior corners for cracks. Bring structural engineer if any diagonal cracking visible.',
        }],
      },
    ],
  },
]

// ─── Signal → GC Risk Mapping ─────────────────────────────────────────────────
// What a distress signal tells a CONTRACTOR that investors miss

const SIGNAL_GC_INSIGHTS: Record<string, { insight: string; risks: string[] }> = {
  fire_damage: {
    insight: 'Fire damage often looks cosmetic but hides structural and electrical damage. Smoke penetrates everywhere — HVAC, insulation, inside walls. Insurance may have paid out leaving deferred issues.',
    risks: ['Full electrical inspection — fire often damages wiring not visually obvious', 'HVAC contaminated with smoke and soot — likely replacement', 'Check structural members in attic and basement for heat damage', 'Drywall and insulation replacement throughout'],
  },
  code_violation: {
    insight: 'Code violations indicate owner could not or would not maintain the property. Violations often surface one visible issue while hiding related systemic neglect.',
    risks: ['Inspect all related systems — visible violation often has hidden siblings', 'Check permit history — unpermitted prior work creates liability on resale'],
  },
  vacant: {
    insight: 'Vacant properties suffer accelerated deterioration. Pipes freeze, rodents nest, moisture accumulates. 6 months vacant adds approximately 15-25% to rehab scope.',
    risks: ['Full plumbing pressure test — pipes may have frozen/burst', 'HVAC inspection — systems degrade rapidly when unused', 'Check for rodent intrusion in insulation and walls', 'Moisture and mold inspection throughout'],
  },
  tax_delinquent: {
    insight: 'Tax delinquent owners are typically cash-strapped. Maintenance has been deferred for the same duration as the financial hardship — often 2-5 years of zero upkeep.',
    risks: ['Assume 3-5 years of deferred maintenance across all systems', 'Budget contingency at 20% above standard — not 10%'],
  },
  building_permit: {
    insight: 'A building permit filed and abandoned often means the owner ran out of money mid-project. Unpermitted or incomplete work creates inspection liability on resale.',
    risks: ['Identify what work was started — is it code-compliant?', 'Incomplete electrical or plumbing work is dangerous and expensive to properly close out', 'Budget for bringing unpermitted work to code'],
  },
}

// ─── Comp confidence scoring ───────────────────────────────────────────────────

function scoreCompConfidence(compsCount?: number, arvLow?: number, arvHigh?: number): {
  confidence: 'strong' | 'moderate' | 'weak'
  spread: number
  note: string
} {
  if (!compsCount || compsCount === 0) {
    return { confidence: 'weak', spread: 0, note: 'No comparable sales found — ARV highly uncertain, significant exit risk' }
  }
  const spread = arvLow && arvHigh ? Math.round(((arvHigh - arvLow) / ((arvLow + arvHigh) / 2)) * 100) : 0
  if (compsCount >= 4 && spread < 15) return { confidence: 'strong', spread, note: `${compsCount} strong comps, tight ${spread}% range — high ARV confidence` }
  if (compsCount >= 2 && spread < 25) return { confidence: 'moderate', spread, note: `${compsCount} comps, ${spread}% spread — reasonable ARV confidence, verify before offering` }
  return { confidence: 'weak', spread, note: `${compsCount} comp(s), ${spread}% spread — ARV uncertain, price aggressively or pass` }
}

// ─── DOM risk assessment ───────────────────────────────────────────────────────

function scoreDomRisk(avgDom?: number): { risk: 'low' | 'medium' | 'high'; note: string; carryDays: number } {
  if (!avgDom) return { risk: 'medium', note: 'DOM data unavailable — model 90-day hold', carryDays: 90 }
  if (avgDom <= 30) return { risk: 'low', note: `Fast market — avg ${avgDom}d DOM, strong buyer demand`, carryDays: 45 }
  if (avgDom <= 60) return { risk: 'low', note: `Healthy market — avg ${avgDom}d DOM`, carryDays: 75 }
  if (avgDom <= 90) return { risk: 'medium', note: `Normal market — avg ${avgDom}d DOM, plan 90-120d hold`, carryDays: 105 }
  if (avgDom <= 120) return { risk: 'medium', note: `Slow market — avg ${avgDom}d DOM, budget extended carry`, carryDays: 135 }
  return { risk: 'high', note: `Soft market — avg ${avgDom}d DOM, significant carry cost risk`, carryDays: avgDom * 1.3 }
}

// ─── Main grading function ────────────────────────────────────────────────────

function scoreToGrade(score: number): DealGrade {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 45) return 'C'
  return 'D'
}

const GRADE_CONFIG: Record<DealGrade, { color: string; bg: string; border: string }> = {
  A: { color: '#1A7A4A', bg: '#EDFAF3', border: '#1A7A4A40' },
  B: { color: '#1B3A8C', bg: '#EEF2FB', border: '#1B3A8C40' },
  C: { color: '#C45E1A', bg: '#FEF3EA', border: '#C45E1A40' },
  D: { color: '#C0341D', bg: '#FEF0ED', border: '#C0341D40' },
}

export async function computeDealGrade(
  input: DealGradeInput,
  anthropicKey: string
): Promise<DealGradeResult> {
  const year = input.yearBuilt || 0

  // 1. Collect all age-based risks
  const gcRisks: GCRisk[] = []
  for (const category of AGE_RISKS) {
    for (const range of category.ranges) {
      if (year >= range.minYear && year <= range.maxYear) {
        for (const risk of range.risks) {
          gcRisks.push({ system: category.system, ...risk })
        }
      }
    }
  }

  // 2. Signal-based GC insights
  const permitInsights: PermitInsight[] = []
  const signalType = input.signalType || ''
  const signalGC = SIGNAL_GC_INSIGHTS[signalType]
  if (signalGC) {
    signalGC.risks.forEach(r => {
      permitInsights.push({ signal: signalType, detail: r, severity: signalType === 'fire_damage' ? 'red' : 'yellow' })
    })
  }

  // 3. Comp analysis
  const compResult = scoreCompConfidence(input.compsCount, input.arvPriceLow, input.arvPriceHigh)
  const domResult  = scoreDomRisk(input.avgDom)

  // 4. Calculate total risk adder
  const totalRiskLow  = gcRisks.reduce((s, r) => s + r.costImpact[0], 0)
  const totalRiskHigh = gcRisks.reduce((s, r) => s + r.costImpact[1], 0)

  // 5. Score the deal
  let score = 75  // start at B

  // Building age penalty
  if (year > 0) {
    const age = new Date().getFullYear() - year
    if (age > 80)      score -= 20
    else if (age > 60) score -= 15
    else if (age > 40) score -= 8
    else if (age > 20) score -= 3
    if (age < 10)      score += 8   // newer = bonus
  }

  // Risk count penalty
  score -= gcRisks.filter(r => r.probability === 'certain').length * 8
  score -= gcRisks.filter(r => r.probability === 'likely').length * 4
  score -= gcRisks.filter(r => r.probability === 'possible').length * 2

  // Signal severity
  if (input.severity === 'critical')      score -= 5
  if (signalType === 'fire_damage')       score -= 15
  if (signalType === 'vacant')            score -= 8

  // Comp confidence bonus/penalty
  if (compResult.confidence === 'strong') score += 8
  if (compResult.confidence === 'weak')   score -= 15

  // DOM risk
  if (domResult.risk === 'low')    score += 5
  if (domResult.risk === 'high')   score -= 12

  // Risk/reward bonus — if there's a lot of hidden risk but you know about it
  // (because you're a GC), you can price it in — that's your edge
  const totalRiskRatio = input.estimatedRehab && totalRiskHigh > 0
    ? totalRiskHigh / input.estimatedRehab
    : 0
  if (totalRiskRatio > 0.5) score -= 10  // risk adder is > 50% of known rehab

  score = Math.max(10, Math.min(98, score))
  const grade = scoreToGrade(score)
  const cfg   = GRADE_CONFIG[grade]

  // 6. Rehab buffer recommendation
  const baseBuffer = 10  // standard contingency
  const ageBuffer  = year < 1950 ? 15 : year < 1970 ? 10 : year < 1990 ? 5 : 0
  const signalBuffer = signalType === 'fire_damage' ? 20 : signalType === 'vacant' ? 12 : 0
  const adjustedRehabBuffer = Math.min(35, baseBuffer + ageBuffer + signalBuffer)

  // 7. Inspection focus areas
  const inspectionFocus = [
    ...gcRisks.filter(r => r.probability === 'certain').map(r => r.inspectionFocus),
    ...gcRisks.filter(r => r.probability === 'likely').map(r => r.inspectionFocus),
  ].slice(0, 4)

  if (inspectionFocus.length === 0) {
    inspectionFocus.push('Standard inspection — check HVAC, roof, and plumbing age')
  }

  // 8. AI-generated summary (Claude, temp=0)
  let summary = ''
  let gcNote  = ''
  let headline = ''
  let recommendedAction = ''

  if (anthropicKey) {
    try {
      const prompt = `You are Albert Salomon, a licensed General Contractor and real estate investor in Virginia and North Carolina.

Analyze this property and write a GC Deal Grade assessment. Be direct, specific, and think like a contractor — not a generic investor.

PROPERTY DATA:
${JSON.stringify({
  address: input.address,
  city: input.city,
  state: input.state,
  yearBuilt: input.yearBuilt,
  sqft: input.sqft,
  beds: input.beds,
  baths: input.baths,
  estimatedARV: input.arvSuggestion,
  estimatedRehab: input.estimatedRehab,
  distressSignal: input.signalLabel,
  severity: input.severity,
  description: input.description,
  compConfidence: compResult.confidence,
  avgDom: input.avgDom,
  grade,
  score,
  gcRisks: gcRisks.map(r => ({ system: r.system, flag: r.flag, costImpact: r.costImpact, probability: r.probability })),
  totalHiddenRiskRange: [totalRiskLow, totalRiskHigh],
  adjustedRehabBuffer,
}, null, 2)}

Write exactly this JSON (no markdown):
{
  "headline": "Grade ${grade} — [10 word max summary of the deal]",
  "summary": "[2-3 sentences. GC perspective: what the property likely needs, what the numbers say, go/no-go recommendation with price logic]",
  "gcNote": "[1 sentence. The specific thing a contractor notices that a typical investor would miss on this property]",
  "recommendedAction": "[1 specific action: e.g., 'Submit $155k offer contingent on structural engineer report' or 'Pass — carry cost risk exceeds margin at current ARV']"
}`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(18000),
      })

      if (res.ok) {
        const d = await res.json()
        const raw  = (d?.content?.[0]?.text || '').trim()
        const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        if (text && text.startsWith('{')) {
          const parsed = JSON.parse(text)
          headline          = parsed.headline          || ''
          summary           = parsed.summary           || ''
          gcNote            = parsed.gcNote            || ''
          recommendedAction = parsed.recommendedAction || ''
        }
      }
    } catch (e) {
      console.warn('[DealGrade] AI summary failed, using fallback', e)
    }
  }

  // Fallback text if AI unavailable
  if (!headline) {
    const gradeLabels: Record<DealGrade, string> = {
      A: 'Strong buy — clean deal with good numbers',
      B: 'Solid buy — known risks, priceable with GC expertise',
      C: 'Proceed with caution — significant unknowns, price aggressively',
      D: 'High risk — substantial hidden costs, pass or deep discount only',
    }
    headline = `Grade ${grade} — ${gradeLabels[grade]}`
  }

  if (!summary) {
    const riskCount = gcRisks.filter(r => r.probability !== 'possible').length
    summary = `${year > 0 ? `${new Date().getFullYear() - year}-year-old property` : 'Property'} with ${riskCount} material GC risk flag${riskCount !== 1 ? 's' : ''}. Total hidden cost exposure ${totalRiskLow > 0 ? `$${Math.round(totalRiskLow/1000)}k-$${Math.round(totalRiskHigh/1000)}k` : 'moderate'}. ${compResult.note}. ${adjustedRehabBuffer > 10 ? `Use ${adjustedRehabBuffer}% contingency buffer on rehab estimate.` : 'Standard 10% contingency applies.'}`
  }

  if (!gcNote) {
    const topRisk = gcRisks.find(r => r.probability === 'certain')
    gcNote = topRisk
      ? `${topRisk.flag} — investors miss this, contractors budget for it immediately.`
      : `${year < 1980 ? 'Age alone' : 'Signal type'} warrants full-scope inspection before offer is final.`
  }

  if (!recommendedAction) {
    recommendedAction = grade === 'A' || grade === 'B'
      ? 'Proceed — get property under contract, complete full inspection within 10-day contingency period'
      : grade === 'C'
      ? 'Price at 60-65% of ARV to account for unknown scope — only if you can verify risks in person first'
      : 'Pass unless deeply discounted — hidden costs likely exceed stated rehab budget'
  }

  return {
    grade, gradeColor: cfg.color, gradeBg: cfg.bg,
    headline, summary, gcRisks, permitInsights,
    compConfidence: compResult.confidence,
    domRisk: domResult.risk,
    inspectionFocus,
    adjustedRehabBuffer,
    totalRiskAdder: [totalRiskLow, totalRiskHigh],
    recommendedAction,
    gcNote,
    computedAt: new Date().toISOString(),
  }
}
