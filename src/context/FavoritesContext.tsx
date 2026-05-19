import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { AnalyzedProperty } from '@/types'
import { useAuth } from './AuthContext'

interface FavoritesState {
  favorites: AnalyzedProperty[]
  ids: Set<string>
  isFavorite: (id: string) => boolean
  toggle: (p: AnalyzedProperty) => void
  remove: (id: string) => void
  clear: () => void
}

const Ctx = createContext<FavoritesState>({
  favorites: [], ids: new Set(),
  isFavorite: () => false, toggle: () => {}, remove: () => {}, clear: () => {},
})

const keyFor = (uid?: string | null) => `flipscan:favorites:${uid || 'anon'}`

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [favorites, setFavorites] = useState<AnalyzedProperty[]>([])

  // Load when user changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(user?.id))
      setFavorites(raw ? JSON.parse(raw) : [])
    } catch { setFavorites([]) }
  }, [user?.id])

  // Persist
  useEffect(() => {
    try { localStorage.setItem(keyFor(user?.id), JSON.stringify(favorites)) } catch {}
  }, [favorites, user?.id])

  const ids = new Set(favorites.map(f => f.id))

  const isFavorite = useCallback((id: string) => ids.has(id), [favorites])
  const toggle = useCallback((p: AnalyzedProperty) => {
    setFavorites(prev => prev.some(f => f.id === p.id)
      ? prev.filter(f => f.id !== p.id)
      : [...prev, p])
  }, [])
  const remove = useCallback((id: string) => {
    setFavorites(prev => prev.filter(f => f.id !== id))
  }, [])
  const clear = useCallback(() => setFavorites([]), [])

  return (
    <Ctx.Provider value={{ favorites, ids, isFavorite, toggle, remove, clear }}>
      {children}
    </Ctx.Provider>
  )
}

export const useFavorites = () => useContext(Ctx)