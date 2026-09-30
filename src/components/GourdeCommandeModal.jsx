import { useMemo, useState } from 'react'
import { formatEuros } from '../constants.js'
import logoSrc from './GourdePerso/logo-boucaniers.webp'
import { POSES, trouverPose } from './GourdePerso/poses'
import { useOswald, creerMesure } from './GourdePerso/police'
import { svgApercu, nettoyerPrenom, nettoyerNumero } from './GourdePerso/etiquetteGourde'

// Garde uniquement les chiffres (et un + en tête) d'un numéro de téléphone
function nettoyerTelephone(t) {
  const s = String(t || '').trim()
  return (s.startsWith('+') ? '+' : '') + s.replace(/\D/g, '').slice(0, 15)
}

const telephoneValide = (t) => t.replace(/\D/g, '').length >= 10

// Modale de commande « Custom Gourde » : prénom, numéro de maillot,
// illustration, contact du parent, puis ajout au panier ou paiement direct.
export default function GourdeCommandeModal({ produit, onValider, onValiderEtPayer, onFermer }) {
  const [prenom, setPrenom] = useState('')
  const [numero, setNumero] = useState('')
  const [poseId, setPoseId] = useState(POSES[0].id)
  const [contactNom, setContactNom] = useState('')
  const [contactTel, setContactTel] = useState('')
  const [stickers, setStickers] = useState(true)
  const policePrete = useOswald()
  const pose = trouverPose(poseId)

  const apercu = useMemo(
    () =>
      svgApercu({
        prenom,
        numero,
        logoUrl: new URL(logoSrc, window.location.href).href,
        joueurUrl: new URL(pose.src, window.location.href).href,
        joueurRatio: pose.ratio,
        mesurer: creerMesure(),
      }),
    // policePrete : on remesure une fois Oswald chargée
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prenom, numero, pose, policePrete]
  )

  const prenomOk = nettoyerPrenom(prenom) !== ''
  const contactOk = contactNom.trim() !== ''
  const telOk = telephoneValide(contactTel)
  const complet = prenomOk && contactOk && telOk

  function details() {
    return {
      prenom: nettoyerPrenom(prenom),
      numero: nettoyerNumero(numero),
      illustration: pose.id,
      contact_nom: contactNom.trim(),
      contact_tel: nettoyerTelephone(contactTel),
      stickers,
    }
  }

  return (
    <div className="fond-modale" onClick={onFermer}>
      <div className="modale" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2>{produit.nom}</h2>
        <p style={{ color: 'var(--texte-clair)' }}>
          {formatEuros(produit.prix)} · étiquette de gourde{stickers ? ' + 6 stickers' : ''}, remise au match suivant
        </p>

        <div
          style={{ borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,17,74,.15)', margin: '10px 0' }}
          dangerouslySetInnerHTML={{ __html: apercu }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div className="champ">
            <label>Prénom *</label>
            <input
              value={prenom}
              maxLength={14}
              autoComplete="off"
              placeholder="Spencer"
              onChange={(e) => setPrenom(e.target.value)}
            />
          </div>
          <div className="champ">
            <label>Numéro maillot</label>
            <input
              value={numero}
              inputMode="numeric"
              placeholder="77"
              onChange={(e) => setNumero(nettoyerNumero(e.target.value))}
            />
          </div>
        </div>

        <div className="champ" style={{ marginBottom: 4 }}>
          <label>Illustration</label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {POSES.map((p) => {
            const actif = p.id === pose.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPoseId(p.id)}
                aria-pressed={actif}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  padding: 4, borderRadius: 10, background: '#fff',
                  border: actif ? '3px solid var(--bleu)' : '1px solid var(--bordure)',
                }}
              >
                <img src={p.src} alt="" style={{ width: '100%', height: 44, objectFit: 'contain' }} />
                <span style={{ fontSize: 11, fontWeight: actif ? 700 : 500 }}>{p.nom}</span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="champ">
            <label>Nom du contact *</label>
            <input
              value={contactNom}
              autoComplete="off"
              placeholder="Nom du parent"
              onChange={(e) => setContactNom(e.target.value)}
            />
          </div>
          <div className="champ">
            <label>Téléphone du contact *</label>
            <input
              value={contactTel}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="06 12 34 56 78"
              onChange={(e) => setContactTel(e.target.value)}
            />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 4px', fontWeight: 600, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={stickers}
            onChange={(e) => setStickers(e.target.checked)}
            style={{ width: 22, height: 22 }}
          />
          Avec les 6 petits stickers prénom + numéro (casque, crosse, sac)
        </label>

        {contactTel && !telOk && (
          <p style={{ fontSize: '0.8rem', color: 'var(--rouge)', marginTop: -6 }}>
            Numéro de téléphone incomplet (10 chiffres).
          </p>
        )}

        <div className="modale-actions">
          <button className="bouton-secondaire" onClick={onFermer}>
            Annuler
          </button>
          <button className="bouton-principal" disabled={!complet} onClick={() => onValider(details())}>
            Ajouter au panier
          </button>
        </div>
        <button
          className="bouton-payer-maintenant"
          disabled={!complet}
          onClick={() => onValiderEtPayer(details())}
        >
          ⚡ Payer maintenant
        </button>
      </div>
    </div>
  )
}
