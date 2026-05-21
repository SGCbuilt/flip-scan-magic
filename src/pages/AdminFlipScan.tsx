import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import App from '@/App'

export default function AdminFlipScan() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      setChecking(false)
      return
    }
    supabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' })
      .then(({ data }) => {
        setIsAdmin(!!data)
        setChecking(false)
      })
      .catch(() => {
        setIsAdmin(false)
        setChecking(false)
      })
  }, [user])

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--sgc-gray-light)' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
          <div className="w-4 h-4 border-2 border-gray-300 border-t-[var(--sgc-navy)] rounded-full animate-spin" />
          Checking permissions…
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ background: 'var(--sgc-gray-light)' }}>
        <div className="text-lg font-semibold" style={{ color: 'var(--sgc-black)' }}>Access Denied</div>
        <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>You need admin privileges to view this page.</div>
        <button
          onClick={() => navigate('/')}
          className="text-sm px-4 py-2 rounded-lg cursor-pointer border"
          style={{ background: 'var(--sgc-navy)', color: 'white', borderColor: 'var(--sgc-navy)' }}
        >
          Back to App
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Admin banner */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ background: 'var(--sgc-navy-dark)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>
            Admin View
          </span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
            FlipScan Pro — Real-estate deal scanner &amp; market analyzer
          </span>
        </div>
        <button
          onClick={() => navigate('/admin')}
          className="text-[10px] uppercase tracking-widest rounded px-3 py-1 bg-transparent cursor-pointer transition-colors hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)' }}
        >
          ← Back to Admin
        </button>
      </div>

      {/* The actual FlipScan app */}
      <div className="flex-1 overflow-hidden">
        <App />
      </div>
    </div>
  )
}
