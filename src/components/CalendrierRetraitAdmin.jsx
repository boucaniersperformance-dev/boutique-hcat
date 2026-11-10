import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function formatDateMatch(dateStr) {
  const [annee, mois, jour] = dateStr.split('-').map(Number)
  const d = new Date(annee, mois - 1, jour)
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Petite gestion des matchs à domicile à venir : ce sont les seules dates
// proposées aux responsables pour fixer un retrait de commande (voir
// FinaliserCommandeModal). Volontairement tenue à jour « à la main » par
// un(e) responsable plutôt que pré-remplie automatiquement à partir d'un
// calendrier externe, pour éviter tout risque d'erreur ou d'oubli de mise
// à jour en cours de saison.
export default function CalendrierRetraitAdmin({ benevoleId }) {
  const [matchs, setMatchs] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)

  const [dateMatch, setDateMatch] = useState('')
  const [heureMatch, setHeureMatch] = useState('')
  const [adversaire, setAdversaire] = useState('')
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
  const [erreurAjout, setErreurAjout] = useState(null)

  const [suppressionEnCours, setSuppressionEnCours] = useState({})

  const charger = useCallback(async () => {
    setErreur(null)
    const { data, error } = await supabase.rpc('lister_matchs_domicile_retrait', {
      p_benevole_id: benevoleId,
    })
    if (error) {
      setErreur('Impossible de charger le calendrier des matchs à domicile.')
    } else {
      setMatchs(data || [])
    }
    setChargement(false)
  }, [benevoleId])

  useEffect(() => {
    charger()
  }, [charger])

  async function ajouter() {
    if (!dateMatch) return
    setAjoutEnCours(true)
    setErreurAjout(null)
    const { error } = await supabase.rpc('ajouter_match_domicile_retrait', {
      p_benevole_id: benevoleId,
      p_date_match: dateMatch,
      p_heure: heureMatch.trim() || null,
      p_adversaire: adversaire.trim() || null,
    })
    setAjoutEnCours(false)
    if (error) {
      setErreurAjout(error.message || "L'ajout a échoué. Réessaie.")
      return
    }
    setDateMatch('')
    setHeureMatch('')
    setAdversaire('')
    charger()
  }

  async function supprimer(id) {
    setSuppressionEnCours((e) => ({ ...e, [id]: true }))
    const { error } = await supabase.rpc('supprimer_match_domicile_retrait', {
      p_benevole_id: benevoleId,
      p_id: id,
    })
    setSuppressionEnCours((e) => ({ ...e, [id]: false }))
    if (!error) charger()
  }

  return (
    <div className="bloc" style={{ marginTop: 32 }}>
      <h2 style={{ margin: 0 }}>Prochains matchs à domicile (retrait des commandes)</h2>
      <p style={{ color: 'var(--texte-clair)', fontSize: '0.85rem' }}>
        Les clients ne récupèrent leur commande que lors d'un match à
        domicile. Ajoute ici les prochaines dates : elles seront proposées
        au moment de « Finaliser la commande ».
      </p>

      {chargement && <p className="chargement">Chargement…</p>}
      {erreur && <p className="erreur">{erreur}</p>}

      {!chargement && !erreur && (
        <div className="lignes-pretes" style={{ maxHeight: 'none' }}>
          {matchs.map((m) => (
            <div className="ligne-prete" key={m.id} style={{ cursor: 'default' }}>
              <span className="panier-ligne-info">
                <span className="panier-ligne-nom">{formatDateMatch(m.date_match)}</span>
                {(m.adversaire || m.heure) && (
                  <span className="panier-ligne-detail">
                    {m.adversaire ? `vs ${m.adversaire}` : ''}
                    {m.adversaire && m.heure ? ' · ' : ''}
                    {m.heure || ''}
                  </span>
                )}
              </span>
              <button
                type="button"
                className="bouton-icone"
                title="Supprimer cette date"
                disabled={!!suppressionEnCours[m.id]}
                onClick={() => supprimer(m.id)}
              >
                ×
              </button>
            </div>
          ))}
          {matchs.length === 0 && (
            <p className="panier-vide">Aucun match à domicile à venir enregistré</p>
          )}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
          maxWidth: 620,
          marginTop: 14,
        }}
      >
        <div className="champ">
          <label>Date du match *</label>
          <input type="date" value={dateMatch} onChange={(e) => setDateMatch(e.target.value)} />
        </div>
        <div className="champ">
          <label>Heure (facultatif)</label>
          <input
            type="text"
            placeholder="20h30"
            value={heureMatch}
            onChange={(e) => setHeureMatch(e.target.value)}
          />
        </div>
        <div className="champ">
          <label>Adversaire (facultatif)</label>
          <input
            type="text"
            placeholder="Toulouse"
            value={adversaire}
            onChange={(e) => setAdversaire(e.target.value)}
          />
        </div>
      </div>

      {erreurAjout && <p className="erreur">{erreurAjout}</p>}

      <button
        type="button"
        className="bouton-secondaire"
        style={{ marginTop: 10, flex: 'none' }}
        disabled={!dateMatch || ajoutEnCours}
        onClick={ajouter}
      >
        {ajoutEnCours ? 'Ajout…' : '+ Ajouter cette date'}
      </button>
    </div>
  )
}
