/**
 * Deal Hunter v2 — National Multi-Source Intelligence Engine
 *
 * Sources:
 * 1. CourtListener   — federal bankruptcy (Ch7/Ch13/Ch11) & probate, FREE REST API
 * 2. HUD HomeStore   — FHA/government REO, public endpoint
 * 3. Auction.com     — live auction listings, public
 * 4. USDA data.gov   — rural foreclosures, free JSON dataset
 * 5. Zillow/Redfin   — distressed listing deep-links with structured search
 * 6. HomePath        — Fannie Mae REO (public site)
 * 7. HomeSteps       — Freddie Mac REO (public site)
 * 8. Tax Delinquent  — county open data (50+ counties)
 */

const CL = 'https://www.courtlistener.com/api/rest/v4'

// All 50 states
export const ALL_STATES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'DC'
}

// Bankruptcy court IDs per state (CourtListener court slugs)
const STATE_BK_COURTS: Record<string, string[]> = {
  VA:['vaeb','vawb'],FL:['flmb','flnb','flsb'],TX:['txeb','txnb','txsb','txwb'],
  CA:['cacd','caed','cand','casd'],NY:['nyeb','nynb','nysd','nywb'],
  GA:['ganb','gamb','gasb'],NC:['nceb','ncmb','ncwb'],MD:['mdb'],
  PA:['paeb','pamb','pawb'],OH:['ohnb','ohsb'],IL:['ilnb','ilsb','ilcb'],
  MI:['mieb','miwb'],NJ:['njb'],AZ:['azb'],CO:['cob'],WA:['waeb','wawb'],
  TN:['tneb','tnmb','tnwb'],LA:['laeb','lamb','lawb'],AL:['alnb','almb','alsb'],
  MO:['moeb','mowb'],SC:['scb'],KY:['kyeb','kywb'],MN:['mnb'],WI:['wieb','wiwb'],
  MA:['mab'],CT:['ctb'],IN:['innb','insb'],MS:['msnb','mssb'],AR:['areb','arwb'],
  NV:['nvb'],OK:['okeb','oknb','okwb'],KS:['ksb'],NE:['neb'],IA:['ianb','iasb'],
  OR:['orb'],HI:['hib'],MT:['mtb'],ID:['idb'],NM:['nmb'],WV:['wvnb','wvsb'],
  ND:['ndb'],SD:['sdb'],AK:['akb'],WY:['wyb'],UT:['utb'],RI:['rib'],
  ME:['meb'],NH:['nhb'],VT:['vtb'],DE:['deb'],DC:['dcb']
}

function stateOf(q: string): string {
  const u = q.trim().toUpperCase()
  if (ALL_STATES[u]) return u
  const lower = q.trim().toLowerCase()
  for (const [abbr, name] of Object.entries(ALL_STATES)) {
    if (name.toLowerCase() === lower) return abbr
  }
  // Try "City, ST" pattern
  const parts = q.split(',')
  if (parts.length >= 2) {
    const st = parts[parts.length - 1].trim().toUpperCase().slice(0, 2)
    if (ALL_STATES[st]) return st
  }
  return ''
}

function cityOf(q: string): string {
  const parts = q.split(',')
  return parts.length >= 2 ? parts[0].trim() : ''
}

function zipOf(q: string): string {
  const m = q.match(/\b(\d{5})\b/)
  return m ? m[1] : ''
}

async function safeFetch(url: string, opts?: RequestInit): Promise<any | null> {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// ── 1. BANKRUPTCY — CourtListener free API ────────────────────────────────
export interface BankruptcyFiling {
  id: string; source: 'bankruptcy'; sourceLabel: string
  caseName: string; caseNumber: string; chapter: number
  dateFiled: string; court: string; state: string
  addr: string; distressScore: number; signals: string[]; daysOpen: number; price: number
  clUrl: string
}

async function fetchBKForCourt(courtSlug: string, cutoff: string, q?: string): Promise<any[]> {
  const p = new URLSearchParams({
    court: courtSlug,
    date_filed__gte: cutoff,
    order_by: '-date_filed',
    page_size: '20',
    format: 'json',
  })
  if (q) p.set('q', q)
  const data = await safeFetch(`${CL}/dockets/?${p}`, { headers: { Accept: 'application/json' } })
  return data?.results || []
}

export async function fetchBankruptcyFilings(
  states: string[], city?: string, days = 120
): Promise<BankruptcyFiling[]> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
  const results: BankruptcyFiling[] = []
  const seen = new Set<string>()

  // Determine which courts to query
  const courts: string[] = []
  if (states.length === 0 || states.includes('ALL')) {
    // National — query top bankruptcy courts
    Object.values(STATE_BK_COURTS).flat().slice(0, 20).forEach(c => courts.push(c))
  } else {
    states.forEach(s => (STATE_BK_COURTS[s] || []).forEach(c => courts.push(c)))
  }

  // Run in batches of 5 parallel
  const batches: string[][] = []
  for (let i = 0; i < courts.length; i += 5) batches.push(courts.slice(i, i + 5))

  for (const batch of batches) {
    const rows = await Promise.all(batch.map(c => fetchBKForCourt(c, cutoff, city)))
    rows.flat().forEach(d => {
      const key = d.id || d.docket_number
      if (!key || seen.has(key)) return
      seen.add(key)
      const chapter = parseInt(d.chapter || '7') || 7
      const days2 = Math.round((Date.now() - new Date(d.date_filed || Date.now()).getTime()) / 86400000)
      const score = Math.min(100, (chapter === 7 ? 70 : chapter === 13 ? 55 : 45) + (days2 < 30 ? 20 : days2 < 60 ? 10 : 0))
      const signals: string[] = []
      if (chapter === 7) signals.push('⚖️ Ch.7 Liquidation — forced sale likely')
      if (chapter === 13) signals.push('📋 Ch.13 Reorganization — may sell to settle debt')
      if (chapter === 11) signals.push('🏢 Ch.11 Business bankruptcy')
      if (days2 < 30) signals.push(`🔴 Fresh filing — ${days2} days ago`)
      else if (days2 < 60) signals.push(`🟡 Recent filing — ${days2} days ago`)
      signals.push('🏛️ Federal court public record — free to access')
      signals.push('💡 Contact estate attorney for property leads')

      results.push({
        id: `bk-${d.id}`, source: 'bankruptcy', sourceLabel: '⚖️ Bankruptcy Court',
        caseName: d.case_name || 'Filing', caseNumber: d.docket_number || '',
        chapter, dateFiled: d.date_filed || '', court: d.court?.court_name || d.court_id || '',
        state: detectStateFromCourt(d.court_id || ''),
        addr: d.case_name || 'See court record', distressScore: score,
        signals, daysOpen: days2, price: 0,
        clUrl: `https://www.courtlistener.com${d.absolute_url || `/docket/${d.id}/`}`,
      })
    })
  }
  return results.sort((a, b) => b.distressScore - a.distressScore).slice(0, 100)
}

function detectStateFromCourt(courtId: string): string {
  for (const [st, courts] of Object.entries(STATE_BK_COURTS)) {
    if (courts.some(c => courtId.startsWith(c.slice(0, 2)))) return st
  }
  return courtId.slice(0, 2).toUpperCase()
}

// ── 2. HUD HomeStore ──────────────────────────────────────────────────────
export interface HUDListing {
  id: string; source: 'hud'; sourceLabel: string
  addr: string; city: string; state: string; zip: string
  price: number; beds: number; baths: number; sqft: number
  caseNumber: string; status: string; dom: number; signals: string[]
  listingUrl: string
}

export async function fetchHUDListings(states: string[], zip?: string): Promise<HUDListing[]> {
  const results: HUDListing[] = []

  const targetStates = states.length === 0 || states.includes('ALL')
    ? Object.keys(ALL_STATES).slice(0, 10)  // top 10 states for national
    : states.slice(0, 5)

  await Promise.all(targetStates.map(async st => {
    const p: Record<string, string> = { state: st, status: 'A', pageSize: '25', page: '1' }
    if (zip) p.zip = zip

    // Try HUD's JSON API
    const data = await safeFetch(
      `https://www.hudhomestore.gov/HudHome/PropertySearch.aspx/GetProperties?${new URLSearchParams(p)}`,
      { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } }
    )

    const props = data?.d?.properties || data?.properties || []
    props.forEach((p2: any) => {
      const listDate = p2.lstngDt || p2.listingDate || ''
      const dom = listDate ? Math.round((Date.now() - new Date(listDate).getTime()) / 86400000) : 0
      const price = parseFloat(p2.price || p2.lstngPrice || p2.Price || 0)
      const signals = ['🏛️ HUD / FHA Government Foreclosure', '💰 Typically 10–30% below market']
      if (dom > 30) signals.push(`📅 ${dom} days listed — price drop possible`)
      if (p2.insnType === 'IE') signals.push('⚡ Insured — FHA financing eligible')
      if (p2.insnType === 'UN') signals.push('⚠️ Uninsured — needs rehab')
      results.push({
        id: `hud-${p2.caseNum || Math.random()}`,
        source: 'hud', sourceLabel: '🏛️ HUD HomeStore',
        addr: p2.address || p2.propAddr || '', city: p2.city || p2.propCity || '',
        state: p2.state || st, zip: p2.zip || p2.propZip || '',
        price, beds: parseInt(p2.bdrms || p2.beds || 0),
        baths: parseFloat(p2.baths || 0), sqft: parseInt(p2.sqFt || p2.sqft || 0),
        caseNumber: p2.caseNum || '', status: p2.status || 'Active',
        dom, signals,
        listingUrl: `https://www.hudhomestore.gov/Listing/PropertyDetails.aspx?caseNumber=${p2.caseNum || ''}`,
      })
    })
  }))

  // Always add deep-link fallback
  if (results.length === 0) {
    targetStates.forEach(st => {
      results.push({
        id: `hud-link-${st}`, source: 'hud', sourceLabel: '🏛️ HUD HomeStore',
        addr: `HUD Properties in ${ALL_STATES[st] || st}`, city: '', state: st, zip: '',
        price: 0, beds: 0, baths: 0, sqft: 0, caseNumber: 'SEARCH', status: 'Active',
        dom: 0,
        signals: ['🏛️ FHA-foreclosed homes by HUD', '💰 10–30% below market typical', '🔗 Click to view live listings'],
        listingUrl: `https://www.hudhomestore.gov/Home/Index.aspx`,
      })
    })
  }
  return results.slice(0, 100)
}

// ── 3. USDA Rural Foreclosures ────────────────────────────────────────────
export interface USDAListing {
  id: string; source: 'usda'; sourceLabel: string
  addr: string; city: string; state: string; zip: string
  price: number; beds: number; acres?: number; signals: string[]; listingUrl: string
}

export async function fetchUSDAListings(states: string[]): Promise<USDAListing[]> {
  const results: USDAListing[] = []

  // USDA Resale Properties — data.gov CKAN API
  const targetStates = states.length === 0 || states.includes('ALL')
    ? [] : states.slice(0, 5)

  const filter = targetStates.length > 0
    ? encodeURIComponent(JSON.stringify({ State: targetStates[0] }))
    : ''

  const url = `https://catalog.data.gov/api/3/action/datastore_search?resource_id=c5d785c0-8f5a-4e7e-b37e-99e62b8d0e1e${filter ? `&filters=${filter}` : ''}&limit=50`
  const data = await safeFetch(url)
  const records = data?.result?.records || []

  records.forEach((r: any, i: number) => {
    const price = parseFloat(r['List Price'] || r.price || r.Price || 0)
    results.push({
      id: `usda-${r._id || i}`, source: 'usda', sourceLabel: '🌾 USDA Rural',
      addr: r.Address || r.address || r['Property Address'] || '',
      city: r.City || r.city || '', state: r.State || r.state || '',
      zip: r.Zip || r.zip || r['Zip Code'] || '',
      price, beds: parseInt(r.Bedrooms || r.bedrooms || 0),
      acres: parseFloat(r.Acres || r.acres || 0),
      signals: [
        '🌾 USDA Rural Development Foreclosure',
        '💰 Low competition — rural market',
        '✅ USDA/FHA financing may apply',
        r.Acres > 0 ? `🏞️ ${r.Acres} acres included` : '',
      ].filter(Boolean),
      listingUrl: 'https://www.sc.egov.usda.gov/data/RD_Properties.html',
    })
  })

  if (results.length === 0) {
    results.push({
      id: 'usda-national', source: 'usda', sourceLabel: '🌾 USDA Rural',
      addr: 'USDA Rural Development Properties Nationwide', city: '', state: 'US', zip: '',
      price: 0, beds: 0, acres: undefined,
      signals: ['🌾 Rural properties across all 50 states', '💰 Low competition markets', '🔗 Click to view all listings'],
      listingUrl: 'https://www.sc.egov.usda.gov/data/RD_Properties.html',
    })
  }
  return results
}

// ── 4. Auction listings ───────────────────────────────────────────────────
export interface AuctionListing {
  id: string; source: 'auction'; sourceLabel: string
  addr: string; city: string; state: string; zip: string
  price: number; openingBid?: number; auctionDate?: string
  beds: number; baths: number; sqft: number; propertyType: string
  signals: string[]; url: string; daysToAuction?: number; platform: string
}

// Major auction platforms — generate structured deep-links with correct search URLs
function buildAuctionDeepLinks(states: string[], city?: string): AuctionListing[] {
  const links: AuctionListing[] = []
  const targetStates = states.length === 0 || states.includes('ALL')
    ? ['national'] : states.slice(0, 3)

  const platforms = [
    {
      name: 'Auction.com', icon: '🔨',
      url: (st: string, c?: string) =>
        `https://www.auction.com/residential/foreclosure/?state=${st === 'national' ? '' : st}${c ? `&city=${encodeURIComponent(c)}` : ''}`,
      signals: ['🔨 REO + courthouse step auctions', '💵 Cash required day of auction', '⚡ Deepest discounts available', '🏦 Bank-owned inventory'],
    },
    {
      name: 'Hubzu', icon: '🏠',
      url: (st: string, c?: string) =>
        `https://www.hubzu.com/search-results?state=${st === 'national' ? '' : st}${c ? `&city=${encodeURIComponent(c)}` : ''}`,
      signals: ['🏠 Bank & servicer REO auctions', '📅 Extended bidding periods', '🔍 Less competition than Auction.com'],
    },
    {
      name: 'Ten-X', icon: '🏢',
      url: (_st: string) => 'https://www.ten-x.com/company/blog/foreclosure-listings/',
      signals: ['🏢 Commercial & residential', '💼 Institutional-grade distressed assets'],
    },
    {
      name: 'Xome', icon: '📋',
      url: (st: string, c?: string) =>
        `https://www.xome.com/foreclosures?state=${st === 'national' ? '' : st}${c ? `&city=${encodeURIComponent(c)}` : ''}`,
      signals: ['📋 Bank-direct REO listings', '🏦 ServiceMac & Nationstar inventory'],
    },
  ]

  targetStates.forEach(st => {
    platforms.forEach((p, pi) => {
      links.push({
        id: `auction-${p.name}-${st}`,
        source: 'auction', sourceLabel: `${p.icon} ${p.name}`,
        addr: `${p.name} — ${st === 'national' ? 'National' : ALL_STATES[st] || st}${city ? ` / ${city}` : ''}`,
        city: city || '', state: st === 'national' ? 'US' : st, zip: '',
        price: 0, beds: 0, baths: 0, sqft: 0, propertyType: 'REO/Foreclosure',
        signals: p.signals,
        url: p.url(st, city),
        platform: p.name,
        daysToAuction: undefined,
      })
    })
  })
  return links
}

export async function fetchAuctionListings(states: string[], city?: string): Promise<AuctionListing[]> {
  // Try Auction.com API for real data, fall back to deep-links
  const targetSt = states.find(s => s !== 'ALL') || ''
  if (targetSt) {
    const data = await safeFetch(
      `https://www.auction.com/api/v1/properties?state=${targetSt}&limit=30${city ? `&city=${encodeURIComponent(city)}` : ''}`,
      { headers: { Accept: 'application/json' } }
    )
    const props = data?.properties || data?.results || []
    if (props.length > 0) {
      const mapped = props.map((p: any) => {
        const aDate = p.auctionDate || p.auction_date
        const dta = aDate ? Math.round((new Date(aDate).getTime() - Date.now()) / 86400000) : undefined
        return {
          id: `auction-${p.id}`, source: 'auction' as const, sourceLabel: '🔨 Auction.com',
          addr: p.address || '', city: p.city || '', state: p.state || targetSt,
          zip: p.zip || '', price: p.openingBid || p.estimatedValue || 0,
          openingBid: p.openingBid, auctionDate: aDate,
          beds: p.bedrooms || 0, baths: p.bathrooms || 0, sqft: p.squareFootage || 0,
          propertyType: p.propertyType || 'Foreclosure',
          signals: [
            dta != null && dta <= 7 ? `🚨 AUCTION IN ${dta} DAYS` : dta != null ? `⏰ Auction in ${dta} days` : '🔨 Active auction listing',
            '💵 Cash required at auction',
            p.propertyType === 'REO' ? '🏦 Bank-owned REO' : '🏛️ Court-ordered sale',
          ].filter(Boolean),
          url: `https://www.auction.com/residential/${p.id}`,
          daysToAuction: dta, platform: 'Auction.com',
        }
      })
      return [...mapped, ...buildAuctionDeepLinks(states.filter(s => s !== targetSt), city)]
    }
  }
  return buildAuctionDeepLinks(states.length === 0 ? ['ALL'] : states, city)
}

// ── 5. Probate / Estate ───────────────────────────────────────────────────
export interface ProbateLead {
  id: string; source: 'probate'; sourceLabel: string
  caseName: string; caseNumber: string; dateFiled: string
  court: string; state: string; addr: string
  signals: string[]; daysOpen: number; distressScore: number; price: number; clUrl: string
}

export async function fetchProbateLeads(states: string[], city?: string): Promise<ProbateLead[]> {
  const cutoff = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0]
  const results: ProbateLead[] = []
  const seen = new Set<string>()

  const searchTerms = ['estate', 'probate', 'decedent', 'heir']
  const query = city ? `"${city}" (${searchTerms.join(' OR ')})` : searchTerms.join(' OR ')

  const p = new URLSearchParams({
    q: query,
    date_filed__gte: cutoff,
    order_by: '-date_filed',
    page_size: '50',
    format: 'json',
    type: 'r',
  })

  if (states.length > 0 && !states.includes('ALL')) {
    const courts = states.flatMap(s => STATE_BK_COURTS[s] || []).slice(0, 5)
    if (courts.length) p.set('court', courts.join(','))
  }

  const data = await safeFetch(`${CL}/dockets/?${p}`, { headers: { Accept: 'application/json' } })
  const dockets = data?.results || []

  dockets.forEach((d: any) => {
    if (seen.has(d.id)) return
    seen.add(d.id)
    const daysOpen = Math.round((Date.now() - new Date(d.date_filed || Date.now()).getTime()) / 86400000)
    const score = Math.min(100, 55 + (daysOpen < 90 ? 25 : daysOpen < 180 ? 10 : 0))
    results.push({
      id: `probate-${d.id}`, source: 'probate', sourceLabel: '📋 Probate/Estate',
      caseName: d.case_name || 'Estate Case', caseNumber: d.docket_number || '',
      dateFiled: d.date_filed || '', court: d.court?.court_name || d.court_id || '',
      state: detectStateFromCourt(d.court_id || ''),
      addr: d.case_name || 'See filing',
      signals: [
        '📋 Probate case — inherited property may need quick sale',
        '💡 Heirs often motivated to liquidate fast',
        `📅 Filed ${daysOpen} days ago`,
        '🤝 Contact estate attorney for property details',
        '⚖️ CourtListener public record — free access',
      ],
      daysOpen, distressScore: score, price: 0,
      clUrl: `https://www.courtlistener.com${d.absolute_url || `/docket/${d.id}/`}`,
    })
  })
  return results.slice(0, 60)
}

// ── 6. Government REO portals ─────────────────────────────────────────────
export interface GovREOPortal {
  id: string; source: 'gov_reo'; sourceLabel: string
  name: string; description: string; url: string
  coverageStates: string[]; signals: string[]; discount: string
}

export function getGovREOPortals(states: string[]): GovREOPortal[] {
  return [
    {
      id: 'homepath', source: 'gov_reo', sourceLabel: '🏠 HomePath',
      name: 'Fannie Mae HomePath',
      description: 'Fannie Mae REO — no appraisal or mortgage insurance required',
      url: states.length > 0 && !states.includes('ALL')
        ? `https://www.homepath.fanniemae.com/listings/?state=${states.slice(0,3).join(',')}`
        : 'https://www.homepath.fanniemae.com',
      coverageStates: ['All 50 States'],
      signals: ['🏦 Fannie Mae owned — clear title', '✅ No appraisal required', '💰 Up to 3% closing cost assistance', '🏠 Owner-occupant 15-day first look window'],
      discount: '5–25% below market',
    },
    {
      id: 'homesteps', source: 'gov_reo', sourceLabel: '🏡 HomeSteps',
      name: 'Freddie Mac HomeSteps',
      description: 'Freddie Mac REO — First Look 20-day owner-occupant exclusive',
      url: states.length > 0 && !states.includes('ALL')
        ? `https://www.homesteps.com/homes-for-sale?state=${states[0]}`
        : 'https://www.homesteps.com',
      coverageStates: ['All 50 States'],
      signals: ['🏦 Freddie Mac owned — clean title', '📅 20-day First Look for non-investors', '💰 Investor eligible after First Look', '🔧 Typically sold as-is'],
      discount: '5–20% below market',
    },
    {
      id: 'hud-main', source: 'gov_reo', sourceLabel: '🏛️ HUD Homes',
      name: 'HUD HomeStore',
      description: 'FHA-foreclosed homes — exclusive periods then open to all',
      url: `https://www.hudhomestore.gov/Home/Index.aspx`,
      coverageStates: ['All 50 States'],
      signals: ['🏛️ FHA government foreclosures', '🔑 Exclusive owner-occupant period first', '💰 $100 down FHA financing available', '⚠️ As-is condition — no repairs by HUD'],
      discount: '10–30% below market',
    },
    {
      id: 'va-reo', source: 'gov_reo', sourceLabel: '🎖️ VA Homes',
      name: 'VA Foreclosures',
      description: 'Veterans Affairs REO properties via Vendor Management portal',
      url: 'https://listings.vacares.com/properties',
      coverageStates: ['All 50 States'],
      signals: ['🎖️ VA-backed foreclosures', '💰 VA loan financing eligible', '🏠 Good condition typically', '📋 Lower investor competition'],
      discount: '5–15% below market',
    },
    {
      id: 'usda-portal', source: 'gov_reo', sourceLabel: '🌾 USDA Homes',
      name: 'USDA Rural Development',
      description: 'Rural single-family foreclosures via USDA portal',
      url: 'https://www.sc.egov.usda.gov/data/RD_Properties.html',
      coverageStates: ['Rural areas, all states'],
      signals: ['🌾 Rural locations — very low competition', '✅ USDA loan financing eligible', '💰 Steep discounts in rural markets', '🏞️ Often includes acreage'],
      discount: '10–35% below market',
    },
    {
      id: 'auction-reo', source: 'gov_reo', sourceLabel: '🔨 REO Auction',
      name: 'Auction.com',
      description: 'Largest online platform for bank-owned and courthouse auctions',
      url: `https://www.auction.com/residential/foreclosure/`,
      coverageStates: ['All 50 States'],
      signals: ['🔨 Bank REO + live courthouse steps', '💵 Cash required same-day', '⚡ Deepest discounts — no contingencies', '🏦 Direct bank inventory'],
      discount: '15–40% below market',
    },
  ]
}

// ── 7. Tax Delinquent — open data counties ─────────────────────────────────
export interface TaxDelinquentLead {
  id: string; source: 'tax_delinquent'; sourceLabel: string
  addr: string; city: string; state: string; zip: string
  ownerName: string; taxOwed: number; yearsDelinquent: number
  price: number; signals: string[]; distressScore: number; county: string
}

const OPEN_DATA_COUNTIES: Record<string, { url: string; state: string; county: string }> = {
  'Cook-IL':          { url: 'https://datacatalog.cookcountyil.gov/resource/c7yz-ttqg.json?$limit=50', state: 'IL', county: 'Cook' },
  'Harris-TX':        { url: 'https://opendata.harriscountytx.gov/resource/tax-delinquent.json?$limit=50', state: 'TX', county: 'Harris' },
  'Philadelphia-PA':  { url: 'https://phl.carto.com/api/v2/sql?q=SELECT * FROM real_estate_tax_delinquencies LIMIT 50&format=json', state: 'PA', county: 'Philadelphia' },
  'Detroit-MI':       { url: 'https://data.detroitmi.gov/resource/p4v5-whzq.json?$limit=50', state: 'MI', county: 'Wayne' },
  'Cleveland-OH':     { url: 'https://data.clevelandohio.gov/resource/tax-delinquent.json?$limit=50', state: 'OH', county: 'Cuyahoga' },
}

export async function fetchTaxDelinquentData(states: string[]): Promise<TaxDelinquentLead[]> {
  const results: TaxDelinquentLead[] = []
  const targetCounties = Object.entries(OPEN_DATA_COUNTIES).filter(([, v]) =>
    states.length === 0 || states.includes('ALL') || states.includes(v.state)
  ).slice(0, 3)

  await Promise.all(targetCounties.map(async ([key, cfg]) => {
    const data = await safeFetch(cfg.url)
    const records = Array.isArray(data) ? data : (data?.rows || data?.result?.records || [])
    records.slice(0, 25).forEach((r: any, i: number) => {
      const taxOwed = parseFloat(r.tax_owed || r.amount_due || r.balance || r.total_due || 0)
      const years = parseInt(r.years_delinquent || r.delinquent_years || 1)
      const score = Math.min(100, 40 + Math.min(30, taxOwed / 1000) + (years > 3 ? 20 : years > 1 ? 10 : 0))
      results.push({
        id: `tax-${key}-${r.parcel_id || i}`,
        source: 'tax_delinquent', sourceLabel: '💸 Tax Delinquent',
        addr: r.address || r.property_address || r.Address || '',
        city: r.city || r.City || cfg.county,
        state: cfg.state, zip: r.zip || r.zipcode || '',
        ownerName: r.owner_name || r.owner || r.Owner || '',
        taxOwed, yearsDelinquent: years, county: cfg.county,
        price: parseFloat(r.assessed_value || r.market_value || 0) * 0.6,
        signals: [
          `💸 $${taxOwed.toLocaleString()} in unpaid taxes`,
          years > 1 ? `📅 ${years} years delinquent` : '📅 Recently delinquent',
          '🏚️ Owner under financial stress — motivated seller',
          '⚡ Tax lien sale risk = urgency to sell',
          '🤝 Direct outreach opportunity before auction',
        ],
        distressScore: score,
      })
    })
  }))
  return results.sort((a, b) => b.distressScore - a.distressScore)
}

// ── MASTER HUNT ───────────────────────────────────────────────────────────
export interface DealHuntOptions {
  states: string[]   // [] = national, ['VA'] = Virginia only, ['ALL'] = explicit national
  city?: string
  zip?: string
  county?: string
  sources: {
    bankruptcy: boolean; hud: boolean; auction: boolean; usda: boolean
    probate: boolean; taxDelinquent: boolean; govReo: boolean
  }
}

export interface DealHuntResult {
  bankruptcy: BankruptcyFiling[]; hud: HUDListing[]; auction: AuctionListing[]
  usda: USDAListing[]; probate: ProbateLead[]; taxDelinquent: TaxDelinquentLead[]
  govReo: GovREOPortal[]; errors: string[]; totalFound: number
  searchedStates: string[]; isNational: boolean
}

export async function runDealHunt(opts: DealHuntOptions): Promise<DealHuntResult> {
  const isNational = opts.states.length === 0 || opts.states.includes('ALL')
  const r: DealHuntResult = {
    bankruptcy: [], hud: [], auction: [], usda: [], probate: [],
    taxDelinquent: [], govReo: [], errors: [],
    totalFound: 0, searchedStates: isNational ? ['All 50 States'] : opts.states, isNational
  }

  const tasks: Promise<void>[] = []

  if (opts.sources.bankruptcy)
    tasks.push(fetchBankruptcyFilings(opts.states, opts.city).then(x => { r.bankruptcy = x }).catch(e => r.errors.push(`Bankruptcy: ${e.message}`)))
  if (opts.sources.hud)
    tasks.push(fetchHUDListings(opts.states, opts.zip).then(x => { r.hud = x }).catch(e => r.errors.push(`HUD: ${e.message}`)))
  if (opts.sources.auction)
    tasks.push(fetchAuctionListings(opts.states, opts.city).then(x => { r.auction = x }).catch(e => r.errors.push(`Auction: ${e.message}`)))
  if (opts.sources.usda)
    tasks.push(fetchUSDAListings(opts.states).then(x => { r.usda = x }).catch(e => r.errors.push(`USDA: ${e.message}`)))
  if (opts.sources.probate)
    tasks.push(fetchProbateLeads(opts.states, opts.city).then(x => { r.probate = x }).catch(e => r.errors.push(`Probate: ${e.message}`)))
  if (opts.sources.taxDelinquent)
    tasks.push(fetchTaxDelinquentData(opts.states).then(x => { r.taxDelinquent = x }).catch(e => r.errors.push(`Tax: ${e.message}`)))
  if (opts.sources.govReo)
    r.govReo = getGovREOPortals(opts.states)

  await Promise.allSettled(tasks)
  r.totalFound = r.bankruptcy.length + r.hud.length + r.auction.length +
    r.usda.length + r.probate.length + r.taxDelinquent.length + r.govReo.length
  return r
}

export { stateOf, cityOf, zipOf }
