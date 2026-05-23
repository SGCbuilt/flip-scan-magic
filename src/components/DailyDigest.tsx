/**
 * Daily Digest — Morning Intelligence Brief
 *
 * Aggregates everything that needs your attention today into one screen.
 * Designed to be the FIRST thing you open every morning.
 *
 * Sections (in priority order):
 *   1. 🔥 Overdue tasks — deals slipping right now
 *   2. 📅 Due today — your call list for the day
 *   3. 🚨 New high-score leads (last 24hrs from Lead Radar cache)
 *   4. ⚠ Stale pipeline leads (7+ days no contact)
 *   5. 📊 Quick stats — pipeline health at a glance
 *   6. 💰 Wholesale — active deals + matching buyers
 *   7. 📒 P&L watch — deals needing actual cost updates
 *
 * Auto-runs Lead Radar scan in background on open if last scan > 12 hours ago.
 */
import { useState, useEffect, useCallback } from 'react'
import { getDueTodayAndOverdue, getTasks, getTaskStats, completeTask, FollowUpTask } from '../lib/followUpEngine'
import { getPipeline, getPipelineStats, PipelineLead } from '../lib/pipeline'
import { getWholesaleDeals, getWholesaleStats } from '../lib/wholesalePDF'
import { getDealPLs, analyzeDeal } from '../lib/dealPL'
import { fetchLeadRadar, RADAR_SOURCES, Lead } from '../lib/leadRadar'
import { getBuyerStats } from '../lib/buyerList'
import { isSupabaseConfigured, sendDailyDigest } from '../lib/supabase'
import { getDueTodayDrip, getDripStats } from '../lib/drip'

const fmt$ = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—'

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function hoursAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, count, color, bg, children, defaultOpen = true }: {
  title: string; count?: number; color: string; bg: string
  children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl overflow-hidden border" style={{ borderColor: color + '30' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 border-none cursor-pointer"
        style={{ background: bg }}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm" style={{ color }}>{title}</span>
          {count !== undefined && count > 0 && (
            <span className="text-xs font-black px-2 py-0.5 rounded-full text-white"
              style={{ background: color }}>
              {count}
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="bg-white">{children}</div>}
    </div>
  )
}

// ── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, onDone }: { task: FollowUpTask; onDone: () => void }) {
  const isOverdue = new Date(task.dueDate) < new Date(new Date().toDateString())
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate" style={{ color: 'var(--sgc-black)' }}>
          {task.address}
        </div>
        <div className="text-xs flex items-center gap-2 mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
          <span>{task.ownerName || 'Unknown owner'}</span>
          {task.dueTime && <span>· {task.dueTime}</span>}
          {isOverdue && <span className="font-bold" style={{ color: '#C0341D' }}>· OVERDUE</span>}
        </div>
        {task.note && <div className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--sgc-gray-mid)' }}>{task.note}</div>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {task.phone && (
          <a href={`tel:${task.phone}`}
            className="px-3 py-1.5 rounded-lg text-xs font-bold no-underline"
            style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
            📞 Call
          </a>
        )}
        <button onClick={() => { completeTask(task.id); onDone() }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white border-none cursor-pointer"
          style={{ background: '#1A7A4A' }}>
          ✓ Done
        </button>
      </div>
    </div>
  )
}

// ── Lead row ──────────────────────────────────────────────────────────────────
function LeadRow({ lead }: { lead: Lead }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
        style={{ background: '#EEF2FB', color: 'var(--sgc-navy)' }}>
        {lead.investorScore}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate" style={{ color: 'var(--sgc-black)' }}>{lead.address}</div>
        <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
          {lead.city}, {lead.state} · {lead.signalLabel}
        </div>
      </div>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 capitalize"
        style={{
          background: lead.severity === 'critical' ? '#FEF0ED' : lead.severity === 'high' ? '#FEF3EA' : '#EEF2FB',
          color:      lead.severity === 'critical' ? '#C0341D' : lead.severity === 'high' ? '#C45E1A' : '#1B3A8C',
        }}>
        {lead.severity}
      </span>
    </div>
  )
}

// ── Stale lead row ────────────────────────────────────────────────────────────
function StaleRow({ lead }: { lead: PipelineLead }) {
  const lastActivity = lead.contacts.length > 0
    ? lead.contacts[lead.contacts.length - 1].date
    : lead.addedAt
  const days = daysAgo(lastActivity)
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
        style={{ background: '#FEF7EA', color: '#8A5700' }}>
        {days}d
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate" style={{ color: 'var(--sgc-black)' }}>{lead.address}</div>
        <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
          {lead.ownerName || 'No owner'} · {lead.stage.replace('_', ' ')}
        </div>
      </div>
      {lead.phones.find(p => !p.dnc) && (
        <a href={`tel:${lead.phones.find(p => !p.dnc)?.number}`}
          className="px-3 py-1.5 rounded-lg text-xs font-bold no-underline flex-shrink-0"
          style={{ background: '#EDFAF3', color: '#1A7A4A' }}>
          📞 Call
        </a>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DailyDigest() {
  const [loading,      setLoading]      = useState(false)
  const [lastScan,     setLastScan]     = useState<string | null>(null)
  const [newLeads,     setNewLeads]     = useState<Lead[]>([])
  const [urgentTasks,  setUrgentTasks]  = useState<FollowUpTask[]>([])
  const [todayTasks,   setTodayTasks]   = useState<FollowUpTask[]>([])
  const [staleLeads,   setStaleLeads]   = useState<PipelineLead[]>([])
  const [refresh,      setRefresh]      = useState(0)
  const [emailSending, setEmailSending] = useState(false)
  const [emailResult,  setEmailResult]  = useState<{ ok: boolean; msg: string } | null>(null)
  const supabaseOk = isSupabaseConfigured()

  const pStats    = getPipelineStats()
  const tStats    = getTaskStats()
  const wStats    = getWholesaleStats()
  const bStats    = getBuyerStats()
  const dStats    = getDripStats()
  const dripDue   = getDueTodayDrip()
  const plDeals = getDealPLs()

  const loadLocal = useCallback(() => {
    const due    = getDueTodayAndOverdue()
    const today  = new Date().toISOString().split('T')[0]
    setUrgentTasks(due.filter(t => new Date(t.dueDate) < new Date(today)))
    setTodayTasks(due.filter(t => t.dueDate === today))

    const pipeline = getPipeline()
    setStaleLeads(pipeline.filter(l => {
      if (['closed_won','closed_lost','pass'].includes(l.stage)) return false
      const last = l.contacts.length > 0
        ? l.contacts[l.contacts.length - 1].date
        : l.addedAt
      return daysAgo(last) >= 7
    }))
  }, [])

  // Auto-scan Lead Radar if last scan > 12 hours ago
  const autoScan = useCallback(async () => {
    const lastKey = 'flipscan_digest_last_scan'
    const last = localStorage.getItem(lastKey)
    if (last && hoursAgo(last) < 12) {
      // Use cached results
      try {
        const cached = JSON.parse(localStorage.getItem('flipscan_digest_leads') || '[]')
        const cutoff = new Date()
        cutoff.setHours(cutoff.getHours() - 24)
        const recent = cached.filter((l: Lead) => l.filedDate >= cutoff.toISOString().split('T')[0])
        setNewLeads(recent.filter((l: Lead) => l.investorScore >= 70).slice(0, 10))
        setLastScan(last)
      } catch {}
      return
    }

    setLoading(true)
    try {
      const result = await fetchLeadRadar(
        RADAR_SOURCES.map(s => s.id), 1  // last 24 hours only
      )
      const topLeads = result.leads.filter(l => l.investorScore >= 70).slice(0, 10)
      setNewLeads(topLeads)
      const now = new Date().toISOString()
      setLastScan(now)
      localStorage.setItem(lastKey, now)
      localStorage.setItem('flipscan_digest_leads', JSON.stringify(result.leads))
    } catch (e) {
      console.warn('[Digest] auto-scan failed', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadLocal()
    autoScan()
  }, [refresh])

  const totalUrgent = urgentTasks.length + todayTasks.length
  const plNeedingUpdate = plDeals.filter(d => {
    if (d.status === 'closed') return false
    const s = analyzeDeal(d)
    const hasActuals = d.items.some(i => i.actual > 0)
    return !hasActuals && daysAgo(d.createdAt) > 3
  })

  // Greeting based on time
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--sgc-gray-light)' }}>
      <div className="p-5 max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="rounded-2xl p-5 text-white"
          style={{ background: 'linear-gradient(135deg, #1B3A8C, #0F2460)' }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-lg font-black">{greeting}, Albert</div>
              <div className="text-sm opacity-80 mt-0.5">{today}</div>
              <div className="text-sm opacity-70 mt-1">SGC General Contractors · FlipScan Pro</div>
            </div>
            <div className="flex flex-col gap-2 items-end flex-shrink-0">
              <button onClick={() => setRefresh(r => r + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>
                ↻ Refresh
              </button>
              <button
                onClick={async () => {
                  if (!supabaseOk) {
                    setEmailResult({ ok: false, msg: 'Connect Supabase first — Settings → Integrations → Supabase in Lovable' })
                    return
                  }
                  setEmailSending(true)
                  setEmailResult(null)
                  const r = await sendDailyDigest(
                    todayTasks.length,
                    urgentTasks.length
                  )
                  setEmailResult(r.success
                    ? { ok: true, msg: `✓ Email sent! ${r.leadsFound} leads included` }
                    : { ok: false, msg: r.error || 'Send failed' }
                  )
                  setEmailSending(false)
                }}
                disabled={emailSending}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer whitespace-nowrap"
                style={{ background: emailSending ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.25)', color: 'white' }}>
                {emailSending ? '⟳ Sending...' : '✉ Send Email Now'}
              </button>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
            {[
              { l: 'Tasks Today',      v: totalUrgent,          alert: totalUrgent > 0 },
              { l: 'Active Deals',     v: pStats.active,        alert: false },
              { l: 'Stale Leads',      v: staleLeads.length,    alert: staleLeads.length > 0 },
              { l: 'Wholesale Active', v: wStats.active,        alert: false },
            ].map(s => (
              <div key={s.l} className="text-center">
                <div className="text-2xl font-black" style={{ color: s.alert ? '#FBBF24' : 'white' }}>
                  {s.v}
                </div>
                <div className="text-[10px] opacity-70">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Email result toast */}
        {emailResult && (
          <div className="rounded-2xl p-4 flex items-center justify-between"
            style={{ background: emailResult.ok ? '#EDFAF3' : '#FEF0ED', border: `1px solid ${emailResult.ok ? '#1A7A4A40' : '#C0341D40'}` }}>
            <span className="text-sm font-semibold" style={{ color: emailResult.ok ? '#1A7A4A' : '#C0341D' }}>
              {emailResult.msg}
            </span>
            <button onClick={() => setEmailResult(null)}
              className="text-sm cursor-pointer bg-transparent border-none ml-4"
              style={{ color: emailResult.ok ? '#1A7A4A' : '#C0341D' }}>✕</button>
          </div>
        )}

        {/* Supabase / email setup nudge */}
        {!supabaseOk && (
          <div className="rounded-2xl p-4" style={{ background: '#EEF2FB', border: '1px solid var(--sgc-navy)30' }}>
            <div className="text-sm font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>
              📧 Set Up Automated Morning Emails
            </div>
            <div className="text-xs leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>
              Connect Supabase to get this brief emailed to <strong>projects@sgcbuilt.com</strong> every morning at 6 AM automatically.
              <br/>
              <strong>Lovable:</strong> Settings → Integrations → Supabase → Connect. Then deploy the <code>daily-digest</code> edge function and set <code>RESEND_API_KEY</code> (free at resend.com).
              <br/>
              Setup guide: <code>SUPABASE-SETUP.md</code> in the project root.
            </div>
          </div>
        )}

        {/* ── 1. OVERDUE TASKS ── */}
        {urgentTasks.length > 0 && (
          <Section title="🚨 Overdue — Deals Slipping Right Now" count={urgentTasks.length}
            color="#C0341D" bg="#FEF0ED">
            {urgentTasks.map(t => (
              <TaskRow key={t.id} task={t} onDone={() => setRefresh(r => r + 1)} />
            ))}
          </Section>
        )}

        {/* ── 2. DUE TODAY ── */}
        <Section title="📅 Call List — Due Today" count={todayTasks.length}
          color="#C45E1A" bg="#FEF3EA" defaultOpen={todayTasks.length > 0}>
          {todayTasks.length === 0 ? (
            <div className="px-5 py-4 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
              ✓ Nothing due today — you're ahead
            </div>
          ) : (
            todayTasks.map(t => (
              <TaskRow key={t.id} task={t} onDone={() => setRefresh(r => r + 1)} />
            ))
          )}
        </Section>

        {/* ── 3. NEW LEADS ── */}
        <Section title={`🔍 New High-Score Leads — Last 24 Hours${loading ? ' (scanning...)' : ''}`}
          count={newLeads.length} color="#1B3A8C" bg="#EEF2FB"
          defaultOpen={newLeads.length > 0}>
          {loading ? (
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="w-4 h-4 border-2 rounded-full spin"
                style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }}/>
              <span className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                Scanning government APIs for new leads...
              </span>
            </div>
          ) : newLeads.length === 0 ? (
            <div className="px-5 py-4 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
              No new high-score leads (70+) filed in the last 24 hours
              {lastScan && (
                <span className="text-xs ml-2" style={{ color: 'var(--sgc-gray-mid)' }}>
                  · Scanned {new Date(lastScan).toLocaleTimeString()}
                </span>
              )}
            </div>
          ) : (
            <>
              {newLeads.map(l => <LeadRow key={l.id} lead={l} />)}
              {lastScan && (
                <div className="px-5 py-2 text-[10px]" style={{ color: 'var(--sgc-gray-mid)', borderTop: '1px solid var(--sgc-gray-border)' }}>
                  Scanned {new Date(lastScan).toLocaleTimeString()} · Score 70+ only · Go to Lead Radar for full list
                </div>
              )}
            </>
          )}
        </Section>

        {/* ── 4. STALE PIPELINE LEADS ── */}
        <Section title="⚠ Stale Leads — 7+ Days No Contact" count={staleLeads.length}
          color="#8A5700" bg="#FEF7EA" defaultOpen={staleLeads.length > 0}>
          {staleLeads.length === 0 ? (
            <div className="px-5 py-4 text-sm" style={{ color: '#1A7A4A' }}>
              ✓ All active leads touched recently — good follow-up discipline
            </div>
          ) : (
            staleLeads.slice(0, 8).map(l => <StaleRow key={l.id} lead={l} />)
          )}
          {staleLeads.length > 8 && (
            <div className="px-5 py-3 text-xs text-center" style={{ color: 'var(--sgc-gray-mid)', borderTop: '1px solid var(--sgc-gray-border)' }}>
              + {staleLeads.length - 8} more stale leads — go to Pipeline CRM
            </div>
          )}
        </Section>

        {/* ── 5. PIPELINE HEALTH ── */}
        <Section title="📊 Pipeline Health" color="#534AB7" bg="#EEEDFE" defaultOpen={false}>
          <div className="px-5 py-4 grid grid-cols-3 gap-4">
            {[
              { l: 'New Leads',        v: pStats.stages.new            },
              { l: 'Researching',      v: pStats.stages.researching    },
              { l: 'Contacted',        v: pStats.stages.contacted      },
              { l: 'Negotiating',      v: pStats.stages.negotiating    },
              { l: 'Under Contract',   v: pStats.stages.under_contract },
              { l: '🔥 Hot Leads',    v: pStats.hotLeads              },
            ].map(s => (
              <div key={s.l} className="text-center p-2.5 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
                <div className="text-xl font-bold" style={{ color: 'var(--sgc-navy)' }}>{s.v}</div>
                <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 6. WHOLESALE + BUYERS ── */}
        {(wStats.active > 0 || bStats.total > 0) && (
          <Section title="💼 Wholesale & Buyers" color="#1A7A4A" bg="#EDFAF3" defaultOpen={false}>
            <div className="px-5 py-4 space-y-3">
              {wStats.active > 0 && (
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
                  <div>
                    <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>
                      {wStats.active} active wholesale listing{wStats.active > 1 ? 's' : ''}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                      {wStats.closed} closed · {fmt$(wStats.totalFees)} total fees
                    </div>
                  </div>
                  <div className="text-sm font-bold" style={{ color: '#1A7A4A' }}>
                    Go to Wholesale →
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
                <div>
                  <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>
                    {bStats.active} active buyer{bStats.active !== 1 ? 's' : ''} in list
                  </div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                    {bStats.cash} cash buyers · {fmt$(bStats.totalFeesPaid)} fees paid to you
                  </div>
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* ── 6b. DRIP SEQUENCES ── */}
        {dripDue.length > 0 && (
          <Section title="🔄 Drip Touches Due Today" count={dripDue.length}
            color="#534AB7" bg="#EEEDFE" defaultOpen={true}>
            {dripDue.slice(0, 6).map(({ sequence, touch }) => (
              <div key={touch.id} className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                <span className="text-lg flex-shrink-0">
                  {touch.type === 'call' ? '📞' : touch.type === 'sms' ? '💬' : touch.type === 'email' ? '✉️' : '📣'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: 'var(--sgc-black)' }}>{sequence.address}</div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                    {touch.title} · {sequence.ownerName || 'Unknown owner'}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {sequence.phone && touch.type === 'call' && (
                    <a href={`tel:${sequence.phone}`}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold no-underline"
                      style={{ background: '#EDFAF3', color: '#1A7A4A' }}>📞</a>
                  )}
                  {touch.smsUrl && (
                    <a href={touch.smsUrl}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold no-underline"
                      style={{ background: '#EEF2FB', color: '#1B3A8C' }}>💬</a>
                  )}
                </div>
              </div>
            ))}
            {dripDue.length > 6 && (
              <div className="px-5 py-3 text-xs text-center" style={{ color: 'var(--sgc-gray-mid)' }}>
                + {dripDue.length - 6} more drip touches — go to Drip Sequences tab
              </div>
            )}
          </Section>
        )}

        {/* ── 7. P&L WATCH ── */}
        {plNeedingUpdate.length > 0 && (
          <Section title="📒 P&L Watch — Needs Actual Cost Entry" count={plNeedingUpdate.length}
            color="#534AB7" bg="#EEEDFE" defaultOpen={false}>
            {plNeedingUpdate.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: 'var(--sgc-black)' }}>{d.address}</div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                    {d.city}, {d.state} · Created {daysAgo(d.createdAt)} days ago · No actuals entered yet
                  </div>
                </div>
                <div className="text-xs font-semibold flex-shrink-0" style={{ color: '#534AB7' }}>
                  Go to Deal P&L →
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* ── FOOTER ── */}
        <div className="text-center py-4 space-y-1">
          <div className="text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>
            FlipScan Pro · SGC General Contractors
          </div>
          <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
            (703) 944-9770 · projects@sgcbuilt.com · sgcbuilt.com
          </div>
          {lastScan && (
            <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
              Lead data refreshes every 12 hours · Last: {new Date(lastScan).toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
