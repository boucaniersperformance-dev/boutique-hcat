import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import {
  CATEGORIES,
  categorieProduit,
  formatEuros,
  photosProduit,
} from '../constants.js'
import CommandeAjoutModal from '../components/CommandeAjoutModal.jsx'
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

// Écran « Commande » : n'importe quel bénévole peut y noter la demande
// d'un client pour un article pas disponible tout de suite (taille
// épuisée, article pas sorti à ce match…) — nom/prénom/téléphone du
// client, puis un ou plusieurs articles avec leur quantité. Purement
// informatif : aucun lien avec le stock, c'est même tout l'intérêt de
// cette page.
//
// Les responsables voient en plus, sur ce même écran, le suivi de toutes
// les commandes enregistrées (à traiter / traitées).
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
  const [actionEnCours, setActionEnCours] = useState({})

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

  const chargerCommandes = useCallback(async () => {
    if (!estResponsable) {
      setChargementCommandes(false)
      return
    }
    setErreurCommandes(null)
    const { data, error } = await supabase.rpc('lister_commandes', {
      p_benevole_id: benevole.id,
    })
    if (error) {
      setErreurCommandes('Impossible de charger les commandes enregistrées.')
    } else {
      setCommandes(data || [])
    }
    setChargementCommandes(false)
  }, [benevole.id, estResponsable])

  useEffect(() => {
    chargerCommandes()
  }, [chargerCommandes])

  async function enregistrerCommande() {
    if (!peutValider) return
    setEnregistrementEnCours(true)
    setErreurEnvoi(null)
    setMessageSucces(null)

    const echecs = []
    for (const ligne of lignes) {
      const { error } = await supabase.rpc('enregistrer_commande', {
        p_benevole_id: benevole.id,
        p_produit_id: ligne.produit_id,
        p_taille: ligne.taille,
        p_quantite: ligne.quantite,
        p_nom_client: nomClient.trim(),
        p_prenom_client: prenomClient.trim(),
        p_telephone_client: telephoneClient.trim(),
        p_email_client: emailClient.trim() || null,
      })
      if (error) echecs.push(ligne)
    }

    setEnregistrementEnCours(false)

    if (echecs.length === 0) {
      setLignes([])
      setNomClient('')
      setPrenomClient('')
      setTelephoneClient('')
      setEmailClient('')
      setMessageSucces('Commande enregistrée ✓')
      chargerCommandes()
    } else if (echecs.length === lignes.length) {
      setErreurEnvoi("L'enregistrement a échoué. Réessaie.")
    } else {
      setLignes(echecs)
      setErreurEnvoi(
        `${lignes.length - echecs.length} article(s) enregistré(s), ${echecs.length} en échec — réessaie pour l'article restant.`
      )
      chargerCommandes()
    }
  }

  async function basculerStatut(commande) {
    setActionEnCours((e) => ({ ...e, [commande.id]: true }))
    const { error } = await supabase.rpc('marquer_commande', {
      p_benevole_id: benevole.id,
      p_commande_id: commande.id,
      p_traitee: commande.statut !== 'traitee',
    })
    setActionEnCours((e) => ({ ...e, [commande.id]: false }))
    if (!error) chargerCommandes()
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
    chargerCommandes()
  }

  return (
    <>
      <div className="bloc">
        <h2>Commande</h2>
        <p style={{ color: 'var(--texte-clair)' }}>
          Pour un article qui n'est pas disponible tout de suite (taille
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
                    <th>Article</th>
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
                      <td>
                        {d.nom_produit || '—'}
                        {d.taille ? ` · ${d.taille}` : ''}
                        {d.quantite ? ` · Qté ${d.quantite}` : ''}
                      </td>
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
                    <th>Article</th>
                    <th>Quantité</th>
                    <th>Enregistrée par</th>
                    <th>Origine</th>
                    <th>Date</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {commandes.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {c.numero_commande || '—'}
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
                      <td>
                        {c.nom_produit}
                        {c.taille ? ` · ${c.taille}` : ''}
                      </td>
                      <td>{c.quantite}</td>
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
                          <span style={{ color: 'var(--vert)', fontWeight: 700 }}>✓ Traitée</span>
                        ) : (
                          <span style={{ color: 'var(--orange)', fontWeight: 700 }}>En attente</span>
                        )}
                      </td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="bouton-secondaire"
                          disabled={!!actionEnCours[c.id]}
                          onClick={() => basculerStatut(c)}
                        >
                          {c.statut === 'traitee' ? 'Remettre en attente' : 'Marquer traitée'}
                        </button>
                        <button
                          className="bouton-icone"
                          title="Annuler cette commande"
                          disabled={!!actionEnCours[c.id]}
                          onClick={() => ouvrirSuppression(c)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  {commandes.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', color: 'var(--texte-clair)' }}>
                        Aucune commande enregistrée pour l'instant
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

      {commandeASupprimer && (
        <div className="fond-modale" onClick={fermerSuppression}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <h2>Annuler cette commande ?</h2>
            <p>
              {commandeASupprimer.prenom_client} {commandeASupprimer.nom_client} —{' '}
              {commandeASupprimer.nom_produit}
              {commandeASupprimer.taille ? ` · ${commandeASupprimer.taille}` : ''} · Quantité :{' '}
              {commandeASupprimer.quantite}
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
              {demandeAExaminer.demande.nom_produit}
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
