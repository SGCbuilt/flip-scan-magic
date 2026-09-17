import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AuthGate from './components/AuthGate'
import UnsubscribePage from './components/UnsubscribePage'
import './index.css'

const isUnsubscribe = window.location.pathname.replace(/\/$/, '') === '/unsubscribe'

// The coming-soon page is a static file; some hosts don't auto-resolve the
// folder to its index.html, so forward explicitly.
if (window.location.pathname.replace(/\/$/, '') === '/coming-soon') {
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
