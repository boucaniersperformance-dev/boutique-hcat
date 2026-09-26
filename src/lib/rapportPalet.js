import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { formatEuros } from '../constants.js'

// Construit le PDF imprimable du "Jeux du palet" : un numéro de palet par
// ligne, avec l'acheteur et son téléphone, et le total des ventes en bas
// de la colonne. Même moteur pdf-lib que rapportMatch.js / rapportStock.js.
//
// - lignes : résultat de lister_ventes_palet (numero_palet, nom,
//   telephone, prix_unitaire, cree_le, benevole_nom, mode_paiement)
// - dateLabel : texte affiché dans le titre (ex : "26/09/2026")
export async function genererRapportPaletPdf({ lignes, dateLabel }) {
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
    segments.forEach(({ texte, x, police: policeSegment, couleur, alignerDroite, largeurZone }) => {
      const f = policeSegment || police
      const c = couleur || noir
      let posX = x
      if (alignerDroite && largeurZone) {
        const largeurTexte = f.widthOfTextAtSize(texte, taille)
        posX = x + largeurZone - largeurTexte
      }
      page.drawText(texte, { x: posX, y, size: taille, font: f, color: c })
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

  ligne(
    [{ texte: `Jeux du palet — ${dateLabel}`, x: MARGE, police: policeGrasse, couleur: bleu }],
    { taille: 18, interligne: 26 }
  )
  ligne(
    [
      {
        texte: `Rapport généré le ${new Date().toLocaleString('fr-FR')} — ${lignes.length} numéro(s)`,
        x: MARGE,
        couleur: gris,
      },
    ],
    { taille: 9, interligne: 18 }
  )
  traitHorizontal()

  const colNumero = MARGE
  const colNom = MARGE + 60
  const colTelephone = MARGE + 260
  const colPrix = LARGEUR - MARGE - 50

  ligne(
    [
      { texte: 'N° palet', x: colNumero, police: policeGrasse },
      { texte: 'Nom et prénom', x: colNom, police: policeGrasse },
      { texte: 'Téléphone', x: colTelephone, police: policeGrasse },
      { texte: 'Prix', x: colPrix - 50, police: policeGrasse, alignerDroite: true, largeurZone: 50 },
    ],
    { taille: 9, interligne: 14 }
  )
  traitHorizontal()

  if (lignes.length === 0) {
    ligne([{ texte: 'Aucun numéro de palet vendu.', x: MARGE, couleur: gris }])
  }

  let total = 0
  lignes.forEach((l) => {
    ligne(
      [
        { texte: String(l.numero_palet), x: colNumero },
        { texte: l.nom || '—', x: colNom },
        { texte: l.telephone || '—', x: colTelephone },
        {
          texte: formatEuros(l.prix_unitaire),
          x: colPrix - 50,
          alignerDroite: true,
          largeurZone: 50,
        },
      ],
      { taille: 9, interligne: 14 }
    )
    total += Number(l.prix_unitaire)
  })

  traitHorizontal()
  ligne(
    [
      {
        texte: `Total des ventes : ${formatEuros(total)}`,
        x: colPrix - 160,
        police: policeGrasse,
        alignerDroite: true,
        largeurZone: 160,
      },
    ],
    { taille: 12, interligne: 20 }
  )

  return pdfDoc.save()
}
