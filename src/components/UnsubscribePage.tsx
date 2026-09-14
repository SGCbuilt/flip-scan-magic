import { useEffect, useState } from 'react'
import { supabase } from '../integrations/supabase/client'

const NAVY = '#0F2460'

export default function UnsubscribePage() {
  const [state, setState] = useState<'loading' | 'valid' | 'used' | 'invalid' | 'done' | 'error'>('loading')
  const [busy, setBusy] = useState(false)
  const token = new URLSearchParams(window.location.search).get('token') || ''

  useEffect(() => {
    if (!token) { setState('invalid'); return }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setState(d?.reason === 'already_used' ? 'used' : 'invalid'); return }
        if (d?.already_unsubscribed || d?.used) setState('used')
        else setState('valid')
      })
      .catch(() => setState('error'))
  }, [token])

  async function confirm() {
    setBusy(true)
    const { error } = await supabase.functions.invoke('handle-email-unsubscribe', { body: { token } })
    setBusy(false)
    setState(error ? 'error' : 'done')
  }

  const copy: Record<string, { title: string; body: string }> = {
    loading: { title: 'Checking your link…', body: '' },
    valid: { title: 'Unsubscribe from FlipScan Pro emails?', body: 'You will stop receiving auction alerts and other app notifications at this address. Sign-in and password emails still work.' },
    used: { title: 'You are already unsubscribed', body: 'This address no longer receives FlipScan Pro notification emails.' },
    invalid: { title: 'This link is not valid', body: 'The unsubscribe link is incomplete or has expired. Use the link in the most recent email.' },
    done: { title: 'Unsubscribed', body: 'You will no longer receive FlipScan Pro notification emails at this address.' },
    error: { title: 'Something went wrong', body: 'We could not process that just now. Please try again in a moment.' },
  }

  const c = copy[state]

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#F5F7FB' }}>
      <div className="w-full max-w-md rounded-2xl border p-8 text-center" style={{ background: 'white', borderColor: '#E5E9F0' }}>
        <div className="text-xs font-black tracking-widest mb-4" style={{ color: '#1B3A8C' }}>SGC BUILT · FLIPSCAN PRO</div>
        <h1 className="text-lg font-black mb-2" style={{ color: NAVY }}>{c.title}</h1>
        {c.body && <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>{c.body}</p>}
        {state === 'valid' && (
          <button onClick={confirm} disabled={busy}
            className="mt-6 px-5 py-2.5 rounded-lg text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: busy ? '#94A3B8' : NAVY }}>
            {busy ? 'Working…' : 'Confirm unsubscribe'}
          </button>
        )}
        <div className="mt-6">
          <a href="/" className="text-xs font-bold no-underline" style={{ color: '#1B3A8C' }}>Back to FlipScan Pro →</a>
        </div>
      </div>
    </div>
  )
}
