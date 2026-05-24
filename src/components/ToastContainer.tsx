import { useState, useEffect } from 'react'
import { toast as toastStore } from '../lib/toast'

interface ToastItem {
  id:      string
  msg:     string
  type:    'success' | 'error' | 'info' | 'warning'
  duration:number
}

const TYPE_STYLE: Record<ToastItem['type'], { bg: string; color: string; icon: string }> = {
  success: { bg: '#0F2460',  color: 'white',   icon: '✓' },
  error:   { bg: '#FEF0ED',  color: '#C0341D', icon: '✕' },
  warning: { bg: '#1A1A2E',  color: '#FCD34D', icon: '⚠' },
  info:    { bg: '#0F2460',  color: 'white',   icon: 'ℹ' },
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    return toastStore.subscribe((t: ToastItem[]) => setToasts(t))
  }, [])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none"
      style={{ minWidth: 300, maxWidth: 480 }}>
      {toasts.map(t => {
        const s = TYPE_STYLE[t.type]
        return (
          <div key={t.id}
            className="flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-medium w-full pointer-events-auto"
            style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}20` }}>
            <span className="text-base flex-shrink-0">{s.icon}</span>
            <span className="flex-1">{t.msg}</span>
          </div>
        )
      })}
    </div>
  )
}
