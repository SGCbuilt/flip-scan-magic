/**
 * KPI Dashboard — Business Performance Command Center
 *
 * All numbers pulled from existing data:
 *   - Pipeline CRM → lead counts, stage breakdown, profit tracking
 *   - Tasks engine  → follow-up performance
 *   - Wholesale     → assignment fees earned
 *   - Drive for Dollars → capture activity
 *
 * No external APIs. Pure math on your own data.
 * Updates every time you open it.
 */
import { useState, useEffect } from 'react'
import { getPipeline, getPipelineStats, PipelineLead } from '../lib/pipeline'
import { getTaskStats, getTasks } from '../lib/followUpEngine'
import { getWholesaleStats, getWholesaleDeals } from '../lib/wholesalePDF'
import { getDealPLs, getAllPLStats, buildCostingIntelligence } from '../lib/dealPL'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (n: number) =>
  n >= 1000000 ? `$${(n/1000000).toFixed(2)}M`
  : n >= 1000  ? `$${Math.round(n/1000)}k`
  : n > 0      ? `$${Math.round(n).toLocaleString()}`
  : '—'

const pct = (n: number, d = 1) => isFinite(n) && n > 0 ? `${n.toFixed(d)}%` : '—'

function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function getThisMonth(): { start: Date; end: Date; label: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { start, end, label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
}

function getLast30(): Date {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, bg, trend, icon }: {
  label: string; value: string | number; sub?: string
  color?: string; bg?: string; trend?: 'up' | 'down' | 'neutral'
  icon?: string
}) {
  return (
    <div className="rounded-2xl border p-4 flex flex-col justify-between"
      style={{ borderColor: color ? color + '30' : 'var(--sgc-gray-border)', background: bg || 'white', minHeight: 90 }}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider leading-tight"
          style={{ color: color || 'var(--sgc-gray-mid)' }}>
          {icon && <span className="mr-1">{icon}</span>}{label}
        </div>
        {trend && (
          <span className="text-xs" style={{ color: trend === 'up' ? '#1A7A4A' : trend === 'down' ? '#C0341D' : 'var(--sgc-gray-mid)' }}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
      <div>
        <div className="text-2xl font-black leading-none mt-1" style={{ color: color || 'var(--sgc-black)' }}>
          {value}
        </div>
        {sub && <div className="text-[10px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── Funnel Bar ────────────────────────────────────────────────────────────────
function FunnelBar({ label, count, total, color }: {
  label: string; count: number; total: number; color: string
}) {
  const pctVal = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <div className="text-xs w-28 flex-shrink-0 font-medium" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</div>
      <div className="flex-1 h-6 rounded-lg overflow-hidden relative" style={{ background: 'var(--sgc-gray-light)' }}>
        <div className="h-full rounded-lg flex items-center pl-2 transition-all"
          style={{ width: `${Math.max(pctVal, 2)}%`, background: color, minWidth: count > 0 ? 24 : 0 }}>
          {count > 0 && <span className="text-[10px] font-bold text-white">{count}</span>}
        </div>
      </div>
      <div className="text-xs font-bold w-8 text-right flex-shrink-0" style={{ color }}>
        {count}
      </div>
    </div>
  )
}

// ── Mini Chart — 30-day activity sparkline ────────────────────────────────────
function ActivityChart({ leads }: { leads: PipelineLead[] }) {
  const days = 30
  const today = new Date(); today.setHours(0,0,0,0)

  // Count leads added per day for last 30 days
  const counts: number[] = Array(days).fill(0)
  leads.forEach(l => {
    const d = daysAgo(l.addedAt)
    if (d >= 0 && d < days) counts[days - 1 - d]++
  })

  const max = Math.max(...counts, 1)
  const h = 48

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-gray-mid)' }}>
        Leads Added — Last 30 Days
      </div>
      <div className="flex items-end gap-0.5" style={{ height: h }}>
        {counts.map((c, i) => {
          const barH = Math.max(2, Math.round((c / max) * h))
          const isToday = i === days - 1
          return (
            <div key={i} className="flex-1 rounded-sm relative group"
              style={{ height: barH, background: isToday ? '#C45E1A' : c > 0 ? 'var(--sgc-navy)' : 'var(--sgc-gray-border)' }}>
              {c > 0 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-10"
                  style={{ background: 'var(--sgc-navy)', pointerEvents: 'none' }}>
                  {c}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>30 days ago</span>
        <span className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>Today</span>
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function KPIDashboard() {
  const [data, setData] = useState<ReturnType<typeof computeKPIs> | null>(null)
  const [period, setPeriod] = useState<'30d' | 'mtd' | 'all'>('30d')

  function computeKPIs() {
    const leads      = getPipeline()
    const pStats     = getPipelineStats()
    const tStats     = getTaskStats()
    const wStats     = getWholesaleStats()
    const wDeals     = getWholesaleDeals()
    const allTasks   = getTasks()

    // Date boundaries
    const cutoff = period === 'all' ? new Date(0)
      : period === 'mtd' ? getThisMonth().start
      : getLast30()

    const periodLeads = leads.filter(l => new Date(l.addedAt) >= cutoff)
    const periodLabel = period === 'all' ? 'All Time'
      : period === 'mtd' ? getThisMonth().label
      : 'Last 30 Days'

    // ── Lead Funnel ───────────────────────────────────────────────────────────
    const totalLeads      = periodLeads.length
    const contacted       = periodLeads.filter(l => l.contacts.length > 0).length
    const offers          = periodLeads.filter(l => l.offers.length > 0).length
    const underContract   = periodLeads.filter(l => l.stage === 'under_contract').length
    const closedWon       = leads.filter(l => l.stage === 'closed_won').length
    const closedLost      = leads.filter(l => l.stage === 'closed_lost').length

    // Conversion rates
    const contactRate   = totalLeads > 0 ? (contacted / totalLeads) * 100 : 0
    const offerRate     = contacted > 0  ? (offers / contacted) * 100 : 0
    const closeRate     = offers > 0     ? (closedWon / Math.max(offers, 1)) * 100 : 0
    const overallConv   = totalLeads > 0 ? (closedWon / totalLeads) * 100 : 0

    // ── Financial ─────────────────────────────────────────────────────────────
    const closedLeads = leads.filter(l => l.stage === 'closed_won' && l.closePrice)
    const totalRevenue = closedLeads.reduce((s, l) => s + (l.closePrice || 0), 0)
    const totalProfit  = leads.filter(l => l.stage === 'closed_won')
      .reduce((s, l) => s + (l.estimatedProfit || 0), 0)
    const avgProfit    = closedWon > 0 ? totalProfit / closedWon : 0
    const wFees        = wStats.totalFees

    // Estimated pipeline value (active deals × avg profit)
    const activePipeline = leads.filter(l =>
      ['researching','contacted','negotiating','under_contract'].includes(l.stage)
    )
    const pipelineValue = activePipeline.reduce((s, l) => s + (l.estimatedProfit || 0), 0)

    // ── Speed metrics ─────────────────────────────────────────────────────────
    const contactedLeads = leads.filter(l => l.contacts.length > 0 && l.addedAt)
    const avgDaysToContact = contactedLeads.length > 0
      ? contactedLeads.reduce((s, l) => {
          const first = l.contacts[0]?.date
          return first ? s + daysBetween(l.addedAt, first) : s
        }, 0) / contactedLeads.length
      : 0

    const closedLeadsWithDates = leads.filter(l => l.stage === 'closed_won' && l.closedDate)
    const avgDaysToClose = closedLeadsWithDates.length > 0
      ? closedLeadsWithDates.reduce((s, l) => s + daysBetween(l.addedAt, l.closedDate!), 0) / closedLeadsWithDates.length
      : 0

    // ── Task performance ──────────────────────────────────────────────────────
    const completedTasks = allTasks.filter(t => t.completed)
    const totalTasks     = allTasks.length
    const taskCompRate   = totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0

    // ── Source breakdown ──────────────────────────────────────────────────────
    const bySource: Record<string, number> = {}
    periodLeads.forEach(l => {
      const src = l.source || 'Unknown'
      const key = src.includes('Norfolk') ? 'Norfolk'
        : src.includes('Virginia Beach') ? 'VB'
        : src.includes('Richmond') ? 'Richmond'
        : src.includes('Charlotte') ? 'Charlotte'
        : src.includes('Raleigh') ? 'Raleigh'
        : src.includes('Chatham') ? 'Chatham'
        : src.includes('Drive') ? 'Drive $'
        : 'Other'
      bySource[key] = (bySource[key] || 0) + 1
    })

    // ── Hot leads ─────────────────────────────────────────────────────────────
    const hotLeads = leads
      .filter(l => l.priority === 'hot' && !['closed_won','closed_lost','pass'].includes(l.stage))
      .sort((a,b) => b.investorScore - a.investorScore)
      .slice(0, 5)

    // ── Stale leads — haven't been touched in 7+ days ─────────────────────────
    const staleLeads = leads.filter(l => {
      if (['closed_won','closed_lost','pass'].includes(l.stage)) return false
      const lastActivity = l.contacts.length > 0
        ? l.contacts[l.contacts.length - 1].date
        : l.addedAt
      return daysAgo(lastActivity) >= 7
    })

    return {
      periodLabel, totalLeads, contacted, offers, underContract,
      closedWon, closedLost, contactRate, offerRate, closeRate, overallConv,
      totalRevenue, totalProfit, avgProfit, wFees, pipelineValue,
      avgDaysToContact, avgDaysToClose, taskCompRate,
      tStats, wStats, bySource, hotLeads, staleLeads, leads,
      completedTaskCount: completedTasks.length, totalTaskCount: totalTasks,
    }
  }

  useEffect(() => { setData(computeKPIs()) }, [period])

  if (!data) return null

  const {
    periodLabel, totalLeads, contacted, offers, underContract,
    closedWon, closedLost, contactRate, offerRate, closeRate, overallConv,
    totalRevenue, totalProfit, avgProfit, wFees, pipelineValue,
    avgDaysToContact, avgDaysToClose, taskCompRate,
    tStats, wStats, bySource, hotLeads, staleLeads, leads,
    completedTaskCount, totalTaskCount,
  } = data

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--sgc-gray-light)' }}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black" style={{ color: 'var(--sgc-navy)' }}>
              📊 Business KPIs
            </h2>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              {periodLabel} · Updated {new Date().toLocaleTimeString()}
            </div>
          </div>
          <div className="flex gap-1.5">
            {([
              { v: '30d', l: 'Last 30 Days' },
              { v: 'mtd', l: 'This Month'  },
              { v: 'all', l: 'All Time'    },
            ] as const).map(p => (
              <button key={p.v} onClick={() => setPeriod(p.v)}
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer"
                style={period === p.v
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {p.l}
              </button>
            ))}
          </div>
        </div>

        {/* ── ROW 1 — Money ── */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>
            💰 Financial Performance
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon="🏆" label="Deals Closed" value={closedWon}
              color="#1A7A4A" bg="#EDFAF3"
              sub={closedLost > 0 ? `${closedLost} lost` : 'No losses yet'} />
            <StatCard icon="💵" label="Total Profit (Est)" value={fmt$(totalProfit)}
              color="#1A7A4A" bg="#EDFAF3"
              sub={closedWon > 0 ? `${fmt$(avgProfit)} avg/deal` : 'No closed deals yet'} />
            <StatCard icon="🏷️" label="Assignment Fees" value={fmt$(wFees)}
              color="#534AB7" bg="#EEEDFE"
              sub={`${wStats.closed} wholesale deal${wStats.closed !== 1 ? 's' : ''} closed`} />
            <StatCard icon="📈" label="Pipeline Value" value={fmt$(pipelineValue)}
              color="#C45E1A" bg="#FEF3EA"
              sub={`${leads.filter(l => ['researching','contacted','negotiating','under_contract'].includes(l.stage)).length} active deals`} />
          </div>
        </div>

        {/* ── ROW 2 — Deal Funnel ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Funnel */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="text-sm font-bold mb-4" style={{ color: 'var(--sgc-navy)' }}>🎯 Deal Funnel — {periodLabel}</div>
            {totalLeads === 0 ? (
              <div className="text-sm text-center py-6" style={{ color: 'var(--sgc-gray-mid)' }}>
                No leads in this period yet
              </div>
            ) : (
              <>
                <FunnelBar label="Leads Found"    count={totalLeads}    total={totalLeads} color="#1B3A8C" />
                <FunnelBar label="Contacted"       count={contacted}     total={totalLeads} color="#534AB7" />
                <FunnelBar label="Offers Made"     count={offers}        total={totalLeads} color="#C45E1A" />
                <FunnelBar label="Under Contract"  count={underContract} total={totalLeads} color="#8A5700" />
                <FunnelBar label="Closed Won"      count={closedWon}     total={totalLeads} color="#1A7A4A" />
                <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  {[
                    { l: 'Contact Rate', v: pct(contactRate), c: contactRate >= 40 ? '#1A7A4A' : '#C45E1A' },
                    { l: 'Offer Rate',   v: pct(offerRate),   c: offerRate   >= 20 ? '#1A7A4A' : '#C45E1A' },
                    { l: 'Close Rate',   v: pct(closeRate),   c: closeRate   >= 30 ? '#1A7A4A' : '#C45E1A' },
                  ].map(m => (
                    <div key={m.l} className="text-center">
                      <div className="text-[10px] mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                      <div className="text-lg font-black" style={{ color: m.c }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Activity chart */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="text-sm font-bold mb-4" style={{ color: 'var(--sgc-navy)' }}>📅 Lead Activity</div>
            <ActivityChart leads={leads} />
            <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-center">
                <div className="text-[10px] mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Avg Days to First Contact</div>
                <div className="text-xl font-black" style={{ color: avgDaysToContact <= 1 ? '#1A7A4A' : avgDaysToContact <= 3 ? '#C45E1A' : '#C0341D' }}>
                  {avgDaysToContact > 0 ? `${avgDaysToContact.toFixed(1)}d` : '—'}
                </div>
                <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>Target: same day</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Avg Days to Close</div>
                <div className="text-xl font-black" style={{ color: 'var(--sgc-navy)' }}>
                  {avgDaysToClose > 0 ? `${Math.round(avgDaysToClose)}d` : '—'}
                </div>
                <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>Industry avg: 165 days</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── ROW 3 — Tasks + Speed ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon="✅" label="Tasks Due Today" value={tStats.dueToday}
            color={tStats.dueToday > 0 ? '#C45E1A' : '#1A7A4A'}
            bg={tStats.dueToday > 0 ? '#FEF3EA' : '#EDFAF3'}
            sub={tStats.overdue > 0 ? `⚠ ${tStats.overdue} overdue` : 'All current'} />
          <StatCard icon="📋" label="Task Completion" value={pct(taskCompRate, 0)}
            color={taskCompRate >= 80 ? '#1A7A4A' : '#C45E1A'}
            sub={`${completedTaskCount} of ${totalTaskCount} tasks done`} />
          <StatCard icon="🚗" label="D4D Captures" value={(() => {
              try { return JSON.parse(localStorage.getItem('flipscan_d4d_v1') || '[]').length } catch { return 0 }
            })()}
            color="#534AB7" sub="Drive for Dollars total" />
          <StatCard icon="📢" label="Active Wholesale" value={wStats.active}
            color="#8A5700" bg="#FEF7EA"
            sub={`${wStats.total} total listed`} />
        </div>

        {/* ── ROW 4 — Lead Sources + Hot + Stale ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Lead sources */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="text-sm font-bold mb-4" style={{ color: 'var(--sgc-navy)' }}>📡 Leads by Source</div>
            {Object.keys(bySource).length === 0 ? (
              <div className="text-sm text-center py-4" style={{ color: 'var(--sgc-gray-mid)' }}>
                No leads this period
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(bySource)
                  .sort(([,a],[,b]) => b - a)
                  .map(([src, count]) => {
                    const pctVal = totalLeads > 0 ? (count / totalLeads) * 100 : 0
                    return (
                      <div key={src}>
                        <div className="flex justify-between text-xs mb-1">
                          <span style={{ color: 'var(--sgc-black)' }}>{src}</span>
                          <span className="font-bold" style={{ color: 'var(--sgc-navy)' }}>{count} ({pct(pctVal, 0)})</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>
                          <div className="h-full rounded-full" style={{ width: `${pctVal}%`, background: 'var(--sgc-navy)' }}/>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          {/* Hot leads */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#C0341D30' }}>
            <div className="text-sm font-bold mb-4" style={{ color: '#C0341D' }}>🔥 Hot Leads — Action Now</div>
            {hotLeads.length === 0 ? (
              <div className="text-xs text-center py-4" style={{ color: 'var(--sgc-gray-mid)' }}>
                No hot leads. Mark leads as 🔥 in Pipeline to see them here.
              </div>
            ) : (
              <div className="space-y-2">
                {hotLeads.map(l => (
                  <div key={l.id} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: '#FEF0ED' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                      style={{ background: '#C0341D', color: 'white' }}>
                      {l.investorScore}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate" style={{ color: 'var(--sgc-black)' }}>{l.address}</div>
                      <div className="text-[10px]" style={{ color: '#C0341D' }}>
                        {l.contacts.length} contacts · {l.stage.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stale leads */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#8A570030' }}>
            <div className="text-sm font-bold mb-1" style={{ color: '#8A5700' }}>⚠ Stale Leads (7+ days)</div>
            <div className="text-[10px] mb-3" style={{ color: 'var(--sgc-gray-mid)' }}>Active deals with no recent activity</div>
            {staleLeads.length === 0 ? (
              <div className="text-xs text-center py-4" style={{ color: '#1A7A4A' }}>
                ✅ All leads touched recently
              </div>
            ) : (
              <div className="space-y-2">
                {staleLeads.slice(0, 5).map(l => {
                  const lastActivity = l.contacts.length > 0
                    ? l.contacts[l.contacts.length - 1].date
                    : l.addedAt
                  const days = daysAgo(lastActivity)
                  return (
                    <div key={l.id} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: '#FEF7EA' }}>
                      <div className="text-sm font-black flex-shrink-0" style={{ color: '#8A5700' }}>{days}d</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate" style={{ color: 'var(--sgc-black)' }}>{l.address}</div>
                        <div className="text-[10px] capitalize" style={{ color: '#8A5700' }}>
                          {l.stage.replace('_',' ')} · {l.ownerName || 'No owner'}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {staleLeads.length > 5 && (
                  <div className="text-[10px] text-center" style={{ color: '#8A5700' }}>
                    + {staleLeads.length - 5} more stale leads
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── ROW 5 — Performance targets ── */}
        <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="text-sm font-bold mb-4" style={{ color: 'var(--sgc-navy)' }}>
            🎯 Performance vs Targets
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                l: 'Contact Rate', actual: contactRate, target: 40,
                note: 'Contact 40%+ of leads found',
                fmt: (n: number) => pct(n, 0),
              },
              {
                l: 'Days to First Contact', actual: avgDaysToContact > 0 ? avgDaysToContact : null, target: 1,
                note: 'Contact same day as finding lead',
                fmt: (n: number) => `${n.toFixed(1)}d`,
                invert: true,  // lower is better
              },
              {
                l: 'Task Completion', actual: taskCompRate, target: 90,
                note: 'Complete 90%+ of follow-up tasks',
                fmt: (n: number) => pct(n, 0),
              },
              {
                l: 'Deals Closed', actual: closedWon, target: 1,
                note: 'At least 1 deal per month',
                fmt: (n: number) => String(Math.round(n)),
              },
            ].map(m => {
              const hasData    = m.actual !== null && m.actual !== undefined && (m.actual as number) > 0
              const beats      = hasData && (m.invert
                ? (m.actual as number) <= m.target
                : (m.actual as number) >= m.target)
              const color      = !hasData ? 'var(--sgc-gray-mid)' : beats ? '#1A7A4A' : '#C45E1A'
              const bg         = !hasData ? 'var(--sgc-gray-light)' : beats ? '#EDFAF3' : '#FEF7EA'
              return (
                <div key={m.l} className="rounded-xl p-3" style={{ background: bg }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color }}>
                    {m.l}
                  </div>
                  <div className="text-2xl font-black mb-1" style={{ color }}>
                    {hasData ? m.fmt(m.actual as number) : '—'}
                  </div>
                  <div className="text-[10px] font-semibold" style={{ color }}>
                    {beats ? '✓ On target' : hasData ? '⚠ Below target' : 'No data yet'}
                  </div>
                  <div className="text-[9px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                    Target: {m.fmt(m.target)} · {m.note}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── COSTING INTELLIGENCE ── */}
        {(() => {
          const intel = buildCostingIntelligence()
          if (!intel.hasEnoughData) return null
          return (
            <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-navy)30' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>
                  🧠 Deal Costing Intelligence
                </div>
                <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {intel.dealsAnalyzed} deal{intel.dealsAnalyzed !== 1 ? 's' : ''} analyzed
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { l: 'Overall Accuracy',   v: `${intel.estimatedAccuracy}%`, c: intel.estimatedAccuracy >= 85 ? '#1A7A4A' : '#C45E1A', bg: intel.estimatedAccuracy >= 85 ? '#EDFAF3' : '#FEF7EA' },
                  { l: 'Rehab Bias',         v: intel.rehabBias > 0 ? `+${intel.rehabBias}%` : `${intel.rehabBias}%`, c: Math.abs(intel.rehabBias) > 10 ? '#C0341D' : '#1A7A4A', bg: Math.abs(intel.rehabBias) > 10 ? '#FEF0ED' : '#EDFAF3' },
                  { l: 'Suggested Buffer',   v: `+${intel.suggestedRehabBuffer}%`, c: '#1B3A8C', bg: '#EEF2FB' },
                  { l: 'Smart Rules Learned', v: intel.smartAdjustments.filter(a => a.confidence !== 'low').length, c: '#534AB7', bg: '#EEEDFE' },
                ].map(m => (
                  <div key={m.l} className="text-center p-3 rounded-xl" style={{ background: m.bg }}>
                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                    <div className="text-xl font-black" style={{ color: m.c }}>{m.v}</div>
                  </div>
                ))}
              </div>
              {intel.topBias && (
                <div className="p-3 rounded-xl text-xs" style={{
                  background: intel.topBias.trend === 'over' ? '#FEF0ED' : '#EDFAF3',
                  color: intel.topBias.trend === 'over' ? '#C0341D' : '#1A7A4A',
                }}>
                  <strong>Biggest bias:</strong> {intel.topBias.insight}
                </div>
              )}
              {intel.smartAdjustments.filter(a => a.confidence === 'high').slice(0, 2).map(a => (
                <div key={a.lineItemLabel} className="mt-2 p-2.5 rounded-xl text-xs flex items-center gap-2"
                  style={{ background: 'var(--sgc-gray-light)' }}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.biasDirection === 'over' ? '#C0341D' : '#1A7A4A' }}/>
                  <span style={{ color: 'var(--sgc-black)' }}>{a.rule}</span>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Footer */}
        <div className="text-[10px] text-center pb-4" style={{ color: 'var(--sgc-gray-mid)' }}>
          All data from your FlipScan Pro — Pipeline CRM, Tasks, Wholesale, Drive for Dollars · Refreshes on open
        </div>
      </div>
    </div>
  )
}
