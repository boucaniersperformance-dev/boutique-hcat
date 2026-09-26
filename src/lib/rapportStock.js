import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { comparerTailles } from '../constants.js'

// Construit un PDF listant le stock des produits sélectionnés (peu importe
// qu'ils soient actuellement en vente ou non — c'est justement le but du
// bouton "imprimer le stock" : voir l'état réel du stock indépendamment de
// ce qui est affiché aux acheteurs). Même moteur de mise en page que
// rapportMatch.js (pdf-lib, généré entièrement côté navigateur).
//
// - produits : liste de produits (avec variantes_produit) déjà filtrée par
//   l'appelant selon la sélection faite dans la modale.
export async function genererRapportStockPdf(produits) {
  const pdfDoc = await PDFDocument.create()
  const police = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const policeGrasse = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const LARGEUR = 595.28
  const HAUTEUR = 841.89
  const MARGE = 40
  const BAS_PAGE = 50

  const noir = rgb(0.11, 0.13, 0.17)
  const gris = rgb(0.42, 0.45, 0.5)
  const bleu = rgb(0.11, 0.21, 0.34)
  const bordure = rgb(0.9, 0.91, 0.93)

  let page = pdfDoc.addPage([LARGEUR, HAUTEUR])
  let y = HAUTEUR - MARGE

  function nouvellePage() {
    page = pdfDoc.addPage([LARGEUR, HAUTEUR])
    y = HAUTEUR - MARGE
  }

  function assurerEspace(hauteur) {
    if (y - hauteur < BAS_PAGE) {
      nouvellePage()
    }
  }

  function ligne(segments, { taille = 10, interligne = 14 } = {}) {
    assurerEspace(interligne)
    segments.forEach(({ texte, x, police: policeSegment, couleur }) => {
      const f = policeSegment || police
      const c = couleur || noir
      page.drawText(texte, { x, y, size: taille, font: f, color: c })
    })
    y -= interligne
  }

  function traitHorizontal() {
    assurerEspace(6)
    page.drawLine({
      start: { x: MARGE, y },
      end: { x: LARGEUR - MARGE, y },
      thickness: 0.75,
      color: bordure,
    })
    y -= 10
  }

  ligne([{ texte: 'Boutique HCAT — État du stock', x: MARGE, police: policeGrasse, couleur: bleu }], {
    taille: 18,
    interligne: 26,
  })
  ligne(
    [
      {
        texte: `Généré le ${new Date().toLocaleString('fr-FR')} — ${produits.length} article(s)`,
        x: MARGE,
        couleur: gris,
      },
    ],
    { taille: 9, interligne: 18 }
  )
  traitHorizontal()

  const colProduit = MARGE
  const colReference = MARGE + 280
  const colTaille = MARGE + 380
  const colStock = LARGEUR - MARGE - 40

  ligne(
    [
      { texte: 'Produit', x: colProduit, police: policeGrasse },
      { texte: 'Référence', x: colReference, police: policeGrasse },
      { texte: 'Taille', x: colTaille, police: policeGrasse },
      { texte: 'Stock', x: colStock, police: policeGrasse },
    ],
    { taille: 9, interligne: 14 }
  )
  traitHorizontal()

  produits
    .slice()
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }))
    .forEach((produit) => {
      const variantes = (produit.variantes_produit || [])
        .slice()
        .sort((a, b) => comparerTailles(a.taille, b.taille))
      if (variantes.length === 0) return

      // Réserve la place du produit ET de toutes ses tailles d'un coup,
      // pour ne jamais couper les tailles d'un même produit entre deux
      // pages (voir rapportMatch.js pour la même logique).
      assurerEspace(12 * (variantes.length + 1) + 4)

      const yEnTete = y
      ligne([{ texte: produit.nom, x: colProduit, police: policeGrasse }], {
        taille: 9,
        interligne: 12,
      })
      // Référence et statut "hors vente" tiennent tous les deux sur la même
      // ligne que le nom du produit (jamais en dessous), pour ne jamais
      // interférer avec les lignes de tailles qui suivent.
      const mentions = [produit.reference, !produit.actif ? 'hors vente' : null]
        .filter(Boolean)
        .join(' · ')
      if (mentions) {
        page.drawText(mentions, {
          x: colReference,
          y: yEnTete,
          size: 8,
          font: police,
          color: gris,
        })
      }

      variantes.forEach((v) => {
        const texteStock =
          v.stock_qty === null || v.stock_qty === undefined ? 'non suivi' : String(v.stock_qty)
        ligne(
          [
            { texte: v.taille || 'Sans taille', x: colTaille },
            { texte: texteStock, x: colStock },
          ],
          { taille: 9, interligne: 12 }
        )
      })
    })

  return pdfDoc.save()
}
