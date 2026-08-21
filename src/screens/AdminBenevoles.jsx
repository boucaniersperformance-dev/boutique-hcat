import { Fragment, useCallback, useEffect, useState } from 'react'
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

  const [ligneOuverte, setLigneOuverte] = useState(null)
  const [roleEdite, setRoleEdite] = useState('benevole')
  const [nouveauPinEdite, setNouveauPinEdite] = useState('')
  const [erreurEdition, setErreurEdition] = useState(null)
  const [actionEnCours, setActionEnCours] = useState(false)

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

  function ouvrirEdition(cible) {
    if (ligneOuverte === cible.id) {
      setLigneOuverte(null)
      return
    }
    setLigneOuverte(cible.id)
    setRoleEdite(cible.role)
    setNouveauPinEdite('')
    setErreurEdition(null)
  }

  async function enregistrerRole(cible) {
    if (roleEdite === cible.role) return
    setActionEnCours(true)
    setErreurEdition(null)
    const { error } = await supabase.rpc('changer_role_benevole', {
      p_benevole_id: benevole.id,
      p_cible_id: cible.id,
      p_role: roleEdite,
    })
    setActionEnCours(false)
    if (error) {
      setErreurEdition(error.message || 'Erreur lors du changement de rôle.')
      return
    }
    charger()
  }

  async function reinitialiserPin(cible) {
    if (!/^\d{4}$/.test(nouveauPinEdite)) {
      setErreurEdition('Le nouveau code doit contenir exactement 4 chiffres.')
      return
    }
    setActionEnCours(true)
    setErreurEdition(null)
    const { error } = await supabase.rpc('changer_pin_benevole', {
      p_benevole_id: benevole.id,
      p_cible_id: cible.id,
      p_nouveau_pin: nouveauPinEdite,
    })
    setActionEnCours(false)
    if (error) {
      setErreurEdition('Erreur lors de la réinitialisation du code.')
      return
    }
    setNouveauPinEdite('')
  }

  async function changerStatut(cible) {
    setActionEnCours(true)
    const { error } = await supabase.rpc('changer_statut_benevole', {
      p_benevole_id: benevole.id,
      p_cible_id: cible.id,
      p_actif: !cible.actif,
    })
    setActionEnCours(false)
    if (error) {
      setErreurEdition(error.message || 'Erreur lors du changement de statut.')
      return
    }
    charger()
  }

  async function supprimer(cible) {
    const confirme = window.confirm(
      `Supprimer définitivement ${cible.nom} ? Cette action est irréversible (mais son historique de ventes est conservé).`
    )
    if (!confirme) return
    setActionEnCours(true)
    const { error } = await supabase.rpc('supprimer_benevole', {
      p_benevole_id: benevole.id,
      p_cible_id: cible.id,
    })
    setActionEnCours(false)
    if (error) {
      window.alert(error.message || "Impossible de supprimer ce bénévole.")
      return
    }
    setLigneOuverte(null)
    charger()
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {benevoles.map((b) => (
              <Fragment key={b.id}>
                <tr>
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
                    <button
                      className="bouton-icone"
                      title="Modifier"
                      onClick={() => ouvrirEdition(b)}
                    >
                      ✏️
                    </button>
                    <button
                      className="bouton-icone"
                      title="Supprimer"
                      disabled={actionEnCours}
                      onClick={() => supprimer(b)}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
                {ligneOuverte === b.id && (
                  <tr>
                    <td colSpan={4}>
                      <div className="panneau-edition">
                        <div className="champ">
                          <label>Rôle</label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <select
                              value={roleEdite}
                              onChange={(e) => setRoleEdite(e.target.value)}
                            >
                              <option value="benevole">Bénévole</option>
                              <option value="responsable">Responsable</option>
                            </select>
                            <button
                              className="bouton-secondaire"
                              disabled={actionEnCours || roleEdite === b.role}
                              onClick={() => enregistrerRole(b)}
                            >
                              Enregistrer le rôle
                            </button>
                          </div>
                        </div>

                        <div className="champ">
                          <label>
                            Réinitialiser le code (par sécurité, un code déjà
                            créé ne peut pas être ré-affiché — seulement
                            remplacé par un nouveau)
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={4}
                              value={nouveauPinEdite}
                              onChange={(e) =>
                                setNouveauPinEdite(e.target.value.replace(/\D/g, ''))
                              }
                              placeholder="Nouveau code à 4 chiffres"
                            />
                            <button
                              className="bouton-secondaire"
                              disabled={actionEnCours || !/^\d{4}$/.test(nouveauPinEdite)}
                              onClick={() => reinitialiserPin(b)}
                            >
                              Réinitialiser
                            </button>
                          </div>
                        </div>

                        <button
                          className="bouton-secondaire"
                          disabled={actionEnCours}
                          onClick={() => changerStatut(b)}
                        >
                          {b.actif ? 'Désactiver (peut être réactivé)' : 'Réactiver'}
                        </button>

                        {erreurEdition && <p className="erreur">{erreurEdition}</p>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
