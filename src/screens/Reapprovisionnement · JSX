import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function texteDelai(jours) {
  if (jours === null || jours === undefined) return '—'
  return `${jours} jour${jours > 1 ? 's' : ''}`
}

export default function Reapprovisionnement({ benevole }) {
  const [lignes, setLignes] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [actualisationEnCours, setActualisationEnCours] = useState(false)
  const [derniereActualisation, setDerniereActualisation] = useState(null)

  const charger = useCallback(
    async (silencieux) => {
      if (silencieux) setActualisationEnCours(true)
      setErreur(null)
      const { data, error } = await supabase.rpc('lister_reapprovisionnement', {
        p_benevole_id: benevole.id,
      })
      if (error) {
        setErreur('Impossible de charger la liste de réapprovisionnement.')
      } else {
        setLignes(data || [])
        setDerniereActualisation(new Date())
      }
      setChargement(false)
      setActualisationEnCours(false)
    },
    [benevole.id]
  )

  useEffect(() => {
    charger(false)
  }, [charger])

  if (chargement) return <div className="chargement">Chargement…</div>
  if (erreur) return <p className="erreur">{erreur}</p>

  return (
    <div className="bloc">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0 }}>Réapprovisionnement</h2>
        <button
          type="button"
          className="bouton-secondaire"
          disabled={actualisationEnCours}
          onClick={() => charger(true)}
        >
          {actualisationEnCours ? 'Actualisation…' : '↻ Actualiser'}
        </button>
      </div>

      <p style={{ color: 'var(--texte-clair)' }}>
        Liste des tailles dont le stock est au niveau (ou en dessous) du
        seuil d'alerte réglé pour elles. Configure les seuils et les
        délais de commande/livraison depuis l'onglet{' '}
        <strong>Produits</strong>, en ouvrant la fiche de chaque article
        (seuil taille par taille à côté du stock, délais dans le panneau
        « ✏️ Modifier »). Une taille sans seuil réglé n'apparaît jamais
        ici.
      </p>

      {derniereActualisation && (
        <p style={{ color: 'var(--texte-clair)', fontSize: '0.82rem' }}>
          Dernière actualisation : {derniereActualisation.toLocaleTimeString('fr-FR')}
        </p>
      )}

      {lignes.length === 0 ? (
        <p style={{ color: 'var(--texte-clair)' }}>
          ✅ Rien à signaler — tous les articles surveillés sont au-dessus
          de leur seuil.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tableau-admin">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Référence</th>
                <th>Taille</th>
                <th>Stock actuel</th>
                <th>Seuil</th>
                <th title="Délai estimé pour passer la commande auprès du fournisseur">
                  Délai de commande
                </th>
                <th title="Délai estimé entre la commande passée et la réception">
                  Délai de livraison
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const manque = l.stock_qty <= 0
                return (
                  <tr key={l.variante_id}>
                    <td>{l.nom_produit}</td>
                    <td>{l.reference || '—'}</td>
                    <td>{l.taille || '—'}</td>
                    <td>
                      <span className={`pastille ${manque ? 'inactif' : 'a-definir'}`}>
                        {l.stock_qty}
                      </span>
                    </td>
                    <td>{l.seuil_reappro}</td>
                    <td>{texteDelai(l.delai_commande_jours)}</td>
                    <td>{texteDelai(l.delai_livraison_jours)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
