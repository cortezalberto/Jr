import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// SPRINT 6: Environment configuration
import { validateEnv, logEnvConfig } from './config/env'

// PWA: Register service worker
import { registerSW } from 'virtual:pwa-register'

// Validate environment variables on startup
validateEnv()

// Log environment config in development
logEnvConfig()

// Register service worker with auto-update
const updateSW = registerSW({
  onNeedRefresh() {
    // Auto-update without prompting user
    updateSW(true)
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
})

// Initialize Web Vitals monitoring (development only)
if (import.meta.env.DEV) {
  import('./utils/webVitals').then(({ reportWebVitals, consoleReporter }) => {
    reportWebVitals(consoleReporter)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
