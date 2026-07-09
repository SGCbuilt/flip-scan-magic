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
  const parts = [o.firstName, o.middleName, o.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  if (typeof o.name === 'string') return o.name.trim()
  return ''
}

function joinMailing(m: any): string {
  if (!m) return ''
  if (typeof m === 'string') return m
  const line = [m.addressLine1, m.addressLine2].filter(Boolean).join(' ')
  const city = [m.city, m.state].filter(Boolean).join(', ')
  return [line, city, m.zipCode].filter(Boolean).join(', ')
}

export async function lookupOwner(
  address: string, city: string, state: string, zip: string
): Promise<OwnerLookupResult> {
  const full = [address, city, state, zip].filter(Boolean).join(', ')
  if (!full) return EMPTY

  try {
    const { data, error } = await supabase.functions.invoke('rentcast', {
      body: { endpoint: 'properties', params: { address: full } },
    })
    if (error) return EMPTY
    const arr: any[] = Array.isArray(data) ? data : (data?.properties || data?.data || [])
    const rec = arr[0]
    if (!rec) return EMPTY

    const owner = rec.owner || {}
    const name = joinName(owner)
    const mailingAddr = joinMailing(owner.mailingAddress)
    if (!name && !mailingAddr) return EMPTY

    return {
      hit: true,
      name,
      mailingAddr,
      absenteeOwner: !!(owner.ownerOccupied === false || rec.ownerOccupied === false),
      ownerType: (owner.type as any) || '',
      source: 'rentcast_property_record',
      raw: rec,
    }
  } catch {
    return EMPTY
  }
}