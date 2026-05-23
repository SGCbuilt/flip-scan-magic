/**
 * Direct Mail — PostGrid API Integration
 *
 * Sends physical yellow letters to owner mailing addresses.
 * $1.20 per letter, 72-hour delivery, 3-8% response rate.
 *
 * When to use:
 *   - After skip trace reveals mailing address (especially out-of-state owners)
 *   - Day 5-7 of drip sequence (physical mail + calls + texts = multi-channel)
 *   - Absentee owners who haven't responded to calls or texts
 *
 * Setup: Get free API key at postgrid.com (pay-per-letter, no monthly fee)
 *        Store in localStorage as 'fscan_postgrid'
 *
 * Letter template: SGC letterhead, professional but warm tone.
 * Personalized per lead using owner name and property address.
 */

export interface MailRequest {
  // Recipient (owner)
  ownerName:    string
  mailingAddr:  string   // owner's mailing address from skip trace
  mailingCity:  string
  mailingState: string
  mailingZip:   string
  // Property being offered on
  propertyAddress: string
  propertyCity:    string
  propertyState:   string
  // Letter content
  letterType: 'yellow_letter' | 'postcard' | 'formal'
}

export interface MailResult {
  success:   boolean
  letterId?: string
  status?:   string
  cost?:     number
  eta?:      string
  error?:    string
}

function getPostGridKey(): string {
  try { return localStorage.getItem('fscan_postgrid') || '' } catch { return '' }
}

// ── Letter templates ──────────────────────────────────────────────────────────

function buildYellowLetter(req: MailRequest): string {
  const firstName = req.ownerName.split(' ')[0] || 'Homeowner'
  return `Dear ${firstName},

My name is Albert Salomon. I'm a licensed contractor and real estate investor based in the Virginia/North Carolina area.

I am writing to express my sincere interest in purchasing your property located at ${req.propertyAddress}, ${req.propertyCity}, ${req.propertyState}.

I buy properties directly from owners — no real estate agents, no commissions, no repairs needed on your part. I pay cash and can close on your timeline, whether that's 2 weeks or 6 months from now.

If you've been considering selling — or even if you haven't thought about it — I'd love to have a brief conversation to see if we might be able to work something out that makes sense for both of us.

There is absolutely no obligation. I simply want to introduce myself as a serious, local buyer who is ready to move quickly.

Please call or text me at (703) 944-9770, or email me at projects@sgcbuilt.com.

Thank you for your time.

Sincerely,

Albert Salomon
SGC General Contractors
(703) 944-9770 | projects@sgcbuilt.com | sgcbuilt.com`
}

function buildPostcard(req: MailRequest): string {
  const firstName = req.ownerName.split(' ')[0] || 'Homeowner'
  return `${firstName} — I'd like to make a CASH OFFER on your property at ${req.propertyAddress}.

Fast close. As-is. No agents. No fees.

Albert Salomon · SGC General Contractors
(703) 944-9770 · projects@sgcbuilt.com`
}

// ── PostGrid API ──────────────────────────────────────────────────────────────

export async function sendDirectMail(req: MailRequest): Promise<MailResult> {
  const apiKey = getPostGridKey()
  if (!apiKey) {
    return { success: false, error: 'PostGrid API key not set. Get free key at postgrid.com and save as fscan_postgrid in browser.' }
  }

  const letterBody = req.letterType === 'postcard'
    ? buildPostcard(req)
    : buildYellowLetter(req)

  // PostGrid letter API
  try {
    const res = await fetch('https://api.postgrid.com/print-mail/v1/letters', {
      method: 'POST',
      headers: {
        'x-api-key':   apiKey,
        'Content-Type':'application/json',
      },
      body: JSON.stringify({
        description:  `SGC FlipScan — ${req.propertyAddress}`,
        to: {
          firstName:   req.ownerName.split(' ')[0] || 'Property',
          lastName:    req.ownerName.split(' ').slice(1).join(' ') || 'Owner',
          addressLine1:req.mailingAddr,
          city:        req.mailingCity,
          provinceOrState: req.mailingState,
          postalOrZip: req.mailingZip,
          country:     'us',
        },
        from: {
          firstName:   'Albert',
          lastName:    'Salomon',
          companyName: 'SGC General Contractors',
          addressLine1:'SGC General Contractors',
          city:        'Virginia Beach',
          provinceOrState: 'VA',
          postalOrZip: '23451',
          country:     'us',
        },
        html: `<html><body style="font-family:Georgia,serif;font-size:14px;line-height:1.8;max-width:650px;margin:40px auto;color:#1a1a1a;padding:0 20px">
          <div style="border-bottom:3px solid #1B3A8C;padding-bottom:16px;margin-bottom:24px">
            <div style="font-size:20px;font-weight:800;color:#1B3A8C;letter-spacing:-0.5px">SGC BUILT</div>
            <div style="font-size:11px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:3px">General Contractors · (703) 944-9770 · projects@sgcbuilt.com</div>
          </div>
          <pre style="font-family:Georgia,serif;white-space:pre-wrap;font-size:14px;line-height:1.8">${letterBody.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
        </body></html>`,
      }),
      signal: AbortSignal.timeout(15000),
    })

    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data?.error?.message || `PostGrid error: ${res.status}` }
    }

    return {
      success:  true,
      letterId: data.id,
      status:   data.status,
      cost:     1.20,
      eta:      '3-5 business days',
    }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error sending mail' }
  }
}

// ── SMS Templates (no Twilio — native deep links) ─────────────────────────────

export interface SMSTemplate {
  id:       string
  label:    string
  scenario: string
  body:     string
  tags:     string[]
}

export const SMS_TEMPLATES: SMSTemplate[] = [
  {
    id: 'first_contact',
    label: 'First Contact',
    scenario: 'Initial outreach after skip trace',
    body: 'Hi {firstName}, this is Albert Salomon — local contractor and cash buyer. I\'m interested in making an offer on your property at {address}. As-is purchase, fast close. Would love to connect. Call/text (703) 944-9770.',
    tags: ['outreach', 'first touch'],
  },
  {
    id: 'after_no_answer',
    label: 'After No Answer',
    scenario: 'Follow-up text after call went unanswered',
    body: 'Hi {firstName}, I tried calling about {address}. Albert Salomon here — cash buyer, as-is, fast close. No pressure. If you\'d like to chat, I\'m at (703) 944-9770.',
    tags: ['follow-up', 'no answer'],
  },
  {
    id: 'interested_followup',
    label: 'Interested — Next Step',
    scenario: 'They said they\'re interested, now set a meeting',
    body: 'Hi {firstName}, great speaking with you! When works for a quick walkthrough of {address}? I can do mornings or evenings. Just pick a time — (703) 944-9770.',
    tags: ['hot lead', 'meeting'],
  },
  {
    id: 'offer_sent',
    label: 'Offer Sent',
    scenario: 'After emailing/mailing written offer',
    body: 'Hi {firstName}, just sent over a written cash offer for {address}. Let me know any questions. Happy to talk through it — (703) 944-9770.',
    tags: ['offer', 'follow-up'],
  },
  {
    id: 'price_check',
    label: 'Price Check',
    scenario: 'They went quiet after initial interest',
    body: 'Hi {firstName} — Albert here about {address}. Still very interested if timing works for you. Cash, as-is, your timeline. (703) 944-9770',
    tags: ['re-engage', 'stale'],
  },
  {
    id: 'long_term',
    label: 'Long-Term Re-Engage',
    scenario: '30-60 days later, circumstances may have changed',
    body: 'Hi {firstName}, Albert Salomon — I reached out a while back about {address}. Situations change. If you\'re ever open to a conversation, I\'m always reachable at (703) 944-9770. No pressure.',
    tags: ['long term', '60 day'],
  },
  {
    id: 'fire_damage',
    label: 'Fire / Distress',
    scenario: 'Property has visible damage or distress signal',
    body: 'Hi {firstName}, I saw your property at {address} and wanted to reach out. I specialize in buying distressed properties as-is — no repairs needed, cash, quick close. Albert Salomon · (703) 944-9770.',
    tags: ['distress', 'urgent'],
  },
  {
    id: 'absentee',
    label: 'Out-of-State Owner',
    scenario: 'Owner lives far from property',
    body: 'Hi {firstName}, I understand managing a property from out of the area can be challenging. I\'d love to make the process easy — cash purchase of {address}, as-is, handle all the paperwork. Albert · (703) 944-9770.',
    tags: ['absentee', 'remote'],
  },
]

export function buildSMSUrl(template: SMSTemplate, vars: { firstName: string; address: string; phone: string }): string {
  const body = template.body
    .replace(/{firstName}/g, vars.firstName || 'there')
    .replace(/{address}/g, vars.address)
  return `sms:${vars.phone}?body=${encodeURIComponent(body)}`
}

export function buildSMSBody(template: SMSTemplate, vars: { firstName: string; address: string }): string {
  return template.body
    .replace(/{firstName}/g, vars.firstName || 'there')
    .replace(/{address}/g, vars.address)
}
