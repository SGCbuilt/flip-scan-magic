import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import type { AreaAnalysis } from './marketAnalyzer'

export interface SavedMarket {
  id: string                // location string used as id
  location: string
  savedAt: number
  analysis: AreaAnalysis
}

const keyFor = (uid?: string | null) => `flipscan:markets:${uid || 'anon'}`

export function useMarketFavorites() {
  const { user } = useAuth()
  const [saved, setSaved] = useState<SavedMarket[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(user?.id))
      setSaved(raw ? JSON.parse(raw) : [])
    } catch { setSaved([]) }
  }, [user?.id])

  useEffect(() => {
    try { localStorage.setItem(keyFor(user?.id), JSON.stringify(saved)) } catch {}
  }, [saved, user?.id])

  const isSaved = useCallback((id: string) => saved.some(m => m.id === id), [saved])

  const toggle = useCallback((m: SavedMarket) => {
    setSaved(prev => prev.some(p => p.id === m.id)
      ? prev.filter(p => p.id !== m.id)
      : [{ ...m, savedAt: Date.now() }, ...prev].slice(0, 20))
  }, [])

  const remove = useCallback((id: string) => {
    setSaved(prev => prev.filter(p => p.id !== id))
  }, [])

  const clear = useCallback(() => setSaved([]), [])

  return { saved, isSaved, toggle, remove, clear }
}