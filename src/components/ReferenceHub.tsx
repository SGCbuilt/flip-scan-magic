import { useState } from 'react'
// Reference Hub — Free portals + paid lead source analysis
// All links verified real, all data from live research May 2026

const FREE_PORTALS = [
  {
    name: 'HUD HomeStore',
    icon: '🏛️',
    badge: 'Free',
    badgeColor: '#1A7A4A',
    badgeBg: '#EDFAF3',
    tagline: 'FHA Foreclosures — Government Owned',
    discount: '10–30% below market',
    coverage: 'All 50 states',
    description: 'HUD forecloses on properties with FHA-insured mortgages and sells them to recover losses. You must use a HUD-registered broker to bid. Owner-occupants get exclusive first 15 days, then investors can bid.',
    howTo: 'Filter by state/county/city/zip. Download the PCR (Property Condition Report). Check "IE" (insured, FHA-eligible) vs "UN" (uninsured — needs rehab, deeper discount).',
    tips: [
      'Sort by Days on Market — 30+ days = eligible for automatic price reduction',
      '"UN" uninsured = heavier rehab but significantly lower starting price',
      'HUD accepts sealed bids — submit through your registered agent',
      'Properties sold strictly as-is — get an inspection contingency waived upfront',
    ],
    url: 'https://www.hudhomestore.gov',
    color: '#185FA5',
    bg: '#E6F1FB',
  },
  {
    name: 'Fannie Mae HomePath',
    icon: '🏠',
    badge: 'Free',
    badgeColor: '#1A7A4A',
    badgeBg: '#EDFAF3',
    tagline: 'Fannie Mae REO — No Appraisal Required',
    discount: '5–25% below market',
    coverage: 'All 50 states',
    description: 'Fannie Mae REO properties from foreclosures on conventional loans. Major advantage: no appraisal or mortgage insurance required. Up to 3% closing cost assistance available. Generally cleaner title than HUD.',
    howTo: 'Search by state/city/zip. Note the "First Look" expiration date — after that date investors can bid. Set up email alerts for target zip codes.',
    tips: [
      'After First Look (15 days) expires — investor window opens. Set alerts.',
      'HomePath properties often have better condition than HUD — Fannie maintains them',
      'No appraisal = faster close, less risk of deal falling through financing',
      'Check price history tab — Fannie reduces prices on sitting inventory on a schedule',
    ],
    url: 'https://www.homepath.fanniemae.com',
    color: '#1A7A4A',
    bg: '#EDFAF3',
  },
  {
    name: 'Freddie Mac HomeSteps',
    icon: '🏡',
    badge: 'Free',
    badgeColor: '#1A7A4A',
    badgeBg: '#EDFAF3',
    tagline: 'Freddie Mac REO — 20-Day First Look',
    discount: '5–20% below market',
    coverage: 'All 50 states',
    description: 'Freddie Mac REO with a 20-day First Look window for non-investors. After that, investors can participate openly. Freddie Mac is transparent about which properties investors can bid on.',
    howTo: 'Create account for email alerts on new listings. Filter by state and price. Ask your agent to check listing dates to know when First Look expires on specific properties.',
    tips: [
      'Freddie Mac confirms investor eligibility clearly — no guessing',
      'Prices automatically reduce on schedule — ask agent about reduction history',
      'Generally sold as-is but in better condition than distressed private sales',
      'Less competition than HUD because fewer investors know about HomeSteps',
    ],
    url: 'https://www.homesteps.com',
    color: '#6B3FAD',
    bg: '#F3EDFE',
  },
  {
    name: 'Auction.com',
    icon: '🔨',
    badge: 'Free to browse',
    badgeColor: '#8A5700',
    badgeBg: '#FEF7EA',
    tagline: 'Live REO & Courthouse Auctions',
    discount: '15–40% below market',
    coverage: 'All 50 states',
    description: 'Largest online foreclosure auction platform. Combines bank-owned REO with live courthouse step auctions streamed online. Cash required — no contingencies. Deepest discounts available but highest risk.',
    howTo: 'Set up saved searches with email alerts. Register free. For courthouse auctions do a title search first — you buy as-is including any encumbrances.',
    tips: [
      'Bank-Owned section = clear title (safer). Courthouse = title risk, do homework',
      'Opening bid is NOT the final price — auctions start there and go up',
      'Add 5% buyer premium to your bid when calculating max offer',
      'New auctions added daily — check alerts every morning for fresh inventory',
    ],
    url: 'https://www.auction.com',
    color: '#C0341D',
    bg: '#FCEBEB',
  },
  {
    name: 'USDA Rural Development',
    icon: '🌾',
    badge: 'Free',
    badgeColor: '#1A7A4A',
    badgeBg: '#EDFAF3',
    tagline: 'Rural Foreclosures — Very Low Competition',
    discount: '10–35% below market',
    coverage: 'Rural areas, all states',
    description: 'USDA-owned rural properties from foreclosed Rural Development loans. Extremely low competition because most investors overlook rural markets. Often includes significant acreage. USDA financing may apply to your buyer.',
    howTo: 'Click your target state on the map. Properties listed with full address, price, and description. Call the listed state USDA office directly to schedule showings — they are responsive.',
    tips: [
      'Rural = very few investors bidding. You may be the only offer.',
      'USDA 0%-down loans may be available to your end buyer — widens your buyer pool',
      'Properties often held a long time — USDA is motivated to move inventory',
      'Inspect well/septic carefully — rural utilities need expert evaluation',
    ],
    url: 'https://www.sc.egov.usda.gov/data/RD_Properties.html',
    color: '#3B6D11',
    bg: '#EAF3DE',
  },
  {
    name: 'VA Foreclosures',
    icon: '🎖️',
    badge: 'Free',
    badgeColor: '#1A7A4A',
    badgeBg: '#EDFAF3',
    tagline: 'Veterans Affairs REO — Less Competition',
    discount: '5–15% below market',
    coverage: 'All 50 states',
    description: 'VA-owned properties from foreclosures on VA-guaranteed loans. Sold through licensed real estate agents on MLS. No owner-occupant restriction — investors can purchase. Typically better condition than HUD.',
    howTo: 'Ask any licensed agent to search MLS for VA REO listings. Properties listed by VA-approved asset management companies. Standard purchase contract process.',
    tips: [
      'VA REO appears on MLS — your agent can search directly in any market',
      'No owner-occupant exclusion period — you can bid from day 1',
      'Typically priced at or near market — discount comes from negotiation',
      'VA responds quickly — faster close possible compared to HUD/Fannie',
    ],
    url: 'https://listings.vacares.com',
    color: '#534AB7',
    bg: '#EEEDFE',
  },
  {
    name: 'CourtListener — Bankruptcy',
    icon: '⚖️',
    badge: 'Free API',
    badgeColor: '#185FA5',
    badgeBg: '#E6F1FB',
    tagline: 'Federal Court Filings — Earliest Possible Signal',
    discount: 'Pre-market opportunity',
    coverage: 'All 94 federal court districts',
    description: 'Free Law Project maintains the largest free archive of federal bankruptcy filings. Ch.7 = liquidation (forced sale of assets). Ch.13 = reorganization (may sell to repay debt). You see this BEFORE any property hits the market.',
    howTo: 'Create free account at courtlistener.com. Get API token from your profile. Search by court district, date filed, nature of suit. Contact bankruptcy trustee directly — they manage asset sales.',
    tips: [
      'Ch.7 liquidation = trustee MUST sell assets — contact them, not the owner',
      'Fresh filings (< 30 days) = earliest window before any agent gets involved',
      'Search "real property" + your state bankruptcy court slug (e.g. vaeb for VA)',
      'Combine with property record lookup — find the address from the owner name',
      'API is free — create account at courtlistener.com → Profile → API Token',
    ],
    url: 'https://www.courtlistener.com',
    color: '#854F0B',
    bg: '#FAEEDA',
  },
  {
    name: 'Zillow & Redfin Distressed Filters',
    icon: '🔍',
    badge: 'Free',
    badgeColor: '#1A7A4A',
    badgeBg: '#EDFAF3',
    tagline: 'MLS Foreclosures & Price-Reduced Listings',
    discount: '5–20% below market',
    coverage: 'All 50 states',
    description: 'Both Zillow and Redfin have specific filters for foreclosures, pre-foreclosures, and price-reduced listings on MLS. Less hidden than true off-market but often ignored by retail buyers scared of the process.',
    howTo: 'Zillow: More Filters → Listing Type → Foreclosures + Pre-Foreclosures. Redfin: Filters → Listing Status → Foreclosure. Both: sort by Days on Market descending.',
    tips: [
      '"Pre-foreclosure" on Zillow = NOD filed — contact owner DIRECTLY before bank takes over',
      'Sort by DOM descending — 90+ days = seller is anxious and negotiable',
      '"Price Reduced" filter combined with high DOM = most motivated sellers on MLS',
      'Set email alerts for new foreclosure listings in your target zip codes',
    ],
    url: 'https://www.zillow.com/homes/for_sale/',
    color: '#006AFF',
    bg: '#E6F0FF',
  },
]

const PAID_SOURCES = [
  {
    rank: 1,
    name: 'PropStream',
    icon: '⭐',
    badge: 'Best Overall',
    badgeColor: '#1A7A4A',
    badgeBg: '#EDFAF3',
    price: '$99/mo',
    trial: '7-day free trial + 50 leads',
    roi: '1 deal per 400–500 contacts',
    verdict: 'Best starting platform for SGC. Most complete data set, built-in skip tracing, direct mail, and now AI calling via BatchLeads acquisition.',
    bestFor: 'Building targeted lists of pre-foreclosure, tax delinquent, absentee owners, and vacant properties. Stack multiple signals to find the most motivated sellers.',
    keyFeatures: [
      '160M+ properties nationwide',
      '165+ search filters including NOD, tax delinquent, absentee, vacant, high equity',
      'Built-in skip tracing at $0.10/contact',
      'Direct mail postcards sent from platform',
      'MLS comps built in',
      'List Automator ($27/mo add-on) — alerts when properties hit distress signals',
      'Acquired BatchLeads (July 2025) — AI calling integration coming',
    ],
    proTip: 'Stack: Pre-Foreclosure + Absentee Owner + High Equity (>40%) + Owned 5+ years = ultra-motivated seller list. This combination gives you 5–10x higher response rates than single filters.',
    url: 'https://www.propstream.com',
    color: '#1A7A4A',
    bg: '#EDFAF3',
    highlight: true,
  },
  {
    rank: 2,
    name: 'REsimpli',
    icon: '🏆',
    badge: 'Best All-in-One CRM',
    badgeColor: '#1B3A8C',
    badgeBg: '#EEF2FB',
    price: '$149/mo (Basic)',
    trial: '30-day free trial',
    roi: 'Highest conversion rate — AI follow-up 3–5x more closes',
    verdict: 'If you want ONE tool that does everything — data, skip tracing, CRM, AI calling, SMS, accounting — this is it. Built by an investor who closed 750+ deals himself.',
    bestFor: 'Investors who want to eliminate the complexity of managing 5 different tools. REsimpli replaces PropStream + BatchLeads + DealMachine + a CRM + QuickBooks.',
    keyFeatures: [
      '9 AI agents call, text, and follow up automatically while you sleep',
      'Includes driving for dollars app (no DealMachine needed)',
      'Built-in skip tracing with litigator scrub + confidence scoring',
      'List stacking: absentee + pre-foreclosure + high equity in one search',
      'KPI dashboard: cost per lead, ROI per channel, team performance',
      'Built-in accounting replaces QuickBooks',
      '30-day free trial — most complete trial in the industry',
    ],
    proTip: 'The 9 AI agents are the real differentiator. You pull a list, the AI calls and texts every contact, scores responses by motivation level, and flags the hot ones for you. You only talk to people who are ready to sell.',
    url: 'https://www.resimpli.com',
    color: '#1B3A8C',
    bg: '#EEF2FB',
    highlight: false,
  },
  {
    rank: 3,
    name: 'DealMachine',
    icon: '📱',
    badge: 'Best Mobile / Field',
    badgeColor: '#C45E1A',
    badgeBg: '#FEF3EA',
    price: '$49–99/mo',
    trial: '7-day free trial',
    roi: '1 deal per 200 doors in target areas',
    verdict: 'Unbeatable for driving target neighborhoods. Spot a distressed house, pull owner data instantly, launch outreach from your car. Best tool for visual distress identification.',
    bestFor: 'Contractors and investors who drive their target neighborhoods. You can spot rehab opportunities with your eyes that no database can show — broken windows, peeling paint, overgrown yards.',
    keyFeatures: [
      'Spot distressed property → tap → instant owner name, phone, equity data',
      'AI assistant (Alma) calculates offer price and generates cold call scripts on the spot',
      'Direct mail postcards sent from the app immediately',
      'Route tracking — build systematic neighborhood coverage',
      'Skip tracing built into the mobile workflow',
      'Integrates with PropStream — pull list, then drive those streets',
    ],
    proTip: 'For SGC as a GC, driving for dollars has an extra advantage — you can spot construction quality issues and estimate rehab costs on sight while pulling owner data. Your contractor eye gives you an edge no software has.',
    url: 'https://www.dealmachine.com',
    color: '#C45E1A',
    bg: '#FEF3EA',
    highlight: false,
  },
  {
    rank: 4,
    name: 'ATTOM Data',
    icon: '🏦',
    badge: 'Best Foreclosure Depth',
    badgeColor: '#854F0B',
    badgeBg: '#FAEEDA',
    price: '$150–500/mo',
    trial: 'Demo required',
    roi: 'Institutional — used by hedge funds',
    verdict: 'The deepest foreclosure pipeline data available. Tracks NOD → Lis Pendens → Auction Date → REO status in real time. Best for investors who want to catch deals at every stage of the foreclosure process.',
    bestFor: 'Serious investors who want to track the full foreclosure timeline, not just the end result. Know about a property the moment a Notice of Default is filed — months before it hits any portal.',
    keyFeatures: [
      'Full foreclosure pipeline: NOD → auction → REO in real time',
      'Auction dates and opening bids before they are publicly listed',
      'Full REST API for integration into your own systems',
      'Property condition scoring from MLS photos',
      '155M+ property records',
      'Used by institutional investors — you get the same data',
    ],
    proTip: 'The NOD (Notice of Default) alert is the killer feature. When a homeowner misses 3 payments, ATTOM knows before the courthouse does. You can contact the owner while they still have time to avoid foreclosure — lowest competition window.',
    url: 'https://www.attomdata.com',
    color: '#854F0B',
    bg: '#FAEEDA',
    highlight: false,
  },
  {
    rank: 5,
    name: 'Goliath Data',
    icon: '🎯',
    badge: 'Best ROI Per Lead (2025)',
    badgeColor: '#534AB7',
    badgeBg: '#EEEDFE',
    price: 'Custom — contact for pricing',
    trial: 'Demo required',
    roi: '1 deal per 75–100 contacts (vs 400+ elsewhere)',
    verdict: 'New in 2025, disrupting the market. AI predicts which owners will sell before they even know it themselves. You call fewer people and close more deals. Worth the higher price for serious operators.',
    bestFor: 'Investors who want precision over volume. Instead of blasting 1,000 contacts to find 2 deals, Goliath scores 1,000 and you call the top 75 — and still find 2 deals.',
    keyFeatures: [
      'David AI scores every property 0–100 for likelihood to sell',
      'Uses 50+ signals: ownership tenure, payment behavior, local trends, life events',
      'Data Pipelines → Command Center → closed deals (full workflow)',
      'Predicts sellers 60–90 days before they list',
      'Pulls from public + private data sources + behavioral signals',
      'Built for scale — multi-user team support',
    ],
    proTip: '5x better conversion rate than traditional list marketing. If you spend $500/mo on PropStream and close 1 deal, the same budget on Goliath closes 5. The math favors precision over volume every time.',
    url: 'https://goliathdata.com',
    color: '#534AB7',
    bg: '#EEEDFE',
    highlight: false,
  },
]

export default function ReferenceHub() {
  const [section, setSection] = useState<'free' | 'paid'>('free')
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* Tab switcher */}
      <div className="flex-shrink-0 px-6 pt-5 flex gap-2">
        {[
          { id: 'free', label: '🏛️ Free Sources', sub: `${FREE_PORTALS.length} portals` },
          { id: 'paid', label: '💎 Paid Lead Providers', sub: 'ranked by ROI' },
        ].map(t => (
          <button key={t.id} onClick={() => setSection(t.id as any)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-semibold border border-b-0 cursor-pointer transition-all"
            style={section === t.id
              ? { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-navy)' }
              : { background: 'transparent', borderColor: 'transparent', color: 'var(--sgc-gray-mid)' }}>
            {t.label}
            <span className="text-[10px] font-normal" style={{ color: section === t.id ? 'var(--sgc-gray-mid)' : 'var(--sgc-gray-mid)' }}>
              {t.sub}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ background: 'white', borderTop: `1px solid var(--sgc-gray-border)` }}>
        <div className="p-6 max-w-5xl">

          {/* ── FREE PORTALS ── */}
          {section === 'free' && (
            <div className="space-y-4">
              <div className="mb-5">
                <h2 className="text-base font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>Free Government & Public Sources</h2>
                <p className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                  These portals are 100% free. Click any link to search directly on the source website. No subscriptions, no sign-up required for most.
                </p>
              </div>

              {FREE_PORTALS.map(p => (
                <div key={p.name} className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: expanded === p.name ? p.color + '40' : 'var(--sgc-gray-border)', background: 'white' }}>

                  {/* Header — always visible */}
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer"
                    onClick={() => setExpanded(expanded === p.name ? null : p.name)}
                    style={{ background: expanded === p.name ? p.bg : 'white' }}>
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{ background: p.bg }}>
                      {p.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-bold" style={{ color: 'var(--sgc-black)' }}>{p.name}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: p.badgeBg, color: p.badgeColor }}>{p.badge}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: '#EDFAF3', color: '#1A7A4A' }}>{p.discount}</span>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{p.tagline} · {p.coverage}</div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                        style={{ background: p.color }}
                        onClick={e => e.stopPropagation()}>
                        Open ↗
                      </a>
                      <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                        {expanded === p.name ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded === p.name && (
                    <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: p.color }}>What It Is</div>
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--sgc-black)' }}>{p.description}</p>

                          <div className="text-xs font-semibold uppercase tracking-wider mb-2 mt-4" style={{ color: p.color }}>How to Search</div>
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--sgc-black)' }}>{p.howTo}</p>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: p.color }}>Investor Tips</div>
                          <ul className="space-y-2">
                            {p.tips.map((tip, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--sgc-black)' }}>
                                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                                  style={{ background: p.color }}>{i + 1}</span>
                                {tip}
                              </li>
                            ))}
                          </ul>
                          <a href={p.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 mt-4 text-sm font-bold px-4 py-2 rounded-xl text-white"
                            style={{ background: p.color }}>
                            Search {p.name} ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── PAID SOURCES ── */}
          {section === 'paid' && (
            <div className="space-y-5">
              <div className="mb-5">
                <h2 className="text-base font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>Paid Lead Provider Comparison</h2>
                <p className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                  Ranked by ROI for a fix-and-flip / GC operation. All pricing and data verified May 2026.
                  To connect any of these to FlipScan, use the <strong>Deal Hunter</strong> tab → Connect API.
                </p>
              </div>

              {PAID_SOURCES.map(s => (
                <div key={s.name} className="rounded-2xl border overflow-hidden"
                  style={{
                    borderColor: s.highlight ? s.color + '60' : expanded === s.name ? s.color + '40' : 'var(--sgc-gray-border)',
                    boxShadow: s.highlight ? `0 0 0 1px ${s.color}20` : 'none',
                  }}>

                  {/* Rank banner */}
                  {s.highlight && (
                    <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${s.color}, ${s.color}80)` }} />
                  )}

                  {/* Header */}
                  <div className="flex items-center gap-4 p-4 cursor-pointer"
                    onClick={() => setExpanded(expanded === s.name ? null : s.name)}
                    style={{ background: expanded === s.name || s.highlight ? s.bg : 'white' }}>

                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{ background: s.bg }}>
                      {s.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-[10px] font-bold" style={{ color: s.color }}>#{s.rank}</span>
                        <span className="text-sm font-bold" style={{ color: 'var(--sgc-black)' }}>{s.name}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: s.badgeBg, color: s.badgeColor }}>{s.badge}</span>
                      </div>
                      <div className="text-xs flex items-center gap-2 flex-wrap" style={{ color: 'var(--sgc-gray-mid)' }}>
                        <span style={{ color: 'var(--sgc-navy)', fontWeight: 600 }}>{s.price}</span>
                        <span>·</span>
                        <span>{s.trial}</span>
                        <span>·</span>
                        <span>{s.roi}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <a href={s.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                        style={{ background: s.color }}
                        onClick={e => e.stopPropagation()}>
                        Visit ↗
                      </a>
                      <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                        {expanded === s.name ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded */}
                  {expanded === s.name && (
                    <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: s.color }}>Verdict for SGC</div>
                          <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--sgc-black)' }}>{s.verdict}</p>

                          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: s.color }}>Best For</div>
                          <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--sgc-black)' }}>{s.bestFor}</p>

                          {/* Pro tip */}
                          <div className="rounded-xl p-3" style={{ background: s.bg }}>
                            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: s.color }}>⚡ Power User Tip</div>
                            <p className="text-xs leading-relaxed" style={{ color: 'var(--sgc-black)' }}>{s.proTip}</p>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: s.color }}>Key Features</div>
                          <ul className="space-y-1.5 mb-4">
                            {s.keyFeatures.map((f, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--sgc-black)' }}>
                                <span style={{ color: s.color, fontWeight: 700, flexShrink: 0 }}>✓</span>
                                {f}
                              </li>
                            ))}
                          </ul>
                          <div className="flex gap-2">
                            <a href={s.url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl text-white"
                              style={{ background: s.color }}>
                              Start Free Trial ↗
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
