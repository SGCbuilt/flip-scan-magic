import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { lovable } from '@/integrations/lovable/index'
import { toast } from '../lib/toast'

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/?type=recovery`,
        })
        if (error) throw error
        toast.success('Password reset email sent — check your inbox.')
        setMode('signin')
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        toast.success('Account created — check your email to confirm, then sign in.')
        setMode('signin')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        toast.success('Welcome back')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    try {
      const res = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin })
      if (res.error) throw res.error
    } catch (err: any) {
      toast.error(err?.message || 'Google sign-in failed')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0F2460' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 pt-8 pb-6 text-center" style={{ background: '#0F2460' }}>
          <div className="text-4xl mb-2">⚡</div>
          <div className="text-xl font-black text-white tracking-tight">FlipScan Pro</div>
          <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
            SGC General Contractors
          </div>
        </div>

        <form onSubmit={submit} className="p-6 space-y-3">
          <div className="flex gap-2 mb-4">
            {(['signin','signup'] as const).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className="flex-1 py-2 text-xs font-bold rounded-lg cursor-pointer border-none transition-all"
                style={mode === m
                  ? { background: '#0F2460', color: 'white' }
                  : { background: '#F1F5F9', color: '#64748B' }}>
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com" autoComplete="email"
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
            style={{ borderColor: '#D1D9E6', background: '#F8FAFC' }}/>

          {mode !== 'forgot' && (
            <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password (min 6 chars)"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
              style={{ borderColor: '#D1D9E6', background: '#F8FAFC' }}/>
          )}

          {mode === 'signin' && (
            <div className="text-right">
              <button type="button" onClick={() => setMode('forgot')}
                className="text-xs font-semibold bg-transparent border-none cursor-pointer p-0"
                style={{ color: '#0F2460' }}>
                Forgot password?
              </button>
            </div>
          )}

          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer disabled:opacity-50"
            style={{ background: '#0F2460' }}>
            {busy ? 'Please wait…'
              : mode === 'signup' ? 'Create Account'
              : mode === 'forgot' ? 'Send reset link'
              : 'Sign In'}
          </button>

          {mode === 'forgot' && (
            <button type="button" onClick={() => setMode('signin')}
              className="w-full text-xs font-semibold bg-transparent border-none cursor-pointer"
              style={{ color: '#64748B' }}>
              ← Back to sign in
            </button>
          )}

          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px" style={{ background: '#E5E9F0' }}/>
            <span className="text-[10px] font-bold" style={{ color: '#94A3B8' }}>OR</span>
            <div className="flex-1 h-px" style={{ background: '#E5E9F0' }}/>
          </div>

          <button type="button" onClick={google}
            className="w-full py-3 rounded-xl text-sm font-semibold border cursor-pointer flex items-center justify-center gap-2"
            style={{ borderColor: '#D1D9E6', background: 'white', color: '#0F2460' }}>
            <span>🔐</span> Continue with Google
          </button>
        </form>

        <div className="px-6 pb-6 text-center text-[11px]" style={{ color: '#94A3B8' }}>
          Your API keys are saved to your account — no need to re-enter them.
        </div>
      </div>
    </div>
  )
}