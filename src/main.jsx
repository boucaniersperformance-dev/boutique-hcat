import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Point d'entrée de l'appli du staff (index.html). La page publique de
// commande (/commande-client) a son propre point d'entrée dédié —
// commande-client.html / main-commande.jsx — avec son propre manifeste
// PWA ; voir vercel.json pour le routage entre les deux.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
