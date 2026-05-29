import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import { hydrateKeysFromCloud, clearLocalKeys } from '../lib/keyVault'
import AuthPage from './AuthPage'
import ResetPasswordPage from './ResetPasswordPage'

interface Props { children: React.ReactNode }

export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    // Detect recovery link landing (Supabase puts type=recovery in URL hash or query)
    const hash = window.location.hash || ''
    const search = window.location.search || ''
    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      setRecovery(true)
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (!s) {
        clearLocalKeys()
        setHydrated(false)
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session?.user && !hydrated) {
      hydrateKeysFromCloud(session.user.id).finally(() => setHydrated(true))
    }
  }, [session, hydrated])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0F2460', color: 'white' }}>
        <div className="text-sm opacity-70">Loading…</div>
      </div>
    )
  }

  if (!session) return <AuthPage />

  if (recovery) {
    return <ResetPasswordPage onDone={() => setRecovery(false)} />
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0F2460', color: 'white' }}>
        <div className="text-sm opacity-70">Loading your workspace…</div>
      </div>
    )
  }

  return <>{children}</>
}