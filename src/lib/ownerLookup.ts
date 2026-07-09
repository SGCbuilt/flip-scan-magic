/**
 * Owner Lookup — free/automatic owner name via RentCast /properties.
 *
 * Used as an automatic fallback when Tracerfy skip-trace is missing or
 * returns no hit. Returns just the public-record owner identity + mailing
 * address (no phones/emails).
 */
import { supabase } from '@/integrations/supabase/client'

export interface OwnerLookupResult {
  hit: boolean
  name: string
  mailingAddr: string
  absenteeOwner: boolean
  ownerType?: 'Individual' | 'Organization' | ''
  source: 'rentcast_property_record' | 'none'
  raw?: any
}

const EMPTY: OwnerLookupResult = {
  hit: false, name: '', mailingAddr: '', absenteeOwner: false,
  ownerType: '', source: 'none',
}

function joinName(o: any): string {
  if (!o) return ''
  if (typeof o.names === 'string' && o.names.trim()) return o.names.trim()
  if (Array.isArray(o.names) && o.names.length) return o.names.filter(Boolean).join(' & ')
  if (typeof o.ownerNames === 'string' && o.ownerNames.trim()) return o.ownerNames.trim()
  if (Array.isArray(o.ownerNames) && o.ownerNames.length) return o.ownerNames.filter(Boolean).join(' & ')
  if (typeof o.ownerName === 'string' && o.ownerName.trim()) return o.ownerName.trim()
  const parts = [o.firstName, o.middleName, o.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  if (typeof o.name === 'string') return o.name.trim()
  return ''
}

function joinMailing(m: any): string {
  if (!m) return ''
  if (typeof m === 'string') return m
  const line = [m.addressLine1 || m.streetAddress || m.address, m.addressLine2].filter(Boolean).join(' ')
  const city = [m.city, m.state].filter(Boolean).join(', ')
  return [line, city, m.zipCode || m.zip].filter(Boolean).join(', ')
}

function normalizeZip(zip: string) {
  return String(zip || '').match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || ''
}

function normalizeState(state: string) {
  const s = String(state || '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(s) ? s : ''
}

function buildLookupAttempts(address: string, city: string, state: string, zip: string) {
  const full = [address, city, state, zip].map(x => String(x || '').trim()).filter(Boolean).join(', ')
  const attempts: Record<string, string>[] = []
  const push = (params: Record<string, string>) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value)) as Record<string, string>
    const key = JSON.stringify(clean)
    if (Object.keys(clean).length && !attempts.some(a => JSON.stringify(a) === key)) attempts.push(clean)
  }

  push({ address: full })
  push({ address: String(address || '').trim(), city: String(city || '').trim(), state: normalizeState(state), zipCode: normalizeZip(zip) })
  push({ address: String(address || '').trim() })
  return attempts
}

export async function lookupOwner(
  address: string, city: string, state: string, zip: string
): Promise<OwnerLookupResult> {
  const attempts = buildLookupAttempts(address, city, state, zip)
  if (!attempts.length) return EMPTY

  try {
    for (const params of attempts) {
      const { data, error } = await supabase.functions.invoke('rentcast', {
        body: { endpoint: 'properties', params },
      })
      if (error) continue
      const arr: any[] = Array.isArray(data) ? data : (data?.properties || data?.data || [])
      const rec = arr[0]
      if (!rec) continue

      const owner = rec.owner || {}
      const name = joinName(owner) || joinName(rec)
      const mailingAddr = joinMailing(owner.mailingAddress || rec.ownerMailingAddress || rec.mailingAddress)
      if (!name && !mailingAddr) continue

      return {
        hit: true,
        name,
        mailingAddr,
        absenteeOwner: !!(owner.ownerOccupied === false || rec.ownerOccupied === false),
        ownerType: (owner.type as any) || '',
        source: 'rentcast_property_record',
        raw: rec,
      }
    }
    return EMPTY
  } catch {
    return EMPTY
  }
}