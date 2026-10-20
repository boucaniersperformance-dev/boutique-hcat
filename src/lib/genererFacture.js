import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { formatEuros } from '../constants.js'

// Identité du club, pour l'en-tête de la facture. À mettre à jour ici le
// jour où l'adresse de contact (email/téléphone) est disponible — pour
// l'instant volontairement absente plutôt qu'inventée.
const CLUB_NOM = 'Hockey Club Aire Toulonnaise'
const CLUB_ADRESSE = 'Patinoire de la Garde, 99 avenue Première DFL, 83130 La Garde'
const CLUB_SIRET = 'SIRET : 410 145 684 00016'
const CLUB_TVA = 'Association loi 1901 à but non lucratif — non assujettie à la TVA'

// Construit le PDF d'une facture de vente générée a posteriori (écran
// Historique). Même moteur pdf-lib que rapportPalet.js / rapportMatch.js.
//
// - facture : résultat de generer_facture (numero_facture, generee_le,
//   vente_date, mode_paiement, total, benevole_nom, nom_acheteur,
//   adresse_acheteur, lignes [{nom_produit, taille, quantite,
//   prix_unitaire}])
export async function genererFacturePdf(facture) {
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

  // Logo du club, en haut à droite de la première page. Chargé depuis le
  // fichier déjà utilisé par l'application (public/logo.png) ; une facture
  // reste valide sans logo si le fichier n'a pas pu être récupéré (pas de
  // connexion, par exemple).
  const TAILLE_LOGO = 60
  try {
    const reponseLogo = await fetch('/logo.png')
    if (reponseLogo.ok) {
      const octetsLogo = await reponseLogo.arrayBuffer()
      const logoImage = await pdfDoc.embedPng(octetsLogo)
      page.drawImage(logoImage, {
        x: LARGEUR - MARGE - TAILLE_LOGO,
        y: HAUTEUR - MARGE - TAILLE_LOGO + 6,
        width: TAILLE_LOGO,
        height: TAILLE_LOGO,
      })
    }
  } catch {
    // Non bloquant — voir commentaire ci-dessus.
  }

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

  // --- En-tête : identité du club (émetteur) ---
  ligne([{ texte: CLUB_NOM, x: MARGE, police: policeGrasse, couleur: bleu }], { taille: 16, interligne: 20 })
  ligne([{ texte: CLUB_ADRESSE, x: MARGE, couleur: gris }], { taille: 9, interligne: 13 })
  ligne([{ texte: CLUB_SIRET, x: MARGE, couleur: gris }], { taille: 9, interligne: 13 })
  ligne([{ texte: CLUB_TVA, x: MARGE, couleur: gris }], { taille: 9, interligne: 20 })

  // --- Titre + numéro + dates ---
  ligne(
    [{ texte: `FACTURE N° ${facture.numero_facture}`, x: MARGE, police: policeGrasse, couleur: noir }],
    { taille: 14, interligne: 20 }
  )
  ligne(
    [
      {
        texte: `Vente du ${new Date(facture.vente_date).toLocaleDateString('fr-FR')} — Facture émise le ${new Date(facture.generee_le).toLocaleDateString('fr-FR')}`,
        x: MARGE,
        couleur: gris,
      },
    ],
    { taille: 9, interligne: 20 }
  )
  traitHorizontal()

  // --- Acheteur ---
  ligne([{ texte: 'Facturé à', x: MARGE, police: policeGrasse }], { taille: 10, interligne: 15 })
  ligne([{ texte: facture.nom_acheteur, x: MARGE }], { taille: 10, interligne: 14 })
  if (facture.adresse_acheteur) {
    ligne([{ texte: facture.adresse_acheteur, x: MARGE, couleur: gris }], { taille: 9, interligne: 14 })
  }
  y -= 10
  traitHorizontal()

  // --- Tableau des articles ---
  // Zones de droite à gauche (chacune sur sa propre largeur, avec un
  // espace entre elles) pour que "Prix unit." et "Montant" ne se
  // chevauchent jamais, quelle que soit la largeur des montants affichés.
  const margeDroite = LARGEUR - MARGE
  const largeurMontant = 75
  const largeurPu = 75
  const xMontant = margeDroite - largeurMontant
  const xPu = xMontant - largeurPu - 15
  const colArticle = MARGE
  const colQte = MARGE + 300

  ligne(
    [
      { texte: 'Article', x: colArticle, police: policeGrasse },
      { texte: 'Qté', x: colQte, police: policeGrasse },
      { texte: 'Prix unit.', x: xPu, police: policeGrasse, alignerDroite: true, largeurZone: largeurPu },
      { texte: 'Montant', x: xMontant, police: policeGrasse, alignerDroite: true, largeurZone: largeurMontant },
    ],
    { taille: 9, interligne: 14 }
  )
  traitHorizontal()

  const lignesArticles = facture.lignes || []
  if (lignesArticles.length === 0) {
    ligne([{ texte: 'Aucun article.', x: MARGE, couleur: gris }])
  }

  lignesArticles.forEach((l) => {
    const nom = l.nom_produit + (l.taille ? ` (${l.taille})` : '')
    const montant = Number(l.prix_unitaire) * Number(l.quantite)
    ligne(
      [
        { texte: nom, x: colArticle },
        { texte: String(l.quantite), x: colQte },
        { texte: formatEuros(l.prix_unitaire), x: xPu, alignerDroite: true, largeurZone: largeurPu },
        { texte: formatEuros(montant), x: xMontant, alignerDroite: true, largeurZone: largeurMontant },
      ],
      { taille: 9, interligne: 14 }
    )
  })

  traitHorizontal()
  ligne(
    [
      {
        texte: `Total TTC : ${formatEuros(facture.total)}`,
        x: margeDroite - 220,
        police: policeGrasse,
        alignerDroite: true,
        largeurZone: 220,
      },
    ],
    { taille: 12, interligne: 20 }
  )
  ligne(
    [
      {
        texte: `Réglé le ${new Date(facture.vente_date).toLocaleDateString('fr-FR')} par ${facture.mode_paiement === 'cb' ? 'carte bancaire' : 'espèces'}`,
        x: MARGE,
        couleur: gris,
      },
    ],
    { taille: 9, interligne: 16 }
  )
  ligne([{ texte: CLUB_TVA, x: MARGE, couleur: gris }], { taille: 8, interligne: 12 })
  ligne(
    [{ texte: `Encaissement enregistré par ${facture.benevole_nom}.`, x: MARGE, couleur: gris }],
    { taille: 8, interligne: 12 }
  )

  return pdfDoc.save()
}
