import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import {
  comparerTailles,
  formatEuros,
  CATEGORIES,
  categorieProduit,
  stockTotalProduit,
} from '../constants.js'
import RecadrageModal from '../components/RecadrageModal.jsx'

const BUCKET_PHOTOS = 'produits-photos'

export default function AdminProduits({ benevole }) {
  const [produits, setProduits] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [messages, setMessages] = useState({})
  const [enTransfert, setEnTransfert] = useState({})

  const [recadrage, setRecadrage] = useState(null) // { produit, fichier, cible: 'principale' | 'supplementaire' }
  const [corbeilleOuverte, setCorbeilleOuverte] = useState(false)
  const [archiveOuverte, setArchiveOuverte] = useState(false)

  const [categoriesActives, setCategoriesActives] = useState(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c.cle, true]))
  )

  const [ligneOuverte, setLigneOuverte] = useState(null)
  const [nomEdite, setNomEdite] = useState('')
  const [referenceEdite, setReferenceEdite] = useState('')
  const [erreurEditionProduit, setErreurEditionProduit] = useState(null)
  const [actionEditionEnCours, setActionEditionEnCours] = useState(false)

  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauPrix, setNouveauPrix] = useState('')
  const [nouveauType, setNouveauType] = useState('sans_taille')
  const [creationEnCours, setCreationEnCours] = useState(false)
  const [erreurCreation, setErreurCreation] = useState(null)

  const charger = useCallback(async () => {
    setErreur(null)
    const { data, error } = await supabase
      .from('produits')
      .select('*, variantes_produit(*), produit_photos(*)')
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

  function parNomAlphabetique(a, b) {
    return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })
  }

  const produitsActifs = useMemo(
    () =>
      produits
        .filter(
          (p) =>
            !p.supprime_le &&
            !p.archive_le &&
            categoriesActives[categorieProduit(p)]
        )
        .sort(parNomAlphabetique),
    [produits, categoriesActives]
  )
  const produitsArchives = useMemo(
    () =>
      produits
        .filter((p) => !p.supprime_le && p.archive_le)
        .sort(parNomAlphabetique),
    [produits]
  )
  const produitsCorbeille = useMemo(
    () => produits.filter((p) => p.supprime_le).sort(parNomAlphabetique),
    [produits]
  )

  const comptesParCategorie = useMemo(() => {
    const compte = { adulte: 0, enfant: 0, goodies: 0 }
    produits
      .filter((p) => !p.supprime_le && !p.archive_le)
      .forEach((p) => {
        compte[categorieProduit(p)] += 1
      })
    return compte
  }, [produits])

  const toutesCategoriesActives = CATEGORIES.every((c) => categoriesActives[c.cle])

  function basculerCategorie(cle) {
    setCategoriesActives((etat) => ({ ...etat, [cle]: !etat[cle] }))
  }

  function basculerToutesCategories() {
    const nouvelEtat = !toutesCategoriesActives
    setCategoriesActives(
      Object.fromEntries(CATEGORIES.map((c) => [c.cle, nouvelEtat]))
    )
  }

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
    const { produit, cible } = recadrage
    setRecadrage(null)
    if (cible === 'supplementaire') {
      await ajouterPhotoSupplementaire(produit, blob)
    } else {
      await changerPhoto(produit, blob)
    }
  }

  function annulerRecadrage() {
    setRecadrage(null)
  }

  async function ajouterPhotoSupplementaire(produit, blob) {
    setEnTransfert((t) => ({ ...t, [produit.id]: true }))
    const chemin = `${produit.id}-extra-${Date.now()}.jpg`
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
    const { error } = await supabase.rpc('ajouter_photo_produit', {
      p_benevole_id: benevole.id,
      p_produit_id: produit.id,
      p_url: urlPublique.publicUrl,
    })
    setEnTransfert((t) => ({ ...t, [produit.id]: false }))
    if (error) {
      afficherMessage(produit.id, "Échec de l'ajout de la photo")
      return
    }
    afficherMessage(produit.id, 'Photo ajoutée ✓')
    charger()
  }

  async function supprimerPhotoSupplementaire(photo) {
    const { error } = await supabase.rpc('supprimer_photo_produit', {
      p_benevole_id: benevole.id,
      p_photo_id: photo.id,
    })
    if (error) return
    charger()
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

  function ouvrirEdition(produit) {
    if (ligneOuverte === produit.id) {
      setLigneOuverte(null)
      return
    }
    setLigneOuverte(produit.id)
    setNomEdite(produit.nom)
    setReferenceEdite(produit.reference || '')
    setErreurEditionProduit(null)
  }

  function fermerEdition() {
    setLigneOuverte(null)
  }

  async function renommerProduit(produit) {
    const nom = nomEdite.trim()
    if (!nom || nom === produit.nom) return
    setActionEditionEnCours(true)
    setErreurEditionProduit(null)
    const { error } = await supabase.rpc('renommer_produit', {
      p_benevole_id: benevole.id,
      p_produit_id: produit.id,
      p_nouveau_nom: nom,
    })
    setActionEditionEnCours(false)
    if (error) {
      setErreurEditionProduit(error.message || 'Erreur lors du renommage.')
      return
    }
    setProduits((liste) =>
      liste.map((p) => (p.id === produit.id ? { ...p, nom } : p))
    )
    afficherMessage(produit.id, 'Nom enregistré ✓')
  }

  async function enregistrerReference(produit) {
    const reference = referenceEdite.trim()
    if (reference === (produit.reference || '')) return
    setActionEditionEnCours(true)
    setErreurEditionProduit(null)
    const { error } = await supabase.rpc('definir_reference_produit', {
      p_benevole_id: benevole.id,
      p_produit_id: produit.id,
      p_reference: reference,
    })
    setActionEditionEnCours(false)
    if (error) {
      setErreurEditionProduit(error.message || "Erreur lors de l'enregistrement de la référence.")
      return
    }
    setProduits((liste) =>
      liste.map((p) => (p.id === produit.id ? { ...p, reference: reference || null } : p))
    )
    afficherMessage(produit.id, 'Référence enregistrée ✓')
  }

  async function mettreALaCorbeille(produit) {
    const { error } = await supabase.rpc('supprimer_produit', {
      p_benevole_id: benevole.id,
      p_produit_id: produit.id,
    })
    if (error) {
      afficherMessage(produit.id, 'Erreur')
      return
    }
    charger()
  }

  async function restaurerProduit(produit) {
    const { error } = await supabase.rpc('restaurer_produit', {
      p_benevole_id: benevole.id,
      p_produit_id: produit.id,
    })
    if (error) return
    charger()
  }

  async function archiverProduit(produit) {
    const { error } = await supabase.rpc('archiver_produit', {
      p_benevole_id: benevole.id,
      p_produit_id: produit.id,
    })
    if (error) {
      afficherMessage(produit.id, 'Erreur')
      return
    }
    charger()
  }

  async function desarchiverProduit(produit) {
    const { error } = await supabase.rpc('desarchiver_produit', {
      p_benevole_id: benevole.id,
      p_produit_id: produit.id,
    })
    if (error) return
    charger()
  }

  async function supprimerDefinitivement(produit) {
    if (
      !window.confirm(
        `Supprimer définitivement "${produit.nom}" ? Cette action est irréversible (son historique de ventes est conservé, mais la fiche produit disparaît).`
      )
    ) {
      return
    }
    const { error } = await supabase.rpc('supprimer_produit_definitivement', {
      p_benevole_id: benevole.id,
      p_produit_id: produit.id,
    })
    if (error) return
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
          tous les bénévoles. Triés par ordre alphabétique.
        </p>

        <aside className="filtres-categories" style={{ marginBottom: 16 }}>
          <h2>Filtrer</h2>
          <button
            type="button"
            className="bouton-tout-filtres"
            onClick={basculerToutesCategories}
          >
            {toutesCategoriesActives ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
          {CATEGORIES.map((cat) => (
            <label className="filtre-case" key={cat.cle}>
              <input
                type="checkbox"
                checked={categoriesActives[cat.cle]}
                onChange={() => basculerCategorie(cat.cle)}
              />
              {cat.label}
              <span className="compte">{comptesParCategorie[cat.cle]}</span>
            </label>
          ))}
        </aside>

        <div style={{ overflowX: 'auto' }}>
        <table className="tableau-admin">
          <thead>
            <tr>
              <th>Photo</th>
              <th>Produit</th>
              <th>Prix (€)</th>
              <th>Actif</th>
              <th>Stock</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {produitsActifs.map((produit) => (
              <Fragment key={produit.id}>
              <tr>
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
                      if (fichier) setRecadrage({ produit, fichier, cible: 'principale' })
                      e.target.value = ''
                    }}
                  />

                  <div className="photos-supp">
                    {(produit.produit_photos || [])
                      .slice()
                      .sort((a, b) => a.ordre - b.ordre)
                      .map((photo) => (
                        <div className="photo-supp-vignette" key={photo.id}>
                          <img src={photo.url} alt="" />
                          <button
                            type="button"
                            title="Retirer cette photo"
                            onClick={() => supprimerPhotoSupplementaire(photo)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    <label className="photo-supp-ajout" title="Ajouter une photo (ex : dos)">
                      +
                      <input
                        type="file"
                        accept="image/*"
                        disabled={!!enTransfert[produit.id]}
                        onChange={(e) => {
                          const fichier = e.target.files?.[0]
                          if (fichier) setRecadrage({ produit, fichier, cible: 'supplementaire' })
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                </td>
                <td>
                  {produit.nom}
                  <div className="reference-produit">
                    Réf. : {produit.reference || '—'}
                  </div>
                  {!produit.prix && (
                    <div>
                      <span className="pastille a-definir">Prix à définir</span>
                    </div>
                  )}
                  {(() => {
                    const stock = stockTotalProduit(produit)
                    return stock !== null && stock <= 0 ? (
                      <div>
                        <span className="pastille masque">
                          Masqué en vente (stock à 0)
                        </span>
                      </div>
                    ) : null
                  })()}
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
                    .sort((a, b) => comparerTailles(a.taille, b.taille))
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
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="bouton-icone"
                      title="Modifier le nom / la référence"
                      onClick={() => ouvrirEdition(produit)}
                    >
                      ✏️
                    </button>
                    <button
                      className="bouton-icone"
                      title="Archiver (on ne le commande plus pour l'instant, mais on garde sa fiche)"
                      onClick={() => archiverProduit(produit)}
                    >
                      📦
                    </button>
                    <button
                      className="bouton-icone"
                      title="Mettre à la corbeille"
                      onClick={() => mettreALaCorbeille(produit)}
                    >
                      🗑️
                    </button>
                    {messages[produit.id]}
                  </div>
                </td>
              </tr>
              {ligneOuverte === produit.id && (
                <tr>
                  <td colSpan={6}>
                    <div className="panneau-edition">
                      <div className="champ">
                        <label>Nom (affiché sur l'écran de vente)</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            type="text"
                            value={nomEdite}
                            onChange={(e) => setNomEdite(e.target.value)}
                          />
                          <button
                            className="bouton-secondaire"
                            disabled={
                              actionEditionEnCours ||
                              !nomEdite.trim() ||
                              nomEdite.trim() === produit.nom
                            }
                            onClick={() => renommerProduit(produit)}
                          >
                            Enregistrer le nom
                          </button>
                        </div>
                      </div>

                      <div className="champ">
                        <label>
                          Référence (code interne pour le stock, ex : code
                          fournisseur — non visible en vente)
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            type="text"
                            value={referenceEdite}
                            placeholder="Ex : HCT-PULL-001"
                            onChange={(e) => setReferenceEdite(e.target.value)}
                          />
                          <button
                            className="bouton-secondaire"
                            disabled={
                              actionEditionEnCours ||
                              referenceEdite.trim() === (produit.reference || '')
                            }
                            onClick={() => enregistrerReference(produit)}
                          >
                            Enregistrer la référence
                          </button>
                        </div>
                      </div>

                      {erreurEditionProduit && <p className="erreur">{erreurEditionProduit}</p>}

                      <button className="bouton-secondaire" onClick={fermerEdition}>
                        Fermer
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      <div className="bloc">
        <button
          className="bouton-secondaire"
          onClick={() => setArchiveOuverte((v) => !v)}
        >
          📦 Archivés ({produitsArchives.length}){' '}
          {archiveOuverte ? '▲' : '▼'}
        </button>
        {archiveOuverte && (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            {produitsArchives.length === 0 ? (
              <p style={{ color: 'var(--texte-clair)' }}>Aucun produit archivé.</p>
            ) : (
              <table className="tableau-admin">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Prix (€)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {produitsArchives.map((produit) => (
                    <tr key={produit.id}>
                      <td>{produit.nom}</td>
                      <td>{formatEuros(produit.prix)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="bouton-secondaire"
                            onClick={() => desarchiverProduit(produit)}
                          >
                            ♻️ Désarchiver
                          </button>
                          <button
                            className="bouton-icone"
                            title="Mettre à la corbeille"
                            onClick={() => mettreALaCorbeille(produit)}
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
        )}
      </div>

      <div className="bloc">
        <button
          className="bouton-secondaire"
          onClick={() => setCorbeilleOuverte((v) => !v)}
        >
          🗑️ Corbeille ({produitsCorbeille.length}){' '}
          {corbeilleOuverte ? '▲' : '▼'}
        </button>
        {corbeilleOuverte && (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            {produitsCorbeille.length === 0 ? (
              <p style={{ color: 'var(--texte-clair)' }}>La corbeille est vide.</p>
            ) : (
              <table className="tableau-admin">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Prix (€)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {produitsCorbeille.map((produit) => (
                    <tr key={produit.id}>
                      <td>{produit.nom}</td>
                      <td>{formatEuros(produit.prix)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="bouton-secondaire"
                            onClick={() => restaurerProduit(produit)}
                          >
                            ♻️ Restaurer
                          </button>
                          <button
                            className="bouton-icone"
                            title="Supprimer définitivement"
                            onClick={() => supprimerDefinitivement(produit)}
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
        )}
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

