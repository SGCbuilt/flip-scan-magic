import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AuthGate from './components/AuthGate'
import UnsubscribePage from './components/UnsubscribePage'
import './index.css'

const path = window.location.pathname.replace(/\/$/, '')
const isUnsubscribe = path === '/unsubscribe'

// The coming-soon page is a static file; some hosts don't auto-resolve the
// folder to its index.html, so forward explicitly.
if (path === '/coming-soon') {
  window.location.replace('/coming-soon/index.html')
}

// Only the /login entry point (used by the SGC Studio link) opens the app.
// Everyone else landing on the site goes straight to the public landing page.
const LOGIN_PATHS = ['/login', '/app']
const hasStoredSession = (() => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || ''
      if (/^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true
    }
  } catch { /* storage blocked */ }
  return false
})()

const isRecoveryLink =
  (window.location.hash || '').includes('type=recovery') ||
  (window.location.search || '').includes('type=recovery')

const allowApp =
  isUnsubscribe ||
  LOGIN_PATHS.includes(path) ||
  isRecoveryLink ||
  hasStoredSession

if (!allowApp && path !== '/coming-soon') {
  window.location.replace('/coming-soon/index.html')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isUnsubscribe ? (
      <UnsubscribePage />
    ) : (
      <AuthGate>
        <App />
      </AuthGate>
    )}
  </React.StrictMode>
)
