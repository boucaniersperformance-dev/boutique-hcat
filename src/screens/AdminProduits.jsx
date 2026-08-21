import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatEuros } from '../constants.js'
import RecadrageModal from '../components/RecadrageModal.jsx'

const BUCKET_PHOTOS = 'produits-photos'

export default function AdminProduits({ benevole }) {
  const [produits, setProduits] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [messages, setMessages] = useState({})
  const [enTransfert, setEnTransfert] = useState({})

  const [recadrage, setRecadrage] = useState(null) // { produit, fichier }

  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauPrix, setNouveauPrix] = useState('')
  const [nouveauType, setNouveauType] = useState('sans_taille')
  const [creationEnCours, setCreationEnCours] = useState(false)
  const [erreurCreation, setErreurCreation] = useState(null)

  const charger = useCallback(async () => {
    setErreur(null)
    const { data, error } = await supabase
      .from('produits')
      .select('*, variantes_produit(*)')
      .order('ordre', { ascending: true })
    if (error) {
      setErreur('Impossible de charger les produits.')
    } else {
      setProduits(data || [])
    }
    setChargement(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  function afficherMessage(id, texte) {
    setMessages((m) => ({ ...m, [id]: texte }))
    setTimeout(() => {
      setMessages((m) => ({ ...m, [id]: null }))
    }, 2500)
  }

  async function sauvegarderProduit(produit, changements) {
    const nouveau = { ...produit, ...changements }
    const { error } = await supabase.rpc('modifier_produit', {
      p_benevole_id: benevole.id,
      p_produit_id: produit.id,
      p_prix: nouveau.prix,
      p_actif: nouveau.actif,
      p_photo_url: nouveau.photo_url,
    })
    if (error) {
      afficherMessage(produit.id, "Erreur d'enregistrement")
      return false
    }
    setProduits((liste) =>
      liste.map((p) => (p.id === produit.id ? nouveau : p))
    )
    afficherMessage(produit.id, 'Enregistré ✓')
    return true
  }

  async function sauvegarderStock(variante, produitId, nouvelleValeur) {
    const valeur = Math.max(0, parseInt(nouvelleValeur, 10) || 0)
    const { error } = await supabase.rpc('modifier_stock', {
      p_benevole_id: benevole.id,
      p_variante_id: variante.id,
      p_stock_qty: valeur,
    })
    if (error) {
      afficherMessage(produitId, 'Erreur stock')
      return
    }
    setProduits((liste) =>
      liste.map((p) => {
        if (p.id !== produitId) return p
        return {
          ...p,
          variantes_produit: p.variantes_produit.map((v) =>
            v.id === variante.id ? { ...v, stock_qty: valeur } : v
          ),
        }
      })
    )
    afficherMessage(produitId, 'Stock mis à jour ✓')
  }

  // `blob` est toujours l'image déjà recadrée et compressée en JPEG carré
  // par la modale de recadrage (voir RecadrageModal) : l'extension et le
  // type sont donc fixes, quelle que soit la photo d'origine envoyée.
  async function changerPhoto(produit, blob) {
    setEnTransfert((t) => ({ ...t, [produit.id]: true }))
    const chemin = `${produit.id}-${Date.now()}.jpg`
    const { error: erreurUpload } = await supabase.storage
      .from(BUCKET_PHOTOS)
      .upload(chemin, blob, { upsert: true, contentType: 'image/jpeg' })
    if (erreurUpload) {
      setEnTransfert((t) => ({ ...t, [produit.id]: false }))
      afficherMessage(produit.id, "Échec de l'envoi de la photo")
      return
    }
    const { data: urlPublique } = supabase.storage
      .from(BUCKET_PHOTOS)
      .getPublicUrl(chemin)
    await sauvegarderProduit(produit, { photo_url: urlPublique.publicUrl })
    setEnTransfert((t) => ({ ...t, [produit.id]: false }))
  }

  async function confirmerRecadrage(blob) {
    const { produit } = recadrage
    setRecadrage(null)
    await changerPhoto(produit, blob)
  }

  function annulerRecadrage() {
    setRecadrage(null)
  }

  async function creerProduit(e) {
    e.preventDefault()
    setErreurCreation(null)
    if (!nouveauNom.trim()) {
      setErreurCreation('Le nom est obligatoire.')
      return
    }
    setCreationEnCours(true)
    const { error } = await supabase.rpc('ajouter_produit', {
      p_benevole_id: benevole.id,
      p_nom: nouveauNom.trim(),
      p_prix: parseFloat(nouveauPrix) || 0,
      p_necessite_taille: nouveauType !== 'sans_taille',
      p_jeu_tailles: nouveauType === 'sans_taille' ? null : nouveauType,
    })
    setCreationEnCours(false)
    if (error) {
      setErreurCreation("Erreur lors de la création du produit.")
      return
    }
    setNouveauNom('')
    setNouveauPrix('')
    setNouveauType('sans_taille')
    charger()
  }

  if (chargement) return <div className="chargement">Chargement…</div>
  if (erreur) return <p className="erreur">{erreur}</p>

  return (
    <>
      <div className="bloc">
        <h2>Nouveau produit</h2>
        <form className="formulaire-inline" onSubmit={creerProduit}>
          <div className="champ">
            <label>Nom</label>
            <input
              type="text"
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              placeholder="Ex : Débardeur running"
            />
          </div>
          <div className="champ">
            <label>Prix (€)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={nouveauPrix}
              onChange={(e) => setNouveauPrix(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="champ">
            <label>Type</label>
            <select value={nouveauType} onChange={(e) => setNouveauType(e.target.value)}>
              <option value="sans_taille">Sans taille (goodie)</option>
              <option value="adulte">Vêtement adulte (S à XXL)</option>
              <option value="enfant">Vêtement enfant (par âge)</option>
            </select>
          </div>
          <button className="bouton-principal" type="submit" disabled={creationEnCours}>
            {creationEnCours ? 'Création…' : '+ Ajouter ce produit'}
          </button>
        </form>
        {erreurCreation && <p className="erreur">{erreurCreation}</p>}
      </div>

      <div className="bloc">
        <h2>Gestion des produits</h2>
        <p style={{ color: 'var(--texte-clair)' }}>
          Les prix, le stock et les photos se mettent à jour immédiatement pour
          tous les bénévoles.
        </p>
        <div style={{ overflowX: 'auto' }}>
        <table className="tableau-admin">
          <thead>
            <tr>
              <th>Photo</th>
              <th>Produit</th>
              <th>Prix (€)</th>
              <th>Actif</th>
              <th>Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {produits.map((produit) => (
              <tr key={produit.id}>
                <td>
                  <div className="produit-image" style={{ width: 56, height: 56 }}>
                    {produit.photo_url ? (
                      <img src={produit.photo_url} alt={produit.nom} />
                    ) : (
                      '🛍️'
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!!enTransfert[produit.id]}
                    onChange={(e) => {
                      const fichier = e.target.files?.[0]
                      if (fichier) setRecadrage({ produit, fichier })
                      e.target.value = ''
                    }}
                  />
                </td>
                <td>
                  {produit.nom}
                  {!produit.prix && (
                    <div>
                      <span className="pastille a-definir">Prix à définir</span>
                    </div>
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    defaultValue={produit.prix}
                    onBlur={(e) => {
                      const valeur = parseFloat(e.target.value) || 0
                      if (valeur !== produit.prix) {
                        sauvegarderProduit(produit, { prix: valeur })
                      }
                    }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={produit.actif}
                    onChange={(e) =>
                      sauvegarderProduit(produit, { actif: e.target.checked })
                    }
                  />
                </td>
                <td>
                  {(produit.variantes_produit || [])
                    .slice()
                    .sort((a, b) => (a.taille || '').localeCompare(b.taille || ''))
                    .map((variante) => (
                      <div
                        key={variante.id}
                        style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}
                      >
                        {variante.taille && <span>{variante.taille}</span>}
                        <input
                          type="number"
                          min="0"
                          defaultValue={variante.stock_qty}
                          onBlur={(e) => {
                            if (parseInt(e.target.value, 10) !== variante.stock_qty) {
                              sauvegarderStock(variante, produit.id, e.target.value)
                            }
                          }}
                        />
                      </div>
                    ))}
                </td>
                <td>{messages[produit.id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      {recadrage && (
        <RecadrageModal
          fichier={recadrage.fichier}
          onValider={confirmerRecadrage}
          onAnnuler={annulerRecadrage}
        />
      )}
    </>
  )
}

