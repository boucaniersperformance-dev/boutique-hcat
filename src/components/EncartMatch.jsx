import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { LIEUX_MATCH, resumeMatch } from '../constants.js'
import { genererRapportMatchPdf } from '../lib/rapportMatch.js'

const BUCKET_RAPPORTS = 'rapports-matchs'

function aujourdHui() {
  return new Date().toISOString().slice(0, 10)
}

// Encart en haut de l'écran Vente : affiche le match en cours (date / lieu /
// adversaire), permet d'en démarrer un, de le corriger, ou de le clôturer —
// ce qui génère un PDF de bilan (ventes + stock) déposé dans l'historique et
// réinitialise l'encart pour le prochain match. Prévient le parent (Vente)
// du match courant via `onMatchChange`, pour que les ventes enregistrées
// pendant que l'encart est ouvert y soient rattachées.
export default function EncartMatch({ benevole, produits, onMatchChange }) {
  const [match, setMatch] = useState(null)
  const [chargement, setChargement] = useState(true)

  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [dateMatch, setDateMatch] = useState(aujourdHui())
  const [lieuMatch, setLieuMatch] = useState('domicile')
  const [adversaireMatch, setAdversaireMatch] = useState('')
  const [erreurFormulaire, setErreurFormulaire] = useState(null)
  const [actionEnCours, setActionEnCours] = useState(false)

  const [clotureEnCours, setClotureEnCours] = useState(false)
  const [erreurCloture, setErreurCloture] = useState(null)

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('matchs')
      .select('*')
      .is('cloture_le', null)
      .maybeSingle()
    setMatch(data || null)
    onMatchChange?.(data || null)
    setChargement(false)
  }, [onMatchChange])

  useEffect(() => {
    charger()
  }, [charger])

  function ouvrirFormulaire() {
    if (match) {
      setDateMatch(match.date_match)
      setLieuMatch(match.lieu)
      setAdversaireMatch(match.adversaire)
    } else {
      setDateMatch(aujourdHui())
      setLieuMatch('domicile')
      setAdversaireMatch('')
    }
    setErreurFormulaire(null)
    setFormulaireOuvert(true)
  }

  function fermerFormulaire() {
    if (actionEnCours) return
    setFormulaireOuvert(false)
  }

  async function enregistrerFormulaire(e) {
    e.preventDefault()
    if (!adversaireMatch.trim()) {
      setErreurFormulaire("Le nom de l'équipe adverse est obligatoire.")
      return
    }
    if (!dateMatch) {
      setErreurFormulaire('La date est obligatoire.')
      return
    }
    setActionEnCours(true)
    setErreurFormulaire(null)
    const { error } = match
      ? await supabase.rpc('modifier_match', {
          p_benevole_id: benevole.id,
          p_match_id: match.id,
          p_date_match: dateMatch,
          p_lieu: lieuMatch,
          p_adversaire: adversaireMatch.trim(),
        })
      : await supabase.rpc('demarrer_match', {
          p_benevole_id: benevole.id,
          p_date_match: dateMatch,
          p_lieu: lieuMatch,
          p_adversaire: adversaireMatch.trim(),
        })
    setActionEnCours(false)
    if (error) {
      setErreurFormulaire(error.message || "Erreur lors de l'enregistrement du match.")
      return
    }
    setFormulaireOuvert(false)
    charger()
  }

  async function cloturerMatch() {
    if (!match) return
    const confirme = window.confirm(
      `Clôturer le match ${resumeMatch(match)} ?\n\nUn PDF récapitulatif (ventes + stock) sera généré et ajouté à l'historique. Les prochaines ventes ne seront plus rattachées à ce match tant qu'un nouveau n'est pas démarré.`
    )
    if (!confirme) return

    setClotureEnCours(true)
    setErreurCloture(null)

    const { data: ventesMatch, error: erreurVentes } = await supabase.rpc(
      'lister_ventes_match',
      { p_benevole_id: benevole.id, p_match_id: match.id }
    )
    if (erreurVentes) {
      setClotureEnCours(false)
      setErreurCloture("Impossible de récupérer les ventes de ce match. Réessaie.")
      return
    }

    const produitsActifs = (produits || [])
      .slice()
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }))

    let pdfBytes
    try {
      pdfBytes = await genererRapportMatchPdf({
        match,
        ventes: ventesMatch || [],
        produitsActifs,
      })
    } catch (err) {
      console.error(err)
      setClotureEnCours(false)
      setErreurCloture('La génération du PDF a échoué. Réessaie.')
      return
    }

    const chemin = `${match.id}.pdf`
    const { error: erreurUpload } = await supabase.storage
      .from(BUCKET_RAPPORTS)
      .upload(chemin, new Blob([pdfBytes], { type: 'application/pdf' }), {
        upsert: true,
        contentType: 'application/pdf',
      })
    if (erreurUpload) {
      setClotureEnCours(false)
      setErreurCloture("Échec de l'envoi du PDF. Réessaie.")
      return
    }

    const { data: urlPublique } = supabase.storage.from(BUCKET_RAPPORTS).getPublicUrl(chemin)

    const { error: erreurCloturerMatch } = await supabase.rpc('cloturer_match', {
      p_benevole_id: benevole.id,
      p_match_id: match.id,
      p_pdf_url: urlPublique.publicUrl,
    })
    setClotureEnCours(false)
    if (erreurCloturerMatch) {
      setErreurCloture(
        'Le PDF a bien été généré, mais la clôture du match a échoué. Réessaie.'
      )
      return
    }

    charger()
  }

  if (chargement) return null

  return (
    <div className="encart-match">
      {!formulaireOuvert && match && (
        <>
          <div className="encart-match-info">
            <span className="encart-match-badge">🏒 Match en cours</span>
            <span className="encart-match-resume">{resumeMatch(match)}</span>
          </div>
          <div className="encart-match-actions">
            <button className="bouton-secondaire" onClick={ouvrirFormulaire}>
              ✏️ Modifier
            </button>
            <button
              className="bouton-secondaire"
              onClick={cloturerMatch}
              disabled={clotureEnCours}
            >
              {clotureEnCours ? 'Clôture en cours…' : '🏁 Clôturer le match'}
            </button>
          </div>
        </>
      )}

      {!formulaireOuvert && !match && (
        <>
          <div className="encart-match-info">
            <span className="encart-match-resume encart-match-resume-vide">
              Aucun match en cours
            </span>
          </div>
          <button className="bouton-secondaire" onClick={ouvrirFormulaire}>
            + Démarrer un match
          </button>
        </>
      )}

      {formulaireOuvert && (
        <form className="formulaire-inline formulaire-match" onSubmit={enregistrerFormulaire}>
          <div className="champ">
            <label>Date</label>
            <input
              type="date"
              value={dateMatch}
              onChange={(e) => setDateMatch(e.target.value)}
            />
          </div>
          <div className="champ">
            <label>Lieu</label>
            <select value={lieuMatch} onChange={(e) => setLieuMatch(e.target.value)}>
              {LIEUX_MATCH.map((l) => (
                <option key={l.cle} value={l.cle}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="champ">
            <label>Équipe adverse</label>
            <input
              type="text"
              value={adversaireMatch}
              onChange={(e) => setAdversaireMatch(e.target.value)}
              placeholder="Ex : Anglet HC"
            />
          </div>
          <button className="bouton-principal" type="submit" disabled={actionEnCours}>
            {actionEnCours ? 'Enregistrement…' : match ? 'Enregistrer' : 'Commencer le match'}
          </button>
          <button
            className="bouton-secondaire"
            type="button"
            onClick={fermerFormulaire}
            disabled={actionEnCours}
          >
            Annuler
          </button>
        </form>
      )}

      {erreurFormulaire && <p className="erreur">{erreurFormulaire}</p>}
      {erreurCloture && <p className="erreur">{erreurCloture}</p>}
    </div>
  )
}

