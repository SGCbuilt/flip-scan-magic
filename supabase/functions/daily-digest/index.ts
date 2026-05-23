/**
 * Daily Digest Edge Function
 *
 * Runs every morning at 6 AM ET via pg_cron or manual trigger.
 * Scans all enabled Lead Radar sources, filters score 70+,
 * cross-references pipeline + tasks, and emails Albert a
 * formatted morning brief at projects@sgcbuilt.com
 *
 * Deploy:   supabase functions deploy daily-digest
 * Schedule: see supabase/migrations/schedule_digest.sql
 *
 * Env secrets needed (set in Supabase Dashboard → Edge Functions → Secrets):
 *   RESEND_API_KEY   — resend.com (free tier: 100 emails/day)
 *   DIGEST_TO_EMAIL  — who to send to (default: projects@sgcbuilt.com)
 *   DIGEST_FROM      — verified sender (default: digest@sgcbuilt.com)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Government API fetchers (same logic as leadRadar.ts, server-side) ─────────
interface Lead {
  id: string; address: string; city: string; state: string
  signalLabel: string; severity: string; investorScore: number
  filedDate: string; source: string; description: string
}

async function safeFetch(url: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
    return r.ok ? await r.json() : null
  } catch { return null }
}

function daysAgoISO(days: number): string {
  const d = new Date(); d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function getSeverity(text: string): string {
  const t = text.toLowerCase()
  if (['fire','structural','unsafe','condemned','hazard','imminent'].some(k => t.includes(k))) return 'critical'
  if (['electrical','plumbing','roof','foundation','mold','vacant','abandoned'].some(k => t.includes(k))) return 'high'
  return 'medium'
}

function scoreSignal(severity: string): number {
  return severity === 'critical' ? 88 : severity === 'high' ? 74 : 54
}

async function fetchNorfolk(): Promise<Lead[]> {
  const since = daysAgoISO(1)
  const url = `https://data.norfolk.gov/resource/mxtv-99gh.json?$where=opened_date>='${since}'&$limit=50&$select=case_number,address,violation_description,violation_type,status,opened_date`
  const data = await safeFetch(url)
  if (!data?.length) return []
  return data.map((r: any) => {
    const desc = r.violation_description || r.violation_type || 'Code violation'
    const sev  = getSeverity(desc)
    return { id: `n-${r.case_number}`, address: r.address || '', city: 'Norfolk', state: 'VA', signalLabel: `Code Violation — ${r.violation_type||''}`, severity: sev, investorScore: scoreSignal(sev), filedDate: r.opened_date?.split('T')[0]||'', source: 'Norfolk', description: desc }
  })
}

async function fetchCharlotte(): Promise<Lead[]> {
  const since = daysAgoISO(1)
  const url = `https://gis.charlottenc.gov/arcgis/rest/services/HNS/CodeEnforcementCasesAll/MapServer/0/query?where=DateOpened>= date '${since}'&outFields=CaseNumber,Address,CaseType,Description,Status,DateOpened&f=json&resultRecordCount=50`
  const data = await safeFetch(url)
  if (!data?.features?.length) return []
  return data.features.map((f: any) => {
    const r = f.attributes || {}
    const desc = r.Description || r.CaseType || 'Code enforcement'
    const sev  = getSeverity(desc)
    return { id: `c-${r.CaseNumber}`, address: r.Address||'', city: 'Charlotte', state: 'NC', signalLabel: `Code Enforcement — ${r.CaseType||''}`, severity: sev, investorScore: scoreSignal(sev), filedDate: r.DateOpened ? new Date(r.DateOpened).toISOString().split('T')[0] : '', source: 'Charlotte', description: desc }
  })
}

async function fetchVirginiaBeach(): Promise<Lead[]> {
  const since = daysAgoISO(1)
  const url = `https://services1.arcgis.com/0MSEUqKaxRlEPj5g/arcgis/rest/services/Code_Enforcement_Cases/FeatureServer/0/query?where=OpenedDate>= date '${since}'&outFields=CaseNumber,Address,ViolationType,Description,Status,OpenedDate&f=json&resultRecordCount=50`
  const data = await safeFetch(url)
  if (!data?.features?.length) return []
  return data.features.map((f: any) => {
    const r = f.attributes || {}
    const desc = r.Description || r.ViolationType || 'Code enforcement'
    const sev  = getSeverity(desc)
    return { id: `vb-${r.CaseNumber}`, address: r.Address||'', city: 'Virginia Beach', state: 'VA', signalLabel: `Code Enforcement — ${r.ViolationType||''}`, severity: sev, investorScore: scoreSignal(sev), filedDate: r.OpenedDate ? new Date(r.OpenedDate).toISOString().split('T')[0] : '', source: 'Virginia Beach', description: desc }
  })
}

// ── Email builder ─────────────────────────────────────────────────────────────
function buildEmail(leads: Lead[], taskCount: number, overdueCount: number, date: string): string {
  const criticalLeads = leads.filter(l => l.severity === 'critical')
  const highLeads     = leads.filter(l => l.severity === 'high')

  const leadRows = leads.slice(0, 12).map(l => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6">
        <div style="font-weight:700;font-size:14px;color:#111">${l.address}</div>
        <div style="font-size:12px;color:#666;margin-top:2px">${l.city}, ${l.state} · ${l.signalLabel}</div>
        <div style="font-size:11px;color:#888;margin-top:2px">${l.description.slice(0,100)}${l.description.length > 100 ? '...' : ''}</div>
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;vertical-align:top">
        <span style="display:inline-block;background:${l.severity === 'critical' ? '#FEF0ED' : l.severity === 'high' ? '#FEF3EA' : '#EEF2FB'};color:${l.severity === 'critical' ? '#C0341D' : l.severity === 'high' ? '#C45E1A' : '#1B3A8C'};padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700;text-transform:uppercase">
          ${l.severity}
        </span>
        <div style="font-size:12px;color:#1B3A8C;font-weight:700;margin-top:4px">${l.investorScore}/100</div>
      </td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1B3A8C,#0F2460);border-radius:16px;padding:28px 32px;margin-bottom:20px">
      <div style="font-size:22px;font-weight:900;color:white;letter-spacing:-0.5px">
        SGC BUILT <span style="font-weight:400;opacity:0.6">· FlipScan Pro</span>
      </div>
      <div style="font-size:15px;color:rgba(255,255,255,0.8);margin-top:6px">☀️ Morning Brief · ${date}</div>
      <div style="display:flex;gap:24px;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.2)">
        ${[
          { l: 'New Leads',    v: leads.length,   c: leads.length > 0 ? '#FBBF24' : 'rgba(255,255,255,0.7)' },
          { l: 'Critical',     v: criticalLeads.length, c: criticalLeads.length > 0 ? '#F87171' : 'rgba(255,255,255,0.7)' },
          { l: 'Tasks Today',  v: taskCount,       c: taskCount > 0 ? '#FBBF24' : 'rgba(255,255,255,0.7)' },
          { l: 'Overdue',      v: overdueCount,    c: overdueCount > 0 ? '#F87171' : 'rgba(255,255,255,0.7)' },
        ].map(s => `
        <div style="text-align:center">
          <div style="font-size:28px;font-weight:900;color:${s.c}">${s.v}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:2px;text-transform:uppercase;letter-spacing:1px">${s.l}</div>
        </div>`).join('')}
      </div>
    </div>

    ${overdueCount > 0 ? `
    <!-- Overdue alert -->
    <div style="background:#FEF0ED;border:2px solid #C0341D;border-radius:12px;padding:16px 20px;margin-bottom:16px">
      <div style="font-weight:800;color:#C0341D;font-size:14px">⚠ ${overdueCount} Overdue Task${overdueCount > 1 ? 's' : ''} — Deals Slipping</div>
      <div style="font-size:13px;color:#C0341D;margin-top:4px">Open FlipScan Pro → Tasks tab to resolve immediately</div>
    </div>` : ''}

    ${taskCount > 0 ? `
    <!-- Tasks today -->
    <div style="background:white;border-radius:12px;padding:16px 20px;margin-bottom:16px;border:1px solid #e5e7eb">
      <div style="font-weight:700;color:#C45E1A;font-size:14px;margin-bottom:8px">📅 ${taskCount} Follow-Up${taskCount > 1 ? 's' : ''} Due Today</div>
      <div style="font-size:13px;color:#374151">Open FlipScan Pro → Tasks → today's call list to work through them in order.</div>
    </div>` : ''}

    ${leads.length > 0 ? `
    <!-- New leads -->
    <div style="background:white;border-radius:12px;overflow:hidden;margin-bottom:16px;border:1px solid #e5e7eb">
      <div style="background:#1B3A8C;padding:14px 16px">
        <div style="font-weight:700;color:white;font-size:14px">
          📡 ${leads.length} New High-Score Lead${leads.length > 1 ? 's' : ''} — Last 24 Hours
          ${criticalLeads.length > 0 ? `<span style="background:#C0341D;color:white;padding:2px 8px;border-radius:100px;font-size:11px;margin-left:8px">${criticalLeads.length} CRITICAL</span>` : ''}
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:3px">Score 70+ only · VA + NC government APIs · ${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <table style="width:100%;border-collapse:collapse">${leadRows}</table>
      ${leads.length > 12 ? `<div style="padding:10px 16px;text-align:center;font-size:12px;color:#888">+ ${leads.length - 12} more leads in FlipScan Pro</div>` : ''}
    </div>` : `
    <!-- No new leads -->
    <div style="background:white;border-radius:12px;padding:16px 20px;margin-bottom:16px;border:1px solid #e5e7eb;text-align:center">
      <div style="font-size:14px;color:#6B7280">No new leads (score 70+) filed in the last 24 hours</div>
      <div style="font-size:12px;color:#9CA3AF;margin-top:4px">Government APIs scan VA + NC daily for code violations and distressed signals</div>
    </div>`}

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:20px">
      <a href="https://sgcflip.com" style="display:inline-block;background:#1B3A8C;color:white;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none">
        Open FlipScan Pro →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;font-size:11px;color:#9CA3AF;line-height:1.6">
      <div style="font-weight:600;color:#6B7280;margin-bottom:4px">SGC General Contractors · Albert Salomon</div>
      (703) 944-9770 · projects@sgcbuilt.com · sgcbuilt.com<br>
      FlipScan Pro · sgcflip.com · Automated daily at 6:00 AM ET
    </div>
  </div>
</body>
</html>`
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const RESEND_KEY  = Deno.env.get('RESEND_API_KEY')  || ''
    const TO_EMAIL    = Deno.env.get('DIGEST_TO_EMAIL') || 'projects@sgcbuilt.com'
    const FROM_EMAIL  = Deno.env.get('DIGEST_FROM')     || 'FlipScan Pro <digest@sgcbuilt.com>'

    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set. Get free key at resend.com' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Scan all sources in parallel (last 24 hours)
    const [norfolk, charlotte, vb] = await Promise.allSettled([
      fetchNorfolk(), fetchCharlotte(), fetchVirginiaBeach()
    ])

    const allLeads: Lead[] = [
      ...(norfolk.status    === 'fulfilled' ? norfolk.value    : []),
      ...(charlotte.status  === 'fulfilled' ? charlotte.value  : []),
      ...(vb.status         === 'fulfilled' ? vb.value         : []),
    ]
      .filter(l => l.investorScore >= 70 && l.address)
      .sort((a, b) => b.investorScore - a.investorScore)

    // Deduplicate by address
    const seen = new Set<string>()
    const deduped = allLeads.filter(l => {
      const k = l.address.toLowerCase().trim()
      if (seen.has(k)) return false
      seen.add(k); return true
    })

    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      timeZone: 'America/New_York'
    })

    // Note: task counts come from request body (client sends them since
    // tasks are stored in localStorage, not Supabase)
    let taskCount = 0, overdueCount = 0
    try {
      const body = await req.json().catch(() => ({}))
      taskCount   = body.taskCount   || 0
      overdueCount = body.overdueCount || 0
    } catch {}

    const html = buildEmail(deduped, taskCount, overdueCount, date)

    // Send via Resend
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [TO_EMAIL],
        subject: `☀️ FlipScan Morning Brief — ${deduped.length} new lead${deduped.length !== 1 ? 's' : ''} · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        html,
      }),
    })

    const sendData = await sendRes.json()

    if (!sendRes.ok) {
      return new Response(JSON.stringify({ error: 'Resend failed', detail: sendData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      leadsFound: deduped.length,
      emailId: sendData.id,
      sentTo: TO_EMAIL,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
