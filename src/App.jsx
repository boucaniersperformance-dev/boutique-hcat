import { useEffect, useState } from 'react'
import { ensureSupabaseSession } from './supabaseClient'
import Login from './screens/Login.jsx'
import Vente from './screens/Vente.jsx'
import AdminProduits from './screens/AdminProduits.jsx'
import AdminBenevoles from './screens/AdminBenevoles.jsx'
import Historique from './screens/Historique.jsx'

const CLE_SESSION = 'boutique-hcat-session'

export default function App() {
  const [pret, setPret] = useState(false)
  const [erreurConnexion, setErreurConnexion] = useState(null)
  const [benevole, setBenevole] = useState(() => {
    try {
      const brut = sessionStorage.getItem(CLE_SESSION)
      return brut ? JSON.parse(brut) : null
    } catch {
      return null
    }
  })
  const [ecran, setEcran] = useState('vente')

  useEffect(() => {
    ensureSupabaseSession()
      .then(() => setPret(true))
      .catch((err) => {
        console.error(err)
        setErreurConnexion(
          "Impossible de contacter la base de données. Vérifie ta connexion internet, ou que les variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY sont bien configurées."
        )
      })
  }, [])

  function connecter(nouveauBenevole) {
    setBenevole(nouveauBenevole)
    sessionStorage.setItem(CLE_SESSION, JSON.stringify(nouveauBenevole))
    setEcran('vente')
  }

  function deconnecter() {
    setBenevole(null)
    sessionStorage.removeItem(CLE_SESSION)
  }

  if (erreurConnexion) {
    return (
      <div className="login-ecran">
        <div className="login-carte">
          <h1>Connexion impossible</h1>
          <p className="erreur">{erreurConnexion}</p>
        </div>
      </div>
    )
  }

  if (!pret) {
    return <div className="chargement">Chargement…</div>
  }

  if (!benevole) {
    return <Login onConnecte={connecter} />
  }

  const estResponsable = benevole.role === 'responsable'

  return (
    <div className="app">
      <header className="entete">
        <div className="entete-titre">
          <img src="/logo.png" alt="" className="logo-entete" />
          Boutique HCAT
        </div>
        <nav className="entete-nav">
          <button
            className={ecran === 'vente' ? 'actif' : ''}
            onClick={() => setEcran('vente')}
          >
            Vente
          </button>
          {estResponsable && (
            <>
              <button
                className={ecran === 'produits' ? 'actif' : ''}
                onClick={() => setEcran('produits')}
              >
                Produits
              </button>
              <button
                className={ecran === 'benevoles' ? 'actif' : ''}
                onClick={() => setEcran('benevoles')}
              >
                Bénévoles
              </button>
              <button
                className={ecran === 'historique' ? 'actif' : ''}
                onClick={() => setEcran('historique')}
              >
                Historique
              </button>
            </>
          )}
        </nav>
        <div className="entete-benevole">
          <span>
            {benevole.nom} {estResponsable ? '(responsable)' : ''}
          </span>
          <button onClick={deconnecter}>Changer de bénévole</button>
        </div>
      </header>

      <main className="contenu">
        {ecran === 'vente' && <Vente benevole={benevole} />}
        {ecran === 'produits' && estResponsable && (
          <AdminProduits benevole={benevole} />
        )}
        {ecran === 'benevoles' && estResponsable && (
          <AdminBenevoles benevole={benevole} />
        )}
        {ecran === 'historique' && estResponsable && (
          <Historique benevole={benevole} />
        )}
      </main>

      <footer className="pied-page">
        <img src="/logo-gb-kreation.png" alt="" className="logo-pied-page" />
        Site créé par GB-Kréation
      </footer>
    </div>
  )
}

