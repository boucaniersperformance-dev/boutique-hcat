import { useCallback, useEffect, useMemo, useState } from 'react'
import { ensureSupabaseSession, supabase } from '../supabaseClient'
import {
  CATEGORIES,
  categorieProduit,
  formatEuros,
  photosProduit,
} from '../constants.js'
import CommandeAjoutModal from '../components/CommandeAjoutModal.jsx'

function telephoneValide(t) {
  return String(t || '').replace(/\D/g, '').length >= 10
}

function cleLigne(produitId, taille) {
  return `${produitId}__${taille || ''}`
}

// Page publique « Commander un article » : accessible via un QR code,
// sans connexion ni code PIN. Un client scanne le code, parcourt le
// catalogue et dépose lui-même sa demande — exactement comme le ferait
// un(e) bénévole sur l'écran Commande, mais seul(e) et sans compte.
//
// Sécurité : la table `commandes` reste protégée par RLS (aucun accès
// direct) ; seule la fonction `enregistrer_commande_publique` — ouverte à
// une simple session anonyme — peut y écrire, avec ses propres
// vérifications et sa limite anti-abus côté base de données.
export default function CommandePublique() {
  // --- Session Supabase : une session anonyme suffit (même mécanisme que
  // pour le reste de l'appli), pas besoin d'identification.
  const [pret, setPret] = useState(false)
  const [erreurSession, setErreurSession] = useState(null)

  useEffect(() => {
    ensureSupabaseSession()
      .then(() => setPret(true))
      .catch((err) => {
        console.error(err)
        setErreurSession(
          "Impossible de contacter le serveur. Vérifie ta connexion internet et réessaie."
        )
      })
  }, [])

  // --- Catalogue ---
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
      setErreurProduits('Impossible de charger les articles. Vérifie ta connexion.')
    } else {
      setProduits(data || [])
    }
    setChargementProduits(false)
  }, [])

  useEffect(() => {
    if (pret) chargerProduits()
  }, [pret, chargerProduits])

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
  const [lignes, setLignes] = useState([])

  // Piège à robots : champ invisible pour un visiteur humain (masqué en
  // CSS), mais qu'un script de remplissage automatique de formulaire
  // repère et remplit souvent. S'il contient quoi que ce soit à l'envoi,
  // la demande est silencieusement ignorée côté serveur.
  const [piege, setPiege] = useState('')

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
    nomClient.trim() !== '' && prenomClient.trim() !== '' && telephoneValide(telephoneClient)
  const peutValider = ficheClientComplete && lignes.length > 0

  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false)
  const [erreurEnvoi, setErreurEnvoi] = useState(null)
  const [messageSucces, setMessageSucces] = useState(null)

  async function enregistrerCommande() {
    if (!peutValider) return
    setEnregistrementEnCours(true)
    setErreurEnvoi(null)
    setMessageSucces(null)

    const echecs = []
    let dernierMessageErreur = null
    for (const ligne of lignes) {
      const { error } = await supabase.rpc('enregistrer_commande_publique', {
        p_produit_id: ligne.produit_id,
        p_taille: ligne.taille,
        p_quantite: ligne.quantite,
        p_nom_client: nomClient.trim(),
        p_prenom_client: prenomClient.trim(),
        p_telephone_client: telephoneClient.trim(),
        p_piege: piege,
      })
      if (error) {
        echecs.push(ligne)
        dernierMessageErreur = error.message
      }
    }

    setEnregistrementEnCours(false)

    if (echecs.length === 0) {
      setLignes([])
      setNomClient('')
      setPrenomClient('')
      setTelephoneClient('')
      setMessageSucces(
        'Commande enregistrée ✓ — un(e) responsable du club te recontactera.'
      )
    } else if (echecs.length === lignes.length) {
      setErreurEnvoi(
        dernierMessageErreur || "L'enregistrement a échoué. Réessaie."
      )
    } else {
      setLignes(echecs)
      setErreurEnvoi(
        `${lignes.length - echecs.length} article(s) enregistré(s), ${echecs.length} en échec — ${dernierMessageErreur || 'réessaie pour l\'article restant.'}`
      )
    }
  }

  if (erreurSession) {
    return (
      <div className="login-ecran">
        <div className="login-carte">
          <h1>Connexion impossible</h1>
          <p className="erreur">{erreurSession}</p>
        </div>
      </div>
    )
  }

  if (!pret) {
    return <div className="chargement">Chargement…</div>
  }

  return (
    <div className="app">
      <header className="entete">
        <div className="entete-titre">
          <img src="/logo.png" alt="" className="logo-entete" />
          Boutique HCAT — commander un article
        </div>
      </header>

      <main className="contenu">
        <div className="bloc">
          <p style={{ color: 'var(--texte-clair)' }}>
            Pour un article qui n'est pas disponible tout de suite (taille
            épuisée, article pas sorti à ce match…) : note ta demande
            ci-dessous, un(e) responsable du club te recontactera.
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
          </div>

          {/* Piège à robots : laissé invisible pour un visiteur humain. */}
          <div
            style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}
            aria-hidden="true"
          >
            <label htmlFor="site_internet">Laisser ce champ vide</label>
            <input
              id="site_internet"
              name="site_internet"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={piege}
              onChange={(e) => setPiege(e.target.value)}
            />
          </div>

          <h3 style={{ marginBottom: 10 }}>Article souhaité</h3>

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

          {chargementProduits && <p className="chargement">Chargement des articles…</p>}
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
            {enregistrementEnCours ? 'Enregistrement…' : 'Enregistrer ma demande'}
          </button>
        </div>

        {produitOuvert && (
          <CommandeAjoutModal
            produit={produitOuvert}
            onValider={ajouterLigne}
            onFermer={() => setProduitOuvert(null)}
          />
        )}
      </main>

      <footer className="pied-page">
        <img src="/logo-gb-kreation.png" alt="" className="logo-pied-page" />
        Site créé par GB-Kréation
      </footer>
    </div>
  )
}
