import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import CommandePublique from './screens/CommandePublique.jsx'

// Deux points d'entrée dans la même appli : l'adresse /commande-client
// (celle encodée dans le QR code affiché en boutique) ouvre directement la
// page publique de commande, sans passer par l'écran de connexion — tout
// le reste de l'adresse (y compris la racine "/") ouvre l'appli normale.
const estPageCommandePublique = window.location.pathname.startsWith('/commande-client')

// La page publique de commande a sa propre « fiche d'identité » d'appli
// (nom, icône, et surtout start_url /commande-client) pour que « Ajouter à
// l'écran d'accueil » depuis cette page réouvre directement la commande —
// et non l'appli du staff, qui utilise le manifeste par défaut.
if (estPageCommandePublique) {
  const lienManifest = document.querySelector('link[rel="manifest"]')
  if (lienManifest) lienManifest.setAttribute('href', '/manifest-commande.webmanifest')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {estPageCommandePublique ? <CommandePublique /> : <App />}
  </StrictMode>,
)
