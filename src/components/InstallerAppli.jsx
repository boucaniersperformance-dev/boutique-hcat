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

// Samsung Internet (navigateur par défaut sur beaucoup de téléphones
// Samsung) a un bug largement documenté, toujours ouvert début 2026 : son
// installation de PWA échoue ou déclenche un faux avertissement Play
// Protect — y compris pour des applis parfaitement correctes. On ne peut
// rien corriger côté code : la seule solution fiable est d'orienter le
// client vers Chrome pour installer.
function estSamsungInternet() {
  return /SamsungBrowser/i.test(window.navigator.userAgent || '')
}

// Tente d'ouvrir l'URL actuelle directement dans Chrome via un lien
// « intent » Android (fonctionne même si Chrome n'est pas le navigateur
// en cours) ; si ça échoue, les instructions affichées à l'écran servent
// de solution de repli.
function ouvrirDansChrome() {
  const urlSansSchema = window.location.href.replace(/^https?:\/\//, '')
  window.location.href = `intent://${urlSansSchema}#Intent;scheme=https;package=com.android.chrome;end`
}

async function copierLien() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    return true
  } catch {
    return false
  }
}

// Bannière « Installer sur l'écran d'accueil », affichée sur la page
// publique de commande.
// - Android/Chrome (et la plupart des navigateurs Chromium) : propose
//   l'installation native en un clic.
// - iOS (Safari, Chrome iOS…) : pas d'invite automatique sur ce système,
//   affiche les étapes manuelles (menu Partager).
// - Samsung Internet : bug connu du navigateur (voir estSamsungInternet
//   ci-dessus) — redirige vers Chrome plutôt que de tenter une
//   installation qui échouera.
export default function InstallerAppli() {
  const [masquee, setMasquee] = useState(true)
  const [eventInstallation, setEventInstallation] = useState(null)
  const [ios, setIos] = useState(false)
  const [samsung, setSamsung] = useState(false)
  const [instructionsOuvertes, setInstructionsOuvertes] = useState(false)
  const [lienCopie, setLienCopie] = useState(false)

  useEffect(() => {
    if (dejaInstallee()) return
    if (lire(CLE_MASQUE) === '1') return

    setIos(estIOS())
    setSamsung(estSamsungInternet())
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
    setInstructionsOuvertes(false)
    ecrire(CLE_MASQUE, '1')
  }

  async function installer() {
    // Priorité au contournement Samsung Internet, même si une invite
    // native a été capturée : elle échoue ou affiche un faux
    // avertissement sur ce navigateur, ouvrir Chrome est plus fiable.
    if (samsung) {
      setInstructionsOuvertes(true)
      ouvrirDansChrome()
      return
    }
    if (eventInstallation) {
      eventInstallation.prompt()
      await eventInstallation.userChoice
      setEventInstallation(null)
      setMasquee(true)
      ecrire(CLE_MASQUE, '1')
      return
    }
    if (ios) {
      setInstructionsOuvertes(true)
    }
  }

  // Pas de bouton utile tant qu'on n'a pas identifié une situation gérée :
  // Samsung Internet (toujours), iOS (toujours, instructions manuelles),
  // ou Android/Chrome une fois l'invite native reçue.
  if (masquee || (!ios && !samsung && !eventInstallation)) return null

  return (
    <div className="bandeau-installer">
      <div className="bandeau-installer-contenu">
        <span className="bandeau-installer-icone">📲</span>
        <span>
          {samsung
            ? "Garde cette page sous la main : pour l'installer sur l'écran d'accueil, ouvre-la dans Chrome (Samsung Internet a un bug connu qui empêche l'installation en ce moment)."
            : "Garde cette page sous la main : installe-la sur l'écran d'accueil de ton téléphone pour retrouver facilement le suivi de ta commande."}
        </span>
      </div>
      <div className="bandeau-installer-actions">
        <button type="button" className="bouton-principal" onClick={installer}>
          {samsung ? 'Ouvrir dans Chrome' : 'Installer'}
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

      {instructionsOuvertes && ios && (
        <div className="instructions-ios-fond" onClick={() => setInstructionsOuvertes(false)}>
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
                setInstructionsOuvertes(false)
                fermer()
              }}
            >
              Compris
            </button>
          </div>
        </div>
      )}

      {instructionsOuvertes && samsung && (
        <div className="instructions-ios-fond" onClick={() => setInstructionsOuvertes(false)}>
          <div className="instructions-ios-carte" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Installer depuis Chrome</h3>
            <p style={{ color: 'var(--texte-clair)' }}>
              Samsung Internet a un bug connu en ce moment qui empêche l'installation de pages
              comme celle-ci. On essaie d'ouvrir Chrome automatiquement — si rien ne se passe :
            </p>
            <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
              <li>Ouvre l'application Chrome sur ton téléphone.</li>
              <li>
                Colle-y ce lien dans la barre d'adresse :
                <div
                  style={{
                    marginTop: 6,
                    padding: '8px 10px',
                    background: 'var(--fond)',
                    borderRadius: 8,
                    fontSize: '0.8rem',
                    wordBreak: 'break-all',
                  }}
                >
                  {window.location.href}
                </div>
              </li>
              <li>Une fois sur la page dans Chrome, touche « Installer » dans la bannière.</li>
            </ol>
            <button
              type="button"
              className="bouton-secondaire"
              style={{ marginRight: 8 }}
              onClick={async () => {
                const ok = await copierLien()
                setLienCopie(ok)
              }}
            >
              {lienCopie ? '✓ Lien copié' : 'Copier le lien'}
            </button>
            <button
              type="button"
              className="bouton-secondaire"
              onClick={() => {
                setInstructionsOuvertes(false)
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
