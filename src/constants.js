// Jeux de tailles disponibles selon le type d'article.
// Ces libellés doivent correspondre exactement à ceux stockés en base
// (colonne `taille` de la table `variantes_produit`).
export const TAILLES_ADULTE = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
export const TAILLES_ENFANT = ['5-6 ans', '7-9 ans', '10-12 ans']

export function taillesPourJeu(jeuTailles) {
  if (jeuTailles === 'adulte') return TAILLES_ADULTE
  if (jeuTailles === 'enfant') return TAILLES_ENFANT
  return []
}

// Ordre logique des tailles (XS→XXL, puis les tranches d'âge), pour trier
// les lignes de stock au lieu de l'ordre alphabétique par défaut.
const ORDRE_TAILLES = [...TAILLES_ADULTE, ...TAILLES_ENFANT]

export function comparerTailles(a, b) {
  const ia = ORDRE_TAILLES.indexOf(a || '')
  const ib = ORDRE_TAILLES.indexOf(b || '')
  if (ia === -1 && ib === -1) return (a || '').localeCompare(b || '')
  if (ia === -1) return 1
  if (ib === -1) return -1
  return ia - ib
}

export function formatEuros(montant) {
  const nombre = Number(montant) || 0
  return nombre.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  })
}

export const SEUIL_STOCK_BAS = 3

// Catégories utilisées pour le filtre de l'écran de vente. Déduites des
// champs déjà en base (necessite_taille / jeu_tailles) : pas besoin de
// colonne supplémentaire.
export const CATEGORIES = [
  { cle: 'adulte', label: 'Vêtements adulte' },
  { cle: 'enfant', label: 'Vêtements enfant' },
  { cle: 'goodies', label: 'Goodies' },
]

export function categorieProduit(produit) {
  if (produit.necessite_taille && produit.jeu_tailles === 'adulte') return 'adulte'
  if (produit.necessite_taille && produit.jeu_tailles === 'enfant') return 'enfant'
  return 'goodies'
}

// Photo principale (produits.photo_url) + photos supplémentaires (ex :
// face/dos, table produit_photos), dans l'ordre d'ajout.
export function photosProduit(produit) {
  const supplementaires = (produit.produit_photos || [])
    .slice()
    .sort((a, b) => a.ordre - b.ordre)
    .map((p) => p.url)
  return [produit.photo_url, ...supplementaires].filter(Boolean)
}
