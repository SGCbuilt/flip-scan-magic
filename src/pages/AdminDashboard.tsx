import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/integrations/supabase/client'

export default function AdminDashboard() {
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
    <div className="min-h-screen" style={{ background: 'var(--sgc-gray-light)' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-0 h-14 flex-shrink-0"
        style={{ background: 'var(--sgc-navy)', borderBottom: '1px solid var(--sgc-navy-dark)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 38 38" className="w-8 h-8 flex-shrink-0">
              <rect width="38" height="38" rx="5" fill="white" fillOpacity="0.12" />
              <polyline points="19,6 32,16 32,33 6,33 6,16" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinejoin="round" />
              <line x1="19" y1="6" x2="6" y2="16" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round" />
              <rect x="14.5" y="24" width="9" height="9" rx="0.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
              <text x="19" y="22" textAnchor="middle" fill="white" fontSize="9.5" fontWeight="700" fontFamily="Inter,sans-serif" letterSpacing="0.5">SGC</text>
            </svg>
            <div>
              <div
                style={{ fontFamily: 'Inter,sans-serif', letterSpacing: '0.12em' }}
                className="text-white font-bold text-sm uppercase leading-none tracking-widest"
              >
                SGC <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>Built</span>
              </div>
              <div
                style={{ letterSpacing: '0.18em', fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}
                className="uppercase mt-0.5"
              >
                Admin Portal
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate('/')}
          className="text-[10px] uppercase tracking-widest rounded px-3 py-1.5 bg-transparent cursor-pointer transition-colors hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)' }}
        >
          Back to App
        </button>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--sgc-black)' }}>
            Admin Dashboard
          </h1>
          <p className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
            Manage SGC Built tools and services
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* FlipScan Pro Card */}
          <div
            onClick={() => navigate('/admin/flipscan')}
            className="group cursor-pointer rounded-xl border p-5 transition-all hover:shadow-lg"
            style={{
              background: 'white',
              borderColor: 'var(--sgc-gray-border)',
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                style={{ background: 'var(--sgc-navy-pale)' }}
              >
                <span style={{ color: 'var(--sgc-navy)' }}>⊞</span>
              </div>
              <span
                className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded"
                style={{ background: '#ecfdf5', color: '#059669' }}
              >
                Active
              </span>
            </div>
            <h3 className="text-base font-bold mb-1" style={{ color: 'var(--sgc-black)' }}>
              FlipScan Pro
            </h3>
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--sgc-gray-mid)' }}>
              Real-estate deal scanner &amp; market analyzer. Search MLS, foreclosures, off-market properties, and analyze flip potential across U.S. markets.
            </p>
            <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>
              <span>Open Scanner</span>
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </div>
          </div>

          {/* Placeholder cards for future admin tools */}
          <div
            className="rounded-xl border p-5 opacity-60"
            style={{
              background: 'white',
              borderColor: 'var(--sgc-gray-border)',
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                style={{ background: '#f3f4f6' }}
              >
                <span style={{ color: '#9ca3af' }}>👤</span>
              </div>
              <span
                className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded"
                style={{ background: '#f3f4f6', color: '#9ca3af' }}
              >
                Soon
              </span>
            </div>
            <h3 className="text-base font-bold mb-1" style={{ color: '#9ca3af' }}>
              User Management
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: '#9ca3af' }}>
              Manage users, roles, and permissions across SGC Built services.
            </p>
          </div>

          <div
            className="rounded-xl border p-5 opacity-60"
            style={{
              background: 'white',
              borderColor: 'var(--sgc-gray-border)',
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                style={{ background: '#f3f4f6' }}
              >
                <span style={{ color: '#9ca3af' }}>⚙</span>
              </div>
              <span
                className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded"
                style={{ background: '#f3f4f6', color: '#9ca3af' }}
              >
                Soon
              </span>
            </div>
            <h3 className="text-base font-bold mb-1" style={{ color: '#9ca3af' }}>
              Settings
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: '#9ca3af' }}>
              Configure system-wide preferences, API keys, and integrations.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
