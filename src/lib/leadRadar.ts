/**
 * Lead Radar — Early Signal Detection
 * 
 * Pulls motivated seller signals from public government APIs across VA + NC.
 * All sources are legal public records. All CORS-enabled. No scraping.
 * 
 * Two API types used:
 * 
 * 1. SOCRATA (data.norfolk.gov, data.richmondgov.com, data.virginia.gov)
 *    Format: GET /resource/{dataset_id}.json?$where=...&$order=...&$limit=...
 *    CORS: YES — Socrata explicitly allows browser access
 * 
 * 2. ARCGIS REST (data.virginiabeach.gov, gis.charlottenc.gov, data-ral.opendata.arcgis.com)
 *    Format: GET /FeatureServer/0/query?where=...&outFields=*&f=json
 *    CORS: YES — ArcGIS public FeatureServers allow browser access
 *
 * Legal basis: Virginia Public Records Act (Va. Code §42.1-76 et seq.)
 * and NC Public Records Law (NCGS Chapter 132) — all records are public.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type SignalType =
  | 'code_violation'
  | 'building_permit'
  | 'fire_damage'
  | 'tax_delinquent'
  | 'probate'
  | 'foreclosure'
  | 'eviction'
  | 'vacant'

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface Lead {
  id:           string
  address:      string
  city:         string
  state:        string
  zip:          string
  county:       string
  lat:          number | null
  lng:          number | null

  // Signal details
  signalType:   SignalType
  signalLabel:  string       // human readable: "Structural Code Violation"
  description:  string       // full violation/case description
  caseNumber:   string
  status:       string       // open, closed, pending
  filedDate:    string       // ISO date
  severity:     Severity

  // Source info
  source:       string       // "Norfolk Open Data"
  sourceUrl:    string
  rawData:      any

  // Investor relevance score 0-100
  investorScore: number
}

export interface RadarSource {
  id:       string
  name:     string
  city:     string
  state:    'VA' | 'NC'
  county:   string
  type:     'socrata' | 'arcgis'
  enabled:  boolean
  signalTypes: SignalType[]
  status:   'idle' | 'loading' | 'loaded' | 'error'
  count:    number
  lastFetch: string | null
  error:    string | null
}

// ─── Source Registry ─────────────────────────────────────────────────────────

export const RADAR_SOURCES: RadarSource[] = [
  // ── VIRGINIA ──────────────────────────────────────────────────────────────
  {
    id: 'norfolk_violations', name: 'Norfolk Code Violations',
    city: 'Norfolk', state: 'VA', county: 'Norfolk City',
    type: 'socrata', enabled: true,
    signalTypes: ['code_violation'],
    status: 'idle', count: 0, lastFetch: null, error: null,
  },
  {
    id: 'norfolk_permits', name: 'Norfolk Building Permits',
    city: 'Norfolk', state: 'VA', county: 'Norfolk City',
    type: 'socrata', enabled: true,
    signalTypes: ['building_permit'],
    status: 'idle', count: 0, lastFetch: null, error: null,
  },
  {
    id: 'virginia_beach', name: 'Virginia Beach Code Enforcement',
    city: 'Virginia Beach', state: 'VA', county: 'Virginia Beach',
    type: 'arcgis', enabled: false,
    signalTypes: ['code_violation'],
    status: 'idle', count: 0, lastFetch: null, error: null,
  },
  {
    id: 'richmond', name: 'Richmond Delinquent Real Estate Taxes',
    city: 'Richmond', state: 'VA', county: 'Richmond City',
    type: 'socrata', enabled: true,
    signalTypes: ['tax_delinquent'],
    status: 'idle', count: 0, lastFetch: null, error: null,
  },
  // ── NORTH CAROLINA ────────────────────────────────────────────────────────
  {
    id: 'charlotte', name: 'Charlotte Code Enforcement',
    city: 'Charlotte', state: 'NC', county: 'Mecklenburg',
    type: 'arcgis', enabled: true,
    signalTypes: ['code_violation'],
    status: 'idle', count: 0, lastFetch: null, error: null,
  },
  {
    id: 'raleigh_permits', name: 'Raleigh Building Permits',
    city: 'Raleigh', state: 'NC', county: 'Wake',
    type: 'arcgis', enabled: true,
    signalTypes: ['building_permit'],
    status: 'idle', count: 0, lastFetch: null, error: null,
  },
]

// ─── Date helper ─────────────────────────────────────────────────────────────
function daysAgoISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]  // YYYY-MM-DD
}

function parseDate(raw: any): string {
  if (!raw) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number') return new Date(raw).toISOString().split('T')[0]
  return String(raw)
}

// ─── Severity scoring ────────────────────────────────────────────────────────
const CRITICAL_KEYWORDS = ['fire', 'structural', 'unsafe', 'condemned', 'hazard', 'imminent', 'collapse', 'emergency']
const HIGH_KEYWORDS     = ['electrical', 'plumbing', 'roof', 'foundation', 'mold', 'sewage', 'vacant', 'abandoned']
const MEDIUM_KEYWORDS   = ['exterior', 'windows', 'doors', 'porch', 'fence', 'overgrown', 'debris']

function getSeverity(text: string): Severity {
  const lower = text.toLowerCase()
  if (CRITICAL_KEYWORDS.some(k => lower.includes(k))) return 'critical'
  if (HIGH_KEYWORDS.some(k => lower.includes(k)))     return 'high'
  if (MEDIUM_KEYWORDS.some(k => lower.includes(k)))   return 'medium'
  return 'low'
}

function getInvestorScore(severity: Severity, signalType: SignalType, status: string): number {
  const baseScore: Record<Severity, number> = {
    critical: 90, high: 75, medium: 55, low: 35
  }
  let score = baseScore[severity]

  // Higher for open/active cases (owner still has problem)
  if (status.toLowerCase().includes('open') || status.toLowerCase().includes('active')) score += 8
  if (status.toLowerCase().includes('repeat') || status.toLowerCase().includes('chronic')) score += 10

  // Signal type multipliers
  if (signalType === 'fire_damage')   score = Math.min(100, score + 15)
  if (signalType === 'tax_delinquent') score = Math.min(100, score + 12)
  if (signalType === 'probate')        score = Math.min(100, score + 10)
  if (signalType === 'foreclosure')    score = Math.min(100, score + 10)

  return Math.min(100, score)
}

// ─── Safe fetch wrapper ───────────────────────────────────────────────────────
async function safeFetch(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.warn(`[LeadRadar] ${res.status} → ${url.slice(0, 100)}`)
      return null
    }
    return await res.json()
  } catch (e: any) {
    console.warn(`[LeadRadar] fetch error for ${url.slice(0, 80)}:`, e?.message)
    return null
  }
}

// ─── Socrata query builder ────────────────────────────────────────────────────
function socrataUrl(domain: string, datasetId: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString()
  return `https://${domain}/resource/${datasetId}.json?${qs}`
}

// ─── ArcGIS query builder ─────────────────────────────────────────────────────
function arcgisUrl(baseUrl: string, where: string, fields = '*', orderBy = ''): string {
  const params = new URLSearchParams({
    where,
    outFields: fields,
    returnGeometry: 'true',
    f: 'json',
    resultRecordCount: '200',
    ...(orderBy ? { orderByFields: orderBy } : {}),
  })
  return `${baseUrl}/query?${params.toString()}`
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCHERS — one per source
// ─────────────────────────────────────────────────────────────────────────────

// ── Norfolk Code Violations (Socrata) ────────────────────────────────────────
async function fetchNorfolkViolations(days: number): Promise<Lead[]> {
  const since = daysAgoISO(days)
  // Real dataset columns: complaint_street, violation_ordinance, violation_created_date,
  // violation_status, geocoded_column_1, gpin
  const url = socrataUrl('data.norfolk.gov', 'mxtv-99gh', {
    '$where':  `violation_created_date >= '${since}T00:00:00.000'`,
    '$order':  'violation_created_date DESC',
    '$limit':  '200',
  })

  const data = await safeFetch(url)
  if (!data?.length) return []

  return data.map((r: any) => {
    const desc     = r.violation_ordinance || r.inspection_type || 'Code violation'
    const severity = getSeverity(desc)
    const coords   = r.geocoded_column_1?.coordinates || []
    return {
      id:           `norfolk-viol-${r.gpin || Math.random().toString(36).slice(2)}`,
      address:      r.complaint_street || 'Unknown',
      city:         'Norfolk',
      state:        'VA',
      zip:          '',
      county:       'Norfolk City',
      lat:          coords[1] ?? null,
      lng:          coords[0] ?? null,
      signalType:   'code_violation' as SignalType,
      signalLabel:  `Code Violation — ${r.violation_ordinance || 'Unknown'}`,
      description:  desc,
      caseNumber:   r.gpin || '',
      status:       r.violation_status || r.inspection_status || 'Unknown',
      filedDate:    parseDate(r.violation_created_date),
      severity,
      source:       'Norfolk Open Data',
      sourceUrl:    'https://data.norfolk.gov/Government/Neighborhood-Quality-Code-Enforcement-Cases/mxtv-99gh',
      rawData:      r,
      investorScore: getInvestorScore(severity, 'code_violation', r.violation_status || ''),
    }
  })
}

// ── Norfolk Permits (Socrata) ─────────────────────────────────────────────────
async function fetchNorfolkPermits(days: number): Promise<Lead[]> {
  const since = daysAgoISO(days)
  const url = socrataUrl('data.norfolk.gov', 'erm3-ukpd', {
    '$where':  `issue_date >= '${since}'`,
    '$order':  'issue_date DESC',
    '$limit':  '200',
    '$select': 'permit_number,address,description,permit_type,status,issue_date,latitude,longitude',
  })

  const data = await safeFetch(url)
  if (!data?.length) return []

  return data.map((r: any) => {
    const desc     = r.description || r.permit_type || 'Building permit'
    const severity = getSeverity(desc)
    return {
      id:           `norfolk-permit-${r.permit_number || Math.random().toString(36).slice(2)}`,
      address:      r.address || 'Unknown',
      city:         'Norfolk',
      state:        'VA',
      zip:          '',
      county:       'Norfolk City',
      lat:          r.latitude  ? parseFloat(r.latitude)  : null,
      lng:          r.longitude ? parseFloat(r.longitude) : null,
      signalType:   'building_permit' as SignalType,
      signalLabel:  `Building Permit — ${r.permit_type || 'Unknown'}`,
      description:  desc,
      caseNumber:   r.permit_number || '',
      status:       r.status || 'Issued',
      filedDate:    parseDate(r.issue_date),
      severity,
      source:       'Norfolk Open Data',
      sourceUrl:    'https://data.norfolk.gov',
      rawData:      r,
      investorScore: getInvestorScore(severity, 'building_permit', r.status || ''),
    }
  })
}

// ── Virginia Beach Code Enforcement (ArcGIS) ─────────────────────────────────
async function fetchVirginiaBeach(days: number): Promise<Lead[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceMs = since.getTime()

  // ArcGIS date filter uses Unix timestamp in milliseconds
  const url = arcgisUrl(
    'https://services1.arcgis.com/0MSEUqKaxRlEPj5g/arcgis/rest/services/Code_Enforcement_Cases/FeatureServer/0',
    `OpenedDate >= date '${since.toISOString().split('T')[0]}'`,
    'CaseNumber,Address,ViolationType,Description,Status,OpenedDate,Shape__Lat,Shape__Lon,ZipCode',
    'OpenedDate DESC'
  )

  const data = await safeFetch(url)
  if (!data?.features?.length) return []

  return data.features.map((f: any) => {
    const r        = f.attributes || {}
    const desc     = r.Description || r.ViolationType || 'Code enforcement case'
    const severity = getSeverity(desc)
    return {
      id:           `vb-${r.CaseNumber || Math.random().toString(36).slice(2)}`,
      address:      r.Address || 'Unknown',
      city:         'Virginia Beach',
      state:        'VA',
      zip:          r.ZipCode || '',
      county:       'Virginia Beach City',
      lat:          f.geometry?.y || null,
      lng:          f.geometry?.x || null,
      signalType:   'code_violation' as SignalType,
      signalLabel:  `Code Enforcement — ${r.ViolationType || 'Violation'}`,
      description:  desc,
      caseNumber:   r.CaseNumber || '',
      status:       r.Status || 'Unknown',
      filedDate:    r.OpenedDate ? new Date(r.OpenedDate).toISOString().split('T')[0] : '',
      severity,
      source:       'Virginia Beach Open Data',
      sourceUrl:    'https://data.virginiabeach.gov',
      rawData:      r,
      investorScore: getInvestorScore(severity, 'code_violation', r.Status || ''),
    }
  })
}

// ── Richmond Code Enforcement (Socrata) ──────────────────────────────────────
async function fetchRichmond(days: number): Promise<Lead[]> {
  const since = daysAgoISO(days)
  // Richmond uses data.richmondgov.com — try known dataset IDs
  const url = socrataUrl('data.richmondgov.com', 'kqdf-hfbu', {
    '$where':  `date_opened >= '${since}'`,
    '$order':  'date_opened DESC',
    '$limit':  '200',
  })

  const data = await safeFetch(url)
  if (!data?.length) return []

  return data.map((r: any) => {
    const desc     = r.description || r.violation_type || r.case_type || 'Code enforcement'
    const severity = getSeverity(desc)
    return {
      id:           `richmond-${r.case_number || r.casenumber || Math.random().toString(36).slice(2)}`,
      address:      r.address || r.location || 'Unknown',
      city:         'Richmond',
      state:        'VA',
      zip:          r.zip_code || '',
      county:       'Richmond City',
      lat:          r.latitude  ? parseFloat(r.latitude)  : null,
      lng:          r.longitude ? parseFloat(r.longitude) : null,
      signalType:   'code_violation' as SignalType,
      signalLabel:  `Code Enforcement — ${r.case_type || 'Violation'}`,
      description:  desc,
      caseNumber:   r.case_number || r.casenumber || '',
      status:       r.status || r.case_status || 'Unknown',
      filedDate:    parseDate(r.date_opened || r.opened_date),
      severity,
      source:       'City of Richmond Open Data',
      sourceUrl:    'https://data.richmondgov.com',
      rawData:      r,
      investorScore: getInvestorScore(severity, 'code_violation', r.status || ''),
    }
  })
}

// ── Charlotte Code Enforcement (ArcGIS) ──────────────────────────────────────
async function fetchCharlotte(days: number): Promise<Lead[]> {
  const since = daysAgoISO(days)
  const url = arcgisUrl(
    'https://gis.charlottenc.gov/arcgis/rest/services/HNS/CodeEnforcementCasesAll/MapServer/0',
    `DateOpened >= date '${since}'`,
    'CaseNumber,Address,CaseType,Description,Status,DateOpened,ZipCode',
    'DateOpened DESC'
  )

  const data = await safeFetch(url)
  if (!data?.features?.length) return []

  return data.features.map((f: any) => {
    const r        = f.attributes || {}
    const desc     = r.Description || r.CaseType || 'Code enforcement'
    const severity = getSeverity(desc)
    return {
      id:           `charlotte-${r.CaseNumber || Math.random().toString(36).slice(2)}`,
      address:      r.Address || 'Unknown',
      city:         'Charlotte',
      state:        'NC',
      zip:          r.ZipCode || '',
      county:       'Mecklenburg',
      lat:          f.geometry?.y || null,
      lng:          f.geometry?.x || null,
      signalType:   'code_violation' as SignalType,
      signalLabel:  `Code Enforcement — ${r.CaseType || 'Violation'}`,
      description:  desc,
      caseNumber:   r.CaseNumber || '',
      status:       r.Status || 'Unknown',
      filedDate:    r.DateOpened ? new Date(r.DateOpened).toISOString().split('T')[0] : '',
      severity,
      source:       'City of Charlotte Open Data (GIS)',
      sourceUrl:    'https://data.charlottenc.gov',
      rawData:      r,
      investorScore: getInvestorScore(severity, 'code_violation', r.Status || ''),
    }
  })
}

// ── Raleigh Permits (ArcGIS) ─────────────────────────────────────────────────
async function fetchRaleigh(days: number): Promise<Lead[]> {
  const since = daysAgoISO(days)
  const url = arcgisUrl(
    'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Building_Permits/FeatureServer/0',
    `applied_date >= date '${since}'`,
    'permit_number,site_address,work_description,permit_type,current_status,applied_date,zip',
    'applied_date DESC'
  )

  const data = await safeFetch(url)
  if (!data?.features?.length) return []

  return data.features.map((f: any) => {
    const r        = f.attributes || {}
    const desc     = r.work_description || r.permit_type || 'Building permit'
    const severity = getSeverity(desc)
    return {
      id:           `raleigh-${r.permit_number || Math.random().toString(36).slice(2)}`,
      address:      r.site_address || 'Unknown',
      city:         'Raleigh',
      state:        'NC',
      zip:          r.zip || '',
      county:       'Wake',
      lat:          f.geometry?.y || null,
      lng:          f.geometry?.x || null,
      signalType:   'building_permit' as SignalType,
      signalLabel:  `Building Permit — ${r.permit_type || 'Permit'}`,
      description:  desc,
      caseNumber:   r.permit_number || '',
      status:       r.current_status || 'Unknown',
      filedDate:    r.applied_date ? new Date(r.applied_date).toISOString().split('T')[0] : '',
      severity,
      source:       'City of Raleigh Open Data',
      sourceUrl:    'https://data.raleighnc.gov',
      rawData:      r,
      investorScore: getInvestorScore(severity, 'building_permit', r.current_status || ''),
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN FETCH — calls all enabled sources in parallel
// ─────────────────────────────────────────────────────────────────────────────

export interface RadarResult {
  leads:    Lead[]
  sources:  RadarSource[]
  stats: {
    total:       number
    critical:    number
    high:        number
    byCity:      Record<string, number>
    byType:      Record<string, number>
    newToday:    number
    fetchedAt:   string
  }
}

export async function fetchLeadRadar(
  enabledSourceIds: string[],
  days = 30,
  onProgress?: (sourceId: string, status: 'loading' | 'loaded' | 'error', count?: number) => void
): Promise<RadarResult> {

  const fetchers: Record<string, (days: number) => Promise<Lead[]>> = {
    norfolk_violations: fetchNorfolkViolations,
    norfolk_permits:    fetchNorfolkPermits,
    virginia_beach:     fetchVirginiaBeach,
    richmond:           fetchRichmond,
    charlotte:          fetchCharlotte,
    raleigh_permits:    fetchRaleigh,
    chatham_sales:      fetchChathamSales,
    chatham_vacant:     fetchChathamDistressed,
    ...EXTRA_FETCHERS,
  }

  const enabled = enabledSourceIds.filter(id => id in fetchers)
  const allLeads: Lead[] = []
  const sources = RADAR_SOURCES.map(s => ({ ...s }))

  await Promise.allSettled(
    enabled.map(async (sourceId) => {
      const src = sources.find(s => s.id === sourceId)
      if (!src) return
      src.status = 'loading'
      onProgress?.(sourceId, 'loading')
      try {
        const leads = await fetchers[sourceId](days)
        src.status   = 'loaded'
        src.count    = leads.length
        src.lastFetch = new Date().toISOString()
        src.error    = null
        allLeads.push(...leads)
        onProgress?.(sourceId, 'loaded', leads.length)
      } catch (e: any) {
        src.status = 'error'
        src.error  = e?.message || 'Fetch failed'
        onProgress?.(sourceId, 'error', 0)
      }
    })
  )

  // Sort by investor score desc, then by date
  allLeads.sort((a, b) => b.investorScore - a.investorScore || b.filedDate.localeCompare(a.filedDate))

  // Deduplicate by address
  const seen = new Set<string>()
  const deduped = allLeads.filter(l => {
    const key = `${l.address.toLowerCase().trim()}::${l.city}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const today = new Date().toISOString().split('T')[0]

  return {
    leads: deduped,
    sources,
    stats: {
      total:    deduped.length,
      critical: deduped.filter(l => l.severity === 'critical').length,
      high:     deduped.filter(l => l.severity === 'high').length,
      byCity:   deduped.reduce((acc, l) => { acc[l.city] = (acc[l.city] || 0) + 1; return acc }, {} as Record<string, number>),
      byType:   deduped.reduce((acc, l) => { acc[l.signalType] = (acc[l.signalType] || 0) + 1; return acc }, {} as Record<string, number>),
      newToday: deduped.filter(l => l.filedDate.startsWith(today)).length,
      fetchedAt: new Date().toISOString(),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHATHAM COUNTY NC — CAMA Parcels + Property Sales
// Server: gisservices.chathamcountync.gov
// Legal: NC Public Records Law NCGS Chapter 132
// Data: Owner, assessed value, property type, last sale, sale price
// Updated: Weekly (CAMA) / Daily (parcels)
// ─────────────────────────────────────────────────────────────────────────────

// Add Chatham to the source registry
RADAR_SOURCES.push(
  {
    id: 'chatham_sales', name: 'Chatham County Property Sales',
    city: 'Pittsboro', state: 'NC', county: 'Chatham',
    type: 'arcgis', enabled: true,
    signalTypes: ['building_permit'],
    status: 'idle', count: 0, lastFetch: null, error: null,
  },
  {
    id: 'chatham_vacant', name: 'Chatham County Vacant/Distressed Parcels',
    city: 'Pittsboro', state: 'NC', county: 'Chatham',
    type: 'arcgis', enabled: true,
    signalTypes: ['vacant', 'tax_delinquent'],
    status: 'idle', count: 0, lastFetch: null, error: null,
  }
)

export async function fetchChathamSales(days: number): Promise<Lead[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  // Property Sales — recent sales below assessed value signal distress
  const url = `https://gisservices.chathamcountync.gov/opendataagol/rest/services/Cadastral/Chatham_PropertySales/MapServer/0/query?` +
    new URLSearchParams({
      where: `SALEDATE >= date '${sinceStr}'`,
      outFields: 'PIN,SITEADDRESS,OWNER,SALEDATE,SALEPRICE,ASSESSED,TAXVAL,ACRES,PROPTYPE,CITYNAME,ZIPCODE',
      returnGeometry: 'true',
      orderByFields: 'SALEDATE DESC',
      resultRecordCount: '200',
      f: 'json',
    }).toString()

  const data = await safeFetch(url)
  if (!data?.features?.length) return []

  return data.features
    .filter((f: any) => {
      const r = f.attributes || {}
      const price    = r.SALEPRICE || 0
      const assessed = r.ASSESSED  || 0
      // Flag: sold well below assessed value = potential distress signal
      return price > 0 && assessed > 0 && price < assessed * 0.85
    })
    .map((f: any) => {
      const r        = f.attributes || {}
      const price    = r.SALEPRICE  || 0
      const assessed = r.ASSESSED   || 0
      const discount = assessed > 0 ? Math.round((1 - price / assessed) * 100) : 0
      const desc     = `Sold ${discount}% below assessed value — $${Math.round(price).toLocaleString()} vs assessed $${Math.round(assessed).toLocaleString()}`
      const severity: Severity = discount >= 30 ? 'critical' : discount >= 20 ? 'high' : 'medium'
      return {
        id:           `chatham-sale-${r.PIN || Math.random().toString(36).slice(2)}`,
        address:      r.SITEADDRESS || 'Unknown',
        city:         r.CITYNAME || 'Chatham County',
        state:        'NC',
        zip:          r.ZIPCODE || '',
        county:       'Chatham',
        lat:          f.geometry?.y || null,
        lng:          f.geometry?.x || null,
        signalType:   'tax_delinquent' as SignalType,
        signalLabel:  `Below-Value Sale — ${discount}% under assessed`,
        description:  desc,
        caseNumber:   r.PIN || '',
        status:       'Sold',
        filedDate:    r.SALEDATE ? new Date(r.SALEDATE).toISOString().split('T')[0] : '',
        severity,
        source:       'Chatham County GIS — Property Sales (public record)',
        sourceUrl:    'https://gisservices.chathamcountync.gov',
        rawData:      r,
        investorScore: getInvestorScore(severity, 'tax_delinquent', 'sold'),
      }
    })
}

export async function fetchChathamDistressed(days: number): Promise<Lead[]> {
  // CAMA Parcels — query for properties with signals:
  // - Zero or very low improvements value vs land value (vacant/teardown)
  // - Property type = mobile home / manufactured
  // - Owner mailing address differs from situs (absentee owner)
  const url = `https://gisservices.chathamcountync.gov/opendataagol/rest/services/Cadastral/Chatham_CamaParcels/MapServer/0/query?` +
    new URLSearchParams({
      // Low improvement value relative to land = vacant/distressed structure
      where: `IMPVAL < LANDVAL * 0.3 AND LANDVAL > 10000 AND PROPTYPE <> 'AG' AND PROPTYPE <> 'EX'`,
      outFields: 'PIN,SITEADDRESS,OWNER,OWNMAIL1,LANDVAL,IMPVAL,TAXVAL,ACRES,PROPTYPE,CITYNAME,ZIPCODE,DEEDEDACRE',
      returnGeometry: 'true',
      resultRecordCount: '150',
      f: 'json',
    }).toString()

  const data = await safeFetch(url)
  if (!data?.features?.length) return []

  return data.features.map((f: any) => {
    const r         = f.attributes || {}
    const landVal   = r.LANDVAL  || 0
    const impVal    = r.IMPVAL   || 0
    const isVacant  = impVal < 1000
    const isAbsentee = r.OWNMAIL1 && r.SITEADDRESS &&
      !r.OWNMAIL1.toLowerCase().includes(r.SITEADDRESS.toLowerCase().split(' ')[0])

    const desc = isVacant
      ? `Vacant lot or minimal structure — land value $${Math.round(landVal).toLocaleString()}, improvement value $${Math.round(impVal).toLocaleString()}`
      : `Low improvement ratio — structure value ${Math.round((impVal/landVal)*100)}% of land value. ${isAbsentee ? 'Absentee owner.' : ''}`

    const severity: Severity = isVacant ? 'high' : impVal < landVal * 0.1 ? 'high' : 'medium'

    return {
      id:           `chatham-dist-${r.PIN || Math.random().toString(36).slice(2)}`,
      address:      r.SITEADDRESS || 'Unknown',
      city:         r.CITYNAME || 'Chatham County',
      state:        'NC',
      zip:          r.ZIPCODE || '',
      county:       'Chatham',
      lat:          f.geometry?.y || null,
      lng:          f.geometry?.x || null,
      signalType:   isVacant ? 'vacant' as SignalType : 'code_violation' as SignalType,
      signalLabel:  isVacant ? 'Vacant / Minimal Structure' : `Low Improvement Value${isAbsentee ? ' + Absentee' : ''}`,
      description:  desc,
      caseNumber:   r.PIN || '',
      status:       'Open',
      filedDate:    new Date().toISOString().split('T')[0],
      severity,
      source:       'Chatham County GIS — CAMA Tax Parcels (public record)',
      sourceUrl:    'https://gisservices.chathamcountync.gov',
      rawData:      r,
      investorScore: getInvestorScore(severity, isVacant ? 'vacant' : 'code_violation', 'open'),
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL COUNTIES — Durham, Wake, Forsyth NC + Henrico, Chesterfield VA
// ─────────────────────────────────────────────────────────────────────────────

RADAR_SOURCES.push(
  { id: 'durham',       name: 'Durham Code Enforcement',     city: 'Durham',        state: 'NC', county: 'Durham',       type: 'arcgis',  enabled: true, signalTypes: ['code_violation'],  status: 'idle', count: 0, lastFetch: null, error: null },
  { id: 'forsyth',      name: 'Forsyth/Winston-Salem Code',  city: 'Winston-Salem', state: 'NC', county: 'Forsyth',      type: 'arcgis',  enabled: true, signalTypes: ['code_violation'],  status: 'idle', count: 0, lastFetch: null, error: null },
  { id: 'wake_county',  name: 'Wake County Permits',         city: 'Cary',          state: 'NC', county: 'Wake',         type: 'arcgis',  enabled: true, signalTypes: ['building_permit'], status: 'idle', count: 0, lastFetch: null, error: null },
  { id: 'henrico',      name: 'Henrico County Code',         city: 'Henrico',       state: 'VA', county: 'Henrico',      type: 'socrata', enabled: true, signalTypes: ['code_violation'],  status: 'idle', count: 0, lastFetch: null, error: null },
  { id: 'chesterfield', name: 'Chesterfield County Permits', city: 'Chesterfield',  state: 'VA', county: 'Chesterfield', type: 'arcgis',  enabled: true, signalTypes: ['building_permit'], status: 'idle', count: 0, lastFetch: null, error: null },
)

async function fetchDurham(days: number): Promise<Lead[]> {
  const since = daysAgoISO(days)
  const url = arcgisUrl(
    'https://gisweb.durhamnc.gov/arcgis/rest/services/PublicWS/Code_Enforcement/MapServer/0',
    `OPENEDDATE >= date '${since}'`,
    'CASENUMBER,FULLADDRESS,CASETYPE,DESCRIPTION,STATUSDESC,OPENEDDATE,ZIPCODE',
    'OPENEDDATE DESC'
  )
  const data = await safeFetch(url)
  if (!data?.features?.length) return []
  return data.features.map((f: any) => {
    const r = f.attributes || {}
    const desc = r.DESCRIPTION || r.CASETYPE || 'Code enforcement'
    const severity = getSeverity(desc)
    return {
      id: `durham-${r.CASENUMBER || Math.random().toString(36).slice(2)}`,
      address: r.FULLADDRESS || 'Unknown', city: 'Durham', state: 'NC', zip: r.ZIPCODE || '', county: 'Durham',
      lat: f.geometry?.y || null, lng: f.geometry?.x || null,
      signalType: 'code_violation' as SignalType, signalLabel: `Code Enforcement — ${r.CASETYPE || 'Violation'}`,
      description: desc, caseNumber: r.CASENUMBER || '', status: r.STATUSDESC || 'Unknown',
      filedDate: r.OPENEDDATE ? new Date(r.OPENEDDATE).toISOString().split('T')[0] : '',
      severity, source: 'City of Durham Open Data', sourceUrl: 'https://gisweb.durhamnc.gov',
      rawData: r, investorScore: getInvestorScore(severity, 'code_violation', r.STATUSDESC || ''),
    }
  })
}

async function fetchForsyth(days: number): Promise<Lead[]> {
  const since = daysAgoISO(days)
  const url = arcgisUrl(
    'https://gis.forsyth.cc/arcgis/rest/services/PublicAccess/CodeEnforcement/MapServer/0',
    `DateOpened >= date '${since}'`,
    'CaseNumber,Address,CaseType,Description,Status,DateOpened,ZipCode',
    'DateOpened DESC'
  )
  const data = await safeFetch(url)
  if (!data?.features?.length) return []
  return data.features.map((f: any) => {
    const r = f.attributes || {}
    const desc = r.Description || r.CaseType || 'Code enforcement'
    const severity = getSeverity(desc)
    return {
      id: `forsyth-${r.CaseNumber || Math.random().toString(36).slice(2)}`,
      address: r.Address || 'Unknown', city: 'Winston-Salem', state: 'NC', zip: r.ZipCode || '', county: 'Forsyth',
      lat: f.geometry?.y || null, lng: f.geometry?.x || null,
      signalType: 'code_violation' as SignalType, signalLabel: `Code Enforcement — ${r.CaseType || 'Violation'}`,
      description: desc, caseNumber: r.CaseNumber || '', status: r.Status || 'Unknown',
      filedDate: r.DateOpened ? new Date(r.DateOpened).toISOString().split('T')[0] : '',
      severity, source: 'Forsyth County Open Data', sourceUrl: 'https://gis.forsyth.cc',
      rawData: r, investorScore: getInvestorScore(severity, 'code_violation', r.Status || ''),
    }
  })
}

async function fetchWakeCounty(days: number): Promise<Lead[]> {
  const since = daysAgoISO(days)
  const url = arcgisUrl(
    'https://maps.wakegov.com/arcgis/rest/services/Inspections/BuildingPermits/MapServer/0',
    `IssueDate >= date '${since}'`,
    'PermitNumber,SiteAddress,Description,PermitType,Status,IssueDate,Zipcode',
    'IssueDate DESC'
  )
  const data = await safeFetch(url)
  if (!data?.features?.length) return []
  return data.features.map((f: any) => {
    const r = f.attributes || {}
    const desc = r.Description || r.PermitType || 'Building permit'
    const severity = getSeverity(desc)
    return {
      id: `wake-${r.PermitNumber || Math.random().toString(36).slice(2)}`,
      address: r.SiteAddress || 'Unknown', city: 'Wake County', state: 'NC', zip: r.Zipcode || '', county: 'Wake',
      lat: f.geometry?.y || null, lng: f.geometry?.x || null,
      signalType: 'building_permit' as SignalType, signalLabel: `Building Permit — ${r.PermitType || 'Permit'}`,
      description: desc, caseNumber: r.PermitNumber || '', status: r.Status || 'Unknown',
      filedDate: r.IssueDate ? new Date(r.IssueDate).toISOString().split('T')[0] : '',
      severity, source: 'Wake County GIS', sourceUrl: 'https://maps.wakegov.com',
      rawData: r, investorScore: getInvestorScore(severity, 'building_permit', r.Status || ''),
    }
  })
}

async function fetchHenrico(days: number): Promise<Lead[]> {
  const since = daysAgoISO(days)
  const url = socrataUrl('data.henrico.us', 'code-violations', {
    '$where': `date_filed >= '${since}'`,
    '$order': 'date_filed DESC',
    '$limit': '200',
  })
  const data = await safeFetch(url)
  if (!data?.length) return []
  return data.map((r: any) => {
    const desc = r.violation_description || r.violation_type || 'Code violation'
    const severity = getSeverity(desc)
    return {
      id: `henrico-${r.case_number || Math.random().toString(36).slice(2)}`,
      address: r.address || 'Unknown', city: 'Henrico', state: 'VA', zip: r.zip || '', county: 'Henrico',
      lat: r.latitude ? parseFloat(r.latitude) : null, lng: r.longitude ? parseFloat(r.longitude) : null,
      signalType: 'code_violation' as SignalType, signalLabel: `Code Violation — ${r.violation_type || 'Violation'}`,
      description: desc, caseNumber: r.case_number || '', status: r.status || 'Unknown',
      filedDate: parseDate(r.date_filed),
      severity, source: 'Henrico County Open Data', sourceUrl: 'https://data.henrico.us',
      rawData: r, investorScore: getInvestorScore(severity, 'code_violation', r.status || ''),
    }
  })
}

async function fetchChesterfield(days: number): Promise<Lead[]> {
  const since = daysAgoISO(days)
  const url = arcgisUrl(
    'https://gis.chesterfield.gov/arcgis/rest/services/PublicAccess/Permits/MapServer/0',
    `ISSUED_DATE >= date '${since}'`,
    'PERMIT_NUMBER,SITE_ADDRESS,DESCRIPTION,PERMIT_TYPE,STATUS,ISSUED_DATE,ZIPCODE',
    'ISSUED_DATE DESC'
  )
  const data = await safeFetch(url)
  if (!data?.features?.length) return []
  return data.features.map((f: any) => {
    const r = f.attributes || {}
    const desc = r.DESCRIPTION || r.PERMIT_TYPE || 'Building permit'
    const severity = getSeverity(desc)
    return {
      id: `chester-${r.PERMIT_NUMBER || Math.random().toString(36).slice(2)}`,
      address: r.SITE_ADDRESS || 'Unknown', city: 'Chesterfield', state: 'VA', zip: r.ZIPCODE || '', county: 'Chesterfield',
      lat: f.geometry?.y || null, lng: f.geometry?.x || null,
      signalType: 'building_permit' as SignalType, signalLabel: `Building Permit — ${r.PERMIT_TYPE || 'Permit'}`,
      description: desc, caseNumber: r.PERMIT_NUMBER || '', status: r.STATUS || 'Unknown',
      filedDate: r.ISSUED_DATE ? new Date(r.ISSUED_DATE).toISOString().split('T')[0] : '',
      severity, source: 'Chesterfield County GIS', sourceUrl: 'https://gis.chesterfield.gov',
      rawData: r, investorScore: getInvestorScore(severity, 'building_permit', r.STATUS || ''),
    }
  })
}

// Register new fetchers — add to existing fetchLeadRadar function map
// These are exported so fetchLeadRadar can pick them up
export const EXTRA_FETCHERS: Record<string, (days: number) => Promise<Lead[]>> = {
  durham:       fetchDurham,
  forsyth:      fetchForsyth,
  wake_county:  fetchWakeCounty,
  henrico:      fetchHenrico,
  chesterfield: fetchChesterfield,
  chatham_sales:   fetchChathamSales,
  chatham_vacant:  fetchChathamDistressed,
}
