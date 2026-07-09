/**
 * Owner Lookup — layered public-record fallback.
 *
 * Delegates to the `owner-lookup` edge function which walks a ladder:
 *   RentCast /properties → /avm/value → /listings/sale → Firecrawl county search.
 * Returns the first hit with a `source` label the UI displays as a badge.
 */
import { supabase } from '@/integrations/supabase/client'

export type OwnerLookupSource =
  | 'rentcast_property'
  | 'rentcast_avm'
  | 'rentcast_listing'
  | 'firecrawl_county'
  | 'none'

export interface OwnerLookupResult {
  hit: boolean
  name: string
  mailingAddr: string
  absenteeOwner: boolean
  ownerType?: 'Individual' | 'Organization' | ''
  source: OwnerLookupSource
  sourceLabel: string
  sourceUrl?: string
  raw?: unknown
}

const EMPTY: OwnerLookupResult = {
  hit: false, name: '', mailingAddr: '', absenteeOwner: false,
  ownerType: '', source: 'none', sourceLabel: '',
}

export async function lookupOwner(
  address: string, city: string, state: string, zip: string
): Promise<OwnerLookupResult> {
  if (!String(address || '').trim()) return EMPTY
  try {
    const { data, error } = await supabase.functions.invoke('owner-lookup', {
      body: { address, city, state, zip },
    })
    if (error || !data) return EMPTY
    if (!data.hit) return EMPTY
    return {
      hit: true,
      name: String(data.name || '').trim(),
      mailingAddr: String(data.mailingAddr || '').trim(),
      absenteeOwner: !!data.absenteeOwner,
      ownerType: data.ownerType || '',
      source: (data.source || 'none') as OwnerLookupSource,
      sourceLabel: String(data.sourceLabel || ''),
      sourceUrl: data.sourceUrl,
      raw: data.raw,
    }
  } catch {
    return EMPTY
  }
}