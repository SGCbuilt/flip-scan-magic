import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AuthGate from './components/AuthGate'
import UnsubscribePage from './components/UnsubscribePage'
import './index.css'

const isUnsubscribe = window.location.pathname.replace(/\/$/, '') === '/unsubscribe'

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
