import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureSupabaseSession, estUneSessionGoogle, supabase } from './supabaseClient'
import Login from './screens/Login.jsx'
import Vente from './screens/Vente.jsx'
import Commande from './screens/Commande.jsx'
import AdminProduits from './screens/AdminProduits.jsx'
import AdminBenevoles from './screens/AdminBenevoles.jsx'
import Reapprovisionnement from './screens/Reapprovisionnement.jsx'
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

  // Connexion Google : le temps de vérifier l'adresse (après retour de
  // Google) et le message d'erreur si elle n'est pas autorisée.
  const [verificationGoogle, setVerificationGoogle] = useState(false)
  const [erreurGoogle, setErreurGoogle] = useState(null)

  // Pendant la fermeture d'une éventuelle session Google (voir
  // deconnecter), pour que le bouton "Changer de bénévole" donne un
  // retour visuel immédiat plutôt que de sembler ne rien faire.
  const [deconnexionEnCours, setDeconnexionEnCours] = useState(false)

  // Notifications "nouvelle commande" pour les responsables : un rond
  // rouge sur l'onglet Commande (nombre de commandes + demandes
  // d'annulation en attente) et une bulle affichée une fois à l'ouverture
  // de session s'il y a quelque chose à traiter. Le compteur redescend
  // tout seul au fur et à mesure que les commandes sont marquées
  // traitées et que les demandes d'annulation sont tranchées — rien à
  // "marquer comme lu".
  const [notifications, setNotifications] = useState(null) // null = pas encore chargé
  const [bulleNotifVisible, setBulleNotifVisible] = useState(false)
  const bulleDejaMontree = useRef(false)

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

  // Dès que l'appli est prête et qu'aucun bénévole n'est encore choisi
  // sur cette tablette, on regarde si la session Supabase est une vraie
  // connexion Google (cas du retour de redirection depuis Google, ou
  // d'une session Google restée ouverte) — si oui, on tente de
  // reconnaître automatiquement le responsable correspondant, sans lui
  // demander de code.
  useEffect(() => {
    if (!pret || benevole) return
    let annule = false
    async function tenterConnexionGoogle() {
      const { data } = await supabase.auth.getSession()
      if (annule || !estUneSessionGoogle(data.session)) return
      setVerificationGoogle(true)
      setErreurGoogle(null)
      const { data: resultat, error } = await supabase.rpc('connecter_via_google')
      if (annule) return
      setVerificationGoogle(false)
      const ligne = Array.isArray(resultat) ? resultat[0] : resultat
      if (error || !ligne) {
        setErreurGoogle(
          error?.message ||
            "La connexion Google a échoué. Réessaie, ou utilise ton code PIN."
        )
        return
      }
      connecter({ id: ligne.id, nom: ligne.nom, role: ligne.role })
    }
    tenterConnexionGoogle()
    return () => {
      annule = true
    }
  }, [pret, benevole])

  // Abandonne une session Google refusée (adresse non autorisée, compte
  // désactivé…) : on se déconnecte complètement de Google et on rouvre
  // une session anonyme, pour retrouver l'écran de connexion normal
  // (tuiles + code PIN) plutôt que de rester bloqué sur l'erreur.
  async function abandonnerConnexionGoogle() {
    setErreurGoogle(null)
    try {
      await supabase.auth.signOut()
    } catch {
      // ignoré : on tente quand même de rouvrir une session anonyme
    }
    await supabase.auth.signInAnonymously().catch(() => {})
  }

  async function deconnecter() {
    setDeconnexionEnCours(true)

    // Invalide la liaison de session côté serveur (best-effort : même si
    // l'appel échoue — réseau coupé, etc. — on déconnecte quand même
    // localement ; la session serveur expirera de toute façon au bout de
    // 12 heures).
    if (benevole) {
      supabase.rpc('deconnecter_benevole', { p_benevole_id: benevole.id }).catch(() => {})
    }

    // Si ce bénévole s'était connecté avec un vrai compte Google, il faut
    // fermer cette session Google AVANT de revenir à l'écran de connexion
    // (pas après) — sinon, pendant ce court instant où l'écran affiche
    // "aucun bénévole" mais où la session Google est encore active,
    // l'appli le reconnecte automatiquement tout de suite, et le bouton
    // semble ne rien faire.
    const { data } = await supabase.auth.getSession()
    if (estUneSessionGoogle(data.session)) {
      await supabase.auth.signOut().catch(() => {})
      await supabase.auth.signInAnonymously().catch(() => {})
    }

    setBenevole(null)
    sessionStorage.removeItem(CLE_SESSION)
    setDeconnexionEnCours(false)
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

  // Charge le nombre de commandes et de demandes d'annulation en attente,
  // ainsi que le nombre de tailles en alerte de réapprovisionnement
  // (responsables uniquement), et le rafraîchit régulièrement pour que les
  // ronds sur les onglets Commande et Réapprovisionnement restent à jour
  // même si le responsable reste sur un autre écran — utile notamment pour
  // repérer les commandes passées depuis la page publique (QR code).
  const estResponsablePourNotif = benevole?.role === 'responsable'
  const chargerNotifications = useCallback(async () => {
    if (!benevole || !estResponsablePourNotif) return
    const { data, error } = await supabase.rpc('compter_notifications_responsable', {
      p_benevole_id: benevole.id,
    })
    if (error) return
    const ligne = Array.isArray(data) ? data[0] : data
    if (!ligne) return
    setNotifications({
      commandes: ligne.commandes_en_attente || 0,
      annulations: ligne.demandes_annulation_en_attente || 0,
      reappro: ligne.reappro_en_alerte || 0,
    })
  }, [benevole, estResponsablePourNotif])

  useEffect(() => {
    if (!pret || !benevole || !estResponsablePourNotif) {
      setNotifications(null)
      return
    }
    chargerNotifications()
    const intervalle = setInterval(chargerNotifications, 45000)
    return () => clearInterval(intervalle)
  }, [pret, benevole, estResponsablePourNotif, chargerNotifications])

  // Dès que le premier comptage arrive après une connexion, si quelque
  // chose attend un responsable, on affiche la bulle une fois (pas à
  // chaque rafraîchissement du compteur, juste à l'ouverture de session).
  useEffect(() => {
    if (!notifications || bulleDejaMontree.current) return
    bulleDejaMontree.current = true
    if (notifications.commandes + notifications.annulations + notifications.reappro > 0) {
      setBulleNotifVisible(true)
    }
  }, [notifications])

  useEffect(() => {
    if (!benevole) bulleDejaMontree.current = false
  }, [benevole])

  // Recharge le compteur à chaque passage par l'écran Commande ou
  // Réapprovisionnement (en y entrant pour avoir un chiffre à jour, et en
  // le quittant pour refléter tout de suite les actions prises, sans
  // attendre le prochain rafraîchissement automatique).
  useEffect(() => {
    if (ecran === 'commande' || ecran === 'reappro') chargerNotifications()
  }, [ecran, chargerNotifications])

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
    if (
      !estResponsable &&
      ['produits', 'benevoles', 'historique', 'caisse', 'reappro'].includes(ecran)
    ) {
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

  if (!pret || verificationGoogle) {
    return <div className="chargement">Chargement…</div>
  }

  if (erreurGoogle) {
    return (
      <div className="login-ecran">
        <div className="login-carte">
          <img src="/logo.png" alt="Boucaniers" className="logo-login" />
          <h1>Connexion Google refusée</h1>
          <p className="erreur">{erreurGoogle}</p>
          <button className="bouton-principal" onClick={abandonnerConnexionGoogle}>
            Retour à l'écran de connexion
          </button>
        </div>
      </div>
    )
  }

  if (!benevole) {
    return <Login onConnecte={connecter} />
  }

  const estResponsable = benevole.role === 'responsable'
  const totalNotifCommande = notifications ? notifications.commandes + notifications.annulations : 0
  const totalNotifReappro = notifications ? notifications.reappro : 0
  const totalNotifications = totalNotifCommande + totalNotifReappro

  return (
    <div className="app">
      {estResponsable && bulleNotifVisible && notifications && totalNotifications > 0 && (
        <div className="bulle-notif">
          <div className="bulle-notif-entete">
            <strong>
              {totalNotifications === 1 ? 'Nouvel élément' : 'Nouveaux éléments'} à traiter
            </strong>
            <button className="bulle-notif-fermer" onClick={() => setBulleNotifVisible(false)}>
              ✕
            </button>
          </div>
          {totalNotifCommande > 0 && (
            <div className="bulle-notif-ligne">
              <span>
                {notifications.commandes > 0 &&
                  `${notifications.commandes} commande${notifications.commandes > 1 ? 's' : ''} en attente`}
                {notifications.commandes > 0 && notifications.annulations > 0 && ' · '}
                {notifications.annulations > 0 &&
                  `${notifications.annulations} demande${notifications.annulations > 1 ? 's' : ''} d'annulation`}
              </span>
              <button
                className="bouton-principal"
                onClick={() => {
                  setEcran('commande')
                  setBulleNotifVisible(false)
                }}
              >
                Voir
              </button>
            </div>
          )}
          {totalNotifReappro > 0 && (
            <div className="bulle-notif-ligne">
              <span>
                {notifications.reappro} taille{notifications.reappro > 1 ? 's' : ''} à
                réapprovisionner
              </span>
              <button
                className="bouton-principal"
                onClick={() => {
                  setEcran('reappro')
                  setBulleNotifVisible(false)
                }}
              >
                Voir
              </button>
            </div>
          )}
        </div>
      )}
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
          <button
            className={`bouton-avec-badge ${ecran === 'commande' ? 'actif' : ''}`}
            onClick={() => setEcran('commande')}
          >
            Commande
            {estResponsable && totalNotifCommande > 0 && (
              <span className="badge-notif">{totalNotifCommande}</span>
            )}
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
                className={`bouton-avec-badge ${ecran === 'reappro' ? 'actif' : ''}`}
                onClick={() => setEcran('reappro')}
              >
                Réapprovisionnement
                {totalNotifReappro > 0 && (
                  <span className="badge-notif">{totalNotifReappro}</span>
                )}
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
          <button onClick={deconnecter} disabled={deconnexionEnCours}>
            {deconnexionEnCours ? 'Déconnexion…' : 'Changer de bénévole'}
          </button>
        </div>
      </header>

      <main className="contenu">
        {ecran === 'vente' && <Vente benevole={benevole} jeuPaletMode={jeuPaletMode} />}
        {ecran === 'palet' && jeuPaletMode !== 'desactive' && <JeuPalet benevole={benevole} />}
        {ecran === 'gourde' && <GourdePerso benevole={benevole} />}
        {ecran === 'commande' && <Commande benevole={benevole} />}
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
        {ecran === 'reappro' && estResponsable && (
          <Reapprovisionnement benevole={benevole} />
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
