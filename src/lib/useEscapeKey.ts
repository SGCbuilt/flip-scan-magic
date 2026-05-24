/**
 * useEscapeKey — close modals on Escape key press
 * Usage: useEscapeKey(onClose) in any modal component
 */
import { useEffect } from 'react'

export function useEscapeKey(onClose: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
}
