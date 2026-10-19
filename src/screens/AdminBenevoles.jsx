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
  const [nomEdite, setNomEdite] = useState('')
  const [roleEdite, setRoleEdite] = useState('benevole')
  const [nouveauPinEdite, setNouveauPinEdite] = useState('')
  const [erreurEdition, setErreurEdition] = useState(null)
  const [actionEnCours, setActionEnCours] = useState(false)

  // Codes PIN révélés à l'écran : { [id]: '1234' | 'indisponible' | 'chargement' }
  const [pinsVisibles, setPinsVisibles] = useState({})

  // Liste blanche des adresses Gmail autorisées à se connecter en tant
  // que responsable (voir le bloc "Connexion Google" en bas de l'écran).
  const [emailsAutorises, setEmailsAutorises] = useState([])
  const [chargementEmails, setChargementEmails] = useState(true)
  const [erreurEmails, setErreurEmails] = useState(null)
  const [nouvelEmail, setNouvelEmail] = useState('')
  const [nouveauNomEmail, setNouveauNomEmail] = useState('')
  const [ajoutEmailEnCours, setAjoutEmailEnCours] = useState(false)
  const [erreurAjoutEmail, setErreurAjoutEmail] = useState(null)
  const [actionEmailEnCours, setActionEmailEnCours] = useState({})

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

  const chargerEmails = useCallback(async () => {
    setErreurEmails(null)
    const { data, error } = await supabase.rpc('lister_emails_autorises', {
      p_benevole_id: benevole.id,
    })
    if (error) {
      setErreurEmails("Impossible de charger la liste des adresses Gmail autorisées.")
    } else {
      setEmailsAutorises(data || [])
    }
    setChargementEmails(false)
  }, [benevole.id])

  useEffect(() => {
    chargerEmails()
  }, [chargerEmails])

  async function ajouterEmailAutorise(e) {
    e.preventDefault()
    setErreurAjoutEmail(null)
    const email = nouvelEmail.trim()
    const nom = nouveauNomEmail.trim()
    if (!email || !email.includes('@')) {
      setErreurAjoutEmail('Adresse e-mail invalide.')
      return
    }
    if (!nom) {
      setErreurAjoutEmail('Le nom est obligatoire.')
      return
    }
    setAjoutEmailEnCours(true)
    const { error } = await supabase.rpc('ajouter_email_autorise', {
      p_benevole_id: benevole.id,
      p_email: email,
      p_nom: nom,
    })
    setAjoutEmailEnCours(false)
    if (error) {
      setErreurAjoutEmail(error.message || "Erreur lors de l'ajout.")
      return
    }
    setNouvelEmail('')
    setNouveauNomEmail('')
    chargerEmails()
  }

  async function basculerActifEmail(ligne) {
    setActionEmailEnCours((e) => ({ ...e, [ligne.email]: true }))
    const { error } = await supabase.rpc('definir_email_autorise_actif', {
      p_benevole_id: benevole.id,
      p_email: ligne.email,
      p_actif: !ligne.actif,
    })
    setActionEmailEnCours((e) => ({ ...e, [ligne.email]: false }))
    if (error) {
      window.alert(error.message || 'Erreur lors du changement de statut.')
      return
    }
    chargerEmails()
  }

  async function supprimerEmailAutorise(ligne) {
    const confirme = window.confirm(
      `Retirer ${ligne.email} de la liste blanche ? ${
        ligne.deja_connecte
          ? "Le compte bénévole déjà créé pour cette adresse n'est pas supprimé (gère-le depuis la liste ci-dessus si besoin) — seule sa capacité à se reconnecter avec Google est retirée."
          : ''
      }`
    )
    if (!confirme) return
    setActionEmailEnCours((e) => ({ ...e, [ligne.email]: true }))
    const { error } = await supabase.rpc('supprimer_email_autorise', {
      p_benevole_id: benevole.id,
      p_email: ligne.email,
    })
    setActionEmailEnCours((e) => ({ ...e, [ligne.email]: false }))
    if (error) {
      window.alert(error.message || 'Erreur lors de la suppression.')
      return
    }
    chargerEmails()
  }

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
    setNomEdite(cible.nom)
    setRoleEdite(cible.role)
    setNouveauPinEdite('')
    setErreurEdition(null)
  }

  async function enregistrerNom(cible) {
    const nom = nomEdite.trim()
    if (!nom || nom === cible.nom) return
    setActionEnCours(true)
    setErreurEdition(null)
    const { error } = await supabase.rpc('changer_nom_benevole', {
      p_benevole_id: benevole.id,
      p_cible_id: cible.id,
      p_nouveau_nom: nom,
    })
    setActionEnCours(false)
    if (error) {
      setErreurEdition(error.message || 'Erreur lors du changement de nom.')
      return
    }
    charger()
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
    setPinsVisibles((etat) => {
      const copie = { ...etat }
      delete copie[cible.id]
      return copie
    })
  }

  // Affiche/masque le code PIN d'un bénévole. Aucune reconfirmation par
  // code n'est demandée ici : cet écran est déjà réservé aux responsables
  // connectés, comme pour les autres corrections rapides de l'appli.
  async function basculerPinVisible(cible) {
    if (pinsVisibles[cible.id] !== undefined) {
      setPinsVisibles((etat) => {
        const copie = { ...etat }
        delete copie[cible.id]
        return copie
      })
      return
    }
    setPinsVisibles((etat) => ({ ...etat, [cible.id]: 'chargement' }))
    const { data, error } = await supabase.rpc('voir_pin_benevole', {
      p_benevole_id: benevole.id,
      p_cible_id: cible.id,
    })
    setPinsVisibles((etat) => ({
      ...etat,
      [cible.id]: error || !data ? 'indisponible' : data,
    }))
  }

  async function debloquer(cible) {
    setActionEnCours(true)
    setErreurEdition(null)
    const { error } = await supabase.rpc('debloquer_benevole', {
      p_benevole_id: benevole.id,
      p_cible_id: cible.id,
    })
    setActionEnCours(false)
    if (error) {
      setErreurEdition(error.message || 'Erreur lors du déblocage.')
      return
    }
    charger()
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
              <th>Verrouillage</th>
              <th>Gmail</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {benevoles.map((b) => (
              <Fragment key={b.id}>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{b.nom}</span>
                      <button
                        type="button"
                        className="bouton-icone"
                        title="Voir le code"
                        style={{ padding: '2px 7px', fontSize: '0.85rem' }}
                        onClick={() => basculerPinVisible(b)}
                      >
                        👁️
                      </button>
                    </div>
                    {pinsVisibles[b.id] === 'chargement' && (
                      <div className="code-affiche">Chargement…</div>
                    )}
                    {pinsVisibles[b.id] === 'indisponible' && (
                      <div className="code-affiche indisponible">
                        Code non disponible — réinitialise-le ci-dessous ✏️
                      </div>
                    )}
                    {pinsVisibles[b.id] &&
                      pinsVisibles[b.id] !== 'chargement' &&
                      pinsVisibles[b.id] !== 'indisponible' && (
                        <div className="code-affiche">Code : {pinsVisibles[b.id]}</div>
                      )}
                  </td>
                  <td>
                    <span className={`pastille ${b.role}`}>{b.role}</span>
                  </td>
                  <td>
                    <span className={`pastille ${b.actif ? 'actif' : 'inactif'}`}>
                      {b.actif ? 'actif' : 'inactif'}
                    </span>
                  </td>
                  <td>
                    {b.verrouille ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="pastille inactif">bloqué</span>
                        <button
                          type="button"
                          className="bouton-secondaire"
                          style={{ padding: '2px 8px', fontSize: '0.85rem' }}
                          disabled={actionEnCours}
                          onClick={() => debloquer(b)}
                        >
                          Débloquer
                        </button>
                      </div>
                    ) : b.tentatives_echouees > 0 ? (
                      <span className="code-affiche">
                        {b.tentatives_echouees} code{b.tentatives_echouees > 1 ? 's' : ''}{' '}
                        incorrect{b.tentatives_echouees > 1 ? 's' : ''} récent
                        {b.tentatives_echouees > 1 ? 's' : ''}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {b.email ? (
                      <span style={{ fontSize: '0.82rem' }}>{b.email}</span>
                    ) : (
                      '—'
                    )}
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
                    <td colSpan={6}>
                      <div className="panneau-edition">
                        <div className="champ">
                          <label>Nom</label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              type="text"
                              value={nomEdite}
                              onChange={(e) => setNomEdite(e.target.value)}
                              placeholder="Prénom Nom"
                            />
                            <button
                              className="bouton-secondaire"
                              disabled={
                                actionEnCours ||
                                !nomEdite.trim() ||
                                nomEdite.trim() === b.nom
                              }
                              onClick={() => enregistrerNom(b)}
                            >
                              Enregistrer le nom
                            </button>
                          </div>
                        </div>

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

      <div className="bloc">
        <h2>Connexion Google (responsables)</h2>
        <p style={{ color: 'var(--texte-clair)' }}>
          Les adresses Gmail ajoutées ici peuvent se connecter directement
          avec leur compte Google, sans code PIN, via le bouton dédié sur
          l'écran de connexion — réservé aux responsables. Rien ne change
          pour les autres bénévoles, qui continuent à utiliser leur code.
          À la première connexion réussie d'une adresse, sa fiche bénévole
          est créée automatiquement avec le nom indiqué ci-dessous.
        </p>

        <form className="formulaire-inline" onSubmit={ajouterEmailAutorise}>
          <div className="champ">
            <label>Adresse Gmail</label>
            <input
              type="email"
              value={nouvelEmail}
              onChange={(e) => setNouvelEmail(e.target.value)}
              placeholder="prenom.nom@gmail.com"
            />
          </div>
          <div className="champ">
            <label>Nom affiché</label>
            <input
              type="text"
              value={nouveauNomEmail}
              onChange={(e) => setNouveauNomEmail(e.target.value)}
              placeholder="Prénom Nom"
            />
          </div>
          <button className="bouton-principal" type="submit" disabled={ajoutEmailEnCours}>
            {ajoutEmailEnCours ? 'Ajout…' : 'Autoriser cette adresse'}
          </button>
        </form>
        {erreurAjoutEmail && <p className="erreur">{erreurAjoutEmail}</p>}

        {chargementEmails ? (
          <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
        ) : erreurEmails ? (
          <p className="erreur">{erreurEmails}</p>
        ) : emailsAutorises.length === 0 ? (
          <p style={{ color: 'var(--texte-clair)' }}>
            Aucune adresse Gmail autorisée pour l'instant.
          </p>
        ) : (
          <table className="tableau-admin">
            <thead>
              <tr>
                <th>Adresse Gmail</th>
                <th>Nom</th>
                <th>Statut</th>
                <th>Compte créé</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {emailsAutorises.map((ligne) => (
                <tr key={ligne.email}>
                  <td>{ligne.email}</td>
                  <td>{ligne.nom}</td>
                  <td>
                    <span className={`pastille ${ligne.actif ? 'actif' : 'inactif'}`}>
                      {ligne.actif ? 'autorisée' : 'désactivée'}
                    </span>
                  </td>
                  <td>{ligne.deja_connecte ? 'oui' : 'pas encore'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="bouton-secondaire"
                        disabled={!!actionEmailEnCours[ligne.email]}
                        onClick={() => basculerActifEmail(ligne)}
                      >
                        {ligne.actif ? 'Désactiver' : 'Réactiver'}
                      </button>
                      <button
                        className="bouton-icone"
                        title="Retirer de la liste"
                        disabled={!!actionEmailEnCours[ligne.email]}
                        onClick={() => supprimerEmailAutorise(ligne)}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

