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
// Tant qu'au moins une fenêtre protégée est ouverte quelque part sur la
// page, UNE SEULE entrée est ajoutée à l'historique de navigation. Un
// retour arrière la consomme et referme la fenêtre la plus récemment
// ouverte au lieu de faire sortir de l'appli — une nouvelle entrée est
// aussitôt reposée pour rester protégé si "fermer" refuse de fermer (ex :
// un enregistrement est en cours). Quand la dernière fenêtre protégée se
// ferme "normalement" (bouton Annuler, clic en dehors, validation...),
// cette entrée est retirée pour ne pas laisser d'entrée fantôme dans
// l'historique.
//
// Tout ceci est coordonné par un seul état partagé (module-level, commun à
// toutes les fenêtres protégées de la page) plutôt que par chaque fenêtre
// individuellement. C'est important : si une fenêtre se ferme PENDANT
// qu'une autre s'ouvre dans le même rendu (ex. la modale de paiement se
// ferme au moment même où l'écran de succès s'affiche), on ne veut ni
// retirer ni ajouter d'entrée — on reste protégé sans interruption, sans
// jamais dépendre de l'ordre ou du délai avec lequel les événements
// "popstate" du navigateur arrivent (ils sont toujours asynchrones, jamais
// immédiats). La décision (ajouter une entrée / la retirer / ne rien
// faire) n'est donc jamais prise directement dans l'effet d'une fenêtre,
// mais un instant plus tard (microtâche), une fois que TOUS les
// changements du rendu en cours ont été appliqués — à ce moment-là, seul
// l'état réel (y a-t-il encore au moins une fenêtre ouverte ?) compte,
// jamais l'ordre dans lequel les fenêtres se sont ouvertes ou fermées.

const fenetresOuvertes = [] // pile des fenêtres protégées actuellement montées, dans l'ordre d'ouverture
let entreeHistoriquePresente = false
let synchronisationPrevue = false
let ecouteurInstalle = false

function synchroniserHistorique() {
  const doitEtreProtege = fenetresOuvertes.length > 0
  if (doitEtreProtege && !entreeHistoriquePresente) {
    entreeHistoriquePresente = true
    window.history.pushState({ hcatFenetre: true }, '')
  } else if (!doitEtreProtege && entreeHistoriquePresente) {
    entreeHistoriquePresente = false
    window.history.back()
  }
}

function planifierSynchronisation() {
  if (synchronisationPrevue) return
  synchronisationPrevue = true
  queueMicrotask(() => {
    synchronisationPrevue = false
    synchroniserHistorique()
  })
}

function assurerEcouteur() {
  if (ecouteurInstalle) return
  ecouteurInstalle = true
  window.addEventListener('popstate', () => {
    // Si aucune entrée n'est actuellement posée pour notre compte, ce
    // popstate ne vient pas d'un appui utilisateur sur une entrée qu'on
    // protège (c'est soit le retour "naturel" d'un back() qu'on a
    // nous-même déclenché lors d'une fermeture normale, déjà pris en
    // compte à ce moment-là, soit un retour hors de toute protection) —
    // rien à faire.
    if (!entreeHistoriquePresente) return

    // Vrai appui sur "retour" consommant notre entrée : on referme la
    // fenêtre la plus récemment ouverte.
    entreeHistoriquePresente = false
    const derniere = fenetresOuvertes[fenetresOuvertes.length - 1]
    derniere?.fermer()

    // Se re-protège aussitôt si besoin (fenêtre encore ouverte, que
    // "fermer" ait réussi à la fermer ou non).
    planifierSynchronisation()
  })
}

export function useFermetureRetour(ouvert, fermer) {
  const fermerRef = useRef(fermer)
  fermerRef.current = fermer

  useEffect(() => {
    if (!ouvert) return undefined

    assurerEcouteur()
    const fenetre = { fermer: () => fermerRef.current() }
    fenetresOuvertes.push(fenetre)
    planifierSynchronisation()

    return () => {
      const i = fenetresOuvertes.indexOf(fenetre)
      if (i !== -1) fenetresOuvertes.splice(i, 1)
      planifierSynchronisation()
    }
  }, [ouvert])
}
