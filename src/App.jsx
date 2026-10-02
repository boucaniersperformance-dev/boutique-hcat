import { useEffect, useState } from 'react'
import { ensureSupabaseSession, supabase } from './supabaseClient'
import Login from './screens/Login.jsx'
import Vente from './screens/Vente.jsx'
import AdminProduits from './screens/AdminProduits.jsx'
import AdminBenevoles from './screens/AdminBenevoles.jsx'
import Historique from './screens/Historique.jsx'
import JeuPalet from './screens/JeuPalet.jsx'
import CaisseEspeces from './screens/CaisseEspeces.jsx'
import GourdePerso from './components/GourdePerso/GourdePerso.jsx'

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
  // 'desactive' | 'page_seule' | 'complet' — réglage modifiable depuis
  // l'onglet Produits (rubrique "Jeu du palet"). Démarre sur 'desactive'
  // (achat simple partout, onglet masqué) tant que la vraie valeur n'a pas
  // été chargée, pour ne jamais montrer la fonction par erreur avant de
  // savoir si elle est vraiment activée.
  const [jeuPaletMode, setJeuPaletMode] = useState('desactive')

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

  // Charge le réglage du jeu du palet une fois connecté (une tablette qui
  // reste ouverte plusieurs jours reprend simplement la valeur lue à sa
  // dernière connexion — un responsable qui change le réglage le voit tout
  // de suite sur sa propre tablette, les autres le reprennent à leur
  // prochaine connexion, comme pour un changement de prix ou de stock).
  useEffect(() => {
    if (!pret || !benevole) return
    let annule = false
    supabase
      .from('parametres_boutique')
      .select('jeu_palet_mode')
      .eq('id', 1)
      .single()
      .then(({ data, error }) => {
        if (annule || error || !data) return
        setJeuPaletMode(data.jeu_palet_mode)
      })
    return () => {
      annule = true
    }
  }, [pret, benevole])

  // Si le réglage est désactivé pendant qu'un bénévole se trouve sur
  // l'écran "Jeux du palet" (rare, mais possible si un responsable le
  // désactive entretemps ailleurs), on le ramène sur l'écran de vente
  // plutôt que de le laisser sur un onglet qui vient de disparaître du
  // menu.
  useEffect(() => {
    if (jeuPaletMode === 'desactive' && ecran === 'palet') setEcran('vente')
  }, [jeuPaletMode, ecran])

  // Si un responsable se déconnecte (ou perd son statut) pendant qu'il se
  // trouve sur un écran réservé aux responsables, on le ramène sur l'écran
  // de vente.
  useEffect(() => {
    const estResponsable = benevole?.role === 'responsable'
    if (!estResponsable && ['produits', 'benevoles', 'historique', 'caisse'].includes(ecran)) {
      setEcran('vente')
    }
  }, [benevole, ecran])

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
          {jeuPaletMode !== 'desactive' && (
            <button
              className={ecran === 'palet' ? 'actif' : ''}
              onClick={() => setEcran('palet')}
            >
              Jeux du palet
            </button>
          )}
          <button
            className={ecran === 'gourde' ? 'actif' : ''}
            onClick={() => setEcran('gourde')}
          >
            Gourde
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
              <button
                className={ecran === 'caisse' ? 'actif' : ''}
                onClick={() => setEcran('caisse')}
              >
                Caisse Espèces
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
        {ecran === 'vente' && <Vente benevole={benevole} jeuPaletMode={jeuPaletMode} />}
        {ecran === 'palet' && jeuPaletMode !== 'desactive' && <JeuPalet benevole={benevole} />}
        {ecran === 'gourde' && <GourdePerso benevole={benevole} />}
        {ecran === 'produits' && estResponsable && (
          <AdminProduits
            benevole={benevole}
            jeuPaletMode={jeuPaletMode}
            onChangerJeuPaletMode={setJeuPaletMode}
          />
        )}
        {ecran === 'benevoles' && estResponsable && (
          <AdminBenevoles benevole={benevole} />
        )}
        {ecran === 'historique' && estResponsable && (
          <Historique benevole={benevole} />
        )}
        {ecran === 'caisse' && estResponsable && (
          <CaisseEspeces benevole={benevole} />
        )}
      </main>

      <footer className="pied-page">
        <img src="/logo-gb-kreation.png" alt="" className="logo-pied-page" />
        Site créé par GB-Kréation
      </footer>
    </div>
  )
}
