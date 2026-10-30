import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '../styles/global.css'
import { getWidgetPrefs } from '../shared/storage'
import { themeCssVars } from '../shared/theme'

// The popup follows the same single accent chosen in the overlay's Settings.
getWidgetPrefs().then((p) => {
  const vars = themeCssVars(p.color)
  for (const [key, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(key, value)
  }
})

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
