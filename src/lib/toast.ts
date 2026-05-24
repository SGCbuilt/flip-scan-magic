/**
 * Global toast system — replaces all alert() calls
 * Components call toast.show() / toast.error() / toast.success()
 * App renders <ToastContainer /> once at root
 */

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id:      string
  msg:     string
  type:    ToastType
  duration:number
}

type Listener = (toasts: Toast[]) => void

let toasts:   Toast[]    = []
let listeners: Listener[] = []

function notify() {
  listeners.forEach(l => l([...toasts]))
}

export const toast = {
  show(msg: string, type: ToastType = 'info', duration = 4000) {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2,5)}`
    toasts = [...toasts, { id, msg, type, duration }]
    notify()
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id)
      notify()
    }, duration)
  },
  success: (msg: string) => toast.show(msg, 'success'),
  error:   (msg: string) => toast.show(msg, 'error', 5000),
  warning: (msg: string) => toast.show(msg, 'warning', 5000),
  info:    (msg: string) => toast.show(msg, 'info'),
  subscribe(fn: Listener) {
    listeners.push(fn)
    return () => { listeners = listeners.filter(l => l !== fn) }
  },
}
