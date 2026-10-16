import { useMemo, useState } from 'react'
import { comparerTailles, formatEuros, photosProduit } from '../constants.js'
import { useFermetureRetour } from '../lib/useFermetureRetour.js'

// Modale « Commande » : demande la taille (si nécessaire) puis la quantité
// souhaitée par le client, indépendamment du stock actuellement affiché —
// c'est tout l'intérêt de cette page : noter une demande pour un article
// pas disponible tout de suite (taille épuisée, pas sorti à ce match…).
//
// Les tailles proposées viennent des déclinaisons réellement configurées
// sur le produit (onglet Produits), jamais d'une liste figée — même règle
// que la modale d'ajout au panier de l'écran Vente.
export default function CommandeAjoutModal({ produit, onValider, onFermer }) {
  useFermetureRetour(true, onFermer)

  const tailles = useMemo(
    () =>
      produit.necessite_taille
        ? (produit.variantes_produit || [])
            .map((v) => v.taille)
            .filter(Boolean)
            .sort(comparerTailles)
        : [],
    [produit]
  )
  const photos = useMemo(() => photosProduit(produit), [produit])
  const [taille, setTaille] = useState(tailles.length === 1 ? tailles[0] : null)
  const [quantite, setQuantite] = useState(1)

  const aucuneTailleConfiguree = produit.necessite_taille && tailles.length === 0
  const attenteTaille = produit.necessite_taille && !taille

  function valider() {
    if (attenteTaille) return
    onValider({ taille, quantite })
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <div className="modale modale-produit" onClick={(e) => e.stopPropagation()}>
        <h2>{produit.nom}</h2>
        <p style={{ color: 'var(--texte-clair)' }}>{formatEuros(produit.prix)} / unité</p>

        <div className="ajout-corps">
          <div className="ajout-photo-col">
            <div className="produit-image">
              {photos.length ? <img src={photos[0]} alt={produit.nom} /> : '🛍️'}
            </div>
          </div>

          <div className="ajout-choix-col">
            {produit.necessite_taille && (
              <>
                <p>
                  <strong>Taille</strong>
                </p>
                {aucuneTailleConfiguree ? (
                  <p className="erreur">
                    Aucune taille n'est configurée pour ce produit — passe
                    d'abord par l'onglet Produits pour en ajouter une.
                  </p>
                ) : (
                  <div className="choix-tailles">
                    {tailles.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`bouton-taille${taille === t ? ' selectionne' : ''}`}
                        onClick={() => setTaille(t)}
                      >
                        <span className="taille-label">{t}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {!attenteTaille && (
              <>
                <p>
                  <strong>Quantité</strong>
                </p>
                <div className="quantite-zone">
                  <button type="button" onClick={() => setQuantite((q) => Math.max(1, q - 1))}>
                    −
                  </button>
                  <span className="quantite-valeur">{quantite}</span>
                  <button type="button" onClick={() => setQuantite((q) => q + 1)}>
                    +
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="modale-actions">
          <button className="bouton-secondaire" onClick={onFermer}>
            Annuler
          </button>
          <button className="bouton-principal" disabled={attenteTaille} onClick={valider}>
            Ajouter à la commande
          </button>
        </div>
      </div>
    </div>
  )
}
