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

// Âges disponibles pour ajouter/corriger une taille enfant par âge précis
// (ex : "8 ans"), en plus des tranches par défaut ("5-6 ans"...) créées à
// la création du produit — utilisé pour le menu déroulant de l'écran
// Produits, afin de ne jamais avoir à taper "ans" à la main.
export const AGES_ENFANT = Array.from({ length: 8 }, (_, i) => `${i + 5} ans`)

// Ordre logique des tailles (XS→XXL, puis les tranches d'âge par défaut),
// pour trier les lignes de stock au lieu de l'ordre alphabétique par défaut.
const ORDRE_TAILLES = [...TAILLES_ADULTE, ...TAILLES_ENFANT]

// Premier nombre trouvé dans un libellé de taille (ex : 5 dans "5-6 ans",
// 8 dans "8 ans"). Sert à trier par ordre numérique croissant les tailles
// ajoutées manuellement (âges précis), qui ne font pas partie du jeu
// standard ci-dessus et n'auraient donc sinon qu'un tri alphabétique
// (ce qui classerait "10 ans" avant "5 ans").
function premierNombre(taille) {
  const trouve = String(taille || '').match(/\d+/)
  return trouve ? parseInt(trouve[0], 10) : null
}

export function comparerTailles(a, b) {
  const ia = ORDRE_TAILLES.indexOf(a || '')
  const ib = ORDRE_TAILLES.indexOf(b || '')
  // Les deux tailles font partie du jeu standard (XS...XXL, tranches
  // d'âge par défaut) : on garde cet ordre précis plutôt qu'un tri
  // numérique, pour départager XS/S/M... (pas de chiffre) et conserver
  // "5-6 ans" avant "7-9 ans" sans ambiguïté.
  if (ia !== -1 && ib !== -1) return ia - ib

  // Sinon (au moins une taille ajoutée manuellement, hors jeu standard) :
  // tri par ordre numérique croissant dès qu'un chiffre est détectable.
  const na = premierNombre(a)
  const nb = premierNombre(b)
  if (na !== null && nb !== null) return na - nb

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

// Stock total connu d'un produit (somme du stock_qty de ses déclinaisons,
// en ignorant celles pas encore renseignées). Retourne null si aucune
// déclinaison n'a de stock suivi — dans ce cas on ne peut pas savoir s'il
// est en rupture, donc on ne le traite pas comme tel. Utilisé à la fois par
// l'écran Vente (badge "Rupture", masquage automatique) et par l'écran
// Produits (indication "masqué en vente").
export function stockTotalProduit(produit) {
  const variantes = produit.variantes_produit || []
  const connues = variantes.filter(
    (v) => v.stock_qty !== null && v.stock_qty !== undefined
  )
  if (connues.length === 0) return null
  return connues.reduce((somme, v) => somme + v.stock_qty, 0)
}

// Lieux possibles pour un match (encart en haut de l'écran Vente).
export const LIEUX_MATCH = [
  { cle: 'domicile', label: 'Domicile' },
  { cle: 'exterieur', label: 'Extérieur' },
]

export function labelLieuMatch(lieu) {
  return LIEUX_MATCH.find((l) => l.cle === lieu)?.label || lieu || ''
}

// Résumé court d'un match, utilisé dans l'encart Vente, l'historique et le
// PDF de bilan : "vs Anglet HC — Domicile — 05/09/2026".
export function resumeMatch(match) {
  if (!match) return ''
  const date = match.date_match
    ? new Date(match.date_match + 'T00:00:00').toLocaleDateString('fr-FR')
    : ''
  return `vs ${match.adversaire} — ${labelLieuMatch(match.lieu)} — ${date}`
}
