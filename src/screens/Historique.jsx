import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatEuros } from '../constants.js'

function aujourdHui() {
  return new Date().toISOString().slice(0, 10)
}

export default function Historique({ benevole }) {
  const [dateDebut, setDateDebut] = useState(aujourdHui())
  const [dateFin, setDateFin] = useState(aujourdHui())
  const [ventes, setVentes] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)

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
                  </tr>
                ))}
                {ventes.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--texte-clair)' }}>
                      Aucune vente sur cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
