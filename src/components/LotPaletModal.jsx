import { useState } from 'react'
import { formatEuros, comparerTailles } from '../constants.js'
import { useFermetureRetour } from '../lib/useFermetureRetour.js'

const MAX_ARTICLES = 3

// Modale « Offrir un lot » (jeu du palet, responsables uniquement, une fois
// par match) : d'abord le choix de 1 à 3 articles distincts du catalogue (1
// exemplaire chacun — pas de quantité ajustable), puis confirmation par code
// PIN responsable, sur le même modèle que les autres actions sensibles de
// l'appli (suppression de vente, purge des demandes…).
export default function LotPaletModal({
  produitsDisponibles,
  matchLabel,
  onValider,
  onFermer,
  enCours,
  erreur,
}) {
  const [etape, setEtape] = useState('choix') // 'choix' | 'pin'
  const [selection, setSelection] = useState([])
  const [pin, setPin] = useState('')

  useFermetureRetour(true, () => {
    if (enCours) return
    if (etape === 'pin') setEtape('choix')
    else onFermer()
  })

  function estSelectionne(produitId) {
    return selection.some((s) => s.produit_id === produitId)
  }

  function basculerArticle(produit) {
    setSelection((lignes) => {
      if (lignes.some((l) => l.produit_id === produit.id)) {
        return lignes.filter((l) => l.produit_id !== produit.id)
      }
      if (lignes.length >= MAX_ARTICLES) return lignes
      return [
        ...lignes,
        {
          produit_id: produit.id,
          nom: produit.nom,
          necessite_taille: produit.necessite_taille,
          taille: null,
        },
      ]
    })
  }

  function choisirTaille(produitId, taille) {
    setSelection((lignes) =>
      lignes.map((l) => (l.produit_id === produitId ? { ...l, taille } : l))
    )
  }

  const selectionComplete =
    selection.length > 0 &&
    selection.length <= MAX_ARTICLES &&
    selection.every((l) => !l.necessite_taille || l.taille)

  const pinValide = /^\d{4}$/.test(pin)

  function passerAuPin() {
    if (!selectionComplete) return
    setEtape('pin')
  }

  function confirmer() {
    if (!pinValide) return
    onValider(selection, pin)
  }

  return (
    <div className="fond-modale" onClick={enCours ? undefined : onFermer}>
      <div className="modale modale-produit" onClick={(e) => e.stopPropagation()}>
        {etape === 'choix' ? (
          <>
            <h2>🏆 Offrir un lot</h2>
            <p style={{ color: 'var(--texte-clair)' }}>
              Choisis entre 1 et 3 articles différents à faire gagner (1 exemplaire
              chacun){matchLabel ? ` — ${matchLabel}` : ''}. Le stock sera décrémenté
              comme pour une vente, mais ça n'entre jamais dans la caisse.
            </p>

            <div className="grille-choix-lot">
              {produitsDisponibles.map((produit) => {
                const selectionne = estSelectionne(produit.id)
                const entree = selection.find((l) => l.produit_id === produit.id)
                const tailles = produit.necessite_taille
                  ? (produit.variantes_produit || [])
                      .map((v) => v.taille)
                      .filter(Boolean)
                      .sort(comparerTailles)
                  : []
                return (
                  <div
                    key={produit.id}
                    className={`carte-choix-lot${selectionne ? ' selectionne' : ''}`}
                  >
                    <button
                      type="button"
                      className="carte-choix-lot-bouton"
                      disabled={!selectionne && selection.length >= MAX_ARTICLES}
                      onClick={() => basculerArticle(produit)}
                    >
                      <span className="carte-choix-lot-nom">{produit.nom}</span>
                      <span className="carte-choix-lot-prix">{formatEuros(produit.prix)}</span>
                    </button>
                    {selectionne && produit.necessite_taille && (
                      <div className="choix-tailles">
                        {tailles.map((t) => {
                          const variante = (produit.variantes_produit || []).find(
                            (v) => v.taille === t
                          )
                          const stock = variante ? variante.stock_qty : null
                          const rupture = stock !== null && stock !== undefined && stock <= 0
                          return (
                            <button
                              key={t}
                              type="button"
                              className={
                                'bouton-taille' +
                                (entree?.taille === t ? ' selectionne' : '') +
                                (rupture ? ' epuise' : '')
                              }
                              onClick={() => choisirTaille(produit.id, t)}
                            >
                              <span className="taille-label">{t}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {produitsDisponibles.length === 0 && (
                <p className="panier-vide">Aucun article en stock à offrir pour l'instant</p>
              )}
            </div>

            <div className="modale-actions">
              <button className="bouton-secondaire" onClick={onFermer}>
                Annuler
              </button>
              <button
                className="bouton-principal"
                disabled={!selectionComplete}
                onClick={passerAuPin}
              >
                Continuer ({selection.length}/{MAX_ARTICLES})
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>🏆 Confirmer le lot</h2>
            <p style={{ color: 'var(--texte-clair)' }}>
              {selection
                .map((l) => l.nom + (l.taille ? ` (${l.taille})` : ''))
                .join(' · ')}
            </p>
            <p>
              Cette action retire ces articles du stock et ne peut être faite
              qu'une fois par match. Entre le code PIN d'un responsable pour
              confirmer.
            </p>
            <div className="champ">
              <label>Code PIN responsable</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
              />
            </div>
            {erreur && <p className="erreur">{erreur}</p>}
            <div className="modale-actions">
              <button
                className="bouton-secondaire"
                onClick={() => setEtape('choix')}
                disabled={enCours}
              >
                Retour
              </button>
              <button
                className="bouton-principal"
                disabled={enCours || !pinValide}
                onClick={confirmer}
              >
                {enCours ? 'Enregistrement…' : 'Offrir le lot'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
