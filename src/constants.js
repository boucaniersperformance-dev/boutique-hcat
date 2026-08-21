// Jeux de tailles disponibles selon le type d'article.
// Ces libellés doivent correspondre exactement à ceux stockés en base
// (colonne `taille` de la table `variantes_produit`).
export const TAILLES_ADULTE = ['S', 'M', 'L', 'XL', 'XXL']
export const TAILLES_ENFANT = ['5-6 ans', '7-9 ans', '10-12 ans', '14-15 ans']

export function taillesPourJeu(jeuTailles) {
  if (jeuTailles === 'adulte') return TAILLES_ADULTE
  if (jeuTailles === 'enfant') return TAILLES_ENFANT
  return []
}

export function formatEuros(montant) {
  const nombre = Number(montant) || 0
  return nombre.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  })
}

export const SEUIL_STOCK_BAS = 3
