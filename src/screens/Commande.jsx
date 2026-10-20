import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import {
  CATEGORIES,
  categorieProduit,
  formatEuros,
  photosProduit,
} from '../constants.js'
import CommandeAjoutModal from '../components/CommandeAjoutModal.jsx'
import PaiementModal from '../components/PaiementModal.jsx'
import { useFermetureRetour } from '../lib/useFermetureRetour.js'

function telephoneValide(t) {
  return String(t || '').replace(/\D/g, '').length >= 10
}

function emailValide(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim())
}

function cleLigne(produitId, taille) {
  return `${produitId}__${taille || ''}`
}

// Résumé textuel des lignes d'une commande ("T-shirt (M) ×2, Casquette ×1"),
// utilisé partout où on affiche une commande sans ouvrir son détail complet.
function resumeLignes(lignes) {
  if (!lignes || lignes.length === 0) return '—'
  return lignes
    .map((l) => `${l.nom_produit}${l.taille ? ` (${l.taille})` : ''} ×${l.quantite}`)
    .join(', ')
}

// Écran « Commande » : n'importe quel bénévole peut y noter la demande
// d'un client pour un ou plusieurs articles pas disponibles tout de suite
// (taille épuisée, article pas sorti à ce match…) — nom/prénom/téléphone du
// client, puis les articles avec leur quantité, regroupés en une seule
// commande avec un seul numéro. Purement informatif : aucun lien avec le
// stock, c'est même tout l'intérêt de cette page.
//
// Les responsables voient en plus, sur ce même écran, le suivi de toutes
// les commandes enregistrées : préparation article par article (chaque
// ligne a sa case « prêt », cochée au fur et à mesure — la commande entière
// passe en « traitée » dès que tout est prêt) et encaissement (indépendant
// de la préparation : une commande peut être payée avant ou après d'être
// prête).
export default function Commande({ benevole }) {
  const estResponsable = benevole.role === 'responsable'

  // --- Bouton "Remonter en haut" : apparaît dès qu'on a défilé un peu,
  // pratique sur cette page qui peut être longue (catalogue + suivi).
  const [afficherBoutonHaut, setAfficherBoutonHaut] = useState(false)
  useEffect(() => {
    function auScroll() {
      setAfficherBoutonHaut(window.scrollY > 300)
    }
    window.addEventListener('scroll', auScroll)
    return () => window.removeEventListener('scroll', auScroll)
  }, [])
  function remonterEnHaut() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // --- Catalogue : tout le catalogue actif (non archivé, non supprimé),
  // qu'il soit ou non actuellement "mis en vente" — c'est justement pour
  // commander ce qui n'est pas disponible là, tout de suite.
  const [produits, setProduits] = useState([])
  const [chargementProduits, setChargementProduits] = useState(true)
  const [erreurProduits, setErreurProduits] = useState(null)
  const [categoriesActives, setCategoriesActives] = useState(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c.cle, true]))
  )
  const [recherche, setRecherche] = useState('')

  const chargerProduits = useCallback(async () => {
    setErreurProduits(null)
    const { data, error } = await supabase
      .from('produits')
      .select('*, variantes_produit(*), produit_photos(*)')
      .is('supprime_le', null)
      .is('archive_le', null)
      .order('ordre', { ascending: true })
    if (error) {
      setErreurProduits(
        'Impossible de charger les produits. Vérifie ta connexion.'
      )
    } else {
      setProduits(data || [])
    }
    setChargementProduits(false)
  }, [])

  useEffect(() => {
    chargerProduits()
  }, [chargerProduits])

  const produitsAffiches = useMemo(() => {
    const texte = recherche.trim().toLowerCase()
    return produits
      .filter((p) => categoriesActives[categorieProduit(p)])
      .filter((p) => !texte || p.nom.toLowerCase().includes(texte))
      .slice()
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }))
  }, [produits, categoriesActives, recherche])

  function basculerCategorie(cle) {
    setCategoriesActives((etat) => ({ ...etat, [cle]: !etat[cle] }))
  }

  // --- Produit en cours de sélection (ouvre la modale taille/quantité) ---
  const [produitOuvert, setProduitOuvert] = useState(null)

  // --- Fiche client + lignes de la commande en cours de saisie ---
  const [nomClient, setNomClient] = useState('')
  const [prenomClient, setPrenomClient] = useState('')
  const [telephoneClient, setTelephoneClient] = useState('')
  const [emailClient, setEmailClient] = useState('')
  const [lignes, setLignes] = useState([])

  function ajouterLigne({ taille, quantite }) {
    const produit = produitOuvert
    setProduitOuvert(null)
    if (!produit) return
    setLignes((ls) => {
      const cle = cleLigne(produit.id, taille)
      const existante = ls.find((l) => l.cle === cle)
      if (existante) {
        return ls.map((l) =>
          l.cle === cle ? { ...l, quantite: l.quantite + quantite } : l
        )
      }
      return [
        ...ls,
        { cle, produit_id: produit.id, nom_produit: produit.nom, taille, quantite },
      ]
    })
  }

  function retirerLigne(cle) {
    setLignes((ls) => ls.filter((l) => l.cle !== cle))
  }

  const ficheClientComplete =
    nomClient.trim() !== '' &&
    prenomClient.trim() !== '' &&
    telephoneValide(telephoneClient) &&
    (emailClient.trim() === '' || emailValide(emailClient))
  const peutValider = ficheClientComplete && lignes.length > 0

  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false)
  const [erreurEnvoi, setErreurEnvoi] = useState(null)
  const [messageSucces, setMessageSucces] = useState(null)

  // --- Panier flottant : raccourci pour rejoindre directement le bouton
  // de validation, tout en bas de la page (après le long catalogue).
  const refBoutonEnregistrer = useRef(null)
  const totalArticlesPanier = useMemo(
    () => lignes.reduce((total, l) => total + l.quantite, 0),
    [lignes]
  )
  function allerAuRecapitulatif() {
    refBoutonEnregistrer.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // --- Suivi des commandes (responsables uniquement) ---
  const [commandes, setCommandes] = useState([])
  const [chargementCommandes, setChargementCommandes] = useState(true)
  const [erreurCommandes, setErreurCommandes] = useState(null)

  // Filtres indépendants : préparation (en_attente / traitee) et paiement
  // (a_regler / payee) — une commande peut avancer sur l'un sans l'autre.
  const [filtrePreparation, setFiltrePreparation] = useState('tout')
  const [filtrePaiement, setFiltrePaiement] = useState('tout')

  const commandesFiltrees = useMemo(
    () =>
      commandes.filter(
        (c) =>
          (filtrePreparation === 'tout' || c.statut === filtrePreparation) &&
          (filtrePaiement === 'tout' || c.statut_paiement === filtrePaiement)
      ),
    [commandes, filtrePreparation, filtrePaiement]
  )

  // --- Détail d'une commande (clic sur son numéro) : lignes avec case
  // « prêt » à cocher une par une, et encaissement (bouton « Payer »).
  const [commandeDetail, setCommandeDetail] = useState(null)
  const [actionLigneEnCours, setActionLigneEnCours] = useState({})
  const [paiementCommandeOuvert, setPaiementCommandeOuvert] = useState(false)
  const [paiementEnCours, setPaiementEnCours] = useState(false)
  const [erreurPaiement, setErreurPaiement] = useState(null)

  useFermetureRetour(!!commandeDetail, () => {
    if (!paiementEnCours) {
      setCommandeDetail(null)
      setPaiementCommandeOuvert(false)
    }
  })

  function ouvrirDetail(commande) {
    setCommandeDetail(commande)
    setPaiementCommandeOuvert(false)
    setErreurPaiement(null)
  }

  function fermerDetail() {
    if (paiementEnCours) return
    setCommandeDetail(null)
    setPaiementCommandeOuvert(false)
  }

  // --- Annulation d'une commande : raison obligatoire + confirmation par
  // le code PIN du responsable, même principe que la suppression d'une
  // vente dans l'écran Historique.
  const [commandeASupprimer, setCommandeASupprimer] = useState(null)
  const [raisonSuppression, setRaisonSuppression] = useState('')
  const [pinSuppression, setPinSuppression] = useState('')
  const [erreurSuppression, setErreurSuppression] = useState(null)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)

  useFermetureRetour(!!commandeASupprimer, () => {
    if (!suppressionEnCours) setCommandeASupprimer(null)
  })

  // --- Demandes d'annulation déposées par les clients eux-mêmes (page
  // publique) : à examiner et accepter/refuser (responsables uniquement).
  const [demandesAnnulation, setDemandesAnnulation] = useState([])
  const [chargementDemandes, setChargementDemandes] = useState(true)
  const [erreurDemandes, setErreurDemandes] = useState(null)
  const [demandeAExaminer, setDemandeAExaminer] = useState(null) // { demande, decision }
  const [pinDecision, setPinDecision] = useState('')
  const [erreurDecision, setErreurDecision] = useState(null)
  const [decisionEnCours, setDecisionEnCours] = useState(false)

  useFermetureRetour(!!demandeAExaminer, () => {
    if (!decisionEnCours) setDemandeAExaminer(null)
  })

  const demandesEnAttente = useMemo(
    () => demandesAnnulation.filter((d) => d.statut === 'en_attente'),
    [demandesAnnulation]
  )

  const chargerDemandesAnnulation = useCallback(async () => {
    if (!estResponsable) {
      setChargementDemandes(false)
      return
    }
    setErreurDemandes(null)
    const { data, error } = await supabase.rpc('lister_demandes_annulation', {
      p_benevole_id: benevole.id,
    })
    if (error) {
      setErreurDemandes("Impossible de charger les demandes d'annulation.")
    } else {
      setDemandesAnnulation(data || [])
    }
    setChargementDemandes(false)
  }, [benevole.id, estResponsable])

  useEffect(() => {
    chargerDemandesAnnulation()
  }, [chargerDemandesAnnulation])

  function ouvrirDecision(demande, decision) {
    setDemandeAExaminer({ demande, decision })
    setPinDecision('')
    setErreurDecision(null)
  }

  function fermerDecision() {
    if (decisionEnCours) return
    setDemandeAExaminer(null)
  }

  async function confirmerDecision() {
    if (!/^\d{4}$/.test(pinDecision)) {
      setErreurDecision('Le code doit contenir exactement 4 chiffres.')
      return
    }
    setDecisionEnCours(true)
    setErreurDecision(null)
    const { error } = await supabase.rpc('traiter_demande_annulation', {
      p_benevole_id: benevole.id,
      p_pin: pinDecision,
      p_demande_id: demandeAExaminer.demande.id,
      p_decision: demandeAExaminer.decision,
    })
    setDecisionEnCours(false)
    if (error) {
      setErreurDecision(
        error.message === 'Code PIN incorrect' ? 'Code PIN incorrect.' : error.message || 'Échec.'
      )
      return
    }
    setDemandeAExaminer(null)
    chargerDemandesAnnulation()
    chargerCommandes()
  }

  // Renvoie la liste à jour (et met aussi à jour l'état `commandes`), pour
  // que les appelants puissent resynchroniser la modale de détail ouverte
  // sans avoir à relire deux fois la base.
  const chargerCommandes = useCallback(async () => {
    if (!estResponsable) {
      setChargementCommandes(false)
      return null
    }
    setErreurCommandes(null)
    const { data, error } = await supabase.rpc('lister_commandes', {
      p_benevole_id: benevole.id,
    })
    if (error) {
      setErreurCommandes('Impossible de charger les commandes enregistrées.')
      setChargementCommandes(false)
      return null
    }
    setCommandes(data || [])
    setChargementCommandes(false)
    return data || []
  }, [benevole.id, estResponsable])

  useEffect(() => {
    chargerCommandes()
  }, [chargerCommandes])

  // Recharge la liste des commandes puis, si la modale de détail est
  // ouverte, la resynchronise avec la version à jour de cette même
  // commande (nouvelles lignes prêtes, nouveau statut de paiement…).
  async function rafraichirEtResynchroniser(commandeId) {
    const liste = await chargerCommandes()
    if (commandeId && liste) {
      const maj = liste.find((c) => c.id === commandeId)
      if (maj) setCommandeDetail(maj)
    }
  }

  async function enregistrerCommande() {
    if (!peutValider) return
    setEnregistrementEnCours(true)
    setErreurEnvoi(null)
    setMessageSucces(null)

    const { error } = await supabase.rpc('enregistrer_commande', {
      p_benevole_id: benevole.id,
      p_lignes: lignes.map((l) => ({
        produit_id: l.produit_id,
        taille: l.taille,
        quantite: l.quantite,
      })),
      p_nom_client: nomClient.trim(),
      p_prenom_client: prenomClient.trim(),
      p_telephone_client: telephoneClient.trim(),
      p_email_client: emailClient.trim() || null,
    })

    setEnregistrementEnCours(false)

    if (error) {
      setErreurEnvoi(error.message || "L'enregistrement a échoué. Réessaie.")
      return
    }

    setLignes([])
    setNomClient('')
    setPrenomClient('')
    setTelephoneClient('')
    setEmailClient('')
    setMessageSucces('Commande enregistrée ✓')
    chargerCommandes()
  }

  // Coche/décoche une ligne comme prête ; la commande entière passe
  // automatiquement en « traitée » dès que toutes ses lignes le sont
  // (logique côté base, voir marquer_ligne_prete).
  async function toggleLignePrete(ligne) {
    setActionLigneEnCours((e) => ({ ...e, [ligne.id]: true }))
    const { error } = await supabase.rpc('marquer_ligne_prete', {
      p_benevole_id: benevole.id,
      p_ligne_id: ligne.id,
      p_pret: !ligne.pret,
    })
    setActionLigneEnCours((e) => ({ ...e, [ligne.id]: false }))
    if (!error) await rafraichirEtResynchroniser(commandeDetail?.id)
  }

  function ouvrirSuppression(commande) {
    setCommandeASupprimer(commande)
    setRaisonSuppression('')
    setPinSuppression('')
    setErreurSuppression(null)
  }

  function fermerSuppression() {
    if (suppressionEnCours) return
    setCommandeASupprimer(null)
  }

  async function confirmerSuppression() {
    if (raisonSuppression.trim() === '') {
      setErreurSuppression('Indique une raison pour annuler cette commande.')
      return
    }
    if (!/^\d{4}$/.test(pinSuppression)) {
      setErreurSuppression('Le code doit contenir exactement 4 chiffres.')
      return
    }
    setSuppressionEnCours(true)
    setErreurSuppression(null)
    const { error } = await supabase.rpc('supprimer_commande', {
      p_benevole_id: benevole.id,
      p_pin: pinSuppression,
      p_commande_id: commandeASupprimer.id,
      p_raison: raisonSuppression.trim(),
    })
    setSuppressionEnCours(false)
    if (error) {
      setErreurSuppression(
        error.message === 'Code PIN incorrect'
          ? 'Code PIN incorrect.'
          : error.message || "L'annulation a échoué."
      )
      return
    }
    setCommandeASupprimer(null)
    if (commandeDetail && commandeDetail.id === commandeASupprimer.id) {
      setCommandeDetail(null)
      setPaiementCommandeOuvert(false)
    }
    chargerCommandes()
  }

  // Encaissement d'une commande (clic sur son numéro, puis « Payer ») :
  // même choix CB / espèces et calcul de monnaie que l'encaissement d'une
  // vente au comptoir.
  async function validerPaiementCommande(mode, montantRecu) {
    if (!commandeDetail) return
    setPaiementEnCours(true)
    setErreurPaiement(null)
    const { error } = await supabase.rpc('marquer_commande_payee', {
      p_benevole_id: benevole.id,
      p_commande_id: commandeDetail.id,
      p_mode_paiement: mode,
      p_montant_recu: montantRecu,
    })
    setPaiementEnCours(false)
    if (error) {
      setErreurPaiement(error.message || "L'encaissement a échoué. Réessaie.")
      return
    }
    setPaiementCommandeOuvert(false)
    await rafraichirEtResynchroniser(commandeDetail.id)
  }

  return (
    <>
      <div className="bloc">
        <h2>Commande</h2>
        <p style={{ color: 'var(--texte-clair)' }}>
          Pour un ou plusieurs articles pas disponibles tout de suite (taille
          épuisée, article pas sorti à ce match…) : note la demande du
          client ci-dessous, elle sera recontactée par un(e) responsable.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            maxWidth: 680,
            marginBottom: 20,
          }}
        >
          <div className="champ">
            <label>Nom *</label>
            <input value={nomClient} onChange={(e) => setNomClient(e.target.value)} />
          </div>
          <div className="champ">
            <label>Prénom *</label>
            <input value={prenomClient} onChange={(e) => setPrenomClient(e.target.value)} />
          </div>
          <div className="champ">
            <label>N° téléphone *</label>
            <input
              type="tel"
              value={telephoneClient}
              onChange={(e) => setTelephoneClient(e.target.value)}
              placeholder="06 12 34 56 78"
            />
          </div>
          <div className="champ">
            <label>Email du client (facultatif)</label>
            <input
              type="email"
              value={emailClient}
              onChange={(e) => setEmailClient(e.target.value)}
              placeholder="client@exemple.fr"
            />
          </div>
        </div>

        {emailClient.trim() !== '' && !emailValide(emailClient) && (
          <p className="erreur" style={{ marginTop: -12 }}>
            Adresse email incorrecte.
          </p>
        )}
        <p style={{ color: 'var(--texte-clair)', fontSize: '0.85rem', marginTop: -12, marginBottom: 16 }}>
          Si renseigné, le client reçoit automatiquement un récapitulatif de sa commande par email.
        </p>
      </div>

      {estResponsable && (
        <div className="bloc" style={{ marginTop: 32 }}>
          <h2>
            Demandes d'annulation (clients)
            {demandesEnAttente.length > 0 && (
              <span
                style={{
                  marginLeft: 10,
                  background: 'var(--orange)',
                  color: 'white',
                  borderRadius: 999,
                  padding: '2px 10px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  verticalAlign: 'middle',
                }}
              >
                {demandesEnAttente.length}
              </span>
            )}
          </h2>
          {chargementDemandes && <p className="chargement">Chargement…</p>}
          {erreurDemandes && <p className="erreur">{erreurDemandes}</p>}
          {!chargementDemandes && !erreurDemandes && (
            <div style={{ overflowX: 'auto' }}>
              <table className="tableau-admin">
                <thead>
                  <tr>
                    <th>Numéro</th>
                    <th>Client</th>
                    <th>Articles</th>
                    <th>Motif</th>
                    <th>Date</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {demandesAnnulation.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {d.numero_commande}
                      </td>
                      <td>
                        {d.prenom_client || d.nom_client
                          ? `${d.prenom_client || ''} ${d.nom_client || ''}`.trim()
                          : '—'}
                      </td>
                      <td>{d.articles || '—'}</td>
                      <td>{d.motif}</td>
                      <td>{new Date(d.cree_le).toLocaleString('fr-FR')}</td>
                      <td>
                        {d.statut === 'traitee' ? (
                          d.decision === 'annulee' ? (
                            <span style={{ color: 'var(--vert)', fontWeight: 700 }}>✓ Annulée</span>
                          ) : (
                            <span style={{ color: 'var(--texte-clair)', fontWeight: 700 }}>Refusée</span>
                          )
                        ) : (
                          <span style={{ color: 'var(--orange)', fontWeight: 700 }}>En attente</span>
                        )}
                      </td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {d.statut === 'en_attente' && (
                          <>
                            <button
                              className="bouton-secondaire"
                              onClick={() => ouvrirDecision(d, 'annulee')}
                            >
                              Accepter (annuler)
                            </button>
                            <button
                              className="bouton-secondaire"
                              onClick={() => ouvrirDecision(d, 'refusee')}
                            >
                              Refuser
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {demandesAnnulation.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--texte-clair)' }}>
                        Aucune demande d'annulation pour l'instant
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {estResponsable && (
        <div className="bloc" style={{ marginTop: 32 }}>
          <h2>Suivi des commandes</h2>

          <div className="filtres-segments">
            <span className="etiquette">Préparation :</span>
            {[
              { cle: 'tout', label: 'Toutes' },
              { cle: 'en_attente', label: 'En attente' },
              { cle: 'traitee', label: 'Prêtes' },
            ].map((opt) => (
              <button
                key={opt.cle}
                type="button"
                className={filtrePreparation === opt.cle ? 'selectionne' : ''}
                onClick={() => setFiltrePreparation(opt.cle)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="filtres-segments">
            <span className="etiquette">Paiement :</span>
            {[
              { cle: 'tout', label: 'Tous' },
              { cle: 'a_regler', label: 'À régler' },
              { cle: 'payee', label: 'Payées' },
            ].map((opt) => (
              <button
                key={opt.cle}
                type="button"
                className={filtrePaiement === opt.cle ? 'selectionne' : ''}
                onClick={() => setFiltrePaiement(opt.cle)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {chargementCommandes && <p className="chargement">Chargement…</p>}
          {erreurCommandes && <p className="erreur">{erreurCommandes}</p>}
          {!chargementCommandes && !erreurCommandes && (
            <div style={{ overflowX: 'auto' }}>
              <table className="tableau-admin">
                <thead>
                  <tr>
                    <th>Numéro</th>
                    <th>Client</th>
                    <th>Téléphone</th>
                    <th>Articles</th>
                    <th>Enregistrée par</th>
                    <th>Origine</th>
                    <th>Date</th>
                    <th>Préparation</th>
                    <th>Paiement</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {commandesFiltrees.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <button
                          type="button"
                          className="lien-commande"
                          onClick={() => ouvrirDetail(c)}
                        >
                          {c.numero_commande || '—'}
                        </button>
                      </td>
                      <td>
                        {c.prenom_client} {c.nom_client}
                        {c.email_client && (
                          <span title={`Recevra un récapitulatif : ${c.email_client}`} style={{ marginLeft: 4 }}>
                            📧
                          </span>
                        )}
                      </td>
                      <td>{c.telephone_client}</td>
                      <td style={{ maxWidth: 260 }}>{resumeLignes(c.lignes)}</td>
                      <td>{c.benevole_nom || '—'}</td>
                      <td>
                        {c.origine === 'public' ? (
                          <span style={{ color: 'var(--bleu)', fontWeight: 700 }}>En ligne (QR)</span>
                        ) : (
                          <span style={{ color: 'var(--texte-clair)' }}>En boutique</span>
                        )}
                      </td>
                      <td>{new Date(c.created_at).toLocaleString('fr-FR')}</td>
                      <td>
                        {c.statut === 'traitee' ? (
                          <span style={{ color: 'var(--vert)', fontWeight: 700 }}>✓ Prête</span>
                        ) : (
                          <span style={{ color: 'var(--orange)', fontWeight: 700 }}>En attente</span>
                        )}
                      </td>
                      <td>
                        {c.statut_paiement === 'payee' ? (
                          <span style={{ color: 'var(--vert)', fontWeight: 700 }}>✓ Payée</span>
                        ) : (
                          <span style={{ color: 'var(--orange)', fontWeight: 700 }}>À régler</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="bouton-icone"
                          title="Annuler cette commande"
                          onClick={() => ouvrirSuppression(c)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  {commandesFiltrees.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', color: 'var(--texte-clair)' }}>
                        Aucune commande ne correspond à ce filtre
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="bloc" style={{ marginTop: 32 }}>
        <h3 style={{ marginBottom: 10 }}>Objet de la commande</h3>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input
            type="text"
            placeholder="Rechercher un article…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            style={{ maxWidth: 220 }}
          />
          {CATEGORIES.map((cat) => (
            <label className="filtre-case" key={cat.cle} style={{ display: 'inline-flex' }}>
              <input
                type="checkbox"
                checked={categoriesActives[cat.cle]}
                onChange={() => basculerCategorie(cat.cle)}
              />
              {cat.label}
            </label>
          ))}
        </div>

        {chargementProduits && <p className="chargement">Chargement des produits…</p>}
        {erreurProduits && <p className="erreur">{erreurProduits}</p>}

        {!chargementProduits && !erreurProduits && (
          <div className="grille-produits">
            {produitsAffiches.length === 0 && (
              <p className="panier-vide">Aucun article ne correspond</p>
            )}
            {produitsAffiches.map((produit) => {
              const photos = photosProduit(produit)
              return (
                <button
                  key={produit.id}
                  type="button"
                  className="produit-bouton"
                  onClick={() => setProduitOuvert(produit)}
                >
                  <div className="produit-image">
                    {categorieProduit(produit) === 'enfant' && (
                      <span className="ruban-enfant">Enfant</span>
                    )}
                    {photos.length ? <img src={photos[0]} alt={produit.nom} /> : '🛍️'}
                  </div>
                  <div className="produit-nom">{produit.nom}</div>
                  {!produit.actif && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--texte-clair)' }}>
                      Pas actuellement en vente
                    </div>
                  )}
                  <div className="produit-prix">{formatEuros(produit.prix)}</div>
                </button>
              )
            })}
          </div>
        )}

        <h3 style={{ marginTop: 24, marginBottom: 10 }}>Récapitulatif</h3>
        {lignes.length === 0 ? (
          <p className="panier-vide">Aucun article ajouté pour l'instant</p>
        ) : (
          <div className="panier-lignes" style={{ maxWidth: 520 }}>
            {lignes.map((l) => (
              <div className="panier-ligne" key={l.cle}>
                <div className="panier-ligne-info">
                  <span className="panier-ligne-nom">{l.nom_produit}</span>
                  <span className="panier-ligne-detail">
                    {l.taille ? `${l.taille} · ` : ''}Quantité : {l.quantite}
                  </span>
                </div>
                <button
                  type="button"
                  className="bouton-icone"
                  title="Retirer cet article"
                  onClick={() => retirerLigne(l.cle)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {erreurEnvoi && <p className="erreur">{erreurEnvoi}</p>}
        {messageSucces && (
          <p style={{ color: 'var(--vert)', fontWeight: 700 }}>{messageSucces}</p>
        )}

        <button
          ref={refBoutonEnregistrer}
          className="bouton-principal"
          style={{ marginTop: 16 }}
          disabled={!peutValider || enregistrementEnCours}
          onClick={enregistrerCommande}
          title={
            !ficheClientComplete
              ? 'Renseigne le nom, le prénom et un numéro de téléphone valide'
              : lignes.length === 0
                ? 'Ajoute au moins un article'
                : undefined
          }
        >
          {enregistrementEnCours ? 'Enregistrement…' : 'Enregistrer la commande'}
        </button>
      </div>

      {produitOuvert && (
        <CommandeAjoutModal
          produit={produitOuvert}
          onValider={ajouterLigne}
          onFermer={() => setProduitOuvert(null)}
        />
      )}

      {lignes.length > 0 && (
        <button
          type="button"
          className="bouton-panier-flottant"
          style={{ bottom: 84 }}
          onClick={allerAuRecapitulatif}
          aria-label="Aller valider la commande"
          title="Aller valider la commande"
        >
          🛒<span className="panier-flottant-compte">{totalArticlesPanier}</span>
        </button>
      )}

      {afficherBoutonHaut && (
        <button
          type="button"
          className="bouton-remonter"
          onClick={remonterEnHaut}
          aria-label="Remonter en haut de la page"
          title="Remonter en haut de la page"
        >
          ⬆️
        </button>
      )}

      {commandeDetail && (
        <div className="fond-modale" onClick={fermerDetail}>
          <div className="modale" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h2>Commande {commandeDetail.numero_commande}</h2>
            <p>
              {commandeDetail.prenom_client} {commandeDetail.nom_client} · {commandeDetail.telephone_client}
              {commandeDetail.email_client ? ` · ${commandeDetail.email_client}` : ''}
            </p>
            <p style={{ color: 'var(--texte-clair)', fontSize: '0.85rem' }}>
              {commandeDetail.origine === 'public' ? 'En ligne (QR)' : 'En boutique'}
              {commandeDetail.benevole_nom ? ` · Enregistrée par ${commandeDetail.benevole_nom}` : ''}
              {' · '}
              {new Date(commandeDetail.created_at).toLocaleString('fr-FR')}
            </p>

            <h3 style={{ marginTop: 16, marginBottom: 4 }}>Articles</h3>
            <p style={{ color: 'var(--texte-clair)', fontSize: '0.8rem', marginTop: 0 }}>
              Coche chaque article au fur et à mesure qu'il est prêt.
            </p>
            <div className="lignes-pretes">
              {(commandeDetail.lignes || []).map((l) => (
                <label
                  className={`ligne-prete${actionLigneEnCours[l.id] ? ' chargement' : ''}`}
                  key={l.id}
                >
                  <input
                    type="checkbox"
                    checked={l.pret}
                    disabled={!!actionLigneEnCours[l.id]}
                    onChange={() => toggleLignePrete(l)}
                  />
                  <span className="panier-ligne-info">
                    <span className="panier-ligne-nom">{l.nom_produit}</span>
                    <span className="panier-ligne-detail">
                      {l.taille ? `${l.taille} · ` : ''}Quantité : {l.quantite} ·{' '}
                      {formatEuros(l.prix_unitaire * l.quantite)}
                    </span>
                  </span>
                </label>
              ))}
              {(commandeDetail.lignes || []).length === 0 && (
                <p className="panier-vide">Aucun article</p>
              )}
            </div>
            <p style={{ textAlign: 'right', fontWeight: 700, margin: '4px 0 0' }}>
              Total indicatif : {formatEuros(commandeDetail.total)}
            </p>

            <div className="detail-commande-statuts">
              <span>
                {commandeDetail.statut === 'traitee' ? (
                  <span style={{ color: 'var(--vert)', fontWeight: 700 }}>✓ Commande prête</span>
                ) : (
                  <span style={{ color: 'var(--orange)', fontWeight: 700 }}>Préparation en attente</span>
                )}
              </span>
              <span>
                {commandeDetail.statut_paiement === 'payee' ? (
                  <span style={{ color: 'var(--vert)', fontWeight: 700 }}>
                    ✓ Payée ({commandeDetail.mode_paiement === 'cb' ? 'CB' : 'Espèces'})
                    {commandeDetail.mode_paiement === 'especes' && commandeDetail.monnaie_rendue != null
                      ? ` · Monnaie rendue ${formatEuros(commandeDetail.monnaie_rendue)}`
                      : ''}
                  </span>
                ) : (
                  <span style={{ color: 'var(--orange)', fontWeight: 700 }}>À régler</span>
                )}
              </span>
            </div>

            {erreurPaiement && <p className="erreur">{erreurPaiement}</p>}

            <div className="modale-actions">
              <button className="bouton-secondaire" onClick={fermerDetail}>
                Fermer
              </button>
              {commandeDetail.statut_paiement !== 'payee' && (
                <button
                  className="bouton-principal"
                  onClick={() => {
                    setErreurPaiement(null)
                    setPaiementCommandeOuvert(true)
                  }}
                >
                  💳 Payer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {paiementCommandeOuvert && commandeDetail && (
        <PaiementModal
          total={commandeDetail.total}
          enCours={paiementEnCours}
          onFermer={() => setPaiementCommandeOuvert(false)}
          onValider={validerPaiementCommande}
        />
      )}

      {commandeASupprimer && (
        <div className="fond-modale" onClick={fermerSuppression}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <h2>Annuler cette commande ?</h2>
            <p>
              {commandeASupprimer.prenom_client} {commandeASupprimer.nom_client} —{' '}
              {resumeLignes(commandeASupprimer.lignes)}
            </p>
            <p style={{ color: 'var(--texte-clair)' }}>
              Cette action est irréversible. Indique la raison, puis confirme avec ton code PIN de
              responsable.
            </p>
            <div className="champ">
              <label>Raison</label>
              <input
                type="text"
                autoFocus
                value={raisonSuppression}
                onChange={(e) => setRaisonSuppression(e.target.value)}
                placeholder="Doublon, client désisté, erreur de saisie…"
              />
            </div>
            <div className="champ">
              <label>Code PIN responsable</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={pinSuppression}
                onChange={(e) => setPinSuppression(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
              />
            </div>
            {erreurSuppression && <p className="erreur">{erreurSuppression}</p>}
            <div className="modale-actions">
              <button
                className="bouton-secondaire"
                onClick={fermerSuppression}
                disabled={suppressionEnCours}
              >
                Retour
              </button>
              <button
                className="bouton-principal"
                onClick={confirmerSuppression}
                disabled={
                  suppressionEnCours ||
                  raisonSuppression.trim() === '' ||
                  !/^\d{4}$/.test(pinSuppression)
                }
              >
                {suppressionEnCours ? 'Annulation…' : 'Annuler la commande'}
              </button>
            </div>
          </div>
        </div>
      )}

      {demandeAExaminer && (
        <div className="fond-modale" onClick={fermerDecision}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <h2>
              {demandeAExaminer.decision === 'annulee'
                ? 'Accepter cette demande et annuler la commande ?'
                : 'Refuser cette demande d\'annulation ?'}
            </h2>
            <p>
              {demandeAExaminer.demande.numero_commande} —{' '}
              {demandeAExaminer.demande.prenom_client} {demandeAExaminer.demande.nom_client} —{' '}
              {demandeAExaminer.demande.articles}
            </p>
            <p style={{ color: 'var(--texte-clair)' }}>
              Motif indiqué par le client : « {demandeAExaminer.demande.motif} »
            </p>
            <p style={{ color: 'var(--texte-clair)' }}>
              {demandeAExaminer.decision === 'annulee'
                ? 'La commande sera définitivement supprimée. '
                : 'La commande restera en place, la demande sera simplement marquée refusée. '}
              Confirme avec ton code PIN de responsable.
            </p>
            <div className="champ">
              <label>Code PIN responsable</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                value={pinDecision}
                onChange={(e) => setPinDecision(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
              />
            </div>
            {erreurDecision && <p className="erreur">{erreurDecision}</p>}
            <div className="modale-actions">
              <button className="bouton-secondaire" onClick={fermerDecision} disabled={decisionEnCours}>
                Retour
              </button>
              <button
                className="bouton-principal"
                onClick={confirmerDecision}
                disabled={decisionEnCours || !/^\d{4}$/.test(pinDecision)}
              >
                {decisionEnCours
                  ? 'Confirmation…'
                  : demandeAExaminer.decision === 'annulee'
                    ? 'Confirmer l\'annulation'
                    : 'Confirmer le refus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
