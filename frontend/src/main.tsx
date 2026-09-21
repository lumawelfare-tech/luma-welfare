import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/Toast'
import { registerSW } from './lib/pwa'
import { initSync } from './lib/sync'
import { initSentry } from './lib/sentry'

// Initialize Sentry for production error monitoring
initSentry()

// Register service worker for PWA support
registerSW()

// Initialize background sync listeners
initSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)

// Defense in depth: remove any orphaned pre-hydrate / prerender boot nodes
// left as <body> siblings (legacy bug from incomplete #root replacement).
document
  .querySelectorAll(
    'body > .app-boot-static, body > .app-boot-static__wordmark, body > .app-boot-static__tag',
  )
  .forEach((el) => el.remove())
