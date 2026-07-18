import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

document.documentElement.classList.add('chordlens-standalone')
const signalingUrl = (import.meta as ImportMeta & { env?: { VITE_SIGNALING_URL?: string } }).env?.VITE_SIGNALING_URL

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App signalingUrl={signalingUrl} />
  </StrictMode>,
)
