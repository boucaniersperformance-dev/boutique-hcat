import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import {
  formatEuros,
  SEUIL_STOCK_BAS,
  CATEGORIES,
  categorieProduit,
  photosProduit,
  stockTotalProduit,
  comparerTailles,
} from '../constants.js'
import AjoutModal from '../components/AjoutModal.jsx'
import PaiementModal from '../components/PaiementModal.jsx'
import EncartMatch from '../components/EncartMatch.jsx'
import GourdeCommandeModal from '../components/GourdeCommandeModal.jsx'
import { estProduitGourde, trouverPose } from '../components/GourdePerso/poses'

function clePanier(produitId, taille) {
  return `${produitId}|${taille || ''}`
}

// Un produit dont tout le stock suivi est à 0 est considéré épuisé : on ne
// l'affiche plus dans la grille de vente pour ne pas la surcharger inutilement
// (il redevient visible automatiquement dès qu'un responsable remet du
// stock). Un produit dont le stock n'est pas suivi (null) reste affiché.
function produitEnStock(produit) {
  const stock = stockTotalProduit(produit)
  return stock === null || stock > 0
}

// Tailles à afficher sous le nom du produit, pour éviter d'avoir à
// l'ouvrir juste pour vérifier ce qui est disponible : uniquement celles
// encore en stock (stock non suivi = considéré disponible), triées dans
// l'ordre habituel (XS...XXL puis tranches d'âge / âges précis).
function taillesDisponibles(produit) {
  return (produit.variantes_produit || [])
    .filter((v) => v.taille && (v.stock_qty === null || v.stock_qty === undefined || v.stock_qty > 0))
    .map((v) => v.taille)
    .sort(comparerTailles)
}

const INTERVALLE_CARROUSEL_MS = 3000

export default function Vente({ benevole }) {
  const [produits, setProduits] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [panier, setPanier] = useState([])
  const [categoriesActives, setCategoriesActives] = useState(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c.cle, true]))
  )
  const [produitOuvert, setProduitOuvert] = useState(null)
  const [gourdeOuverte, setGourdeOuverte] = useState(null)
  const [paiementOuvert, setPaiementOuvert] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [succes, setSucces] = useState(null)
  const [erreurVente, setErreurVente] = useState(null)
  const [tickCarrousel, setTickCarrousel] = useState(0)
  const [matchCourant, setMatchCourant] = useState(null)

  // Un seul minuteur partagé par toutes les vignettes (plutôt qu'un par
  // produit) fait avancer le carrousel des photos face/dos toutes les 3s.
  useEffect(() => {
    const id = setInterval(() => setTickCarrousel((t) => t + 1), INTERVALLE_CARROUSEL_MS)
    return () => clearInterval(id)
  }, [])

  const chargerProduits = useCallback(async () => {
    setErreur(null)
    const { data, error } = await supabase
      .from('produits')
      .select('*, variantes_produit(*), produit_photos(*)')
      .eq('actif', true)
      .order('ordre', { ascending: true })
    if (error) {
      setErreur(
        "Impossible de charger les produits. Vérifie que le fichier SQL a bien été exécuté dans Supabase."
      )
    } else {
      setProduits(data || [])
    }
    setChargement(false)
  }, [])

  useEffect(() => {
    chargerProduits()
  }, [chargerProduits])

  function ajouterLigneAuPanier(produit, { taille, quantite }) {
    const variante = (produit.variantes_produit || []).find(
      (v) => (v.taille || null) === (taille || null)
    )
    const cle = clePanier(produit.id, taille)
    setPanier((lignes) => {
      const existante = lignes.find((l) => l.cle === cle)
      if (existante) {
        return lignes.map((l) =>
          l.cle === cle ? { ...l, quantite: l.quantite + quantite } : l
        )
      }
      return [
        ...lignes,
        {
          cle,
          produit_id: produit.id,
          variante_id: variante ? variante.id : null,
          nom: produit.nom,
          taille: taille || null,
          quantite,
          prix_unitaire: produit.prix,
        },
      ]
    })
  }

  function ajouterAuPanier(produit, choix) {
    ajouterLigneAuPanier(produit, choix)
    setProduitOuvert(null)
  }

  // Ajoute l'article puis ouvre directement le paiement, pour gagner du
  // temps quand la personne n'achète qu'un seul article.
  function ajouterEtPayer(produit, choix) {
    ajouterLigneAuPanier(produit, choix)
    setProduitOuvert(null)
    setPaiementOuvert(true)
  }

  // Commande « Custom Gourde » : une ligne de panier par enfant, avec sa
  // personnalisation (enregistrée dans commandes_gourde après l'encaissement).
  function ajouterCommandeGourde(produit, details, payer) {
    const variante = (produit.variantes_produit || []).find((v) => !v.taille)
    setPanier((lignes) => [
      ...lignes,
      {
        cle: `gourde|${Date.now()}|${details.prenom}`,
        produit_id: produit.id,
        variante_id: variante ? variante.id : null,
        nom: produit.nom,
        taille: null,
        quantite: 1,
        prix_unitaire: produit.prix,
        gourde: details,
      },
    ])
    setGourdeOuverte(null)
    if (payer) setPaiementOuvert(true)
  }

  function ouvrirProduit(produit) {
    if (estProduitGourde(produit)) setGourdeOuverte(produit)
    else setProduitOuvert(produit)
  }

  function modifierQuantite(cle, delta) {
    setPanier((lignes) =>
      lignes
        .map((l) => (l.cle === cle ? { ...l, quantite: l.quantite + delta } : l))
        .filter((l) => l.quantite > 0)
    )
  }

  function supprimerLigne(cle) {
    setPanier((lignes) => lignes.filter((l) => l.cle !== cle))
  }

  const total = panier.reduce((s, l) => s + l.prix_unitaire * l.quantite, 0)

  async function validerVente(mode, montantRecu) {
    setEnregistrement(true)
    setErreurVente(null)
    const lignes = panier.map((l) => ({
      produit_id: l.produit_id,
      taille: l.taille,
      quantite: l.quantite,
    }))
    const { data, error } = await supabase.rpc('enregistrer_vente', {
      p_benevole_id: benevole.id,
      p_mode_paiement: mode,
      p_montant_recu: montantRecu,
      p_lignes: lignes,
      p_match_id: matchCourant?.id ?? null,
    })
    setEnregistrement(false)
    if (error) {
      setErreurVente(
        "La vente n'a pas pu être enregistrée. Vérifie ta connexion et réessaie — le panier n'a pas été vidé."
      )
      return
    }
    const resultat = Array.isArray(data) ? data[0] : data

    // Personnalisations des gourdes, rattachées à la vente qui vient d'être
    // enregistrée. En cas d'échec, la vente reste valide : on affiche les
    // informations à noter à la main.
    const commandesGourde = panier.filter((l) => l.gourde).map((l) => l.gourde)
    const gourdesEnEchec = []
    for (const g of commandesGourde) {
      const { error: errGourde } = await supabase.rpc('enregistrer_commande_gourde', {
        p_benevole_id: benevole.id,
        p_vente_id: resultat?.vente_id ?? null,
        p_prenom: g.prenom,
        p_numero: g.numero || null,
        p_illustration: g.illustration,
        p_contact_nom: g.contact_nom,
        p_contact_tel: g.contact_tel,
      })
      if (errGourde) gourdesEnEchec.push(g)
    }

    setPaiementOuvert(false)
    setSucces({
      mode,
      total: resultat?.total ?? total,
      monnaie: resultat?.monnaie ?? null,
      gourdes: commandesGourde.length,
      gourdesEnEchec,
    })
    setPanier([])
    chargerProduits()
  }

  const comptesParCategorie = useMemo(() => {
    const compte = { adulte: 0, enfant: 0, goodies: 0 }
    produits.filter(produitEnStock).forEach((p) => {
      compte[categorieProduit(p)] += 1
    })
    return compte
  }, [produits])

  const produitsAffiches = useMemo(
    () =>
      produits.filter(
        (p) => produitEnStock(p) && categoriesActives[categorieProduit(p)]
      ),
    [produits, categoriesActives]
  )

  function basculerCategorie(cle) {
    setCategoriesActives((etat) => ({ ...etat, [cle]: !etat[cle] }))
  }

  const toutesCategoriesActives = CATEGORIES.every((c) => categoriesActives[c.cle])

  function basculerToutesCategories() {
    const nouvelEtat = !toutesCategoriesActives
    setCategoriesActives(
      Object.fromEntries(CATEGORIES.map((c) => [c.cle, nouvelEtat]))
    )
  }

  if (chargement) return <div className="chargement">Chargement des produits…</div>
  if (erreur) return <p className="erreur">{erreur}</p>

  return (
    <>
      <EncartMatch benevole={benevole} produits={produits} onMatchChange={setMatchCourant} />
      <div className="ecran-vente">
        <aside className="filtres-categories">
          <h2>Filtrer</h2>
          <button
            type="button"
            className="bouton-tout-filtres"
            onClick={basculerToutesCategories}
          >
            {toutesCategoriesActives ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
          {CATEGORIES.map((cat) => (
            <label className="filtre-case" key={cat.cle}>
              <input
                type="checkbox"
                checked={categoriesActives[cat.cle]}
                onChange={() => basculerCategorie(cat.cle)}
              />
              {cat.label}
              <span className="compte">{comptesParCategorie[cat.cle]}</span>
            </label>
          ))}
        </aside>

        <div className="grille-produits">
          {produitsAffiches.length === 0 && (
            <p className="panier-vide">Aucun article dans cette catégorie</p>
          )}
          {produitsAffiches.map((produit) => {
            const stock = stockTotalProduit(produit)
            const rupture = stock !== null && stock <= 0
            const bas = stock !== null && stock > 0 && stock <= SEUIL_STOCK_BAS
            const photos = photosProduit(produit)
            const photoActuelle = photos.length
              ? photos[tickCarrousel % photos.length]
              : null
            const tailles = produit.necessite_taille ? taillesDisponibles(produit) : []
            return (
              <button
                key={produit.id}
                className="produit-bouton"
                onClick={() => ouvrirProduit(produit)}
              >
                {!produit.prix && (
                  <span className="badge-prix-manquant">Prix à définir</span>
                )}
                {stock !== null && (
                  <span
                    className={`badge-stock${rupture ? ' rupture' : bas ? ' bas' : ''}`}
                  >
                    {rupture ? 'Rupture' : stock}
                  </span>
                )}
                <div className="produit-image">
                  {photoActuelle ? <img src={photoActuelle} alt={produit.nom} /> : '🛍️'}
                </div>
                <div className="produit-nom">{produit.nom}</div>
                {produit.necessite_taille && (
                  <div className="produit-tailles">
                    {tailles.length > 0 ? tailles.join(' · ') : 'Aucune taille en stock'}
                  </div>
                )}
                <div className="produit-prix">{formatEuros(produit.prix)}</div>
              </button>
            )
          })}
        </div>

        <aside className="panier">
          <h2>Panier</h2>
          {panier.length === 0 && <p className="panier-vide">Aucun article pour l'instant</p>}
          <div className="panier-lignes">
            {panier.map((l) => (
              <div className="panier-ligne" key={l.cle}>
                <div className="panier-ligne-info">
                  <span className="panier-ligne-nom">{l.nom}</span>
                  {l.gourde && (
                    <span className="panier-ligne-detail" style={{ fontWeight: 700, color: 'var(--bleu)' }}>
                      {l.gourde.prenom}
                      {l.gourde.numero ? ` #${l.gourde.numero}` : ''} · {trouverPose(l.gourde.illustration).nom}
                      <br />
                      Contact : {l.gourde.contact_nom} · {l.gourde.contact_tel}
                    </span>
                  )}
                  <span className="panier-ligne-detail">
                    {l.taille ? `Taille ${l.taille} · ` : ''}
                    {formatEuros(l.prix_unitaire)} × {l.quantite} ={' '}
                    {formatEuros(l.prix_unitaire * l.quantite)}
                  </span>
                </div>
                <div className="panier-ligne-actions">
                  {!l.gourde && (
                    <div className="pas-a-pas">
                      <button onClick={() => modifierQuantite(l.cle, -1)}>−</button>
                      <span>{l.quantite}</span>
                      <button onClick={() => modifierQuantite(l.cle, 1)}>+</button>
                    </div>
                  )}
                  <button className="bouton-supprimer" onClick={() => supprimerLigne(l.cle)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="panier-total">
            <span>Total</span>
            <span>{formatEuros(total)}</span>
          </div>

          {erreurVente && <p className="erreur">{erreurVente}</p>}

          <button
            className="bouton-principal"
            disabled={panier.length === 0}
            onClick={() => setPaiementOuvert(true)}
          >
            Encaisser
          </button>
        </aside>

        {produitOuvert && (
          <AjoutModal
            produit={produitOuvert}
            onFermer={() => setProduitOuvert(null)}
            onValider={(choix) => ajouterAuPanier(produitOuvert, choix)}
            onValiderEtPayer={(choix) => ajouterEtPayer(produitOuvert, choix)}
          />
        )}

        {gourdeOuverte && (
          <GourdeCommandeModal
            produit={gourdeOuverte}
            onFermer={() => setGourdeOuverte(null)}
            onValider={(details) => ajouterCommandeGourde(gourdeOuverte, details, false)}
            onValiderEtPayer={(details) => ajouterCommandeGourde(gourdeOuverte, details, true)}
          />
        )}

        {paiementOuvert && (
          <PaiementModal
            total={total}
            enCours={enregistrement}
            onFermer={() => setPaiementOuvert(false)}
            onValider={validerVente}
          />
        )}

        {succes && (
          <div className="fond-modale" onClick={() => setSucces(null)}>
            <div className="modale" onClick={(e) => e.stopPropagation()}>
              <div className="succes-ecran">
                <div className="succes-icone">✅</div>
                <h2>Vente enregistrée</h2>
                <p>Total : {formatEuros(succes.total)}</p>
                {succes.mode === 'especes' && succes.monnaie !== null && (
                  <p>Monnaie rendue : {formatEuros(succes.monnaie)}</p>
                )}
                {succes.gourdes > 0 && succes.gourdesEnEchec.length === 0 && (
                  <p>
                    🥤 {succes.gourdes} gourde{succes.gourdes > 1 ? 's' : ''} personnalisée
                    {succes.gourdes > 1 ? 's' : ''} enregistrée{succes.gourdes > 1 ? 's' : ''} : à
                    préparer depuis l'onglet Gourde.
                  </p>
                )}
                {succes.gourdesEnEchec.length > 0 && (
                  <div className="erreur" style={{ textAlign: 'left' }}>
                    <p>
                      La vente est bien enregistrée, mais la personnalisation n'a pas pu être
                      sauvegardée. Note ces informations sur papier :
                    </p>
                    {succes.gourdesEnEchec.map((g, i) => (
                      <p key={i}>
                        <b>
                          {g.prenom}
                          {g.numero ? ` #${g.numero}` : ''}
                        </b>{' '}
                        · {trouverPose(g.illustration).nom} · {g.contact_nom} · {g.contact_tel}
                      </p>
                    ))}
                  </div>
                )}
                <button className="bouton-principal" onClick={() => setSucces(null)}>
                  Nouvelle vente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

