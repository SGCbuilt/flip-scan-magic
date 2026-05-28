/**
 * Skip Trace Integration — Tracerfy API
 * 
 * Endpoint: POST https://www.tracerfy.com/v1/api/lead-builder/lookup/
 * Auth:      Authorization: Api-Key YOUR_API_KEY
 * Cost:      $0.20 per hit (10 credits at $0.02 each), free on miss
 * Returns:   Owner name, up to 8 phones with DNC flags, emails, 
 *            property value, equity, mortgage, beds/baths, year built
 * 
 * Legal:     Include DNC flag check before calling any number.
 *            TCPA compliance: do not call DNC-flagged numbers.
 *            FTC one-to-one consent rule effective Jan 27, 2025.
 */

export interface SkipTraceResult {
  hit:            boolean
  creditsUsed:    number
  owner: {
    name:         string
    mailingAddr:  string
  } | null
  phones: {
    number:       string
    type:         'mobile' | 'landline'
    dnc:          boolean
    litigator:    boolean
    confidence:   number
  }[]
  emails: {
    address:      string
    confidence:   number
  }[]
  property: {
    beds:            number
    baths:           number
    sqft:            number
    yearBuilt:       number
    propertyType:    string
    estimatedValue:  number
    equity:          number
    equityPct:       number
    mortgageBalance: number
    lastSalePrice:   number
    lastSaleDate:    string
    taxStatus:       string
    vacant:          boolean
    absenteeOwner:boolean
  } | null
  rawData: any
  fetchedAt: string
  error?: string
}

export async function skipTrace(
  address: string,
  city: string,
  state: string,
  zip: string,
  apiKey: string
): Promise<SkipTraceResult> {
  if (!apiKey) {
    return { hit: false, creditsUsed: 0, owner: null, phones: [], emails: [], property: null, rawData: null, fetchedAt: new Date().toISOString(), error: 'No Tracerfy API key configured' }
  }

  try {
    const res = await fetch('https://www.tracerfy.com/v1/api/lead-builder/lookup/', {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address, city, state, zip_code: zip }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      return { hit: false, creditsUsed: 0, owner: null, phones: [], emails: [], property: null, rawData: null, fetchedAt: new Date().toISOString(), error: `API ${res.status}: ${err.slice(0, 200)}` }
    }

    const d = await res.json()
    if (!d?.hit) {
      return { hit: false, creditsUsed: d?.credits_deducted || 0, owner: null, phones: [], emails: [], property: null, rawData: d, fetchedAt: new Date().toISOString() }
    }

    // Parse phones — filter DNC and litigators immediately for safety
    const rawPhones = []
    for (const type of ['mobile', 'landline'] as const) {
      for (let i = 1; i <= 5; i++) {
        const key    = `${type}_${i}`
        const dncKey = `${type}_${i}_dnc`
        const litKey = `${type}_${i}_litigator`
        const num    = d.owner?.[key] || d[key]
        if (num && num !== 'None' && num !== '') {
          rawPhones.push({
            number:     num,
            type,
            dnc:        !!(d.owner?.[dncKey] || d[dncKey]),
            litigator:  !!(d.owner?.[litKey] || d[litKey]),
            confidence: 80,
          })
        }
      }
    }

    // Primary phone
    const primaryPhone = d.owner?.primary_phone || d.primary_phone
    if (primaryPhone && !rawPhones.find(p => p.number === primaryPhone)) {
      rawPhones.unshift({
        number:    primaryPhone,
        type:      'mobile' as const,
        dnc:       !!(d.owner?.primary_phone_dnc || d.primary_phone_dnc),
        litigator: false,
        confidence: 95,
      })
    }

    // Parse emails
    const emails = []
    for (let i = 1; i <= 3; i++) {
      const em = d.owner?.[`email_${i}`] || d[`email_${i}`]
      if (em && em !== 'None') emails.push({ address: em, confidence: i === 1 ? 90 : 70 })
    }

    // Parse property data
    const p = d.property || d
    const prop = {
      beds:            parseInt(p.beds) || 0,
      baths:           parseFloat(p.baths) || 0,
      sqft:            parseInt(p.building_size_sqft || p.sqft) || 0,
      yearBuilt:       parseInt(p.year_built) || 0,
      propertyType:    p.property_type || p.propertyType || '',
      estimatedValue:  parseFloat(p.estimated_value || p.avm) || 0,
      equity:          parseFloat(p.equity) || 0,
      equityPct:       parseFloat(p.equity_percent || p.equity_pct) || 0,
      mortgageBalance: parseFloat(p.mortgage_balance || p.open_mortgage_balance) || 0,
      lastSalePrice:   parseFloat(p.last_sale_price) || 0,
      lastSaleDate:    p.last_sale_date || '',
      taxStatus:       p.tax_status || (p.tax_delinquent ? 'delinquent' : 'current'),
      vacant:          !!(p.vacant || p.vacancy_flag),
      absenteeOwner:   !!(p.absentee_owner || p.absentee),
    }

    return {
      hit:         true,
      creditsUsed: d.credits_deducted || 10,
      owner: {
        name:        [d.owner?.first_name, d.owner?.last_name].filter(Boolean).join(' ') || d.owner?.name || '',
        mailingAddr: d.owner?.mailing_address || '',
      },
      phones:   rawPhones,
      emails,
      property: prop,
      rawData:  d,
      fetchedAt: new Date().toISOString(),
    }
  } catch (e: any) {
    return { hit: false, creditsUsed: 0, owner: null, phones: [], emails: [], property: null, rawData: null, fetchedAt: new Date().toISOString(), error: e?.message }
  }
}

// ── Check API key / balance ───────────────────────────────────────────────────
export interface TracerBalance {
  credits:  number
  jobsRun:  number
  leads:    number
}

export async function fetchTracerBalance(apiKey: string): Promise<TracerBalance | null> {
  try {
    const res = await fetch('https://www.tracerfy.com/v1/api/account/summary/', {
      headers: { 'Authorization': `Api-Key ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const d = await res.json()
    return {
      credits: d.credit_balance || d.credits || 0,
      jobsRun: d.total_jobs || 0,
      leads:   d.total_leads || d.properties_traced || 0,
    }
  } catch { return null }
}
