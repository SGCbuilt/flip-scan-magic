import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { lovable } from '@/integrations/lovable'
import { useAuth } from '@/context/AuthContext'
import sgcLogo from '@/assets/sgc-logo.png'

export default function AuthPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (session) navigate('/', { replace: true }) }, [session, navigate])

  if (loading) return null
  if (session) return <Navigate to="/" replace />

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setMsg(null); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setErr(error.message)
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setMsg(null); setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) setErr(error.message)
    else setMsg('Check your inbox for a reset link.')
  }

  const handleGoogle = async () => {
    setErr(null); setBusy(true)
    const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin })
    if (result.error) { setErr(result.error.message); setBusy(false) }
  }

  const ic = "w-full bg-white border border-slate-300 rounded text-[#0a1f4d] font-medium text-sm px-3 py-2.5 outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30 transition-all placeholder:text-slate-400 placeholder:font-normal"

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <img src={sgcLogo} alt="SGC Built" className="w-20 h-20 object-contain" />
          <h1 className="text-xl font-bold text-[#0a1f4d] tracking-widest uppercase mt-3">FlipScan Pro</h1>
          <p className="text-[11px] text-slate-500 tracking-wider mt-1">SGC General Contractors</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-[#0a1f4d] uppercase tracking-wider mb-4">
            {mode === 'signin' ? 'Sign In' : 'Reset Password'}
          </h2>

          <form onSubmit={mode === 'signin' ? handleSignIn : handleForgot} className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Email</label>
              <input type="email" required autoComplete="email" className={ic} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>

            {mode === 'signin' && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Password</label>
                  <button type="button" onClick={() => { setMode('forgot'); setErr(null); setMsg(null) }} className="text-[10px] text-gold-600 hover:text-gold-700 bg-transparent border-none cursor-pointer">Forgot?</button>
                </div>
                <input type="password" required autoComplete="current-password" className={ic} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            )}

            {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
            {msg && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">{msg}</div>}

            <button type="submit" disabled={busy}
              className="w-full bg-gradient-to-b from-gold-400 to-gold-600 hover:from-gold-300 hover:to-gold-500 disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-500 text-[#0a1f4d] font-bold text-xs tracking-widest uppercase py-2.5 rounded-md shadow-sm ring-1 ring-gold-700/30 transition-all cursor-pointer">
              {busy ? '...' : mode === 'signin' ? 'Sign In' : 'Send Reset Link'}
            </button>
          </form>

          {mode === 'signin' && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="h-px bg-slate-200 flex-1" />
                <span className="text-[10px] uppercase tracking-widest text-slate-400">or</span>
                <div className="h-px bg-slate-200 flex-1" />
              </div>

              <button type="button" onClick={handleGoogle} disabled={busy}
                className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-[#0a1f4d] font-medium text-xs py-2.5 rounded-md cursor-pointer transition-colors">
                <svg width="16" height="16" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
                Continue with Google
              </button>
            </>
          )}

          {mode === 'forgot' && (
            <button type="button" onClick={() => { setMode('signin'); setErr(null); setMsg(null) }}
              className="w-full mt-3 text-[11px] text-slate-500 hover:text-[#0a1f4d] bg-transparent border-none cursor-pointer">
              ← Back to sign in
            </button>
          )}
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-4">
          Access is invite-only. Contact your administrator for an account.
        </p>
      </div>
    </div>
  )
}
