/**
 * property-follow-check — watches individual addresses the user is following
 * and emails them as soon as an auction / sale date is posted for that exact
 * property (or when a posted date changes).
 *
 * Triggered daily by cron (service-role bearer) or manually from the UI
 * (user JWT — only that user's follows run).
 *
 * Additive: it INVOKES `auction-radar` and `send-transactional-email`;
 * neither function is modified.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const APP_URL = 'https://sgcflip.com'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const addrKey = (a: string) => (a || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function daysOut(iso: string | null): number | null {
  if (!iso) return null
  return Math.round((new Date(iso + 'T12:00:00Z').getTime() - Date.now()) / 86400000)
}

function dateLabel(iso: string | null, fallback?: string): string {
  if (!iso) return fallback || 'not scheduled'
  try {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    })
  } catch { return iso }
}

interface Follow {
  id: string
  address: string
  city: string
  state: string
  zip: string
  county: string
  addr_key: string
  notify_email: string
  auction_date: string | null
}

/** Scan one area once and reuse it for every follow inside it. */
async function scanArea(area: { city: string; state: string; county: string; zip: string }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/auction-radar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ ...area, daysAhead: 180, maxPrice: 0, nonce: Date.now() }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) throw new Error(body?.error || `scan failed (${res.status})`)
  return Array.isArray(body.records) ? body.records : []
}

async function sendAlert(f: Follow, rec: any, force: boolean) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({
      templateName: 'auction-alert',
      recipientEmail: f.notify_email,
      idempotencyKey: `follow-${f.id}-${rec.auctionDate || 'pending'}${force ? `-test-${Date.now()}` : ''}`,
      templateData: {
        areaLabel: `${f.address}${f.city ? `, ${f.city}` : ''}${f.state ? `, ${f.state}` : ''}`,
        scannedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        appUrl: APP_URL,
        records: [{
          address: rec.address || f.address,
          city: rec.city || f.city,
          state: rec.state || f.state,
          auctionDateLabel: dateLabel(rec.auctionDate || null, rec.auctionDateLabel),
          daysOut: daysOut(rec.auctionDate || null),
          auctionType: rec.auctionType,
          openingBid: rec.openingBid,
          estimatedValue: rec.estimatedValue,
          grade: rec.grade,
          sourceUrl: rec.sourceUrl,
          sourceLabel: rec.sourceLabel,
        }],
      },
    }),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok && body?.success !== false, reason: body?.error || body?.reason || res.status }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Server not configured' }, 500)

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  let body: any = {}
  try { body = await req.json() } catch { /* cron sends {} */ }

  const isSystem = token === SERVICE_KEY
  let userId: string | null = null
  if (!isSystem) {
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data?.user) return json({ error: 'Unauthorized' }, 401)
    userId = data.user.id
  }

  let q = admin.from('property_follows').select('*').eq('active', true)
  if (userId) q = q.eq('user_id', userId)
  if (body.followId) q = q.eq('id', body.followId)
  const { data: follows, error } = await q
  if (error) return json({ error: error.message }, 500)
  if (!follows?.length) return json({ ran: 0, results: [], note: 'No followed properties' })

  // Group by the smallest area that covers each follow, so one scan serves many.
  const groups = new Map<string, { area: any; items: Follow[] }>()
  for (const f of follows as Follow[]) {
    const area = { city: f.city || '', state: f.state || '', county: f.city ? '' : (f.county || ''), zip: f.city ? '' : (f.zip || '') }
    const key = `${area.city}|${area.state}|${area.county}|${area.zip}`.toLowerCase()
    if (!groups.has(key)) groups.set(key, { area, items: [] })
    groups.get(key)!.items.push(f)
  }

  const results: any[] = []

  for (const { area, items } of groups.values()) {
    let records: any[] = []
    let scanError: string | null = null
    try { records = await scanArea(area) } catch (e) { scanError = String((e as Error)?.message || e) }

    for (const f of items) {
      const now = new Date().toISOString()
      if (scanError) {
        await admin.from('property_follows')
          .update({ last_checked_at: now, last_note: `check failed: ${scanError}` }).eq('id', f.id)
        results.push({ followId: f.id, address: f.address, error: scanError })
        continue
      }

      const key = f.addr_key || addrKey(f.address)
      const match = records.find((r: any) => {
        const rk = addrKey(r.address || '')
        return rk && (rk === key || rk.startsWith(key) || key.startsWith(rk))
      })

      if (!match) {
        await admin.from('property_follows')
          .update({ last_checked_at: now, last_note: `no auction notice yet (${records.length} listings scanned)` })
          .eq('id', f.id)
        results.push({ followId: f.id, address: f.address, found: false, scanned: records.length })
        continue
      }

      const newDate: string | null = match.auctionDate || null
      const dateIsNew = !!newDate && newDate !== f.auction_date
      const shouldSend = dateIsNew || (!!body.force && !!match)

      let emailed = false
      let note = newDate
        ? `sale date ${dateLabel(newDate)}`
        : 'listed, no sale date posted yet'

      if (shouldSend) {
        const sent = await sendAlert(f, match, !!body.force && !dateIsNew)
        emailed = sent.ok
        if (!emailed) note += ` · email not sent (${sent.reason})`
      }

      await admin.from('property_follows').update({
        last_checked_at: now,
        last_note: note,
        auction_date: newDate,
        auction_date_label: match.auctionDateLabel || null,
        auction_type: match.auctionType || null,
        opening_bid: match.openingBid || null,
        source_url: match.sourceUrl || null,
        ...(emailed && dateIsNew ? { notified_at: now } : {}),
      }).eq('id', f.id)

      results.push({ followId: f.id, address: f.address, found: true, auctionDate: newDate, emailed, note })
    }
  }

  return json({ ran: results.length, results })
})
