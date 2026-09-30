import { useEffect, useRef } from 'react'

// Fait en sorte que la touche/geste "retour" du téléphone (ou le bouton
// "précédent" du navigateur) referme une fenêtre superposée (modale,
// popup...) au lieu de faire quitter l'application.
//
// À appeler SANS CONDITION dans le corps du composant, en lui passant l'état
// "ouvert" et la fonction qui referme :
//
//   useFermetureRetour(paiementOuvert, () => setPaiementOuvert(false))
//
// ...ou, dans un composant de fenêtre toujours monté quand il est affiché :
//
//   useFermetureRetour(true, onFermer)
//
// Tant que `ouvert` est vrai, une entrée est ajoutée à l'historique de
// navigation du navigateur. Un retour arrière la consomme et appelle
// `fermer` au lieu de faire sortir de l'appli — une nouvelle entrée est
// aussitôt reposée pour rester protégé si `fermer` refuse de fermer (ex :
// un enregistrement est en cours). Si la fenêtre se ferme autrement (bouton
// Annuler, clic en dehors, validation...), l'entrée ajoutée à l'ouverture
// est retirée pour ne pas laisser d'entrée fantôme dans l'historique.
export function useFermetureRetour(ouvert, fermer) {
  const fermerRef = useRef(fermer)
  fermerRef.current = fermer

  useEffect(() => {
    if (!ouvert) return undefined

    window.history.pushState({ hcatFenetre: true }, '')
    let entreePresente = true

    function surRetour() {
      window.history.pushState({ hcatFenetre: true }, '')
      fermerRef.current()
    }

    window.addEventListener('popstate', surRetour)

    return () => {
      window.removeEventListener('popstate', surRetour)
      if (entreePresente) {
        entreePresente = false
        window.history.back()
      }
    }
  }, [ouvert])
}
