import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import { hydrateKeysFromCloud, clearLocalKeys } from '../lib/keyVault'
import AuthPage from './AuthPage'

interface Props { children: React.ReactNode }

export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
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

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0F2460', color: 'white' }}>
        <div className="text-sm opacity-70">Loading your workspace…</div>
      </div>
    )
  }

  return <>{children}</>
}