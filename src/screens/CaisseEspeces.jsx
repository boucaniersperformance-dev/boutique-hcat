import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatEuros } from '../constants.js'

function aujourdHui() {
  return new Date().toISOString().slice(0, 10)
}

const PIECES = [
  { cle: 'pieces_10c', label: '10 centimes', valeur: 0.1 },
  { cle: 'pieces_20c', label: '20 centimes', valeur: 0.2 },
  { cle: 'pieces_50c', label: '50 centimes', valeur: 0.5 },
  { cle: 'pieces_1e', label: '1 €', valeur: 1 },
  { cle: 'pieces_2e', label: '2 €', valeur: 2 },
]

const BILLETS = [
  { cle: 'billets_5', label: '5 €', valeur: 5 },
  { cle: 'billets_10', label: '10 €', valeur: 10 },
  { cle: 'billets_20', label: '20 €', valeur: 20 },
  { cle: 'billets_50', label: '50 €', valeur: 50 },
  { cle: 'billets_100', label: '100 €', valeur: 100 },
]

const TOUTES_DENOMINATIONS = [...PIECES, ...BILLETS]

function quantitesVides() {
  return Object.fromEntries(TOUTES_DENOMINATIONS.map((d) => [d.cle, 0]))
}

export default function CaisseEspeces({ benevole }) {
  const [jour, setJour] = useState(aujourdHui)
  const [fondDeCaisse, setFondDeCaisse] = useState('')
  const [quantites, setQuantites] = useState(quantitesVides)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false)
  const [message, setMessage] = useState(null)

  // Recharge le comptage existant (s'il y en a un) à chaque changement de
  // date — pour pouvoir corriger un jour déjà enregistré en rouvrant
  // simplement la page sur cette date.
  useEffect(() => {
    let annule = false
    setChargement(true)
    setErreur(null)
    setMessage(null)
    supabase
      .rpc('obtenir_comptage_caisse', { p_benevole_id: benevole.id, p_jour: jour })
      .then(({ data, error }) => {
        if (annule) return
        if (error) {
          setErreur('Impossible de charger le comptage de ce jour.')
          setChargement(false)
          return
        }
        const comptage = (data || [])[0]
        if (comptage) {
          setFondDeCaisse(String(comptage.fond_de_caisse))
          setQuantites({
            pieces_10c: comptage.pieces_10c,
            pieces_20c: comptage.pieces_20c,
            pieces_50c: comptage.pieces_50c,
            pieces_1e: comptage.pieces_1e,
            pieces_2e: comptage.pieces_2e,
            billets_5: comptage.billets_5,
            billets_10: comptage.billets_10,
            billets_20: comptage.billets_20,
            billets_50: comptage.billets_50,
            billets_100: comptage.billets_100,
          })
        } else {
          setFondDeCaisse('')
          setQuantites(quantitesVides())
        }
        setChargement(false)
      })
    return () => {
      annule = true
    }
  }, [jour, benevole.id])

  const totalCompte = useMemo(
    () => TOUTES_DENOMINATIONS.reduce((somme, d) => somme + (quantites[d.cle] || 0) * d.valeur, 0),
    [quantites]
  )
  const especesGagnees = totalCompte - (parseFloat(fondDeCaisse) || 0)

  function changerQuantite(cle, valeurTexte) {
    const valeur = Math.max(0, parseInt(valeurTexte, 10) || 0)
    setQuantites((q) => ({ ...q, [cle]: valeur }))
  }

  async function enregistrer() {
    setEnregistrementEnCours(true)
    setErreur(null)
    setMessage(null)
    const { error } = await supabase.rpc('enregistrer_comptage_caisse', {
      p_benevole_id: benevole.id,
      p_jour: jour,
      p_fond_de_caisse: parseFloat(fondDeCaisse) || 0,
      p_pieces_10c: quantites.pieces_10c,
      p_pieces_20c: quantites.pieces_20c,
      p_pieces_50c: quantites.pieces_50c,
      p_pieces_1e: quantites.pieces_1e,
      p_pieces_2e: quantites.pieces_2e,
      p_billets_5: quantites.billets_5,
      p_billets_10: quantites.billets_10,
      p_billets_20: quantites.billets_20,
      p_billets_50: quantites.billets_50,
      p_billets_100: quantites.billets_100,
    })
    setEnregistrementEnCours(false)
    if (error) {
      setErreur("L'enregistrement a échoué. Réessaie.")
      return
    }
    setMessage('Comptage enregistré ✓')
  }

  return (
    <div className="bloc">
      <h2>Caisse Espèces</h2>
      <p style={{ color: 'var(--texte-clair)' }}>
        Compte les pièces et billets présents dans la caisse, indique le
        fond de caisse (la somme de départ pour faire la monnaie), et
        enregistre. Ce comptage apparaîtra dans l'export Excel de
        l'Historique, pour vérifier que les espèces comptées correspondent
        bien aux ventes enregistrées.
      </p>

      <div className="champ" style={{ maxWidth: 220 }}>
        <label>Jour compté</label>
        <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} />
      </div>

      {chargement ? (
        <p className="chargement">Chargement…</p>
      ) : (
        <>
          <div className="champ" style={{ maxWidth: 220 }}>
            <label>Fond de caisse (€)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={fondDeCaisse}
              onChange={(e) => setFondDeCaisse(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginTop: 16 }}>
            <div>
              <h3 style={{ marginBottom: 8 }}>Pièces</h3>
              {PIECES.map((d) => (
                <div
                  key={d.cle}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                >
                  <span style={{ width: 90 }}>{d.label}</span>
                  <input
                    type="number"
                    min="0"
                    style={{ width: 80 }}
                    value={quantites[d.cle]}
                    onChange={(e) => changerQuantite(d.cle, e.target.value)}
                  />
                  <span style={{ color: 'var(--texte-clair)', width: 90, textAlign: 'right' }}>
                    {formatEuros((quantites[d.cle] || 0) * d.valeur)}
                  </span>
                </div>
              ))}
            </div>

            <div>
              <h3 style={{ marginBottom: 8 }}>Billets</h3>
              {BILLETS.map((d) => (
                <div
                  key={d.cle}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                >
                  <span style={{ width: 90 }}>{d.label}</span>
                  <input
                    type="number"
                    min="0"
                    style={{ width: 80 }}
                    value={quantites[d.cle]}
                    onChange={(e) => changerQuantite(d.cle, e.target.value)}
                  />
                  <span style={{ color: 'var(--texte-clair)', width: 90, textAlign: 'right' }}>
                    {formatEuros((quantites[d.cle] || 0) * d.valeur)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="totaux-historique"
            style={{ marginTop: 20 }}
          >
            <span className="carte-total">Total compté : {formatEuros(totalCompte)}</span>
            <span className="carte-total">
              Espèces gagnées (compté − fond de caisse) : {formatEuros(especesGagnees)}
            </span>
          </div>

          {erreur && <p className="erreur">{erreur}</p>}
          {message && <p style={{ color: 'var(--vert)', fontWeight: 700 }}>{message}</p>}

          <button
            className="bouton-principal"
            style={{ marginTop: 16 }}
            onClick={enregistrer}
            disabled={enregistrementEnCours}
          >
            {enregistrementEnCours ? 'Enregistrement…' : 'Enregistrer le comptage'}
          </button>
        </>
      )}
    </div>
  )
}
