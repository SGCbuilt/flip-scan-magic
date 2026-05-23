/**
 * Wholesale Deal Machine
 *
 * Generates professional deal summaries for your wholesale buyer list.
 * Tracks which leads are listed for wholesale, pending, or closed.
 * 
 * Two outputs:
 *   1. PDF-ready HTML summary (opens in new tab → Print → Save as PDF)
 *   2. Email-ready text summary (copy/paste to send directly)
 *
 * Storage: localStorage — all wholesale deals persist between sessions
 */

import { PipelineLead } from './pipeline'

// ── Types ─────────────────────────────────────────────────────────────────────
export type WholesaleStatus = 'listed' | 'pending' | 'closed' | 'pulled'

export interface WholesaleDeal {
  id:             string
  leadId:         string
  address:        string
  city:           string
  state:          string
  zip:            string
  county:         string
  signalLabel:    string
  investorScore:  number

  // Deal numbers
  arv:            number
  rehab:          number
  contractPrice:  number  // what you have it under contract for
  assignmentFee:  number  // your profit
  askingPrice:    number  // contractPrice + assignmentFee

  // Property details
  beds:           number
  baths:          number
  sqft:           number
  yearBuilt:      number
  propertyType:   string
  description:    string  // your notes about the property
  photos:         string  // Zillow/Google Maps URL

  // Wholesale tracking
  status:         WholesaleStatus
  listedAt:       string
  updatedAt:      string
  closedAt?:      string
  buyerName?:     string
  assignmentPaid?: number  // actual fee collected

  // Marketing
  sentTo:         string[]  // buyer names/emails it was sent to
  views:          number
}

const STORAGE_KEY = 'flipscan_wholesale_v1'

function load(): WholesaleDeal[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function save(deals: WholesaleDeal[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(deals)) } catch {}
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export function getWholesaleDeals(): WholesaleDeal[] {
  return load().sort((a, b) => b.listedAt.localeCompare(a.listedAt))
}

export function getWholesaleDeal(id: string): WholesaleDeal | null {
  return load().find(d => d.id === id) || null
}

export function isWholesaleListed(leadId: string): boolean {
  return load().some(d => d.leadId === leadId && d.status !== 'pulled')
}

export function createWholesaleDeal(
  lead: PipelineLead,
  params: Pick<WholesaleDeal, 'arv'|'rehab'|'contractPrice'|'assignmentFee'|'description'|'photos'|'beds'|'baths'|'sqft'|'yearBuilt'|'propertyType'>
): WholesaleDeal {
  const askingPrice = params.contractPrice + params.assignmentFee
  const deal: WholesaleDeal = {
    id:            `ws-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    leadId:        lead.id,
    address:       lead.address,
    city:          lead.city,
    state:         lead.state,
    zip:           lead.zip,
    county:        lead.county,
    signalLabel:   lead.signalLabel,
    investorScore: lead.investorScore,
    askingPrice,
    status:        'listed',
    listedAt:      new Date().toISOString(),
    updatedAt:     new Date().toISOString(),
    sentTo:        [],
    views:         0,
    ...params,
  }
  save([deal, ...load()])
  return deal
}

export function updateWholesaleDeal(id: string, updates: Partial<WholesaleDeal>): void {
  const all = load()
  const idx = all.findIndex(d => d.id === id)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() }
    save(all)
  }
}

export function closeWholesaleDeal(id: string, buyerName: string, assignmentPaid: number): void {
  updateWholesaleDeal(id, {
    status: 'closed',
    buyerName,
    assignmentPaid,
    closedAt: new Date().toISOString(),
  })
}

export function pullWholesaleDeal(id: string): void {
  updateWholesaleDeal(id, { status: 'pulled' })
}

export function getWholesaleStats() {
  const all = load()
  const active = all.filter(d => d.status === 'listed' || d.status === 'pending')
  const closed = all.filter(d => d.status === 'closed')
  const totalFees = closed.reduce((s, d) => s + (d.assignmentPaid || 0), 0)
  return { active: active.length, closed: closed.length, totalFees, total: all.length }
}

// ── PDF Generator ─────────────────────────────────────────────────────────────
export function generateWholesalePDF(deal: WholesaleDeal): void {
  const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'
  const buyerProfit   = deal.arv - deal.askingPrice - deal.rehab
  const buyerROI      = deal.arv > 0
    ? Math.round((buyerProfit / (deal.askingPrice + deal.rehab)) * 100)
    : 0
  const maxOffer70    = Math.round(deal.arv * 0.70 - deal.rehab)
  const passes70      = deal.askingPrice <= maxOffer70

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Deal Summary — ${deal.address}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { margin:0; padding:0; box-sizing:border-box }
    body {
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      color: #111827; background: #fff;
      padding: 48px; max-width: 820px; margin: 0 auto;
    }

    /* Header */
    .header {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 24px; margin-bottom: 32px;
      border-bottom: 4px solid #1B3A8C;
    }
    .logo-text { font-size: 26px; font-weight: 900; color: #1B3A8C; letter-spacing: -1px }
    .logo-sub  { font-size: 10px; color: #6B7280; letter-spacing: 3px; text-transform: uppercase; margin-top: 2px }
    .badge { text-align: right }
    .badge-label { font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: 1.5px }
    .badge-date  { font-size: 14px; color: #1B3A8C; font-weight: 700; margin-top: 2px }

    /* Exclusive tag */
    .exclusive {
      display: inline-flex; align-items: center; gap: 6px;
      background: #C0341D; color: white;
      padding: 6px 14px; border-radius: 100px;
      font-size: 11px; font-weight: 800; letter-spacing: 1px;
      text-transform: uppercase; margin-bottom: 20px;
    }

    /* Address */
    .address     { font-size: 34px; font-weight: 900; color: #111827; line-height: 1.05; margin-bottom: 6px }
    .city-line   { font-size: 18px; color: #6B7280; margin-bottom: 16px }
    .signal-pill {
      display: inline-block; background: #FEF3EA;
      color: #C45E1A; padding: 5px 14px; border-radius: 100px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    }

    /* Numbers grid */
    .nums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 28px 0 }
    .num-card {
      border-radius: 14px; padding: 18px 16px; text-align: center;
      border: 2px solid;
    }
    .num-card.arv     { border-color: #1B3A8C; background: #EEF2FB }
    .num-card.price   { border-color: #374151; background: #F9FAFB }
    .num-card.profit  { border-color: #1A7A4A; background: #ECFDF5 }
    .num-label { font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px }
    .num-value { font-size: 30px; font-weight: 900; line-height: 1 }
    .num-card.arv    .num-value { color: #1B3A8C }
    .num-card.price  .num-value { color: #111827 }
    .num-card.profit .num-value { color: #1A7A4A }
    .num-sub { font-size: 11px; color: #9CA3AF; margin-top: 6px }

    /* Rule check */
    .rule-check {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; border-radius: 10px; margin-bottom: 24px;
      background: ${passes70 ? '#ECFDF5' : '#FEF2F2'};
      border: 1px solid ${passes70 ? '#A7F3D0' : '#FECACA'};
    }
    .rule-icon { font-size: 18px }
    .rule-text { font-size: 13px; color: ${passes70 ? '#065F46' : '#991B1B'}; font-weight: 600 }

    /* Sections */
    .section { margin-bottom: 28px }
    .section-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 2px; color: #1B3A8C;
      padding-bottom: 8px; margin-bottom: 14px;
      border-bottom: 2px solid #E5E7EB;
    }

    /* Deal row */
    .deal-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 9px 0; border-bottom: 1px solid #F3F4F6;
    }
    .deal-row:last-child { border-bottom: none }
    .deal-key   { font-size: 14px; color: #6B7280 }
    .deal-value { font-size: 14px; font-weight: 700; color: #111827 }
    .deal-value.green { color: #065F46 }
    .deal-value.blue  { color: #1B3A8C }
    .deal-value.red   { color: #991B1B }

    /* Why section */
    .why-box {
      background: #FFFBEB; border: 1px solid #FCD34D;
      border-radius: 12px; padding: 16px; margin-bottom: 24px;
    }
    .why-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #92400E; margin-bottom: 8px }
    .why-text  { font-size: 13px; color: #374151; line-height: 1.6 }

    /* Property specs */
    .specs {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 12px; margin-bottom: 24px;
    }
    .spec { text-align: center; padding: 12px; background: #F9FAFB; border-radius: 10px }
    .spec-val   { font-size: 20px; font-weight: 900; color: #111827 }
    .spec-label { font-size: 10px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px }

    /* Notes */
    .notes-box { background: #F9FAFB; border-radius: 12px; padding: 16px; margin-bottom: 24px }
    .notes-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6B7280; margin-bottom: 8px }
    .notes-text  { font-size: 13px; color: #374151; line-height: 1.7 }

    /* Urgency banner */
    .urgency {
      background: linear-gradient(135deg, #C0341D, #8B1A0D);
      color: white; border-radius: 14px; padding: 20px 24px;
      text-align: center; margin-bottom: 24px;
    }
    .urgency-head { font-size: 16px; font-weight: 900; margin-bottom: 4px }
    .urgency-sub  { font-size: 13px; opacity: 0.85 }

    /* CTA */
    .cta {
      background: linear-gradient(135deg, #1B3A8C, #0F2460);
      color: white; border-radius: 16px; padding: 28px 32px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .cta-left { }
    .cta-name  { font-size: 20px; font-weight: 900; margin-bottom: 4px }
    .cta-title { font-size: 13px; opacity: 0.8; margin-bottom: 12px }
    .cta-detail { font-size: 14px; opacity: 0.9; margin-bottom: 4px }
    .cta-right { text-align: right }
    .cta-phone { font-size: 28px; font-weight: 900; letter-spacing: -0.5px }
    .cta-email { font-size: 14px; opacity: 0.8; margin-top: 4px }

    /* Disclaimer */
    .disclaimer { font-size: 10px; color: #D1D5DB; margin-top: 24px; line-height: 1.7; text-align: center }

    @media print {
      body { padding: 24px }
      .urgency { background: #C0341D !important; -webkit-print-color-adjust: exact; print-color-adjust: exact }
      .cta { background: #1B3A8C !important; -webkit-print-color-adjust: exact; print-color-adjust: exact }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div>
      <div class="logo-text">SGC BUILT</div>
      <div class="logo-sub">General Contractors · Deal Desk</div>
    </div>
    <div class="badge">
      <div class="badge-label">Wholesale Deal Summary</div>
      <div class="badge-date">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    </div>
  </div>

  <!-- Exclusive tag -->
  <div class="exclusive">🔒 Exclusive Assignment · First Come First Served</div>

  <!-- Address -->
  <div class="address">${deal.address}</div>
  <div class="city-line">${deal.city}, ${deal.state} ${deal.zip}${deal.county ? ' · ' + deal.county + ' County' : ''}</div>
  <div class="signal-pill">⚠ ${deal.signalLabel}</div>

  <!-- Numbers -->
  <div class="nums">
    <div class="num-card arv">
      <div class="num-label">After Repair Value</div>
      <div class="num-value">${fmt$(deal.arv)}</div>
      <div class="num-sub">Conservative market comp</div>
    </div>
    <div class="num-card price">
      <div class="num-label">Your Acquisition Price</div>
      <div class="num-value">${fmt$(deal.askingPrice)}</div>
      <div class="num-sub">Includes ${fmt$(deal.assignmentFee)} assignment fee</div>
    </div>
    <div class="num-card profit">
      <div class="num-label">Your Potential Profit</div>
      <div class="num-value">${fmt$(buyerProfit)}</div>
      <div class="num-sub">${buyerROI}% ROI after rehab</div>
    </div>
  </div>

  <!-- 70% Rule check -->
  <div class="rule-check">
    <span class="rule-icon">${passes70 ? '✅' : '⚠️'}</span>
    <span class="rule-text">
      70% Rule: ${fmt$(maxOffer70)} max allowable offer — your price of ${fmt$(deal.askingPrice)} ${passes70 ? 'PASSES ✓' : 'exceeds by ' + fmt$(deal.askingPrice - maxOffer70)}
    </span>
  </div>

  <!-- Why available -->
  <div class="why-box">
    <div class="why-title">⚠ Why This Property Is Available</div>
    <div class="why-text">${deal.description || deal.signalLabel + ' — detected through SGC proprietary lead system. Owner is motivated to sell quickly.'}</div>
  </div>

  <!-- Property specs (if available) -->
  ${(deal.beds || deal.baths || deal.sqft || deal.yearBuilt) ? `
  <div class="section">
    <div class="section-title">Property Details</div>
    <div class="specs">
      ${deal.beds ? `<div class="spec"><div class="spec-val">${deal.beds}</div><div class="spec-label">Bedrooms</div></div>` : ''}
      ${deal.baths ? `<div class="spec"><div class="spec-val">${deal.baths}</div><div class="spec-label">Bathrooms</div></div>` : ''}
      ${deal.sqft ? `<div class="spec"><div class="spec-val">${deal.sqft.toLocaleString()}</div><div class="spec-label">Sq Footage</div></div>` : ''}
      ${deal.yearBuilt ? `<div class="spec"><div class="spec-val">${deal.yearBuilt}</div><div class="spec-label">Year Built</div></div>` : ''}
    </div>
  </div>` : ''}

  <!-- Deal math -->
  <div class="section">
    <div class="section-title">Deal Math Breakdown</div>
    ${[
      ['After Repair Value (ARV)',       fmt$(deal.arv),                 ''],
      ['Your Acquisition Price',         fmt$(deal.askingPrice),         'blue'],
      ['Estimated Rehab',                fmt$(deal.rehab),               ''],
      ['Est. Selling Costs (6% + close)',fmt$(Math.round(deal.arv*0.08)),''],
      ['',                               '',                             ''],
      ["Buyer's Gross Profit",           fmt$(buyerProfit),              buyerProfit > 0 ? 'green' : 'red'],
      ['Return on Investment',           `${buyerROI}%`,                 buyerROI >= 20 ? 'green' : ''],
    ].filter(([k]) => k).map(([k, v, cls]) => `
    <div class="deal-row">
      <span class="deal-key">${k}</span>
      <span class="deal-value ${cls}">${v}</span>
    </div>`).join('')}
  </div>

  <!-- Photos link -->
  ${deal.photos ? `
  <div class="section">
    <div class="section-title">Property Photos</div>
    <p style="font-size:14px;color:#1B3A8C;font-weight:600">📸 ${deal.photos}</p>
  </div>` : ''}

  <!-- Urgency banner -->
  <div class="urgency">
    <div class="urgency-head">⏰ This Deal Will Not Last</div>
    <div class="urgency-sub">Call or email immediately to lock in. Assignment is on a first-come, first-served basis.</div>
  </div>

  <!-- CTA -->
  <div class="cta">
    <div class="cta-left">
      <div class="cta-name">Albert Salomon</div>
      <div class="cta-title">Owner · SGC General Contractors · Licensed GC</div>
      <div class="cta-detail">📧 projects@sgcbuilt.com</div>
      <div class="cta-detail">🌐 sgcbuilt.com · sgcflip.com</div>
    </div>
    <div class="cta-right">
      <div class="cta-phone">(703) 944-9770</div>
      <div class="cta-email">Call or text to lock in</div>
    </div>
  </div>

  <div class="disclaimer">
    This deal summary is provided to qualified real estate investors for informational purposes only.
    ARV and rehab estimates are approximations — conduct your own due diligence.
    Buyer is responsible for all inspections, title review, and verification of property condition.
    SGC General Contractors makes no guarantees regarding property value, condition, or title.
    Generated by FlipScan Pro · sgcflip.com · ${new Date().toLocaleDateString()}
  </div>

  <script>
    window.onload = function() {
      // Small delay to ensure styles load
      setTimeout(() => window.print(), 500)
    }
  </script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

// ── Email text generator ──────────────────────────────────────────────────────
export function generateWholesaleEmail(deal: WholesaleDeal): string {
  const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'
  const profit = deal.arv - deal.askingPrice - deal.rehab

  return `Subject: 🏠 DEAL ALERT: ${deal.address}, ${deal.city} ${deal.state} — ${fmt$(deal.askingPrice)}

Hey [Buyer Name],

Just locked up a new deal I think fits your buy box. Details below:

📍 ${deal.address}, ${deal.city}, ${deal.state} ${deal.zip}

THE NUMBERS:
• ARV (After Repair Value): ${fmt$(deal.arv)}
• Rehab Estimate: ${fmt$(deal.rehab)}
• Your Price (Assignment): ${fmt$(deal.askingPrice)}
• Your Potential Profit: ${fmt$(profit)}
• Buyer ROI: ${deal.arv > 0 ? Math.round((profit / (deal.askingPrice + deal.rehab)) * 100) : 0}%

WHY IT'S AVAILABLE:
${deal.description || deal.signalLabel}

${deal.photos ? `PHOTOS: ${deal.photos}` : ''}
${deal.beds ? `PROPERTY: ${deal.beds}bd/${deal.baths}ba${deal.sqft ? ', ' + deal.sqft.toLocaleString() + ' sqft' : ''}${deal.yearBuilt ? ', built ' + deal.yearBuilt : ''}` : ''}

This is an exclusive assignment — first serious buyer locks it in.

Call or text me directly:
Albert Salomon — SGC General Contractors
📞 (703) 944-9770
✉️ projects@sgcbuilt.com

—Albert`
}

// Keep backward compat
export function generateWholesaleSummary(p: {
  lead: PipelineLead
  arv: number
  rehab: number
  contractPrice: number
  assignmentFee: number
  askingPrice: number
  description?: string
  photos?: string
}): void {
  const deal: WholesaleDeal = {
    id: 'preview',
    leadId: p.lead.id,
    address: p.lead.address,
    city: p.lead.city,
    state: p.lead.state,
    zip: p.lead.zip,
    county: p.lead.county,
    signalLabel: p.lead.signalLabel,
    investorScore: p.lead.investorScore,
    arv: p.arv,
    rehab: p.rehab,
    contractPrice: p.contractPrice,
    assignmentFee: p.assignmentFee,
    askingPrice: p.askingPrice,
    description: p.description || '',
    photos: p.photos || '',
    beds: 0, baths: 0, sqft: 0, yearBuilt: 0, propertyType: '',
    status: 'listed',
    listedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sentTo: [],
    views: 0,
  }
  generateWholesalePDF(deal)
}
