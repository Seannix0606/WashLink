import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found in index.html.')
}

// The service worker makes WashLink installable from the phone's home screen. Production only, so dev reloads stay plain.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
