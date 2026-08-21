import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import {
  formatEuros,
  SEUIL_STOCK_BAS,
  CATEGORIES,
  categorieProduit,
  photosProduit,
} from '../constants.js'
import AjoutModal from '../components/AjoutModal.jsx'
import PaiementModal from '../components/PaiementModal.jsx'

function clePanier(produitId, taille) {
  return `${produitId}|${taille || ''}`
}

function stockTotalProduit(produit) {
  const variantes = produit.variantes_produit || []
  const connues = variantes.filter((v) => v.stock_qty !== null && v.stock_qty !== undefined)
  if (connues.length === 0) return null
  return connues.reduce((somme, v) => somme + v.stock_qty, 0)
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
  const [paiementOuvert, setPaiementOuvert] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [succes, setSucces] = useState(null)
  const [erreurVente, setErreurVente] = useState(null)
  const [tickCarrousel, setTickCarrousel] = useState(0)

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

  function ajouterAuPanier(produit, { taille, quantite }) {
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
    setProduitOuvert(null)
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
    })
    setEnregistrement(false)
    if (error) {
      setErreurVente(
        "La vente n'a pas pu être enregistrée. Vérifie ta connexion et réessaie — le panier n'a pas été vidé."
      )
      return
    }
    const resultat = Array.isArray(data) ? data[0] : data
    setPaiementOuvert(false)
    setSucces({
      mode,
      total: resultat?.total ?? total,
      monnaie: resultat?.monnaie ?? null,
    })
    setPanier([])
    chargerProduits()
  }

  const comptesParCategorie = useMemo(() => {
    const compte = { adulte: 0, enfant: 0, goodies: 0 }
    produits.forEach((p) => {
      compte[categorieProduit(p)] += 1
    })
    return compte
  }, [produits])

  const produitsAffiches = useMemo(
    () => produits.filter((p) => categoriesActives[categorieProduit(p)]),
    [produits, categoriesActives]
  )

  function basculerCategorie(cle) {
    setCategoriesActives((etat) => ({ ...etat, [cle]: !etat[cle] }))
  }

  if (chargement) return <div className="chargement">Chargement des produits…</div>
  if (erreur) return <p className="erreur">{erreur}</p>

  return (
    <div className="ecran-vente">
      <aside className="filtres-categories">
        <h2>Filtrer</h2>
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
          return (
            <button
              key={produit.id}
              className="produit-bouton"
              onClick={() => setProduitOuvert(produit)}
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
                <span className="panier-ligne-detail">
                  {l.taille ? `Taille ${l.taille} · ` : ''}
                  {formatEuros(l.prix_unitaire)} × {l.quantite} ={' '}
                  {formatEuros(l.prix_unitaire * l.quantite)}
                </span>
              </div>
              <div className="panier-ligne-actions">
                <div className="pas-a-pas">
                  <button onClick={() => modifierQuantite(l.cle, -1)}>−</button>
                  <span>{l.quantite}</span>
                  <button onClick={() => modifierQuantite(l.cle, 1)}>+</button>
                </div>
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
              <button className="bouton-principal" onClick={() => setSucces(null)}>
                Nouvelle vente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

