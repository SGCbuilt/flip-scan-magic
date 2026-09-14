/**
 * drip-email-run — autonomous AI email touches. EMAIL ONLY.
 *
 * Hard boundary: call, sms, voicemail and mail touches are never touched by
 * this function. They stay fully manual in DripSequences.tsx (TCPA).
 *
 * For every active sequence with a due, pending EMAIL touch, an AI-written
 * subject + body is drafted from that lead's real distress signal and sent
 * through send-transactional-email (existing suppression check, unsubscribe
 * token, queue and retry — none of it rebuilt here). On success the touch is
 * marked complete with outcome "Auto-sent — AI email".
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import {
  PIPELINE_KEY, DRIP_KEY, readStore, writeStore, completeTouchInPlace, isPrivilegedToken,
} from '../_shared/flipscan-store.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || ''
const MODEL = 'google/gemini-2.5-flash'
const MAX_PER_RUN = 25

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const usd = (n?: number) => (n && n > 0 ? '$' + Math.round(n).toLocaleString('en-US') : '')

function leadContext(lead: any, seq: any): string {
  if (!lead) return `Property: ${seq.address}. No further detail on file.`
  return [
    `Property: ${lead.address}${lead.city ? `, ${lead.city}` : ''}${lead.state ? ` ${lead.state}` : ''}`,
    lead.ownerName && `Owner name on file: ${lead.ownerName}`,
    lead.signalLabel && `Distress signal: ${lead.signalLabel}`,
    lead.signalType && `Signal type: ${lead.signalType}`,
    lead.severity && `Urgency: ${lead.severity}`,
    typeof lead.investorScore === 'number' && `Deal score: ${lead.investorScore}/100`,
    usd(lead.estimatedARV) && `Estimated value: ${usd(lead.estimatedARV)}`,
    usd(lead.estimatedProfit) && `Estimated equity: ${usd(lead.estimatedProfit)}`,
    lead.notes && `Research notes: ${String(lead.notes).slice(0, 1200)}`,
  ].filter(Boolean).join('\n')
}

const SYSTEM = `You write short outreach emails for Albert Salomon, a licensed contractor and cash home buyer in Virginia and North Carolina (SGC General Contractors).

Rules, all mandatory:
- Write like one real person emailing another. No marketing language, no hype, no ALL CAPS, no exclamation marks, no "I hope this finds you well".
- Reference the ONE specific situation in the research notes (sale date, permit activity, tax status, equity) in plain words. Never list several signals, never quote numbers back at the owner, never imply you have been watching them.
- 90 words maximum in the body. Three short paragraphs at most.
- Give them an easy out: it is fine if the timing is wrong.
- No signature and no sign-off block — that is added automatically.
- Subject line: lowercase-ish, under 55 characters, no emoji, no "RE:", nothing that looks like a mass mailing.

Return ONLY valid JSON: {"subject":"...","body":"..."}`

async function draftEmail(context: string, touchTitle: string): Promise<{ subject: string; body: string } | null> {
  if (!LOVABLE_API_KEY) return null
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Lovable-AIG-SDK': 'fetch',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `This is the "${touchTitle}" touch in an ongoing follow-up sequence. Write the JSON email now.\n\n${context}` },
      ],
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`AI ${res.status}: ${detail.slice(0, 200)}`)
  }

  const out = await res.json().catch(() => null)
  const text = out?.choices?.[0]?.message?.content
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    const subject = String(parsed.subject || '').trim()
    const body = String(parsed.body || '').trim()
    if (!subject || !body) return null
    return { subject: subject.slice(0, 120), body }
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Server not configured' }, 500)

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  let body: any = {}
  try { body = await req.json() } catch { /* cron sends {} */ }

  const isSystem = await isPrivilegedToken(createClient, SUPABASE_URL, SERVICE_KEY, token)
  let onlyUser: string | null = null
  if (!isSystem) {
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data?.user) return json({ error: 'Unauthorized' }, 401)
    onlyUser = data.user.id
  }

  let q = admin.from('flipscan_store').select('user_id').eq('key', DRIP_KEY)
  if (onlyUser) q = q.eq('user_id', onlyUser)
  const { data: owners, error: ownersError } = await q
  if (ownersError) return json({ error: ownersError.message }, 500)

  // Manual override — paused users get no autonomous emails at all.
  const { data: pausedRows } = await admin
    .from('agent_settings').select('user_id').eq('paused', true)
  const pausedUsers = new Set((pausedRows || []).map((r: any) => r.user_id))

  const today = new Date().toISOString().split('T')[0]
  const results: any[] = []
  let sent = 0

  for (const row of owners || []) {
    const userId = (row as any).user_id as string
    if (pausedUsers.has(userId)) continue
    const sequences = await readStore(admin, userId, DRIP_KEY)
    const pipeline = await readStore(admin, userId, PIPELINE_KEY)
    let dirty = false

    for (const seq of sequences) {
      if (seq.status !== 'active') continue

      for (const touch of seq.touches || []) {
        // HARD BOUNDARY — email only. Calls, texts, voicemails and mail stay manual.
        if (touch.type !== 'email') continue
        if (touch.status !== 'pending') continue
        if (!(touch.scheduledDate <= today)) continue
        if (sent >= MAX_PER_RUN) break

        const recipient = (seq.email || '').trim()
        if (!recipient) {
          results.push({ sequenceId: seq.id, touchId: touch.id, skipped: 'no email address on lead' })
          continue
        }

        const lead = pipeline.find((l: any) => l.id === seq.leadId)
        let draft: { subject: string; body: string } | null = null
        try {
          draft = await draftEmail(leadContext(lead, seq), touch.title || 'Email touch')
        } catch (e) {
          results.push({ sequenceId: seq.id, touchId: touch.id, error: String((e as Error)?.message || e) })
          continue
        }
        if (!draft) {
          results.push({ sequenceId: seq.id, touchId: touch.id, error: 'AI returned no usable draft' })
          continue
        }

        const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({
            templateName: 'seller-outreach',
            recipientEmail: recipient,
            idempotencyKey: `drip-${seq.id}-${touch.id}`,
            templateData: { subject: draft.subject, body: draft.body },
          }),
        })
        const sendBody = await sendRes.json().catch(() => ({}))

        if (!sendRes.ok || sendBody?.success === false) {
          const reason = sendBody?.reason || sendBody?.error || `status ${sendRes.status}`
          if (sendBody?.reason === 'email_suppressed') {
            touch.status = 'skipped'
            touch.outcome = 'Skipped — recipient unsubscribed'
            dirty = true
          }
          results.push({ sequenceId: seq.id, touchId: touch.id, sent: false, reason })
          continue
        }

        touch.sentSubject = draft.subject
        touch.sentBody = draft.body
        completeTouchInPlace(
          sequences, seq.id, touch.id,
          'Auto-sent — AI email',
          `Subject: ${draft.subject}\n\n${draft.body}`,
        )
        dirty = true
        sent++
        results.push({
          sequenceId: seq.id, touchId: touch.id, address: seq.address,
          sent: true, subject: draft.subject,
        })
      }
      if (sent >= MAX_PER_RUN) break
    }

    if (dirty) {
      try { await writeStore(admin, userId, DRIP_KEY, sequences) }
      catch (e) { results.push({ userScope: 'write', error: String((e as Error)?.message || e) }) }
    }
    if (sent >= MAX_PER_RUN) break
  }

  return json({ sent, checked: results.length, capped: sent >= MAX_PER_RUN, results })
})
