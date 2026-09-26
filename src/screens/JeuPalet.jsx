import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatEuros } from '../constants.js'
import PaiementModal from '../components/PaiementModal.jsx'
import { genererRapportPaletPdf } from '../lib/rapportPalet.js'

const PRIX_PALET = 2

function aujourdHui() {
  return new Date().toISOString().slice(0, 10)
}

function cleLigne() {
  return Math.random().toString(36).slice(2)
}

// Écran "Jeux du palet" : accessible à tous les bénévoles (pas seulement
// aux responsables). Chaque numéro de palet acheté (2 €) est saisi avec
// son acheteur, plusieurs numéros peuvent être ajoutés avant de payer en
// une seule fois (comme pour la boutique), et un journal du jour peut
// être imprimé avec le total des ventes.
export default function JeuPalet({ benevole }) {
  const [numero, setNumero] = useState('')
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [erreurAjout, setErreurAjout] = useState(null)

  const [panier, setPanier] = useState([])
  const [paiementOuvert, setPaiementOuvert] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreurVente, setErreurVente] = useState(null)
  const [succes, setSucces] = useState(null)

  const [journal, setJournal] = useState([])
  const [chargementJournal, setChargementJournal] = useState(true)
  const [erreurJournal, setErreurJournal] = useState(null)
  const [impressionEnCours, setImpressionEnCours] = useState(false)

  const chargerJournal = useCallback(async () => {
    setChargementJournal(true)
    setErreurJournal(null)
    const { data, error } = await supabase.rpc('lister_ventes_palet', {
      p_benevole_id: benevole.id,
      p_date_debut: aujourdHui(),
      p_date_fin: aujourdHui(),
    })
    if (error) {
      setErreurJournal("Impossible de charger le journal du jour.")
    } else {
      setJournal(data || [])
    }
    setChargementJournal(false)
  }, [benevole.id])

  useEffect(() => {
    chargerJournal()
  }, [chargerJournal])

  const numerosDejaVendus = useMemo(
    () => new Set(journal.map((l) => l.numero_palet)),
    [journal]
  )
  const numerosDansLePanier = useMemo(
    () => new Set(panier.map((l) => l.numero_palet)),
    [panier]
  )

  function ajouterAuPanier(e) {
    e.preventDefault()
    setErreurAjout(null)
    const numeroInt = parseInt(numero, 10)
    if (!numero || Number.isNaN(numeroInt) || numeroInt <= 0) {
      setErreurAjout('Le numéro de palet doit être un nombre positif.')
      return
    }
    if (!nom.trim()) {
      setErreurAjout('Le nom et prénom sont obligatoires.')
      return
    }
    if (numerosDansLePanier.has(numeroInt)) {
      setErreurAjout('Ce numéro est déjà dans le panier en attente de paiement.')
      return
    }
    setPanier((lignes) => [
      ...lignes,
      { cle: cleLigne(), numero_palet: numeroInt, nom: nom.trim(), telephone: telephone.trim() },
    ])
    setNumero('')
    setNom('')
    setTelephone('')
  }

  function supprimerDuPanier(cle) {
    setPanier((lignes) => lignes.filter((l) => l.cle !== cle))
  }

  const total = panier.length * PRIX_PALET

  async function validerPaiement(mode, montantRecu) {
    setEnregistrement(true)
    setErreurVente(null)
    const lignes = panier.map((l) => ({
      numero_palet: l.numero_palet,
      nom: l.nom,
      telephone: l.telephone || null,
    }))
    const { data, error } = await supabase.rpc('enregistrer_vente_palet', {
      p_benevole_id: benevole.id,
      p_mode_paiement: mode,
      p_montant_recu: montantRecu,
      p_lignes: lignes,
    })
    setEnregistrement(false)
    if (error) {
      setErreurVente(
        "L'encaissement n'a pas pu être enregistré. Vérifie ta connexion et réessaie — le panier n'a pas été vidé."
      )
      return
    }
    const resultat = Array.isArray(data) ? data[0] : data
    setPaiementOuvert(false)
    setSucces({
      mode,
      total: resultat?.total ?? total,
      monnaie: resultat?.monnaie ?? null,
    })
    setPanier([])
    chargerJournal()
  }

  async function imprimerJournal() {
    setImpressionEnCours(true)
    try {
      const pdfBytes = await genererRapportPaletPdf({
        lignes: journal,
        dateLabel: new Date(aujourdHui() + 'T00:00:00').toLocaleDateString('fr-FR'),
      })
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `jeux_du_palet_${aujourdHui()}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      window.alert('La génération du PDF a échoué. Réessaie.')
    } finally {
      setImpressionEnCours(false)
    }
  }

  const totalJournal = journal.reduce((s, l) => s + Number(l.prix_unitaire), 0)

  return (
    <>
      <div className="bloc">
        <h2>🎯 Jeux du palet</h2>
        <p style={{ color: 'var(--texte-clair)' }}>
          2 € le numéro. Saisis un numéro de palet par acheteur, tu peux en
          ajouter plusieurs avant d'encaisser en une seule fois.
        </p>
        <form className="formulaire-inline" onSubmit={ajouterAuPanier}>
          <div className="champ">
            <label>Numéro de palet</label>
            <input
              type="number"
              min="1"
              step="1"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Ex : 47"
            />
          </div>
          <div className="champ">
            <label>Nom et prénom</label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex : Jean Dupont"
            />
          </div>
          <div className="champ">
            <label>Téléphone (optionnel)</label>
            <input
              type="tel"
              inputMode="numeric"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="Ex : 0612345678"
            />
          </div>
          <button className="bouton-principal" type="submit">
            + Ajouter
          </button>
        </form>
        {numero &&
          !Number.isNaN(parseInt(numero, 10)) &&
          numerosDejaVendus.has(parseInt(numero, 10)) && (
            <p className="erreur" style={{ marginTop: 6 }}>
              ⚠️ Le numéro {numero} a déjà été vendu aujourd'hui — vérifie avant de continuer.
            </p>
          )}
        {erreurAjout && <p className="erreur">{erreurAjout}</p>}
      </div>

      <div className="bloc">
        <h2>Panier en attente de paiement</h2>
        {panier.length === 0 && <p className="panier-vide">Aucun numéro ajouté pour l'instant</p>}
        {panier.length > 0 && (
          <>
            <div className="panier-lignes">
              {panier.map((l) => (
                <div className="panier-ligne" key={l.cle}>
                  <div className="panier-ligne-info">
                    <span className="panier-ligne-nom">Palet n°{l.numero_palet} — {l.nom}</span>
                    <span className="panier-ligne-detail">
                      {l.telephone || 'Sans téléphone'} · {formatEuros(PRIX_PALET)}
                    </span>
                  </div>
                  <button className="bouton-supprimer" onClick={() => supprimerDuPanier(l.cle)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="panier-total">
              <span>Total</span>
              <span>{formatEuros(total)}</span>
            </div>
            {erreurVente && <p className="erreur">{erreurVente}</p>}
            <button className="bouton-principal" onClick={() => setPaiementOuvert(true)}>
              Encaisser
            </button>
          </>
        )}
      </div>

      <div className="bloc">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Journal du jour</h2>
          <button
            type="button"
            className="bouton-secondaire"
            onClick={imprimerJournal}
            disabled={impressionEnCours || chargementJournal}
          >
            {impressionEnCours ? 'Génération…' : '🖨️ Imprimer'}
          </button>
        </div>

        {chargementJournal && <p className="chargement">Chargement…</p>}
        {erreurJournal && <p className="erreur">{erreurJournal}</p>}

        {!chargementJournal && !erreurJournal && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="tableau-admin">
                <thead>
                  <tr>
                    <th>N° palet</th>
                    <th>Nom et prénom</th>
                    <th>Téléphone</th>
                    <th>Bénévole</th>
                    <th>Prix</th>
                  </tr>
                </thead>
                <tbody>
                  {journal.map((l) => (
                    <tr key={l.ligne_id}>
                      <td>{l.numero_palet}</td>
                      <td>{l.nom}</td>
                      <td>{l.telephone || '—'}</td>
                      <td>{l.benevole_nom}</td>
                      <td>{formatEuros(l.prix_unitaire)}</td>
                    </tr>
                  ))}
                  {journal.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--texte-clair)' }}>
                        Aucun numéro vendu pour l'instant aujourd'hui
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="totaux-historique">
              <span className="carte-total">{journal.length} numéro(s)</span>
              <span className="carte-total">Total des ventes : {formatEuros(totalJournal)}</span>
            </div>
          </>
        )}
      </div>

      {paiementOuvert && (
        <PaiementModal
          total={total}
          enCours={enregistrement}
          onFermer={() => setPaiementOuvert(false)}
          onValider={validerPaiement}
        />
      )}

      {succes && (
        <div className="fond-modale" onClick={() => setSucces(null)}>
          <div className="modale" onClick={(e) => e.stopPropagation()}>
            <div className="succes-ecran">
              <div className="succes-icone">✅</div>
              <h2>Encaissement enregistré</h2>
              <p>Total : {formatEuros(succes.total)}</p>
              {succes.mode === 'especes' && succes.monnaie !== null && (
                <p>Monnaie rendue : {formatEuros(succes.monnaie)}</p>
              )}
              <button className="bouton-principal" onClick={() => setSucces(null)}>
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
