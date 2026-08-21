import { useMemo, useState } from 'react'
import { formatEuros } from '../constants.js'

export default function PaiementModal({ total, onValider, onFermer, enCours }) {
  const [mode, setMode] = useState(null)
  const [montantRecuStr, setMontantRecuStr] = useState('')

  const montantRecu = parseFloat(montantRecuStr.replace(',', '.'))
  const montantRecuValide = !Number.isNaN(montantRecu) && montantRecu >= 0
  const monnaie = montantRecuValide ? Math.round((montantRecu - total) * 100) / 100 : null

  const peutValider = useMemo(() => {
    if (enCours) return false
    if (mode === 'cb') return true
    if (mode === 'especes') return montantRecuValide && monnaie >= 0
    return false
  }, [mode, montantRecuValide, monnaie, enCours])

  function valider() {
    if (!peutValider) return
    onValider(mode, mode === 'especes' ? montantRecu : null)
  }

  return (
    <div className="fond-modale" onClick={enCours ? undefined : onFermer}>
      <div className="modale" onClick={(e) => e.stopPropagation()}>
        <h2>Encaissement</h2>
        <p style={{ textAlign: 'center', fontSize: '1.6rem', fontWeight: 800, color: 'var(--bleu)' }}>
          {formatEuros(total)}
        </p>

        <div className="choix-paiement">
          <button
            className={mode === 'cb' ? 'selectionne' : ''}
            onClick={() => setMode('cb')}
          >
            💳 Carte bancaire
          </button>
          <button
            className={mode === 'especes' ? 'selectionne' : ''}
            onClick={() => setMode('especes')}
          >
            💶 Espèces
          </button>
        </div>

        {mode === 'especes' && (
          <>
            <div className="champ">
              <label>Montant donné par le client (€)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                autoFocus
                value={montantRecuStr}
                onChange={(e) => setMontantRecuStr(e.target.value)}
                placeholder="0.00"
              />
            </div>
            {montantRecuValide && (
              <div className="recap-monnaie">
                <div>Monnaie à rendre</div>
                <div className={`montant${monnaie < 0 ? ' negatif' : ''}`}>
                  {monnaie < 0
                    ? `Manque ${formatEuros(Math.abs(monnaie))}`
                    : formatEuros(monnaie)}
                </div>
              </div>
            )}
          </>
        )}

        <div className="modale-actions">
          <button className="bouton-secondaire" onClick={onFermer} disabled={enCours}>
            Annuler
          </button>
          <button
            className="bouton-principal"
            disabled={!peutValider}
            onClick={valider}
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer la vente'}
          </button>
        </div>
      </div>
    </div>
  )
}
