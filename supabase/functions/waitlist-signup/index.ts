import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

/**
 * waitlist-signup — public endpoint for the coming-soon page.
 * Validates the form, stores the lead in waitlist_leads, then notifies
 * info@sgcflip.com through the existing send-transactional-email pipeline
 * (suppression check, queue, retry). verify_jwt = false; the public page
 * calls this directly. Honeypot field ("website") silently drops bots.
 */

const MOTIONS = new Set(['wholesale', 'flip', 'both'])
const MAX = { fullName: 120, email: 200, phone: 40, markets: 200, company: 120, message: 2000 }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 500)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  // Honeypot: bots fill hidden fields — pretend success, store nothing.
  if (clean(body.website, 200)) return json({ success: true })

  const lead = {
    full_name: clean(body.fullName, MAX.fullName),
    email: clean(body.email, MAX.email).toLowerCase(),
    phone: clean(body.phone, MAX.phone),
    markets: clean(body.markets, MAX.markets),
    motion: clean(body.motion, 20),
    company: clean(body.company, MAX.company),
    message: clean(body.message, MAX.message),
  }

  if (!lead.full_name) return json({ error: 'Full name is required' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return json({ error: 'A valid email is required' }, 400)
  if (!lead.markets) return json({ error: 'Market(s) is required' }, 400)
  if (!MOTIONS.has(lead.motion)) return json({ error: 'Motion must be wholesale, flip, or both' }, 400)

  const supabase = createClient(supabaseUrl, serviceKey)

  const { error: insertError } = await supabase.from('waitlist_leads').insert(lead)
  if (insertError) {
    // Unique-violation on email = already on the list; treat as success.
    if (insertError.code === '23505') return json({ success: true, duplicate: true })
    console.error('waitlist insert failed', { code: insertError.code, message: insertError.message })
    return json({ error: 'Could not save your request — please email info@sgcflip.com' }, 500)
  }

  // Notify the owner through the existing queued email pipeline.
  const { error: mailError } = await supabase.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'waitlist-notification',
      idempotencyKey: `waitlist-${lead.email}`,
      templateData: {
        fullName: lead.full_name,
        email: lead.email,
        phone: lead.phone,
        markets: lead.markets,
        motion: lead.motion,
        company: lead.company,
        message: lead.message,
        submittedAt: new Date().toISOString(),
      },
    },
  })
  if (mailError) {
    // Lead is stored; notification failure is not user-facing.
    console.error('waitlist notification failed', { message: mailError.message })
  }

  return json({ success: true })
})
