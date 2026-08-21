import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const LONGUEUR_PIN = 4

export default function Login({ onConnecte }) {
  const [benevoles, setBenevoles] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreurListe, setErreurListe] = useState(null)
  const [selectionne, setSelectionne] = useState(null)
  const [pin, setPin] = useState('')
  const [erreurPin, setErreurPin] = useState(null)
  const [verification, setVerification] = useState(false)

  useEffect(() => {
    let annule = false
    async function charger() {
      const { data, error } = await supabase.rpc('lister_benevoles_actifs')
      if (annule) return
      if (error) {
        setErreurListe(
          "Impossible de charger la liste des bénévoles. Vérifie que le fichier SQL a bien été exécuté dans Supabase."
        )
      } else {
        setBenevoles(data || [])
      }
      setChargement(false)
    }
    charger()
    return () => {
      annule = true
    }
  }, [])

  function choisirBenevole(b) {
    setSelectionne(b)
    setPin('')
    setErreurPin(null)
  }

  function ajouterChiffre(chiffre) {
    if (pin.length >= LONGUEUR_PIN) return
    const nouveauPin = pin + chiffre
    setPin(nouveauPin)
    if (nouveauPin.length === LONGUEUR_PIN) {
      verifierPin(nouveauPin)
    }
  }

  function effacer() {
    setPin('')
    setErreurPin(null)
  }

  async function verifierPin(pinSaisi) {
    if (!selectionne) return
    setVerification(true)
    setErreurPin(null)
    const { data, error } = await supabase.rpc('verifier_pin', {
      p_benevole_id: selectionne.id,
      p_pin: pinSaisi,
    })
    setVerification(false)
    const resultat = Array.isArray(data) ? data[0] : data
    if (error || !resultat || !resultat.ok) {
      setErreurPin('Code incorrect, réessaie.')
      setPin('')
      return
    }
    onConnecte({ id: selectionne.id, nom: resultat.nom, role: resultat.role })
  }

  return (
    <div className="login-ecran">
      <div className="login-carte">
        <h1>🏆 Boutique HCAT — identification</h1>

        {chargement && <p className="chargement">Chargement des bénévoles…</p>}
        {erreurListe && <p className="erreur">{erreurListe}</p>}

        {!chargement && !erreurListe && !selectionne && (
          <div className="liste-benevoles">
            {benevoles.length === 0 && (
              <p className="erreur">
                Aucun bénévole enregistré. Demande à un responsable d'en créer
                un via Supabase.
              </p>
            )}
            {benevoles.map((b) => (
              <button
                key={b.id}
                className="bouton-benevole"
                onClick={() => choisirBenevole(b)}
              >
                {b.nom}
              </button>
            ))}
          </div>
        )}

        {selectionne && (
          <div className="pin-zone">
            <p>
              Bonjour <strong>{selectionne.nom}</strong>, entre ton code
            </p>
            <div className="pin-points">
              {Array.from({ length: LONGUEUR_PIN }).map((_, i) => (
                <span
                  key={i}
                  className={`pin-point${i < pin.length ? ' rempli' : ''}`}
                />
              ))}
            </div>
            {erreurPin && <p className="erreur">{erreurPin}</p>}
            {verification && <p>Vérification…</p>}
            <div className="pavé-numerique">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} onClick={() => ajouterChiffre(String(n))}>
                  {n}
                </button>
              ))}
              <button className="effacer" onClick={effacer}>
                Effacer
              </button>
              <button onClick={() => ajouterChiffre('0')}>0</button>
              <button className="effacer" onClick={() => setSelectionne(null)}>
                ← Retour
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
