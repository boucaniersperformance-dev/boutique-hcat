import { useEffect, useState } from 'react'

// Clé localStorage : mémorise que le client a fermé la bannière, pour ne
// pas la lui réafficher à chaque visite. Protégé par try/catch : certains
// navigateurs (navigation privée, réglages stricts) bloquent localStorage.
const CLE_MASQUE = 'hcat_installer_masque'

function lire(cle) {
  try {
    return window.localStorage.getItem(cle)
  } catch {
    return null
  }
}

function ecrire(cle, valeur) {
  try {
    window.localStorage.setItem(cle, valeur)
  } catch {
    // Pas grave : la bannière réapparaîtra simplement à la prochaine visite.
  }
}

// Vrai si l'appli tourne déjà « installée » (lancée depuis l'écran
// d'accueil), auquel cas proposer l'installation n'a plus de sens.
function dejaInstallee() {
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true
  // iOS expose cette propriété non standard quand le site est lancé depuis
  // l'écran d'accueil.
  if (window.navigator.standalone) return true
  return false
}

// iOS/iPadOS n'a pas d'invite d'installation automatique (pas de
// beforeinstallprompt) : il faut guider le client dans le menu Partager.
// iPadOS 13+ se signale comme « Macintosh » mais garde l'écran tactile,
// d'où la deuxième condition.
function estIOS() {
  const ua = window.navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1
}

// Bannière « Installer sur l'écran d'accueil », affichée sur la page
// publique de commande. Sur Android/Chrome, propose l'installation native
// en un clic. Sur iOS (Safari, Chrome iOS…), affiche les étapes manuelles
// car il n'existe pas d'invite automatique sur ce système.
export default function InstallerAppli() {
  const [masquee, setMasquee] = useState(true)
  const [eventInstallation, setEventInstallation] = useState(null)
  const [ios, setIos] = useState(false)
  const [instructionsIOSOuvertes, setInstructionsIOSOuvertes] = useState(false)

  useEffect(() => {
    if (dejaInstallee()) return
    if (lire(CLE_MASQUE) === '1') return

    setIos(estIOS())
    setMasquee(false)

    // L'invite a pu être capturée avant même le montage de ce composant
    // (voir le script dans index.html, nécessaire car Chrome peut la
    // déclencher très tôt, par exemple pendant la vidéo d'intro) : on la
    // récupère tout de suite si elle est déjà disponible.
    if (window.__hcatInstallPrompt) {
      setEventInstallation(window.__hcatInstallPrompt)
    }

    function surInvite(evenement) {
      // Empêche la mini-infobar automatique du navigateur : on affiche
      // notre propre bouton, déclenché au moment choisi par le client.
      evenement.preventDefault()
      setEventInstallation(evenement)
      setMasquee(false)
    }
    function surInvitePrecoce() {
      if (window.__hcatInstallPrompt) setEventInstallation(window.__hcatInstallPrompt)
    }
    function surInstallee() {
      setMasquee(true)
      ecrire(CLE_MASQUE, '1')
    }

    window.addEventListener('beforeinstallprompt', surInvite)
    window.addEventListener('hcat-install-prompt-ready', surInvitePrecoce)
    window.addEventListener('appinstalled', surInstallee)
    return () => {
      window.removeEventListener('hcat-install-prompt-ready', surInvitePrecoce)
      window.removeEventListener('beforeinstallprompt', surInvite)
      window.removeEventListener('appinstalled', surInstallee)
    }
  }, [])

  function fermer() {
    setMasquee(true)
    setInstructionsIOSOuvertes(false)
    ecrire(CLE_MASQUE, '1')
  }

  async function installer() {
    if (eventInstallation) {
      eventInstallation.prompt()
      await eventInstallation.userChoice
      setEventInstallation(null)
      setMasquee(true)
      ecrire(CLE_MASQUE, '1')
      return
    }
    if (ios) {
      setInstructionsIOSOuvertes(true)
    }
  }

  // Sur Android, tant que le navigateur n'a pas encore déclenché
  // beforeinstallprompt (ça peut prendre quelques secondes), pas de bouton
  // utile à afficher. Sur iOS, le bouton ouvre toujours les instructions.
  if (masquee || (!ios && !eventInstallation)) return null

  return (
    <div className="bandeau-installer">
      <div className="bandeau-installer-contenu">
        <span className="bandeau-installer-icone">📲</span>
        <span>
          Garde cette page sous la main : installe-la sur l'écran d'accueil de ton
          téléphone pour retrouver facilement le suivi de ta commande.
        </span>
      </div>
      <div className="bandeau-installer-actions">
        <button type="button" className="bouton-principal" onClick={installer}>
          Installer
        </button>
        <button
          type="button"
          className="bouton-icone"
          title="Fermer"
          aria-label="Fermer"
          onClick={fermer}
        >
          ×
        </button>
      </div>

      {instructionsIOSOuvertes && (
        <div className="instructions-ios-fond" onClick={() => setInstructionsIOSOuvertes(false)}>
          <div className="instructions-ios-carte" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Installer sur iPhone / iPad</h3>
            <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
              <li>
                Touche le bouton <strong>Partager</strong> <span aria-hidden="true">⬆️</span> en
                bas (ou en haut) de l'écran Safari.
              </li>
              <li>
                Fais défiler et choisis <strong>« Sur l'écran d'accueil »</strong>.
              </li>
              <li>
                Touche <strong>« Ajouter »</strong> en haut à droite.
              </li>
            </ol>
            <button
              type="button"
              className="bouton-secondaire"
              onClick={() => {
                setInstructionsIOSOuvertes(false)
                fermer()
              }}
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
