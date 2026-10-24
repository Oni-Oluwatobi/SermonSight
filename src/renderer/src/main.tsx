import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/app.css'
import { initStore } from './state/store'
import { initAuth } from './auth/firebaseAuth'

const container = document.getElementById('root')
if (container) {
  initAuth()
  initStore()
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
