/**
 * Settings — API Keys, Cloud Sync, Direct Mail, SMS Templates, Data Export
 *
 * One screen for everything operational:
 *   - API key management (Anthropic, Tracerfy, PostGrid, Supabase)
 *   - Cloud sync status + manual sync trigger
 *   - Data export / import (JSON backup)
 *   - SMS template launcher
 *   - Direct mail sender
 */
import { useState, useEffect } from 'react'
import { getSyncStatus, exportAllData, importAllData, hydratFromCloud } from '../lib/cloudSync'
import { isSupabaseConfigured } from '../lib/supabase'
import { SMS_TEMPLATES, buildSMSUrl, buildSMSBody, sendDirectMail, MailRequest } from '../lib/directMail'
import { getPipeline } from '../lib/pipeline'
import { supabase } from '@/integrations/supabase/client'
import { saveKey, clearLocalKeys } from '../lib/keyVault'
import { toast } from '../lib/toast'

// ── API Key Field ─────────────────────────────────────────────────────────────
function KeyField({ label, storageKey, placeholder, docs, description }: {
  label: string; storageKey: string; placeholder: string; docs?: string; description: string
}) {
  const [val, setVal]       = useState(() => { try { return localStorage.getItem(storageKey) || '' } catch { return '' } })
  const [visible, setVis]   = useState(false)
  const [saved, setSaved]   = useState(false)

  const handleSave = async () => {
    const { data } = await supabase.auth.getUser()
    await saveKey(storageKey, val, data.user?.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-white rounded-2xl border p-4" style={{ borderColor: val ? '#1A7A4A30' : 'var(--sgc-gray-border)' }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--sgc-black)' }}>
            {label}
            {val && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#EDFAF3', color: '#1A7A4A' }}>✓ Configured</span>}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{description}</div>
        </div>
        {docs && (
          <a href={docs} target="_blank" rel="noopener noreferrer"
            className="text-[10px] font-semibold no-underline flex-shrink-0 px-2 py-1 rounded"
            style={{ background: '#EEF2FB', color: '#1B3A8C' }}>
            Get Key →
          </a>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? 'text' : 'password'}
            value={val} onChange={e => setVal(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-xl border text-xs px-3 py-2.5 outline-none font-mono"
            style={{ borderColor: 'var(--sgc-gray-border)' }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <button onClick={() => setVis(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] cursor-pointer bg-transparent border-none"
            style={{ color: 'var(--sgc-gray-mid)' }}>
            {visible ? 'hide' : 'show'}
          </button>
        </div>
        <button onClick={handleSave}
          className="px-3 py-2 rounded-xl text-xs font-bold text-white border-none cursor-pointer flex-shrink-0"
          style={{ background: saved ? '#1A7A4A' : 'var(--sgc-navy)' }}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── SMS Template Launcher ─────────────────────────────────────────────────────
function SMSLauncher() {
  const pipeline = getPipeline().filter(l => !['closed_won','closed_lost','pass'].includes(l.stage))
  const [leadId, setLeadId]   = useState(pipeline[0]?.id || '')
  const [tmplId, setTmplId]   = useState(SMS_TEMPLATES[0].id)
  const [copied, setCopied]   = useState(false)

  const lead     = pipeline.find(l => l.id === leadId)
  const template = SMS_TEMPLATES.find(t => t.id === tmplId) || SMS_TEMPLATES[0]
  const phone    = lead?.phones?.find(p => !p.dnc)?.number || ''
  const vars     = { firstName: lead?.ownerName?.split(' ')[0] || 'there', address: lead?.address || '' }
  const smsUrl   = phone ? buildSMSUrl(template, { ...vars, phone }) : ''
  const body     = buildSMSBody(template, vars)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Lead</div>
          <select className="w-full rounded-xl border text-xs px-3 py-2 outline-none"
            style={{ borderColor: 'var(--sgc-gray-border)' }}
            value={leadId} onChange={e => setLeadId(e.target.value)}>
            {pipeline.map(l => <option key={l.id} value={l.id}>{l.address.slice(0,30)}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Template</div>
          <select className="w-full rounded-xl border text-xs px-3 py-2 outline-none"
            style={{ borderColor: 'var(--sgc-gray-border)' }}
            value={tmplId} onChange={e => setTmplId(e.target.value)}>
            {SMS_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-xl p-3 text-xs leading-relaxed"
        style={{ background: '#EEF2FB', color: '#1B3A8C', fontFamily: 'monospace' }}>
        {body}
      </div>

      {lead && (
        <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
          📍 {lead.address} · {lead.ownerName || 'Unknown'} · {phone || 'No phone'}
          {lead.phones?.find(p => !p.dnc) ? '' : ' · ⚠ Check DNC status'}
        </div>
      )}

      <div className="flex gap-2">
        {smsUrl ? (
          <a href={smsUrl}
            className="flex-1 text-center py-2.5 rounded-xl text-xs font-bold no-underline text-white"
            style={{ background: '#1B3A8C' }}>
            💬 Open in Messages
          </a>
        ) : (
          <div className="flex-1 text-center py-2.5 rounded-xl text-xs font-bold text-white"
            style={{ background: 'var(--sgc-gray-mid)' }}>
            No phone number
          </div>
        )}
        <button onClick={() => { navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="px-4 py-2 rounded-xl text-xs font-bold border-none cursor-pointer"
          style={{ background: copied ? '#EDFAF3' : 'var(--sgc-gray-light)', color: copied ? '#1A7A4A' : 'var(--sgc-gray-mid)' }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

// ── Direct Mail Sender ────────────────────────────────────────────────────────
function DirectMailSender() {
  const pipeline = getPipeline().filter(l => l.mailingAddr && !['closed_won','closed_lost','pass'].includes(l.stage))
  const [leadId,  setLeadId]  = useState(pipeline[0]?.id || '')
  const [type,    setType]    = useState<MailRequest['letterType']>('yellow_letter')
  const [sending, setSending] = useState(false)
  const [result,  setResult]  = useState<{ ok: boolean; msg: string } | null>(null)

  const lead = pipeline.find(l => l.id === leadId)
  const pgKey = (() => { try { return localStorage.getItem('fscan_postgrid') || '' } catch { return '' } })()

  const handleSend = async () => {
    if (!lead) return
    setSending(true)
    setResult(null)

    const mailResult = await sendDirectMail({
      ownerName:       lead.ownerName || 'Property Owner',
      mailingAddr:     lead.mailingAddr || lead.address,
      mailingCity:     lead.city,
      mailingState:    lead.state,
      mailingZip:      lead.zip,
      propertyAddress: lead.address,
      propertyCity:    lead.city,
      propertyState:   lead.state,
      letterType:      type,
    })

    setResult(mailResult.success
      ? { ok: true,  msg: `✓ Letter sent! Arrives in 3-5 business days. Cost: $1.20. Letter ID: ${mailResult.letterId}` }
      : { ok: false, msg: mailResult.error || 'Failed to send' })
    setSending(false)
  }

  return (
    <div className="space-y-3">
      {!pgKey && (
        <div className="p-3 rounded-xl text-xs" style={{ background: '#FEF7EA', color: '#8A5700' }}>
          ⚠ PostGrid API key not set. Add it above to enable direct mail. Get free key at postgrid.com.
        </div>
      )}

      {pipeline.length === 0 ? (
        <div className="text-xs text-center py-4" style={{ color: 'var(--sgc-gray-mid)' }}>
          No pipeline leads with mailing addresses. Skip trace leads first to get owner addresses.
        </div>
      ) : (
        <>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Lead</div>
            <select className="w-full rounded-xl border text-xs px-3 py-2 outline-none"
              style={{ borderColor: 'var(--sgc-gray-border)' }}
              value={leadId} onChange={e => setLeadId(e.target.value)}>
              {pipeline.map(l => <option key={l.id} value={l.id}>{l.address} — {l.ownerName || 'Unknown'}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['yellow_letter','postcard','formal'] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className="py-2 rounded-xl border text-[10px] font-bold cursor-pointer capitalize"
                style={type === t
                  ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                  : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>

          {lead && (
            <div className="text-[10px] p-2.5 rounded-xl" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
              📬 Mailing to: {lead.mailingAddr || lead.address}, {lead.city} {lead.state} · Re: {lead.address}
            </div>
          )}

          {result && (
            <div className="p-3 rounded-xl text-xs" style={{ background: result.ok ? '#EDFAF3' : '#FEF0ED', color: result.ok ? '#1A7A4A' : '#C0341D' }}>
              {result.msg}
            </div>
          )}

          <button onClick={handleSend} disabled={sending || !lead || !pgKey}
            className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: !pgKey ? 'var(--sgc-gray-mid)' : sending ? 'var(--sgc-gray-mid)' : '#1A7A4A' }}>
            {sending ? '⟳ Sending...' : '📬 Send Physical Letter — $1.20'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Cloud Sync Status ─────────────────────────────────────────────────────────
function CloudSyncStatus() {
  const [status, setStatus]   = useState(getSyncStatus())
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const handleSync = async () => {
    setSyncing(true)
    const r = await hydratFromCloud()
    setSyncResult(r.synced > 0
      ? `✓ Synced ${r.synced} data store${r.synced > 1 ? 's' : ''} from cloud`
      : r.errors > 0
      ? '⚠ Sync error — check Supabase connection'
      : '✓ Already up to date — no cloud data found to import')
    setSyncing(false)
  }

  const handleExport = () => {
    const json = exportAllData()
    const blob = new Blob([json], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `flipscan-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type  = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const r = importAllData(ev.target?.result as string)
        setSyncResult(r.errors.length === 0
          ? `✓ Imported ${r.imported} data stores successfully`
          : `⚠ Imported ${r.imported} stores, ${r.errors.length} errors: ${r.errors.join(', ')}`)
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { l: 'Supabase',   v: status.configured ? 'Connected' : 'Not set', c: status.configured ? '#1A7A4A' : '#C45E1A', bg: status.configured ? '#EDFAF3' : '#FEF3EA' },
          { l: 'Data Stores', v: `${status.keyCount} tables`,                c: '#1B3A8C', bg: '#EEF2FB' },
          { l: 'Mode',       v: status.configured ? 'Cloud + Local' : 'Local only', c: status.configured ? '#1A7A4A' : '#8A5700', bg: status.configured ? '#EDFAF3' : '#FEF7EA' },
        ].map(m => (
          <div key={m.l} className="text-center p-3 rounded-xl" style={{ background: m.bg }}>
            <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
            <div className="text-xs font-bold mt-0.5" style={{ color: m.c }}>{m.v}</div>
          </div>
        ))}
      </div>

      {!status.configured && (
        <div className="p-3 rounded-xl text-xs leading-relaxed" style={{ background: '#EEF2FB', color: '#1B3A8C' }}>
          <strong>To enable cloud sync:</strong> Lovable → Settings → Integrations → Supabase → Connect. Then run <code>supabase/migrations/20240102_cloud_sync.sql</code> in your Supabase SQL Editor. Your data will sync automatically across devices and survive browser clears.
        </div>
      )}

      {syncResult && (
        <div className="p-3 rounded-xl text-xs" style={{ background: syncResult.startsWith('✓') ? '#EDFAF3' : '#FEF7EA', color: syncResult.startsWith('✓') ? '#1A7A4A' : '#8A5700' }}>
          {syncResult}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <button onClick={handleSync} disabled={syncing || !status.configured}
          className="py-2 rounded-xl text-xs font-bold text-white border-none cursor-pointer"
          style={{ background: !status.configured ? 'var(--sgc-gray-mid)' : '#1B3A8C' }}>
          {syncing ? '⟳ Syncing...' : '↻ Pull from Cloud'}
        </button>
        <button onClick={handleExport}
          className="py-2 rounded-xl text-xs font-bold border-none cursor-pointer"
          style={{ background: '#EEF2FB', color: '#1B3A8C' }}>
          ↓ Export JSON
        </button>
        <button onClick={handleImport}
          className="py-2 rounded-xl text-xs font-bold border-none cursor-pointer"
          style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
          ↑ Import JSON
        </button>
      </div>
    </div>
  )
}

// ── Main Settings Component ───────────────────────────────────────────────────
type SettingsTab = 'keys' | 'sync' | 'sms' | 'mail'

export default function Settings() {
  const [tab, setTab] = useState<SettingsTab>('keys')

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'keys', label: 'API Keys',     icon: '🔑' },
    { id: 'sync', label: 'Cloud Sync',   icon: '☁️' },
    { id: 'sms',  label: 'SMS Templates',icon: '💬' },
    { id: 'mail', label: 'Direct Mail',  icon: '📬' },
  ]

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--sgc-gray-light)' }}>
      <div className="p-5 max-w-2xl mx-auto space-y-4">

        {/* Tab bar */}
        <div className="flex gap-1 bg-white rounded-2xl p-1 border" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold cursor-pointer border-none"
              style={tab === t.id
                ? { background: 'var(--sgc-navy)', color: 'white' }
                : { background: 'transparent', color: 'var(--sgc-gray-mid)' }}>
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* API Keys */}
        {tab === 'keys' && (
          <div className="space-y-3">
            <KeyField
              label="RentCast (Comps + AVM)"
              storageKey="fscan_rentcast"
              placeholder="Your RentCast API key"
              docs="https://app.rentcast.io/app/api-keys"
              description="Powers Deal Scanner, comp auto-pull, ARV estimates, and market data everywhere. Required for core functionality."
            />
            <KeyField
              label="Anthropic Claude"
              storageKey="fscan_anthropic"
              placeholder="sk-ant-api03-..."
              docs="https://console.anthropic.com/settings/keys"
              description="Powers GC Deal Grade, AI Motivation Score, Market Analysis. ~$0.003/request."
            />
            <KeyField
              label="Tracerfy (Skip Trace)"
              storageKey="fscan_tracer"
              placeholder="tracer_live_..."
              docs="https://tracerfy.com"
              description="Returns owner name, phone, email, equity, DNC status per property."
            />
            <KeyField
              label="PostGrid (Direct Mail)"
              storageKey="fscan_postgrid"
              placeholder="test_sk_... or live_sk_..."
              docs="https://app.postgrid.com/register"
              description="Send physical letters to owner mailing addresses. $1.20/letter, 3-5 day delivery."
            />
            <KeyField
              label="Supabase URL"
              storageKey="fscan_supabase_url"
              placeholder="https://xxxx.supabase.co"
              docs="https://supabase.com/dashboard"
              description="Auto-set by Lovable when you connect Supabase in Settings → Integrations."
            />
            <KeyField
              label="Supabase Anon Key"
              storageKey="fscan_supabase_anon"
              placeholder="eyJhbGci..."
              description="Auto-set by Lovable. Only needed if configuring manually."
            />
          </div>
        )}

        {/* Cloud Sync */}
        {tab === 'sync' && (
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="text-sm font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>☁️ Cloud Sync</div>
            <div className="text-xs mb-4" style={{ color: 'var(--sgc-gray-mid)' }}>
              Syncs pipeline, tasks, drip sequences, buyers, P&L, projects, wholesale, and Drive for Dollars to Supabase.
              Survives browser clears. Works across devices.
            </div>
            <CloudSyncStatus />
          </div>
        )}

        {/* SMS Templates */}
        {tab === 'sms' && (
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="text-sm font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>💬 SMS Templates</div>
            <div className="text-xs mb-4" style={{ color: 'var(--sgc-gray-mid)' }}>
              8 pre-written messages calibrated for GC buyer positioning. Select lead + template → opens native Messages app pre-filled.
            </div>
            <SMSLauncher />
            <div className="mt-5 pt-4 border-t space-y-2" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>All Templates</div>
              {SMS_TEMPLATES.map(t => (
                <div key={t.id} className="flex items-start gap-3 p-2.5 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold" style={{ color: 'var(--sgc-black)' }}>{t.label}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{t.scenario}</div>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {t.tags.map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{ background: '#EEF2FB', color: '#1B3A8C' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Direct Mail */}
        {tab === 'mail' && (
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="text-sm font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>📬 Direct Mail</div>
            <div className="text-xs mb-4" style={{ color: 'var(--sgc-gray-mid)' }}>
              Sends physical letters via PostGrid API. $1.20/letter, 3-5 business days, 3-8% response rate.
              Multi-channel approach (call + text + letter) significantly outperforms single-channel.
            </div>
            <DirectMailSender />
          </div>
        )}

        {/* Footer */}
        <div className="text-[10px] text-center py-2" style={{ color: 'var(--sgc-gray-mid)' }}>
          FlipScan Pro · SGC General Contractors · (703) 944-9770 · projects@sgcbuilt.com
        </div>
      </div>
    </div>
  )
}
