/**
 * flipscan-store — server-side mirror of the browser data layer.
 *
 * Pipeline and Drip Sequences live in localStorage (src/lib/pipeline.ts,
 * src/lib/drip.ts) and are mirrored to the `flipscan_store` table
 * (user_id TEXT, key TEXT, data JSONB) by src/lib/cloudSync.ts.
 *
 * Scheduled agents cannot call those browser functions, so this module
 * reads/writes the SAME rows and produces records in the SAME shape.
 * Nothing here invents a new store or a new record format.
 */

export const PIPELINE_KEY = 'flipscan_pipeline_v2'
export const DRIP_KEY = 'flipscan_drip_v1'

export const addrKey = (a: string) => (a || '').toLowerCase().replace(/[^a-z0-9]/g, '')

export async function readStore(admin: any, userId: string, key: string): Promise<any[]> {
  const { data } = await admin
    .from('flipscan_store')
    .select('data')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle()
  const rows = data?.data
  return Array.isArray(rows) ? rows : []
}

export async function writeStore(admin: any, userId: string, key: string, rows: any[]): Promise<void> {
  const { error } = await admin
    .from('flipscan_store')
    .upsert(
      { user_id: userId, key, data: rows, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' },
    )
  if (error) throw new Error(`flipscan_store write failed (${key}): ${error.message}`)
}

// ── Pipeline (mirrors addToPipeline in src/lib/pipeline.ts) ───────────────────
export function buildPipelineLead(lead: Record<string, any>) {
  const now = new Date().toISOString()
  return {
    ownerName: '', phones: [], emails: [], mailingAddr: '',
    tags: [], assignedTo: '', notes: '',
    ...lead,
    addedAt: now,
    updatedAt: now,
    contacts: [],
    offers: [],
  }
}

/** Returns the rows to persist, or null when the lead is already present. */
export function appendPipelineLead(existing: any[], lead: Record<string, any>): any[] | null {
  if (existing.some(l => l.id === lead.id)) return null
  return [buildPipelineLead(lead), ...existing]
}

// ── Drip (mirrors DRIP_TEMPLATES + createDripSequence in src/lib/drip.ts) ─────
interface TouchDef {
  day: number
  type: 'call' | 'sms' | 'email' | 'voicemail' | 'mail'
  title: string
  script: (p: { address: string; ownerName: string }) => string
}

const first = (n: string) => (n ? ' ' + n.split(' ')[0] : '')

const MOTIVATED_SELLER: TouchDef[] = [
  { day: 1, type: 'call', title: 'Day 1 — First Call', script: ({ address }) => `Hi, is this the owner of ${address}? My name is Albert Salomon — I'm a local contractor and real estate investor in the area. I noticed your property and I'm genuinely interested in making you a cash offer. I buy properties as-is — no repairs needed, no agent fees. Would you have a few minutes to chat?` },
  { day: 1, type: 'voicemail', title: 'Day 1 — Voicemail Script', script: ({ address }) => `Hi, this message is for the owner of ${address}. My name is Albert Salomon — I'm a local real estate investor and licensed contractor. I'm interested in making a cash offer on your property, bought as-is with a quick close. Please call me back at (703) 944-9770. Thank you.` },
  { day: 3, type: 'call', title: 'Day 3 — Second Call (try different time)', script: ({ address, ownerName }) => `Hi${first(ownerName)}, this is Albert Salomon — I called a couple days ago about your property at ${address}. I'm still very interested in making you a fair cash offer. Do you have 5 minutes to talk?` },
  { day: 5, type: 'sms', title: 'Day 5 — First Text', script: ({ address, ownerName }) => `Hi${first(ownerName)}, this is Albert from SGC General Contractors. I tried calling about ${address}. I'm a local cash buyer — interested in a quick, as-is purchase. Reply YES or call (703) 944-9770.` },
  { day: 7, type: 'call', title: 'Day 7 — Third Call + Offer Mention', script: ({ address, ownerName }) => `Hi${first(ownerName)}, Albert Salomon again about ${address}. I've done my research on the property and I'm prepared to make you a written cash offer. When would be a good time to connect?` },
  { day: 14, type: 'sms', title: 'Day 14 — Follow-Up Text', script: ({ address }) => `Hi, Albert here — following up on ${address}. Still interested in a cash purchase, as-is, fast close. (703) 944-9770` },
  { day: 21, type: 'call', title: 'Day 21 — Re-Engage Call', script: ({ address, ownerName }) => `Hi${first(ownerName)}, Albert Salomon — I've been following up about ${address}. I'm still very interested and ready to move quickly if the timing works for you.` },
  { day: 30, type: 'email', title: 'Day 30 — Email Outreach', script: ({ address, ownerName }) => `Subject: Cash offer for ${address}\n\nHi${first(ownerName)},\n\nI've been trying to reach you about your property at ${address}. I'm a local licensed contractor and real estate investor — I buy properties as-is with cash, fast close, no agent fees or commissions.\n\nIf you'd like to talk numbers, reply here or call me at (703) 944-9770.\n\nAlbert Salomon\nSGC General Contractors`, },
  { day: 60, type: 'call', title: 'Day 60 — Long-Term Re-Engage', script: ({ address, ownerName }) => `Hi${first(ownerName)}, Albert Salomon — I called a couple months back about ${address}. Situations change and I wanted to check in. No obligation at all.` },
]

export const DRIP_TEMPLATES_SERVER: Record<string, TouchDef[]> = {
  motivated_seller: MOTIVATED_SELLER,
}

/** Mirrors createDripSequence() — same record shape DripSequences.tsx reads. */
export function buildDripSequence(params: {
  leadId: string
  address: string
  ownerName: string
  phone?: string
  email?: string
  templateId?: string
}) {
  const templateId = params.templateId || 'motivated_seller'
  const defs = DRIP_TEMPLATES_SERVER[templateId] || MOTIVATED_SELLER
  const start = new Date()
  const seqId = `drip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`

  const touches = defs.map((t, i) => {
    const scheduled = new Date(start)
    scheduled.setDate(scheduled.getDate() + t.day)
    const script = t.script({ address: params.address, ownerName: params.ownerName })
    return {
      id: `touch-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      sequenceId: seqId,
      leadId: params.leadId,
      day: t.day,
      scheduledDate: scheduled.toISOString().split('T')[0],
      type: t.type,
      title: t.title,
      script,
      status: 'pending',
      smsUrl: t.type === 'sms' && params.phone
        ? `sms:${params.phone}?body=${encodeURIComponent(script)}` : undefined,
      mailtoUrl: t.type === 'email' && params.email
        ? `mailto:${params.email}?subject=${encodeURIComponent(`Cash offer — ${params.address}`)}&body=${encodeURIComponent(script)}` : undefined,
    }
  })

  return {
    id: seqId,
    leadId: params.leadId,
    address: params.address,
    ownerName: params.ownerName,
    phone: params.phone,
    email: params.email,
    startedAt: start.toISOString(),
    status: 'active',
    touches,
    templateId,
    daysElapsed: 0,
    createdBy: 'research-agent',
  }
}

/** Mirrors completeTouch() — marks one touch done inside the drip blob. */
export function completeTouchInPlace(
  sequences: any[],
  sequenceId: string,
  touchId: string,
  outcome: string,
  notes?: string,
): boolean {
  const seq = sequences.find(s => s.id === sequenceId)
  if (!seq) return false
  const touch = (seq.touches || []).find((t: any) => t.id === touchId)
  if (!touch) return false
  touch.status = 'completed'
  touch.completedAt = new Date().toISOString()
  touch.outcome = outcome
  if (notes) touch.notes = notes
  const allDone = seq.touches.every((t: any) => t.status === 'completed' || t.status === 'skipped')
  if (allDone) seq.status = 'completed'
  return true
}

/**
 * True when the bearer token carries service-role privileges.
 *
 * Cron jobs authenticate with the key stored in the vault, which is not always
 * byte-identical to SUPABASE_SERVICE_ROLE_KEY in the function environment, so a
 * string compare alone is not enough. This probes a table only service_role can
 * read — a real authorization check, not a claim we trust.
 */
export async function isPrivilegedToken(
  createClientFn: any, url: string, serviceKey: string, token: string,
): Promise<boolean> {
  if (token && token === serviceKey) return true
  try {
    const probe = createClientFn(url, token, { auth: { persistSession: false } })
    const { error } = await probe.from('email_send_state').select('id').limit(1)
    return !error
  } catch { return false }
}
