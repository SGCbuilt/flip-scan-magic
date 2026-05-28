/**
 * Renovation Cost Estimator — Virginia & North Carolina Market Rates
 * 
 * Provides fast screening-level rehab estimates based on:
 * - System condition (good / fair / poor / replace)
 * - Property size and type
 * - VA/NC current labor + material rates (updated May 2026)
 * 
 * NOT a contractor bid — a screening tool to filter leads before site visits.
 * Albert's actual GC costs will be lower due to his crew and buying power.
 * 
 * Sources: RSMeans 2025, HomeAdvisor VA/NC regional data, NAHB cost surveys
 */

export type Condition = 'good' | 'fair' | 'poor' | 'replace'

export interface RehabSystem {
  id:        string
  name:      string
  icon:      string
  condition: Condition
  note?:     string
}

export interface RehabLineItem {
  system:    string
  condition: Condition
  low:       number
  mid:       number
  high:      number
  note:      string
  roi:       'excellent' | 'good' | 'moderate' | 'low'  // return on investment
}

export interface RehabEstimate {
  lineItems:       RehabLineItem[]
  subtotal:        { low: number; mid: number; high: number }
  contingency10:   number
  total:           { low: number; mid: number; high: number }
  gcAdvantage:     number   // Albert's estimated cost savings vs hiring GC (20-30%)
  albertCost:      number   // estimated actual cost with Albert's crew
  highPriorityItems: string[]
  roiItems:        string[] // items with best return on investment
  summaryNote:     string
}

// VA/NC regional cost database (May 2026)
// Ranges: [low, mid, high] per unit or flat
function systemCost(
  id: string,
  condition: Condition,
  sqft: number,
  beds: number
): RehabLineItem | null {
  if (condition === 'good') return null

  const sf = sqft || 1200
  const b  = beds || 3

  const costs: Record<string, Record<Condition, [number, number, number, string, string]>> = {
    roof: {
      good:    [0,0,0,'','excellent'],
      fair:    [2800, 4200, 6500, 'Repair sections + coat — extend 5 yrs', 'good'],
      poor:    [6500, 9500, 14000, 'Full tear-off + 30yr architectural shingle', 'good'],
      replace: [8000, 12000, 18000, 'Full replacement, possible decking repair', 'good'],
    },
    hvac: {
      good:    [0,0,0,'','excellent'],
      fair:    [800, 1400, 2200, 'Service, recharge, minor repairs', 'excellent'],
      poor:    [3500, 5500, 8000, 'New unit likely needed — get quotes', 'excellent'],
      replace: [4500, 7000, 11000, 'Full HVAC replacement + ductwork', 'excellent'],
    },
    electrical: {
      good:    [0,0,0,'','good'],
      fair:    [1200, 2500, 4000, 'Panel upgrade + partial rewire', 'good'],
      poor:    [3500, 6500, 10000, 'Major rewire, panel replacement', 'good'],
      replace: [6000, 10000, 16000, 'Full rewire + 200A panel', 'good'],
    },
    plumbing: {
      good:    [0,0,0,'','moderate'],
      fair:    [800, 1800, 3000, 'Fix leaks, replace fixtures', 'moderate'],
      poor:    [3000, 6000, 9000, 'Partial repipe, water heater', 'moderate'],
      replace: [7000, 12000, 18000, 'Full repipe + fixtures', 'moderate'],
    },
    kitchen: {
      good:    [0,0,0,'','excellent'],
      fair:    [4000, 7000, 11000, 'Cabinet faces, counters, sink, hardware, paint', 'excellent'],
      poor:    [9000, 15000, 22000, 'Semi-custom cabinets, quartz counters, SS appliances', 'excellent'],
      replace: [14000, 22000, 35000, 'Full gut — new layout, cabinets, appliances', 'excellent'],
    },
    bathPrimary: {
      good:    [0,0,0,'','excellent'],
      fair:    [2500, 4000, 6500, 'Vanity, fixtures, toilet, paint', 'excellent'],
      poor:    [5500, 9000, 14000, 'Tile, shower, vanity, toilet, full refresh', 'excellent'],
      replace: [9000, 14000, 22000, 'Full gut + retile', 'excellent'],
    },
    bathGuest: {
      good:    [0,0,0,'','good'],
      fair:    [1500, 2500, 4000, 'Vanity, fixtures, toilet, paint', 'good'],
      poor:    [3500, 6000, 9000, 'Tile, fixtures, full refresh', 'good'],
      replace: [6000, 10000, 16000, 'Full gut', 'good'],
    },
    flooring: {
      good:    [0,0,0,'','excellent'],
      fair:    [1800, 3000, 5000, 'Partial replacement, refinish hardwood', 'excellent'],
      poor:    [Math.round(sf*2.5), Math.round(sf*3.5), Math.round(sf*5), 'LVP throughout (whole house)', 'excellent'],
      replace: [Math.round(sf*3), Math.round(sf*4.5), Math.round(sf*6.5), 'Full LVP + subfloor repairs', 'excellent'],
    },
    paint: {
      good:    [0,0,0,'','good'],
      fair:    [Math.round(sf*0.75), Math.round(sf*1.1), Math.round(sf*1.6), 'Touch-up + accent walls', 'good'],
      poor:    [Math.round(sf*1.2), Math.round(sf*1.8), Math.round(sf*2.5), 'Full interior paint (labor + material)', 'good'],
      replace: [Math.round(sf*1.5), Math.round(sf*2.2), Math.round(sf*3.2), 'Interior + exterior paint', 'good'],
    },
    foundation: {
      good:    [0,0,0,'','moderate'],
      fair:    [2000, 5000, 10000, 'Cracks, waterproofing, minor settling', 'moderate'],
      poor:    [8000, 18000, 35000, 'Significant repair — get structural engineer', 'moderate'],
      replace: [25000, 50000, 90000, 'Major foundation work — deal killer territory', 'low'],
    },
    windows: {
      good:    [0,0,0,'','moderate'],
      fair:    [1200, 2500, 4500, 'Repair, reglaze, weatherstrip', 'moderate'],
      poor:    [Math.round(b*600), Math.round(b*950), Math.round(b*1500), 'Replace 6-8 windows', 'moderate'],
      replace: [Math.round(b*800), Math.round(b*1300), Math.round(b*2000), 'All new windows', 'moderate'],
    },
    landscaping: {
      good:    [0,0,0,'','good'],
      fair:    [800, 1500, 2500, 'Cleanup, mulch, minor plantings', 'good'],
      poor:    [2000, 4000, 7000, 'Major cleanup + landscaping refresh', 'good'],
      replace: [4000, 8000, 14000, 'Full landscape renovation + sod', 'good'],
    },
    exterior: {
      good:    [0,0,0,'','moderate'],
      fair:    [1500, 3000, 5000, 'Paint, fascia, soffit, minor siding', 'moderate'],
      poor:    [4000, 8000, 14000, 'Siding sections + paint', 'moderate'],
      replace: [12000, 22000, 38000, 'Full siding replacement', 'moderate'],
    },
    demo: {
      good:    [0,0,0,'','moderate'],
      fair:    [500, 1000, 2000, 'Partial demo and haul-away', 'moderate'],
      poor:    [1500, 3000, 5500, 'Significant demo', 'moderate'],
      replace: [3000, 6000, 11000, 'Full gut demo', 'moderate'],
    },
  }

  const c = costs[id]
  if (!c || !c[condition]) return null
  const [low, mid, high, note, roi] = c[condition]
  if (low === 0) return null

  return {
    system:    id,
    condition,
    low, mid, high,
    note,
    roi: roi as RehabLineItem['roi'],
  }
}

const ROI_ORDER: Record<string, number> = {
  kitchen: 1, bathPrimary: 2, flooring: 3, hvac: 4,
  paint: 5, bathGuest: 6, landscaping: 7, exterior: 8,
  electrical: 9, roof: 10, plumbing: 11, windows: 12,
  foundation: 13, demo: 14,
}

export function calculateRehab(
  systems: RehabSystem[],
  sqft = 1200,
  beds = 3
): RehabEstimate {
  const lineItems: RehabLineItem[] = []

  for (const sys of systems) {
    const item = systemCost(sys.id, sys.condition, sqft, beds)
    if (item) {
      if (sys.note) item.note = sys.note
      lineItems.push(item)
    }
  }

  // Sort by ROI priority
  lineItems.sort((a, b) => (ROI_ORDER[a.system] || 99) - (ROI_ORDER[b.system] || 99))

  const subtotal = {
    low:  lineItems.reduce((s, i) => s + i.low,  0),
    mid:  lineItems.reduce((s, i) => s + i.mid,  0),
    high: lineItems.reduce((s, i) => s + i.high, 0),
  }

  const contingency10 = Math.round(subtotal.mid * 0.10)

  const total = {
    low:  subtotal.low  + Math.round(subtotal.low  * 0.10),
    mid:  subtotal.mid  + contingency10,
    high: subtotal.high + Math.round(subtotal.high * 0.10),
  }

  // Albert's GC advantage — 20-25% below retail pricing
  const gcAdvantage  = Math.round(total.mid * 0.22)
  const albertCost   = total.mid - gcAdvantage

  const highPriority = lineItems
    .filter(i => ['foundation','roof','electrical','hvac','plumbing'].includes(i.system))
    .map(i => `${i.system} (${i.condition})`)

  const roiItems = lineItems
    .filter(i => ['excellent','good'].includes(i.roi))
    .map(i => i.system)

  const summaryNote = highPriority.length > 0
    ? `Critical systems flagged (${highPriority.join(', ')}) — verify in person before finalizing offer.`
    : 'No critical structural/mechanical issues flagged. Standard cosmetic scope — good candidate.'

  return {
    lineItems, subtotal, contingency10, total,
    gcAdvantage, albertCost,
    highPriorityItems: highPriority,
    roiItems, summaryNote,
  }
}

export const DEFAULT_SYSTEMS: RehabSystem[] = [
  { id: 'roof',        name: 'Roof',             icon: '🏠', condition: 'good' },
  { id: 'hvac',        name: 'HVAC',             icon: '❄️', condition: 'good' },
  { id: 'electrical',  name: 'Electrical',       icon: '⚡', condition: 'good' },
  { id: 'plumbing',    name: 'Plumbing',         icon: '🔧', condition: 'good' },
  { id: 'kitchen',     name: 'Kitchen',          icon: '🍳', condition: 'good' },
  { id: 'bathPrimary', name: 'Primary Bath',     icon: '🚿', condition: 'good' },
  { id: 'bathGuest',   name: 'Guest Bath(s)',    icon: '🛁', condition: 'good' },
  { id: 'flooring',    name: 'Flooring',         icon: '🪵', condition: 'good' },
  { id: 'paint',       name: 'Paint (Interior)', icon: '🎨', condition: 'good' },
  { id: 'windows',     name: 'Windows',          icon: '🪟', condition: 'good' },
  { id: 'exterior',    name: 'Exterior/Siding',  icon: '🏗️', condition: 'good' },
  { id: 'landscaping', name: 'Landscaping',      icon: '🌿', condition: 'good' },
  { id: 'foundation',  name: 'Foundation',       icon: '🧱', condition: 'good' },
  { id: 'demo',        name: 'Demo/Cleanout',    icon: '🗑️', condition: 'good' },
]

// ── Scope of Work PDF Generator ───────────────────────────────────────────────
// Opens in new tab → Print → Save as PDF
// Professional format ready to hand to crew or use as bid document

export interface SOWParams {
  address:     string
  city:        string
  state:       string
  zip?:        string
  arv?:        number
  purchasePrice?: number
  beds?:       number
  baths?:      number
  sqft?:       number
  yearBuilt?:  number
  estimate:    RehabEstimate
  systems:     RehabSystem[]
  notes?:      string
  preparedFor?: string   // buyer / contractor name
  projectNumber?: string
}

const SYSTEM_NAMES: Record<string, string> = {
  roof:        'Roof',
  hvac:        'HVAC System',
  electrical:  'Electrical',
  plumbing:    'Plumbing',
  kitchen:     'Kitchen',
  bathPrimary: 'Primary Bathroom',
  bathGuest:   'Guest Bathroom(s)',
  flooring:    'Flooring',
  paint:       'Interior Paint',
  windows:     'Windows',
  exterior:    'Exterior / Siding',
  landscaping: 'Landscaping',
  foundation:  'Foundation',
  demo:        'Demo / Cleanout',
}

const CONDITION_DETAIL: Record<Condition, { label: string; scope: string }> = {
  good:    { label: 'Good — No Work Required', scope: 'No action needed at this time.' },
  fair:    { label: 'Fair — Repair / Refresh', scope: 'Targeted repairs, cleaning, minor replacements to restore function and appearance.' },
  poor:    { label: 'Poor — Significant Work', scope: 'Major repairs or partial replacement required. Estimate reflects full scope.' },
  replace: { label: 'Replace — Full Replacement', scope: 'Complete removal and replacement of system. All associated materials and labor included.' },
}

export function generateScopeOfWorkPDF(p: SOWParams): void {
  const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'
  const fmtR = (lo: number, hi: number) => `${fmt$(lo)} – ${fmt$(hi)}`
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const projectNum = p.projectNumber || `SGC-${Date.now().toString().slice(-6)}`
  const activeItems = p.estimate.lineItems

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Scope of Work — ${p.address}</title>
  <style>
    @page { margin: 0.75in; size: letter; }
    * { margin: 0; padding: 0; box-sizing: border-box }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 11px; color: #1a1a1a; line-height: 1.5;
    }

    /* Header */
    .header {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 16px; margin-bottom: 20px;
      border-bottom: 3px solid #1B3A8C;
    }
    .logo { }
    .logo-name { font-size: 22px; font-weight: 900; color: #1B3A8C; letter-spacing: -0.5px }
    .logo-sub  { font-size: 9px; color: #888; letter-spacing: 2.5px; text-transform: uppercase; margin-top: 2px }
    .doc-info { text-align: right }
    .doc-title { font-size: 16px; font-weight: 800; color: #1B3A8C }
    .doc-num   { font-size: 10px; color: #888; margin-top: 2px }
    .doc-date  { font-size: 10px; color: #888 }

    /* Property info */
    .property-block {
      display: grid; grid-template-columns: 2fr 1fr;
      gap: 20px; margin-bottom: 20px;
    }
    .address      { font-size: 20px; font-weight: 900; color: #1B3A8C; line-height: 1.1 }
    .city-state   { font-size: 13px; color: #555; margin-top: 3px }
    .prop-specs   { display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap }
    .spec-item    { font-size: 10px; color: #666; background: #f3f4f6; padding: 3px 10px; border-radius: 100px }
    .summary-box  {
      background: #EEF2FB; border-radius: 10px; padding: 14px;
      border-left: 4px solid #1B3A8C;
    }
    .summary-row  { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px }
    .summary-row .lbl { color: #555 }
    .summary-row .val { font-weight: 700; color: #1B3A8C }
    .summary-row.total .lbl { font-weight: 800; color: #1B3A8C }
    .summary-row.total .val { font-size: 15px; color: #1B3A8C }
    .summary-row.gc   .val  { color: #1A7A4A; font-size: 13px }

    /* Section */
    .section { margin-bottom: 18px }
    .section-head {
      display: flex; align-items: center; gap: 8px;
      background: #1B3A8C; color: white;
      padding: 7px 14px; border-radius: 8px 8px 0 0;
      font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
    }
    .section-num {
      background: rgba(255,255,255,0.25); border-radius: 100px;
      width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 900;
    }

    /* Line item */
    .line-item {
      border: 1px solid #e5e7eb; border-top: none;
      page-break-inside: avoid;
    }
    .line-item:last-child { border-radius: 0 0 8px 8px }
    .line-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; background: #f9fafb; border-bottom: 1px solid #e5e7eb;
    }
    .line-system    { font-weight: 800; font-size: 12px; color: #111 }
    .line-condition {
      font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 100px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .cond-fair    { background: #FEF7EA; color: #8A5700 }
    .cond-poor    { background: #FEF3EA; color: #C45E1A }
    .cond-replace { background: #FEF0ED; color: #C0341D }
    .line-cost    { font-weight: 800; font-size: 12px; color: #1B3A8C; text-align: right }
    .line-range   { font-size: 9px; color: #888; text-align: right }
    .line-body    { padding: 8px 14px 10px }
    .line-scope   { font-size: 10px; color: #374151; margin-bottom: 4px }
    .line-note    { font-size: 10px; color: #6B7280; font-style: italic }

    /* Signature table */
    .sig-table { width: 100%; margin-top: 30px; border-collapse: collapse }
    .sig-cell  { width: 45%; vertical-align: bottom; padding-right: 20px }
    .sig-line  { border-bottom: 1.5px solid #374151; margin-bottom: 4px; height: 32px }
    .sig-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 1px }

    /* Critical warning */
    .critical-box {
      background: #FEF0ED; border: 1.5px solid #C0341D; border-radius: 8px;
      padding: 10px 14px; margin-bottom: 16px;
    }
    .critical-title { font-size: 10px; font-weight: 800; color: #C0341D; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px }
    .critical-text  { font-size: 10px; color: #C0341D }

    /* Totals box */
    .totals-box {
      border: 2px solid #1B3A8C; border-radius: 10px;
      overflow: hidden; margin-top: 20px; page-break-inside: avoid;
    }
    .totals-head {
      background: #1B3A8C; color: white; padding: 10px 16px;
      font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
    }
    .totals-body  { padding: 12px 16px }
    .totals-row   { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f3f4f6 }
    .totals-row:last-child { border-bottom: none }
    .totals-lbl   { color: #555; font-size: 11px }
    .totals-val   { font-weight: 700; font-size: 11px; color: #111 }
    .totals-final { background: #EEF2FB; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center }
    .totals-final-lbl { font-size: 12px; font-weight: 800; color: #1B3A8C }
    .totals-final-val { font-size: 20px; font-weight: 900; color: #1B3A8C }
    .totals-gc    { background: #ECFDF5; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center }
    .totals-gc-lbl { font-size: 11px; color: #065F46 }
    .totals-gc-val { font-size: 17px; font-weight: 900; color: #065F46 }

    /* Footer */
    .footer {
      margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb;
      font-size: 9px; color: #9CA3AF;
    }
    .contact-line { font-size: 10px; color: #1B3A8C; font-weight: 600; margin-bottom: 3px }

    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact }
      .section-head, .totals-head { background: #1B3A8C !important }
      .summary-box, .totals-final, .totals-gc { background-color: initial !important }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="logo">
      <div class="logo-name">SGC BUILT</div>
      <div class="logo-sub">General Contractors · (703) 944-9770 · projects@sgcbuilt.com</div>
    </div>
    <div class="doc-info">
      <div class="doc-title">SCOPE OF WORK</div>
      <div class="doc-num">Project #${projectNum}</div>
      <div class="doc-date">${today}</div>
      ${p.preparedFor ? `<div class="doc-date" style="margin-top:2px">Prepared for: <strong>${p.preparedFor}</strong></div>` : ''}
    </div>
  </div>

  <!-- Property info + summary -->
  <div class="property-block">
    <div>
      <div class="address">${p.address}</div>
      <div class="city-state">${p.city}, ${p.state} ${p.zip || ''}</div>
      <div class="prop-specs">
        ${p.beds    ? `<span class="spec-item">${p.beds} Bed</span>`          : ''}
        ${p.baths   ? `<span class="spec-item">${p.baths} Bath</span>`         : ''}
        ${p.sqft    ? `<span class="spec-item">${p.sqft.toLocaleString()} SF</span>` : ''}
        ${p.yearBuilt ? `<span class="spec-item">Built ${p.yearBuilt}</span>`  : ''}
      </div>
      ${p.arv ? `<div style="margin-top:10px;font-size:11px;color:#555">
        ARV: <strong style="color:#1B3A8C">${fmt$(p.arv)}</strong>
        ${p.purchasePrice ? ` &nbsp;|&nbsp; Purchase: <strong>${fmt$(p.purchasePrice)}</strong>` : ''}
      </div>` : ''}
    </div>
    <div class="summary-box">
      <div style="font-size:10px;font-weight:800;color:#1B3A8C;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">
        Cost Summary
      </div>
      <div class="summary-row">
        <span class="lbl">Subtotal (${activeItems.length} systems)</span>
        <span class="val">${fmt$(p.estimate.subtotal.mid)}</span>
      </div>
      <div class="summary-row">
        <span class="lbl">Contingency (10%)</span>
        <span class="val">${fmt$(p.estimate.contingency10)}</span>
      </div>
      <div class="summary-row total" style="border-top:1.5px solid #1B3A8C;padding-top:6px;margin-top:4px">
        <span class="lbl">Total Estimate</span>
        <span class="val">${fmt$(p.estimate.total.mid)}</span>
      </div>
      <div class="summary-row gc">
        <span class="lbl">SGC GC Cost</span>
        <span class="val">${fmt$(p.estimate.albertCost)}</span>
      </div>
    </div>
  </div>

  <!-- Critical warning -->
  ${p.estimate.highPriorityItems.length > 0 ? `
  <div class="critical-box">
    <div class="critical-title">⚠ Critical Systems — Require Inspection Before Finalizing Budget</div>
    <div class="critical-text">${p.estimate.highPriorityItems.join(' · ')} — Estimates below are preliminary. Obtain specialist quotes before committing to these figures.</div>
  </div>` : ''}

  <!-- Line items -->
  ${activeItems.map((item, idx) => {
    const sys = p.systems.find(s => s.id === item.system)
    const condClass = item.condition === 'replace' ? 'cond-replace' : item.condition === 'poor' ? 'cond-poor' : 'cond-fair'
    const condDetail = CONDITION_DETAIL[item.condition]
    return `
  <div class="section">
    <div class="section-head">
      <span class="section-num">${idx + 1}</span>
      ${SYSTEM_NAMES[item.system] || item.system}
    </div>
    <div class="line-item">
      <div class="line-header">
        <div>
          <div class="line-system">${SYSTEM_NAMES[item.system] || item.system}</div>
          <span class="line-condition ${condClass}">${condDetail.label}</span>
        </div>
        <div>
          <div class="line-cost">${fmt$(item.mid)}</div>
          <div class="line-range">${fmtR(item.low, item.high)}</div>
        </div>
      </div>
      <div class="line-body">
        <div class="line-scope">${condDetail.scope}</div>
        <div class="line-note">${item.note}</div>
        ${sys?.note ? `<div class="line-note" style="margin-top:3px;color:#374151">Notes: ${sys.note}</div>` : ''}
      </div>
    </div>
  </div>`
  }).join('')}

  <!-- Totals -->
  <div class="totals-box">
    <div class="totals-head">Project Cost Summary</div>
    <div class="totals-body">
      ${activeItems.map(item => `
      <div class="totals-row">
        <span class="totals-lbl">${SYSTEM_NAMES[item.system] || item.system}</span>
        <span class="totals-val">${fmt$(item.mid)}</span>
      </div>`).join('')}
      <div class="totals-row" style="border-top:2px solid #e5e7eb;margin-top:6px;padding-top:8px">
        <span class="totals-lbl">Subtotal</span>
        <span class="totals-val">${fmt$(p.estimate.subtotal.mid)}</span>
      </div>
      <div class="totals-row">
        <span class="totals-lbl">Contingency (10%)</span>
        <span class="totals-val">${fmt$(p.estimate.contingency10)}</span>
      </div>
    </div>
    <div class="totals-final">
      <span class="totals-final-lbl">Total Retail Estimate</span>
      <span class="totals-final-val">${fmt$(p.estimate.total.mid)}</span>
    </div>
    <div class="totals-gc">
      <span class="totals-gc-lbl">SGC General Contractors Cost (approx. 22% below retail)</span>
      <span class="totals-gc-val">${fmt$(p.estimate.albertCost)}</span>
    </div>
  </div>

  ${p.notes ? `
  <div style="margin-top:20px;padding:12px 16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#374151;margin-bottom:6px">Additional Notes</div>
    <div style="font-size:11px;color:#374151;line-height:1.7">${p.notes}</div>
  </div>` : ''}

  <!-- Signatures -->
  <table class="sig-table">
    <tr>
      <td class="sig-cell">
        <div class="sig-line"></div>
        <div class="sig-label">Albert Salomon — SGC General Contractors</div>
        <div style="font-size:9px;color:#aaa;margin-top:2px">Owner · (703) 944-9770 · projects@sgcbuilt.com</div>
      </td>
      <td width="10%"></td>
      <td class="sig-cell">
        <div class="sig-line"></div>
        <div class="sig-label">${p.preparedFor || 'Client / Contractor'} — Date</div>
      </td>
    </tr>
  </table>

  <!-- Footer -->
  <div class="footer">
    <div class="contact-line">SGC General Contractors · sgcbuilt.com · (703) 944-9770 · projects@sgcbuilt.com</div>
    This scope of work is an estimate based on visual inspection and market pricing (VA/NC regional rates, May 2026 — RSMeans + HomeAdvisor).
    Final costs subject to change upon detailed inspection. All work performed to applicable building codes and permitting requirements.
    Estimate valid for 30 days from issue date. Project #${projectNum} · Generated by FlipScan Pro · sgcflip.com
  </div>

  <script>setTimeout(() => window.print(), 600)</script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close() }
}
