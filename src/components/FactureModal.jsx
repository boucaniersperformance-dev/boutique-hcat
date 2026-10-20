import { useState } from 'react'
import { formatEuros } from '../constants.js'
import { useFermetureRetour } from '../lib/useFermetureRetour.js'

// Modale « Générer une facture » (écran Historique) : la vente au
// comptoir n'a pas d'identité acheteur enregistrée, on la demande donc au
// moment de générer la facture. Si une facture existe déjà pour cette
// vente, les champs sont pré-remplis avec l'acheteur déjà saisi (pour
// corriger une erreur de frappe sans changer le numéro déjà attribué).
export default function FactureModal({ vente, onValider, onFermer, enCours, erreur }) {
  useFermetureRetour(true, () => {
    if (!enCours) onFermer()
  })

  const [nomAcheteur, setNomAcheteur] = useState(vente.nom_acheteur_facture || '')
  const [adresseAcheteur, setAdresseAcheteur] = useState(vente.adresse_acheteur_facture || '')

  const peutValider = nomAcheteur.trim() !== '' && !enCours

  function valider() {
    if (!peutValider) return
    onValider(nomAcheteur.trim(), adresseAcheteur.trim() || null)
  }

  return (
    <div className="fond-modale" onClick={enCours ? undefined : onFermer}>
      <div className="modale" onClick={(e) => e.stopPropagation()}>
        <h2>{vente.numero_facture ? 'Modifier la facture' : 'Générer une facture'}</h2>
        <p style={{ color: 'var(--texte-clair)' }}>
          Vente du {new Date(vente.cree_le).toLocaleDateString('fr-FR')} — {formatEuros(vente.total)}
        </p>
        {vente.numero_facture && (
          <p style={{ color: 'var(--texte-clair)', fontSize: '0.85rem' }}>
            Facture déjà émise : <strong>{vente.numero_facture}</strong>. La corriger ci-dessous
            garde le même numéro.
          </p>
        )}

        <div className="champ">
          <label>Nom de l'acheteur *</label>
          <input
            type="text"
            autoFocus
            value={nomAcheteur}
            onChange={(e) => setNomAcheteur(e.target.value)}
            placeholder="Jean Dupont"
          />
        </div>
        <div className="champ">
          <label>Adresse (facultatif)</label>
          <input
            type="text"
            value={adresseAcheteur}
            onChange={(e) => setAdresseAcheteur(e.target.value)}
            placeholder="12 rue des Oliviers, 83000 Toulon"
          />
        </div>

        {erreur && <p className="erreur">{erreur}</p>}

        <div className="modale-actions">
          <button className="bouton-secondaire" onClick={onFermer} disabled={enCours}>
            Annuler
          </button>
          <button className="bouton-principal" disabled={!peutValider} onClick={valider}>
            {enCours ? 'Génération…' : 'Générer la facture (PDF)'}
          </button>
        </div>
      </div>
    </div>
  )
}
