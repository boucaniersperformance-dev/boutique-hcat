import { useLayoutEffect, useMemo, useRef, useState } from 'react'

const TAILLE_SORTIE = 800 // px, la photo enregistrée sera toujours un carré de cette taille
const ZOOM_MAX = 4

// Modale de recadrage : l'utilisateur choisit une photo depuis son appareil,
// puis la déplace / zoome dans un cadre carré avant de valider. Ce qui est
// visible dans le cadre est exactement ce qui sera enregistré (pas de zone
// masquée) — la photo de sortie est toujours un carré, ce qui règle le
// cadrage ET réduit sa taille (JPEG ~800x800), quelle que soit la photo
// d'origine envoyée par le bénévole.
export default function RecadrageModal({ fichier, onValider, onAnnuler }) {
  const urlImage = useMemo(() => URL.createObjectURL(fichier), [fichier])
  const zoneRef = useRef(null)
  const imgRef = useRef(null)
  const glissement = useRef(null)

  const [tailleNaturelle, setTailleNaturelle] = useState(null) // { w, h }
  const [echelleBase, setEchelleBase] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [pret, setPret] = useState(false)

  function limiter(pos, echelle, taille, naturelle) {
    const largeurImg = naturelle.w * echelle
    const hauteurImg = naturelle.h * echelle
    const minX = taille - largeurImg
    const minY = taille - hauteurImg
    return {
      x: Math.min(0, Math.max(minX, pos.x)),
      y: Math.min(0, Math.max(minY, pos.y)),
    }
  }

  // Une fois la taille réelle de l'image connue, on calcule l'échelle
  // minimale qui remplit le cadre (comme un fond "cover") et on centre.
  useLayoutEffect(() => {
    if (!tailleNaturelle || !zoneRef.current) return
    const taille = zoneRef.current.clientWidth
    const base = Math.max(taille / tailleNaturelle.w, taille / tailleNaturelle.h)
    setEchelleBase(base)
    setZoom(1)
    setPosition({
      x: (taille - tailleNaturelle.w * base) / 2,
      y: (taille - tailleNaturelle.h * base) / 2,
    })
    setPret(true)
  }, [tailleNaturelle])

  function changerZoom(nouveauZoom) {
    if (!echelleBase || !zoneRef.current || !tailleNaturelle) return
    const taille = zoneRef.current.clientWidth
    const ancienneEchelle = echelleBase * zoom
    const nouvelleEchelle = echelleBase * nouveauZoom
    const centreX = taille / 2
    const centreY = taille / 2
    const pointImgX = (centreX - position.x) / ancienneEchelle
    const pointImgY = (centreY - position.y) / ancienneEchelle
    const nouvellePos = limiter(
      { x: centreX - pointImgX * nouvelleEchelle, y: centreY - pointImgY * nouvelleEchelle },
      nouvelleEchelle,
      taille,
      tailleNaturelle
    )
    setZoom(nouveauZoom)
    setPosition(nouvellePos)
  }

  function debuterGlissement(e) {
    if (!pret) return
    e.currentTarget.setPointerCapture(e.pointerId)
    glissement.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y }
  }

  function poursuivreGlissement(e) {
    if (!glissement.current || !zoneRef.current || !tailleNaturelle) return
    const taille = zoneRef.current.clientWidth
    const echelle = echelleBase * zoom
    const dx = e.clientX - glissement.current.x
    const dy = e.clientY - glissement.current.y
    setPosition(
      limiter(
        { x: glissement.current.posX + dx, y: glissement.current.posY + dy },
        echelle,
        taille,
        tailleNaturelle
      )
    )
  }

  function terminerGlissement() {
    glissement.current = null
  }

  function valider() {
    if (!pret || !zoneRef.current || !tailleNaturelle) return
    const taille = zoneRef.current.clientWidth
    const echelle = echelleBase * zoom
    const sourceX = -position.x / echelle
    const sourceY = -position.y / echelle
    const sourceTaille = taille / echelle

    const canvas = document.createElement('canvas')
    canvas.width = TAILLE_SORTIE
    canvas.height = TAILLE_SORTIE
    const ctx = canvas.getContext('2d')
    ctx.drawImage(
      imgRef.current,
      sourceX,
      sourceY,
      sourceTaille,
      sourceTaille,
      0,
      0,
      TAILLE_SORTIE,
      TAILLE_SORTIE
    )
    canvas.toBlob(
      (blob) => {
        URL.revokeObjectURL(urlImage)
        if (blob) onValider(blob)
      },
      'image/jpeg',
      0.85
    )
  }

  function annuler() {
    URL.revokeObjectURL(urlImage)
    onAnnuler()
  }

  const echelle = echelleBase ? echelleBase * zoom : null

  return (
    <div className="fond-modale" onClick={annuler}>
      <div className="modale" onClick={(e) => e.stopPropagation()}>
        <h2>Recadrer la photo</h2>
        <p style={{ color: 'var(--texte-clair)', fontSize: '0.85rem' }}>
          Déplace et zoome pour centrer l'article. Ce qui est visible dans le
          cadre est exactement ce qui sera enregistré.
        </p>

        <div
          ref={zoneRef}
          className="recadrage-zone"
          onPointerDown={debuterGlissement}
          onPointerMove={poursuivreGlissement}
          onPointerUp={terminerGlissement}
          onPointerCancel={terminerGlissement}
        >
          <img
            ref={imgRef}
            src={urlImage}
            alt=""
            draggable={false}
            onLoad={(e) =>
              setTailleNaturelle({
                w: e.target.naturalWidth,
                h: e.target.naturalHeight,
              })
            }
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transformOrigin: '0 0',
              transform: echelle
                ? `translate(${position.x}px, ${position.y}px) scale(${echelle})`
                : 'none',
              visibility: pret ? 'visible' : 'hidden',
              maxWidth: 'none',
            }}
          />
        </div>

        <div className="recadrage-controles">
          <span>🔍−</span>
          <input
            type="range"
            min="1"
            max={ZOOM_MAX}
            step="0.01"
            value={zoom}
            disabled={!pret}
            onChange={(e) => changerZoom(parseFloat(e.target.value))}
          />
          <span>🔍+</span>
        </div>

        <div className="modale-actions">
          <button className="bouton-secondaire" onClick={annuler}>
            Annuler
          </button>
          <button className="bouton-principal" onClick={valider} disabled={!pret}>
            Valider
          </button>
        </div>
      </div>
    </div>
  )
}

