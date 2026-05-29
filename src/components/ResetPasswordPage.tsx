import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '../lib/toast'

interface Props { onDone: () => void }

export default function ResetPasswordPage({ onDone }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (password !== confirm) { toast.error('Passwords do not match'); return }
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success('Password updated — you are signed in.')
      // Clean recovery params from URL
      window.history.replaceState(null, '', window.location.pathname)
      onDone()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0F2460' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 pt-8 pb-6 text-center" style={{ background: '#0F2460' }}>
          <div className="text-4xl mb-2">🔑</div>
          <div className="text-xl font-black text-white tracking-tight">Set a new password</div>
          <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Choose a new password for your account.
          </div>
        </div>

        <form onSubmit={submit} className="p-6 space-y-3">
          <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="New password (min 6 chars)" autoComplete="new-password"
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
            style={{ borderColor: '#D1D9E6', background: '#F8FAFC' }}/>

          <input type="password" required minLength={6} value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Confirm new password" autoComplete="new-password"
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
            style={{ borderColor: '#D1D9E6', background: '#F8FAFC' }}/>

          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer disabled:opacity-50"
            style={{ background: '#0F2460' }}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}