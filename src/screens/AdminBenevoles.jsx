import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function AdminBenevoles({ benevole }) {
  const [benevoles, setBenevoles] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauPin, setNouveauPin] = useState('')
  const [nouveauRole, setNouveauRole] = useState('benevole')
  const [creationEnCours, setCreationEnCours] = useState(false)
  const [erreurCreation, setErreurCreation] = useState(null)
  const [pinsModifies, setPinsModifies] = useState({})

  const charger = useCallback(async () => {
    setErreur(null)
    const { data, error } = await supabase.rpc('lister_benevoles', {
      p_benevole_id: benevole.id,
    })
    if (error) {
      setErreur("Impossible de charger la liste des bénévoles.")
    } else {
      setBenevoles(data || [])
    }
    setChargement(false)
  }, [benevole.id])

  useEffect(() => {
    charger()
  }, [charger])

  async function creerBenevole(e) {
    e.preventDefault()
    setErreurCreation(null)
    if (!nouveauNom.trim()) {
      setErreurCreation('Le nom est obligatoire.')
      return
    }
    if (!/^\d{4}$/.test(nouveauPin)) {
      setErreurCreation('Le code doit contenir exactement 4 chiffres.')
      return
    }
    setCreationEnCours(true)
    const { error } = await supabase.rpc('ajouter_benevole', {
      p_benevole_id: benevole.id,
      p_nom: nouveauNom.trim(),
      p_pin: nouveauPin,
      p_role: nouveauRole,
    })
    setCreationEnCours(false)
    if (error) {
      setErreurCreation(
        error.message?.includes('duplicate')
          ? 'Ce nom existe déjà.'
          : "Erreur lors de la création."
      )
      return
    }
    setNouveauNom('')
    setNouveauPin('')
    setNouveauRole('benevole')
    charger()
  }

  async function changerStatut(cible) {
    await supabase.rpc('changer_statut_benevole', {
      p_benevole_id: benevole.id,
      p_cible_id: cible.id,
      p_actif: !cible.actif,
    })
    charger()
  }

  async function changerPin(cible) {
    const nouveauPinCible = pinsModifies[cible.id]
    if (!/^\d{4}$/.test(nouveauPinCible || '')) return
    const { error } = await supabase.rpc('changer_pin_benevole', {
      p_benevole_id: benevole.id,
      p_cible_id: cible.id,
      p_nouveau_pin: nouveauPinCible,
    })
    if (!error) {
      setPinsModifies((p) => ({ ...p, [cible.id]: '' }))
    }
  }

  if (chargement) return <div className="chargement">Chargement…</div>
  if (erreur) return <p className="erreur">{erreur}</p>

  return (
    <>
      <div className="bloc">
        <h2>Ajouter un bénévole</h2>
        <form className="formulaire-inline" onSubmit={creerBenevole}>
          <div className="champ">
            <label>Nom</label>
            <input
              type="text"
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              placeholder="Prénom Nom"
            />
          </div>
          <div className="champ">
            <label>Code (4 chiffres)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={nouveauPin}
              onChange={(e) => setNouveauPin(e.target.value.replace(/\D/g, ''))}
              placeholder="1234"
            />
          </div>
          <div className="champ">
            <label>Rôle</label>
            <select value={nouveauRole} onChange={(e) => setNouveauRole(e.target.value)}>
              <option value="benevole">Bénévole</option>
              <option value="responsable">Responsable</option>
            </select>
          </div>
          <button className="bouton-principal" type="submit" disabled={creationEnCours}>
            {creationEnCours ? 'Création…' : 'Ajouter'}
          </button>
        </form>
        {erreurCreation && <p className="erreur">{erreurCreation}</p>}
      </div>

      <div className="bloc">
        <h2>Bénévoles enregistrés</h2>
        <table className="tableau-admin">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Nouveau code</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {benevoles.map((b) => (
              <tr key={b.id}>
                <td>{b.nom}</td>
                <td>
                  <span className={`pastille ${b.role}`}>{b.role}</span>
                </td>
                <td>
                  <span className={`pastille ${b.actif ? 'actif' : 'inactif'}`}>
                    {b.actif ? 'actif' : 'inactif'}
                  </span>
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinsModifies[b.id] || ''}
                    onChange={(e) =>
                      setPinsModifies((p) => ({
                        ...p,
                        [b.id]: e.target.value.replace(/\D/g, ''),
                      }))
                    }
                    placeholder="1234"
                  />
                  <button
                    className="bouton-secondaire"
                    disabled={!/^\d{4}$/.test(pinsModifies[b.id] || '')}
                    onClick={() => changerPin(b)}
                  >
                    Modifier
                  </button>
                </td>
                <td>
                  <button className="bouton-secondaire" onClick={() => changerStatut(b)}>
                    {b.actif ? 'Désactiver' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
