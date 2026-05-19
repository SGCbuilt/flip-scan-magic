import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import sgcLogo from '@/assets/sgc-logo.png'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Recovery link drops a session with type=recovery in the URL hash; supabase-js parses it.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
      else setErr('Reset link is invalid or has expired. Request a new one.')
    })
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setMsg(null)
    if (password.length < 8) return setErr('Password must be at least 8 characters.')
    if (password !== confirm) return setErr('Passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setErr(error.message)
    else {
      setMsg('Password updated. Redirecting...')
      setTimeout(() => navigate('/', { replace: true }), 1200)
    }
  }

  const ic = "w-full bg-white border border-slate-300 rounded text-[#0a1f4d] font-medium text-sm px-3 py-2.5 outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30 transition-all placeholder:text-slate-400 placeholder:font-normal"

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <img src={sgcLogo} alt="SGC Built" className="w-20 h-20 object-contain" />
          <h1 className="text-xl font-bold text-[#0a1f4d] tracking-widest uppercase mt-3">Reset Password</h1>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">New Password</label>
              <input type="password" required disabled={!ready} autoComplete="new-password" className={ic} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Confirm Password</label>
              <input type="password" required disabled={!ready} autoComplete="new-password" className={ic} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
            </div>

            {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
            {msg && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">{msg}</div>}

            <button type="submit" disabled={busy || !ready}
              className="w-full bg-gradient-to-b from-gold-400 to-gold-600 hover:from-gold-300 hover:to-gold-500 disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-500 text-[#0a1f4d] font-bold text-xs tracking-widest uppercase py-2.5 rounded-md shadow-sm ring-1 ring-gold-700/30 transition-all cursor-pointer">
              {busy ? '...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
