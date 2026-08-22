import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatEuros, resumeMatch } from '../constants.js'

function aujourdHui() {
  return new Date().toISOString().slice(0, 10)
}

export default function Historique({ benevole }) {
  const [dateDebut, setDateDebut] = useState(aujourdHui())
  const [dateFin, setDateFin] = useState(aujourdHui())
  const [ventes, setVentes] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)

  const [venteASupprimer, setVenteASupprimer] = useState(null)
  const [pinConfirmation, setPinConfirmation] = useState('')
  const [erreurSuppression, setErreurSuppression] = useState(null)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)

  const [matchs, setMatchs] = useState([])
  const [chargementMatchs, setChargementMatchs] = useState(true)
  const [erreurMatchs, setErreurMatchs] = useState(null)

  const [matchASupprimer, setMatchASupprimer] = useState(null)
  const [pinConfirmationMatch, setPinConfirmationMatch] = useState('')
  const [erreurSuppressionMatch, setErreurSuppressionMatch] = useState(null)
  const [suppressionMatchEnCours, setSuppressionMatchEnCours] = useState(false)

  const chargerMatchs = useCallback(async () => {
    setChargementMatchs(true)
    setErreurMatchs(null)
    const { data, error } = await supabase.rpc('lister_matchs', {
      p_benevole_id: benevole.id,
    })
    if (error) {
      setErreurMatchs("Impossible de charger les rapports de match.")
    } else {
      setMatchs(data || [])
    }
    setChargementMatchs(false)
  }, [benevole.id])

  useEffect(() => {
    chargerMatchs()
  }, [chargerMatchs])

  const charger = useCallback(async () => {
    setChargement(true)
    setErreur(null)
    const { data, error } = await supabase.rpc('lister_ventes', {
      p_benevole_id: benevole.id,
      p_date_debut: dateDebut,
      p_date_fin: dateFin,
    })
    if (error) {
      setErreur("Impossible de charger l'historique.")
    } else {
      setVentes(data || [])
    }
    setChargement(false)
  }, [benevole.id, dateDebut, dateFin])

  useEffect(() => {
    charger()
  }, [charger])

  const totalCB = ventes
    .filter((v) => v.mode_paiement === 'cb')
    .reduce((s, v) => s + Number(v.total), 0)
  const totalEspeces = ventes
    .filter((v) => v.mode_paiement === 'especes')
    .reduce((s, v) => s + Number(v.total), 0)
  const totalGeneral = totalCB + totalEspeces

  function exporterCsv() {
    const entetes = ['Date/heure', 'Bénévole', 'Mode', 'Détail', 'Total', 'Reçu', 'Monnaie']
    const lignes = ventes.map((v) => [
      new Date(v.cree_le).toLocaleString('fr-FR'),
      v.benevole_nom,
      v.mode_paiement,
      (v.detail || '').replace(/\n/g, ' '),
      v.total,
      v.montant_recu ?? '',
      v.monnaie_rendue ?? '',
    ])
    const csv = [entetes, ...lignes]
      .map((ligne) => ligne.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ventes_${dateDebut}_${dateFin}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function ouvrirSuppression(vente) {
    setVenteASupprimer(vente)
    setPinConfirmation('')
    setErreurSuppression(null)
  }

  function fermerSuppression() {
    if (suppressionEnCours) return
    setVenteASupprimer(null)
  }

  async function confirmerSuppression() {
    if (!/^\d{4}$/.test(pinConfirmation)) {
      setErreurSuppression('Le code doit contenir exactement 4 chiffres.')
      return
    }
    setSuppressionEnCours(true)
    setErreurSuppression(null)
    const { error } = await supabase.rpc('supprimer_vente', {
      p_benevole_id: benevole.id,
      p_pin: pinConfirmation,
      p_vente_id: venteASupprimer.vente_id,
    })
    setSuppressionEnCours(false)
    if (error) {
      setErreurSuppression(
        error.message === 'Code PIN incorrect'
          ? 'Code PIN incorrect.'
          : "La suppression a échoué."
      )
      return
    }
    setVenteASupprimer(null)
    charger()
  }

  function ouvrirSuppressionMatch(match) {
    setMatchASupprimer(match)
    setPinConfirmationMatch('')
    setErreurSuppressionMatch(null)
  }

  function fermerSuppressionMatch() {
    if (suppressionMatchEnCours) return
    setMatchASupprimer(null)
  }

  async function confirmerSuppressionMatch() {
    if (!/^\d{4}$/.test(pinConfirmationMatch)) {
      setErreurSuppressionMatch('Le code doit contenir exactement 4 chiffres.')
      return
    }
    setSuppressionMatchEnCours(true)
    setErreurSuppressionMatch(null)

    // Supprime d'abord le fichier PDF du stockage (chemin = `<id>.pdf`,
    // voir EncartMatch), puis la fiche du match en base. Une erreur de
    // stockage n'empêche pas la suppression en base : le fichier peut déjà
    // avoir disparu, ou ne jamais avoir été retrouvé — dans les deux cas on
    // ne veut pas bloquer le responsable qui souhaite nettoyer l'historique.
    await supabase.storage.from('rapports-matchs').remove([`${matchASupprimer.id}.pdf`])

    const { error } = await supabase.rpc('supprimer_match', {
      p_benevole_id: benevole.id,
      p_pin: pinConfirmationMatch,
      p_match_id: matchASupprimer.id,
    })
    setSuppressionMatchEnCours(false)
    if (error) {
      setErreurSuppressionMatch(
        error.message === 'Code PIN incorrect'
          ? 'Code PIN incorrect.'
          : 'La suppression a échoué.'
      )
      return
    }
    setMatchASupprimer(null)
    chargerMatchs()
  }

  return (
    <div className="bloc">
      <h2>Historique des ventes</h2>
      <div className="filtre-barre">
        <div className="champ">
          <label>Du</label>
          <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        </div>
        <div className="champ">
          <label>Au</label>
          <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        </div>
        <button className="bouton-secondaire" onClick={exporterCsv} disabled={ventes.length === 0}>
          Exporter en CSV
        </button>
      </div>

      {chargement && <p className="chargement">Chargement…</p>}
      {erreur && <p className="erreur">{erreur}</p>}

      {!chargement && !erreur && (
        <>
          <div className="totaux-historique">
            <span className="carte-total">{ventes.length} vente(s)</span>
            <span className="carte-total">CB : {formatEuros(totalCB)}</span>
            <span className="carte-total">Espèces : {formatEuros(totalEspeces)}</span>
            <span className="carte-total">Total : {formatEuros(totalGeneral)}</span>
          </div>

          <div style={{ overflowX: 'auto', marginTop: 16 }}>
            <table className="tableau-admin">
              <thead>
                <tr>
                  <th>Date / heure</th>
                  <th>Bénévole</th>
                  <th>Mode</th>
                  <th>Détail</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ventes.map((v) => (
                  <tr key={v.vente_id}>
                    <td>{new Date(v.cree_le).toLocaleString('fr-FR')}</td>
                    <td>{v.benevole_nom}</td>
                    <td>{v.mode_paiement === 'cb' ? 'CB' : 'Espèces'}</td>
                    <td style={{ whiteSpace: 'pre-line' }}>{v.detail}</td>
                    <td>{formatEuros(v.total)}</td>
                    <td>
                      <button
                        className="bouton-icone"
                        title="Supprimer cette vente"
                        onClick={() => ouvrirSuppression(v)}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
                {ventes.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--texte-clair)' }}>
                      Aucune vente sur cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="bloc" style={{ marginTop: 32 }}>
        <h2>Rapports de match</h2>

        {chargementMatchs && <p className="chargement">Chargement…</p>}
        {erreurMatchs && <p className="erreur">{erreurMatchs}</p>}

        {!chargementMatchs && !erreurMatchs && (
          <div style={{ overflowX: 'auto' }}>
            <table className="tableau-admin">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Ventes</th>
                  <th>Total</th>
                  <th>Clôturé le</th>
                  <th>Rapport</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {matchs.map((m) => (
                  <tr key={m.id}>
                    <td>{resumeMatch(m)}</td>
                    <td>{m.nb_ventes}</td>
                    <td>{formatEuros(m.total_ventes)}</td>
                    <td>{new Date(m.cloture_le).toLocaleString('fr-FR')}</td>
                    <td>
                      {m.pdf_url ? (
                        <a href={m.pdf_url} target="_blank" rel="noreferrer">
                          Télécharger le PDF
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button
                        className="bouton-icone"
                        title="Supprimer ce rapport"
                        onClick={() => ouvrirSuppressionMatch(m)}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
                {matchs.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--texte-clair)' }}>
                      Aucun match clôturé pour l'instant
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {venteASupprimer && (
        <div className="fond-modale" onClick={fermerSuppression}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <h2>Supprimer cette vente ?</h2>
            <p>
              {new Date(venteASupprimer.cree_le).toLocaleString('fr-FR')} —{' '}
              {venteASupprimer.benevole_nom} — {formatEuros(venteASupprimer.total)}
            </p>
            <p style={{ whiteSpace: 'pre-line', color: 'var(--texte-clair)' }}>
              {venteASupprimer.detail}
            </p>
            <p>
              Cette action est irréversible (le stock des articles vendus sera
              recrédité). Entre le code PIN d'un responsable pour confirmer.
            </p>
            <div className="champ">
              <label>Code PIN responsable</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                value={pinConfirmation}
                onChange={(e) => setPinConfirmation(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
              />
            </div>
            {erreurSuppression && <p className="erreur">{erreurSuppression}</p>}
            <div className="modale-actions">
              <button
                className="bouton-secondaire"
                onClick={fermerSuppression}
                disabled={suppressionEnCours}
              >
                Annuler
              </button>
              <button
                className="bouton-principal"
                onClick={confirmerSuppression}
                disabled={suppressionEnCours || !/^\d{4}$/.test(pinConfirmation)}
              >
                {suppressionEnCours ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {matchASupprimer && (
        <div className="fond-modale" onClick={fermerSuppressionMatch}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <h2>Supprimer ce rapport de match ?</h2>
            <p>{resumeMatch(matchASupprimer)}</p>
            <p>
              Cette action est irréversible : le PDF sera définitivement
              supprimé du stockage et ce match disparaîtra de l'historique.
              Les ventes déjà enregistrées ne sont pas supprimées — elles
              redeviennent simplement des ventes "hors match". Entre le code
              PIN d'un responsable pour confirmer.
            </p>
            <div className="champ">
              <label>Code PIN responsable</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                value={pinConfirmationMatch}
                onChange={(e) => setPinConfirmationMatch(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
              />
            </div>
            {erreurSuppressionMatch && <p className="erreur">{erreurSuppressionMatch}</p>}
            <div className="modale-actions">
              <button
                className="bouton-secondaire"
                onClick={fermerSuppressionMatch}
                disabled={suppressionMatchEnCours}
              >
                Annuler
              </button>
              <button
                className="bouton-principal"
                onClick={confirmerSuppressionMatch}
                disabled={suppressionMatchEnCours || !/^\d{4}$/.test(pinConfirmationMatch)}
              >
                {suppressionMatchEnCours ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

