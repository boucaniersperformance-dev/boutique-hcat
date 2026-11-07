import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import CommandePublique from './screens/CommandePublique.jsx'

// Point d'entrée dédié à la page publique de commande (commande-client.html,
// servie pour l'adresse /commande-client — voir vercel.json). Séparé de
// l'appli du staff (main.jsx / index.html) pour que le bon manifeste PWA
// (start_url /commande-client) soit présent dès le HTML, sans dépendre
// d'un script qui le changerait après coup.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CommandePublique />
  </StrictMode>,
)
