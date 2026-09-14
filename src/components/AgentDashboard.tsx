import { useEffect, useState } from 'react'
import { supabase } from '../integrations/supabase/client'
import { getDripSequences, type DripSequence, type DripTouch } from '../lib/drip'
import { hydratFromCloud } from '../lib/cloudSync'
import { toast } from '../lib/toast'

const NAVY = 'var(--sgc-navy)'

interface SeenRow {
  id: string
  address: string
  addr_key: string
  score: number
  grade: string
  auto_added: boolean
  source: string
  first_seen_at: string
}

interface SentEmail {
  id: string
  address: string
  subject: string
  body: string
  at: string
}

function sinceLabel(iso?: string | null) {
  if (!iso) return '—'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  return `${Math.round(hrs / 24)} d ago`
}

function gradeColor(score: number) {
  if (score >= 78) return '#0F9D58'
  if (score >= 62) return '#E08700'
  return '#7A8699'
}

function collectSentEmails(seqs: DripSequence[]): SentEmail[] {
  const out: SentEmail[] = []
  for (const s of seqs) {
    for (const t of (s.touches || []) as DripTouch[]) {
      if (t.outcome !== 'Auto-sent — AI email') continue
      out.push({
        id: t.id,
        address: s.address,
        subject: (t as any).sentSubject || t.title,
        body: (t as any).sentBody || t.notes || '',
        at: (t as any).completedAt || '',
      })
    }
  }
  return out.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
}

export default function AgentDashboard() {
  const [leads, setLeads] = useState<SeenRow[]>([])
  const [emails, setEmails] = useState<SentEmail[]>([])
  const [paused, setPaused] = useState(false)
  const [savingPause, setSavingPause] = useState(false)
  const [live, setLive] = useState(false)
  const [liveAt, setLiveAt] = useState<string>('')
  const [busy, setBusy] = useState<'' | 'research' | 'email'>('')
  const [note, setNote] = useState('')
  const [openEmail, setOpenEmail] = useState<string>('')

  async function loadLeads() {
    const { data } = await supabase
      .from('research_agent_seen')
      .select('id,address,addr_key,score,grade,auto_added,source,first_seen_at')
      .order('first_seen_at', { ascending: false })
      .limit(100)
    setLeads((data || []) as SeenRow[])
  }

  async function loadPause() {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth?.user?.id
    if (!uid) return
    const { data } = await supabase
      .from('agent_settings').select('paused').eq('user_id', uid).maybeSingle()
    setPaused(!!data?.paused)
  }

  useEffect(() => {
    loadLeads()
    loadPause()
    setEmails(collectSentEmails(getDripSequences()))

    const channel = supabase
      .channel('research-agent-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'research_agent_seen' }, () => {
        setLiveAt(new Date().toISOString())
        loadLeads()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_settings' }, (p: any) => {
        if (typeof p?.new?.paused === 'boolean') setPaused(p.new.paused)
      })
      .subscribe(status => setLive(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function togglePause() {
    setSavingPause(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth?.user?.id
      if (!uid) throw new Error('Please sign in again')
      const next = !paused
      const { error } = await supabase.from('agent_settings').upsert(
        { user_id: uid, paused: next, paused_at: next ? new Date().toISOString() : null },
        { onConflict: 'user_id' },
      )
      if (error) throw error
      setPaused(next)
      toast.success(next
        ? 'Agent stopped — no searching and no emails until you turn it back on'
        : 'Agent running again')
    } catch (e: any) {
      toast.error?.(e?.message || 'Could not change that')
    } finally {
      setSavingPause(false)
    }
  }

  async function runNow(which: 'research' | 'email') {
    if (paused) { toast.error?.('The agent is stopped — turn it back on first'); return }
    setBusy(which)
    setNote(which === 'research' ? 'Searching and filing new leads…' : 'Writing and sending due emails…')
    try {
      const fn = which === 'research' ? 'research-agent-run' : 'drip-email-run'
      const { data, error } = await supabase.functions.invoke(fn, { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      await hydratFromCloud()
      setEmails(collectSentEmails(getDripSequences()))
      await loadLeads()
      const msg = which === 'research'
        ? `${data?.ran || 0} area${(data?.ran || 0) === 1 ? '' : 's'} checked · ${data?.addedTotal || 0} new lead${(data?.addedTotal || 0) === 1 ? '' : 's'} filed`
        : `${data?.sent || 0} email${(data?.sent || 0) === 1 ? '' : 's'} written and sent`
      setNote(msg)
      toast.success(msg)
    } catch (e: any) {
      const msg = e?.message || 'That run could not finish'
      setNote(msg)
      toast.error?.(msg)
    } finally {
      setBusy('')
    }
  }

  const queued = leads.filter(l => l.auto_added)
  const avgScore = queued.length
    ? Math.round(queued.reduce((s, l) => s + (l.score || 0), 0) / queued.length) : 0

  const card: React.CSSProperties = {
    background: 'white', border: '1px solid var(--sgc-gray-border)',
    borderRadius: 12, padding: 16,
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Control bar */}
      <div style={{
        ...card,
        borderLeft: `4px solid ${paused ? '#C0392B' : NAVY}`,
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ minWidth: 240, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ color: NAVY, fontSize: 15 }}>Research agent</strong>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 999,
              background: paused ? '#FDECEA' : '#E7F6EC',
              color: paused ? '#C0392B' : '#0F9D58', fontWeight: 600,
            }}>
              {paused ? 'Stopped' : 'Running daily'}
            </span>
            <span style={{ fontSize: 11, color: live ? '#0F9D58' : '#7A8699' }}>
              {live ? '● Live' : '○ Connecting…'}
              {liveAt ? ` · updated ${sinceLabel(liveAt)}` : ''}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: '#5A6478', marginTop: 4 }}>
            {note || (paused
              ? 'Nothing is being searched and no emails are going out until you start it again.'
              : 'Each morning it searches your saved areas, files strong properties into the pipeline and sends the follow-up emails that are due.')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => runNow('research')} disabled={!!busy || paused}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--sgc-gray-border)', background: 'white', color: NAVY, fontWeight: 600, fontSize: 13, opacity: busy || paused ? 0.5 : 1 }}>
            {busy === 'research' ? 'Searching…' : 'Find leads now'}
          </button>
          <button onClick={() => runNow('email')} disabled={!!busy || paused}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: NAVY, color: 'white', fontWeight: 600, fontSize: 13, opacity: busy || paused ? 0.5 : 1 }}>
            {busy === 'email' ? 'Sending…' : 'Send due emails now'}
          </button>
          <button onClick={togglePause} disabled={savingPause}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: paused ? '#0F9D58' : '#C0392B', color: 'white', fontWeight: 700, fontSize: 13, opacity: savingPause ? 0.6 : 1 }}>
            {paused ? 'Start agent' : 'Stop agent'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { label: 'Leads queued', value: queued.length },
          { label: 'Properties reviewed', value: leads.length },
          { label: 'Average score', value: avgScore || '—' },
          { label: 'Emails sent', value: emails.length },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#5A6478' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Live feed */}
      <div style={card}>
        <div style={{ fontWeight: 700, color: NAVY, marginBottom: 2 }}>Live feed — properties the agent found</div>
        <div style={{ fontSize: 12.5, color: '#5A6478', marginBottom: 10 }}>
          Newest first. Green means it was strong enough to be filed into your pipeline with follow-up started.
        </div>
        {!leads.length && (
          <div style={{ fontSize: 13, color: '#7A8699', padding: '18px 0', textAlign: 'center' }}>
            Nothing found yet. The next daily run will fill this in, or press “Find leads now”.
          </div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {leads.map(l => (
            <div key={l.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              border: '1px solid var(--sgc-gray-border)', borderRadius: 10,
              background: l.auto_added ? '#F4FBF6' : 'white',
            }}>
              <div style={{
                width: 44, textAlign: 'center', fontWeight: 800, fontSize: 15,
                color: gradeColor(l.score),
              }}>
                {l.score || '—'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.address || 'Address pending'}
                </div>
                <div style={{ fontSize: 11.5, color: '#7A8699' }}>
                  {[l.grade && `Grade ${l.grade}`, l.source, sinceLabel(l.first_seen_at)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
                background: l.auto_added ? '#E7F6EC' : '#F1F3F7',
                color: l.auto_added ? '#0F9D58' : '#7A8699',
              }}>
                {l.auto_added ? 'Queued' : 'Reviewed'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Emails */}
      <div style={card}>
        <div style={{ fontWeight: 700, color: NAVY, marginBottom: 2 }}>Emails the agent sent</div>
        <div style={{ fontSize: 12.5, color: '#5A6478', marginBottom: 10 }}>
          Tap one to read exactly what went out. Calls, texts, voicemails and mail are never sent automatically.
        </div>
        {!emails.length && (
          <div style={{ fontSize: 13, color: '#7A8699', padding: '18px 0', textAlign: 'center' }}>
            No automatic emails have gone out yet.
          </div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {emails.map(e => (
            <div key={e.id} style={{ border: '1px solid var(--sgc-gray-border)', borderRadius: 10 }}>
              <button onClick={() => setOpenEmail(openEmail === e.id ? '' : e.id)}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: NAVY }}>{e.subject}</div>
                <div style={{ fontSize: 11.5, color: '#7A8699' }}>
                  {[e.address, sinceLabel(e.at)].filter(Boolean).join(' · ')}
                </div>
              </button>
              {openEmail === e.id && (
                <div style={{ padding: '0 12px 12px', fontSize: 13, color: '#33415C', whiteSpace: 'pre-wrap' }}>
                  {e.body || 'The text of this email was not stored.'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
