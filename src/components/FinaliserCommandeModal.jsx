import { useState } from 'react'
import { useFermetureRetour } from '../lib/useFermetureRetour.js'

// Formate une date Postgres ("2026-11-16") en français, sans dépendre du
// fuseau horaire du navigateur (on construit la date à partir de ses
// composants plutôt que de laisser `new Date('2026-11-16')` l'interpréter
// comme un instant UTC, qui peut glisser d'un jour selon le fuseau local).
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

// Modale « muette » (même principe que PaiementModal/CommandeAjoutModal) :
// elle se contente de proposer les prochains matchs à domicile et de
// renvoyer la date choisie via onValider — c'est l'écran Commande qui
// appelle ensuite la RPC finaliser_commande et gère le chargement/erreurs.
export default function FinaliserCommandeModal({ matchs, chargementMatchs, erreur, onValider, onFermer, enCours }) {
  useFermetureRetour(true, () => {
    if (!enCours) onFermer()
  })

  const [dateChoisie, setDateChoisie] = useState('')

  function valider() {
    if (!dateChoisie || enCours) return
    onValider(dateChoisie)
  }

  return (
    <div className="fond-modale" onClick={enCours ? undefined : onFermer}>
      <div className="modale" onClick={(e) => e.stopPropagation()}>
        <h2>Finaliser la commande</h2>
        <p style={{ color: 'var(--texte-clair)', fontSize: '0.9rem', marginTop: -4 }}>
          Choisis le match à domicile où le client viendra récupérer sa
          commande. S'il a laissé une adresse email, il recevra
          automatiquement un message pour le prévenir.
        </p>

        {chargementMatchs && <p className="chargement">Chargement des matchs…</p>}

        {!chargementMatchs && matchs.length === 0 && (
          <p className="erreur">
            Aucun match à domicile à venir n'est enregistré. Ajoute-le
            d'abord dans « Prochains matchs à domicile » (plus bas sur cette
            page), puis réessaie.
          </p>
        )}

        {!chargementMatchs && matchs.length > 0 && (
          <div className="choix-match-retrait">
            {matchs.map((m) => (
              <label
                key={m.id}
                className={dateChoisie === m.date_match ? 'selectionne' : ''}
              >
                <input
                  type="radio"
                  name="date-retrait"
                  value={m.date_match}
                  checked={dateChoisie === m.date_match}
                  onChange={() => setDateChoisie(m.date_match)}
                />
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
              </label>
            ))}
          </div>
        )}

        {erreur && <p className="erreur">{erreur}</p>}

        <div className="modale-actions">
          <button className="bouton-secondaire" onClick={onFermer} disabled={enCours}>
            Annuler
          </button>
          <button
            className="bouton-principal"
            disabled={!dateChoisie || enCours}
            onClick={valider}
          >
            {enCours ? 'Envoi…' : 'Finaliser et notifier'}
          </button>
        </div>
      </div>
    </div>
  )
}
