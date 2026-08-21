import { useMemo, useState } from 'react'
import { formatEuros, taillesPourJeu, SEUIL_STOCK_BAS, photosProduit } from '../constants.js'

// Modale d'ajout au panier : demande la taille (si nécessaire) puis la quantité.
export default function AjoutModal({ produit, onValider, onValiderEtPayer, onFermer }) {
  const tailles = useMemo(
    () => (produit.necessite_taille ? taillesPourJeu(produit.jeu_tailles) : []),
    [produit]
  )
  const photos = useMemo(() => photosProduit(produit), [produit])
  const [indexPhoto, setIndexPhoto] = useState(0)
  const [taille, setTaille] = useState(tailles.length === 1 ? tailles[0] : null)
  const [quantite, setQuantite] = useState(1)

  function stockPourTaille(t) {
    const variante = (produit.variantes_produit || []).find(
      (v) => (v.taille || null) === (t || null)
    )
    return variante ? variante.stock_qty : null
  }

  const stockDisponible = stockPourTaille(taille)
  const attenteTaille = produit.necessite_taille && !taille

  function valider() {
    if (attenteTaille) return
    onValider({ taille, quantite })
  }

  function validerEtPayer() {
    if (attenteTaille) return
    onValiderEtPayer({ taille, quantite })
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <div className="modale modale-produit" onClick={(e) => e.stopPropagation()}>
        <h2>{produit.nom}</h2>
        <p style={{ color: 'var(--texte-clair)' }}>
          {formatEuros(produit.prix)} / unité
        </p>

        <div className="ajout-corps">
          <div className="ajout-photo-col">
            <div
              className="produit-image galerie-photo"
              onClick={() =>
                photos.length > 1 &&
                setIndexPhoto((i) => (i + 1) % photos.length)
              }
            >
              {photos.length ? <img src={photos[indexPhoto]} alt={produit.nom} /> : '🛍️'}
            </div>
            {photos.length > 1 && (
              <div className="galerie-points">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`galerie-point${i === indexPhoto ? ' actif' : ''}`}
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => setIndexPhoto(i)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="ajout-choix-col">
            {produit.necessite_taille && (
              <>
                <p>
                  <strong>Taille</strong>
                </p>
                <div className="choix-tailles">
                  {tailles.map((t) => {
                    const stock = stockPourTaille(t)
                    const rupture = stock !== null && stock <= 0
                    const bas = stock !== null && stock > 0 && stock <= SEUIL_STOCK_BAS
                    const classes = ['bouton-taille']
                    if (taille === t) classes.push('selectionne')
                    if (rupture) classes.push('epuise')
                    else if (bas) classes.push('stock-bas')
                    return (
                      <button
                        key={t}
                        type="button"
                        className={classes.join(' ')}
                        onClick={() => setTaille(t)}
                      >
                        <span className="taille-label">{t}</span>
                        {stock !== null && (
                          <span className="taille-stock">
                            {rupture ? 'Rupture' : stock}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {tailles.some((t) => {
                  const s = stockPourTaille(t)
                  return s !== null && s <= 0
                }) && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--texte-clair)', textAlign: 'center' }}>
                    Les tailles grisées sont annoncées à 0 en stock — encore
                    sélectionnables si tu sais qu'il en reste physiquement.
                  </p>
                )}
              </>
            )}

            {!attenteTaille && (
              <>
                {stockDisponible !== null && (
                  <p
                    style={{
                      textAlign: 'center',
                      color:
                        stockDisponible <= 0
                          ? 'var(--rouge)'
                          : stockDisponible <= SEUIL_STOCK_BAS
                          ? 'var(--orange)'
                          : 'var(--texte-clair)',
                    }}
                  >
                    {stockDisponible <= 0
                      ? 'Stock annoncé à 0 — vérifie physiquement avant de vendre'
                      : `Stock restant : ${stockDisponible}`}
                  </p>
                )}

                <div className="quantite-zone">
                  <button
                    onClick={() => setQuantite((q) => Math.max(1, q - 1))}
                  >
                    −
                  </button>
                  <span className="quantite-valeur">{quantite}</span>
                  <button onClick={() => setQuantite((q) => q + 1)}>+</button>
                </div>

                <p style={{ textAlign: 'center', fontWeight: 700 }}>
                  Sous-total : {formatEuros(produit.prix * quantite)}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="modale-actions">
          <button className="bouton-secondaire" onClick={onFermer}>
            Annuler
          </button>
          <button
            className="bouton-principal"
            disabled={attenteTaille}
            onClick={valider}
          >
            Ajouter au panier
          </button>
        </div>
        <button
          className="bouton-payer-maintenant"
          disabled={attenteTaille}
          onClick={validerEtPayer}
        >
          ⚡ Payer maintenant
        </button>
      </div>
    </div>
  )
}

