import { useMemo, useState } from 'react'

// Vidéos d'intro affichées à l'ouverture du site (une au hasard parmi les
// trois) — fichiers dans public/intro/, servis directement par Vite/Vercel
// à la racine (/intro/...), comme /logo.png.
const VIDEOS = ['/intro/bucky-check.mp4', '/intro/bucky-pass.mp4', '/intro/bucky-trophy.mp4']

// Plein écran, lecture automatique (donc muette : obligatoire pour que les
// navigateurs l'autorisent), se ferme toute seule à la fin de la vidéo ou
// dès qu'on touche/clique l'écran. onTerminer est appelé une seule fois.
export default function IntroVideo({ onTerminer }) {
  // Tirage au hasard une seule fois par montage du composant (donc une
  // fois par ouverture du site), pas à chaque rendu.
  const video = useMemo(() => VIDEOS[Math.floor(Math.random() * VIDEOS.length)], [])
  const [disparait, setDisparait] = useState(false)

  function terminer() {
    if (disparait) return
    setDisparait(true)
    // Laisse le temps au fondu CSS de se jouer avant de démonter.
    setTimeout(onTerminer, 250)
  }

  return (
    <div
      className={`intro-video-fond${disparait ? ' disparait' : ''}`}
      onClick={terminer}
      role="button"
      aria-label="Passer l'introduction"
    >
      <video
        className="intro-video"
        src={video}
        autoPlay
        muted
        playsInline
        onEnded={terminer}
        onError={terminer}
      />
      <div className="intro-video-passer">Toucher l'écran pour passer</div>
    </div>
  )
}
