import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import './shared/ui/teamspace.css'
import { pruneLegacyCallbackStorage } from './shared/auth/legacyAuthStorage'
import { initI18n } from './shared/i18n'

pruneLegacyCallbackStorage()
await initI18n()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
