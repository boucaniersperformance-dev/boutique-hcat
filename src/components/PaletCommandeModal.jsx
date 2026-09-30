import { useState } from 'react'
import { formatEuros } from '../constants.js'
import { useFermetureRetour } from '../lib/useFermetureRetour.js'

const NUMERO_PALET_MAX = 80
const CASES_PALET = Array.from({ length: NUMERO_PALET_MAX + 1 }, (_, n) => n)

function deuxChiffres(n) {
  return String(n).padStart(2, '0')
}

// Modale de commande « Jeux du palet » depuis la page Vente : même
// tableau de numéros que l'onglet dédié (00 à 80), pour pouvoir
// l'ajouter au panier avec le reste des articles et tout encaisser en
// une seule fois.
export default function PaletCommandeModal({
  produit,
  numerosDejaVendus,
  numerosDansLePanier,
  onValider,
  onValiderEtPayer,
  onFermer,
}) {
  useFermetureRetour(true, onFermer)
  const [numero, setNumero] = useState('')
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')

  const numeroInt = numero !== '' ? parseInt(numero, 10) : null
  const complet = numeroInt !== null && nom.trim() !== ''

  function choisirNumero(n) {
    setNumero((actuel) => (actuel !== '' && parseInt(actuel, 10) === n ? '' : String(n)))
  }

  function details() {
    return {
      numero: numeroInt,
      nom: nom.trim(),
      telephone: telephone.trim(),
    }
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <div className="modale modale-large" onClick={(e) => e.stopPropagation()}>
        <h2>{produit.nom}</h2>
        <p style={{ color: 'var(--texte-clair)' }}>
          {formatEuros(produit.prix)} le numéro, de 00 à {deuxChiffres(NUMERO_PALET_MAX)}.
        </p>

        <div className="grille-palets-legende">
          <span>
            <i className="pastille-legende" /> Disponible
          </span>
          <span>
            <i className="pastille-legende en-panier" /> Dans le panier
          </span>
          <span>
            <i className="pastille-legende vendu" /> Déjà vendu aujourd'hui
          </span>
        </div>

        <div className="grille-palets">
          {CASES_PALET.map((n) => {
            const vendu = numerosDejaVendus.has(n)
            const enPanier = numerosDansLePanier.has(n)
            const selectionne = numeroInt === n
            const indisponible = vendu || enPanier
            return (
              <button
                key={n}
                type="button"
                className={
                  'case-palet' +
                  (selectionne ? ' selectionne' : '') +
                  (vendu ? ' vendu' : '') +
                  (enPanier ? ' en-panier' : '')
                }
                disabled={indisponible}
                onClick={() => choisirNumero(n)}
              >
                {deuxChiffres(n)}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 16 }}>
          <div className="champ">
            <label>
              Nom et prénom {numeroInt !== null && `(numéro ${deuxChiffres(numeroInt)})`}
            </label>
            <input
              value={nom}
              autoComplete="off"
              placeholder="Ex : Jean Dupont"
              onChange={(e) => setNom(e.target.value)}
            />
          </div>
          <div className="champ">
            <label>Téléphone (optionnel)</label>
            <input
              value={telephone}
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0612345678"
              onChange={(e) => setTelephone(e.target.value)}
            />
          </div>
        </div>

        <div className="modale-actions">
          <button className="bouton-secondaire" onClick={onFermer}>
            Annuler
          </button>
          <button className="bouton-principal" disabled={!complet} onClick={() => onValider(details())}>
            Ajouter au panier
          </button>
        </div>
        <button
          className="bouton-payer-maintenant"
          disabled={!complet}
          onClick={() => onValiderEtPayer(details())}
        >
          ⚡ Payer maintenant
        </button>
      </div>
    </div>
  )
}
