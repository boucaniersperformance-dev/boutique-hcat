import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function texteDelai(jours) {
  if (jours === null || jours === undefined) return '—'
  return `${jours} jour${jours > 1 ? 's' : ''}`
}

function quantiteParDefaut(l) {
  return Math.max(1, (l.seuil_reappro ?? 0) - (l.stock_qty ?? 0) + 1)
}

export default function Reapprovisionnement({ benevole }) {
  const [lignes, setLignes] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [actualisationEnCours, setActualisationEnCours] = useState(false)
  const [derniereActualisation, setDerniereActualisation] = useState(null)

  // Sélection en cours : { [variante_id]: quantite } — tailles cochées
  // pour la prochaine commande fournisseur, avec la quantité à commander
  // pour chacune (modifiable).
  const [selection, setSelection] = useState({})
  const [envoiCommandeEnCours, setEnvoiCommandeEnCours] = useState(false)
  const [erreurCommande, setErreurCommande] = useState(null)
  const [messageSuccesCommande, setMessageSuccesCommande] = useState(null)

  // Commandes fournisseur déjà passées, pas encore reçues.
  const [lignesEnCours, setLignesEnCours] = useState([])
  const [chargementEnCours, setChargementEnCours] = useState(true)
  const [erreurEnCours, setErreurEnCours] = useState(null)

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
      }
      setDerniereActualisation(new Date())
      setChargement(false)
      setActualisationEnCours(false)
    },
    [benevole.id]
  )

  const chargerEnCours = useCallback(async () => {
    setErreurEnCours(null)
    const { data, error } = await supabase.rpc('lister_commandes_fournisseur_en_cours', {
      p_benevole_id: benevole.id,
    })
    if (error) {
      setErreurEnCours('Impossible de charger les commandes fournisseur en cours.')
    } else {
      setLignesEnCours(data || [])
    }
    setChargementEnCours(false)
  }, [benevole.id])

  useEffect(() => {
    charger(false)
    chargerEnCours()
  }, [charger, chargerEnCours])

  function basculerSelection(l) {
    setErreurCommande(null)
    setSelection((prev) => {
      const copie = { ...prev }
      if (copie[l.variante_id] !== undefined) {
        delete copie[l.variante_id]
      } else {
        copie[l.variante_id] = quantiteParDefaut(l)
      }
      return copie
    })
  }

  function changerQuantite(variante_id, valeur) {
    const n = parseInt(valeur, 10)
    setSelection((prev) => ({
      ...prev,
      [variante_id]: Number.isNaN(n) || n < 1 ? 1 : n,
    }))
  }

  const nbSelectionnes = Object.keys(selection).length

  async function passerCommande() {
    const lignesAEnvoyer = Object.entries(selection).map(([variante_id, quantite]) => ({
      variante_id,
      quantite,
    }))
    if (lignesAEnvoyer.length === 0) return

    setErreurCommande(null)
    setMessageSuccesCommande(null)
    setEnvoiCommandeEnCours(true)
    const { error } = await supabase.rpc('passer_commande_fournisseur', {
      p_benevole_id: benevole.id,
      p_lignes: lignesAEnvoyer,
    })
    setEnvoiCommandeEnCours(false)

    if (error) {
      setErreurCommande(error.message || 'Impossible de passer la commande.')
      return
    }

    const nb = lignesAEnvoyer.length
    setSelection({})
    setMessageSuccesCommande(
      `Commande transmise ✓ — ${nb} taille${nb > 1 ? 's' : ''} marquée${nb > 1 ? 's' : ''} comme commandée${nb > 1 ? 's' : ''} auprès du fournisseur.`
    )
    charger(true)
    chargerEnCours()
  }

  if (chargement) return <div className="chargement">Chargement…</div>

  return (
    <>
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

        {erreur && <p className="erreur">{erreur}</p>}

        <p style={{ color: 'var(--texte-clair)' }}>
          Liste des tailles dont le stock est au niveau (ou en dessous) du
          seuil d'alerte de leur article. Configure le seuil et le délai de
          livraison depuis l'onglet <strong>Produits</strong>,
          en ouvrant la fiche de l'article puis le panneau «&nbsp;✏️
          Modifier&nbsp;» — un seul seuil réglé pour tout l'article
          s'applique automatiquement à chacune de ses tailles (ex. : seuil
          5 = alerte dès qu'une taille quelconque tombe à 5 ou moins). Un
          article sans seuil réglé n'apparaît jamais ici. Coche les tailles
          à commander vraiment, ajuste la quantité si besoin, puis valide —
          elles disparaîtront de cette liste jusqu'à réception.
        </p>

        {derniereActualisation && (
          <p style={{ color: 'var(--texte-clair)', fontSize: '0.82rem' }}>
            Dernière actualisation : {derniereActualisation.toLocaleTimeString('fr-FR')}
          </p>
        )}

        {lignes.length === 0 ? (
          <p style={{ color: 'var(--texte-clair)' }}>
            ✅ Rien à signaler — tous les articles surveillés sont au-dessus
            de leur seuil (ou déjà en cours de commande).
          </p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="tableau-admin">
                <thead>
                  <tr>
                    <th></th>
                    <th>Produit</th>
                    <th>Référence</th>
                    <th>Taille</th>
                    <th>Stock actuel</th>
                    <th>Seuil</th>
                    <th title="Délai estimé entre la commande passée et la réception">
                      Délai de livraison
                    </th>
                    <th>À commander</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => {
                    const manque = l.stock_qty <= 0
                    const coche = selection[l.variante_id] !== undefined
                    return (
                      <tr key={l.variante_id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={coche}
                            onChange={() => basculerSelection(l)}
                            aria-label={`Sélectionner ${l.nom_produit} ${l.taille || ''}`}
                          />
                        </td>
                        <td>{l.nom_produit}</td>
                        <td>{l.reference || '—'}</td>
                        <td>{l.taille || '—'}</td>
                        <td>
                          <span className={`pastille ${manque ? 'inactif' : 'a-definir'}`}>
                            {l.stock_qty}
                          </span>
                        </td>
                        <td>{l.seuil_reappro}</td>
                        <td>{texteDelai(l.delai_livraison_jours)}</td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            disabled={!coche}
                            value={coche ? selection[l.variante_id] : ''}
                            placeholder="—"
                            style={{ width: 64 }}
                            onChange={(e) => changerQuantite(l.variante_id, e.target.value)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {erreurCommande && <p className="erreur">{erreurCommande}</p>}
            {messageSuccesCommande && (
              <p style={{ color: 'var(--vert)', fontWeight: 700 }}>{messageSuccesCommande}</p>
            )}

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="bouton-principal"
                disabled={nbSelectionnes === 0 || envoiCommandeEnCours}
                onClick={passerCommande}
              >
                {envoiCommandeEnCours
                  ? 'Envoi…'
                  : nbSelectionnes === 0
                  ? 'Passer la commande'
                  : `Passer la commande (${nbSelectionnes} taille${nbSelectionnes > 1 ? 's' : ''})`}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bloc" style={{ marginTop: 24 }}>
        <h2 style={{ margin: 0 }}>Commandes fournisseur en cours</h2>
        <p style={{ color: 'var(--texte-clair)' }}>
          Déjà commandées, pas encore reçues. Une ligne passe
          automatiquement en « reçue » dès que son stock est remis à jour
          (onglet Produits) au-dessus du seuil d'alerte.
        </p>

        {chargementEnCours && <p className="chargement">Chargement…</p>}
        {erreurEnCours && <p className="erreur">{erreurEnCours}</p>}

        {!chargementEnCours && !erreurEnCours && (
          lignesEnCours.length === 0 ? (
            <p style={{ color: 'var(--texte-clair)' }}>
              Aucune commande fournisseur en cours actuellement.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tableau-admin">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Référence</th>
                    <th>Taille</th>
                    <th>Quantité commandée</th>
                    <th>Commandée le</th>
                    <th>Par</th>
                  </tr>
                </thead>
                <tbody>
                  {lignesEnCours.map((l) => (
                    <tr key={l.ligne_id}>
                      <td>{l.nom_produit}</td>
                      <td>{l.reference || '—'}</td>
                      <td>{l.taille || '—'}</td>
                      <td>{l.quantite_commandee}</td>
                      <td>
                        {l.cree_le
                          ? new Date(l.cree_le).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                      <td>{l.cree_par_nom || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </>
  )
}
