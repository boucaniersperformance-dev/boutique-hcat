import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Deux pages HTML distinctes (voir vercel.json pour le routage) :
// - index.html         → l'appli du staff (connexion, bénévoles…)
// - commande-client.html → la page publique de commande, avec son propre
//   manifeste PWA écrit en dur dans son HTML (start_url /commande-client)
//   pour que « Installer sur l'écran d'accueil » fonctionne de façon
//   fiable sur tous les navigateurs — plus de script qui changeait le
//   lien du manifeste après coup.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        commande: resolve(__dirname, 'commande-client.html'),
      },
    },
  },
})
