import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { formatEuros, comparerTailles, labelLieuMatch } from '../constants.js'

// Construit le PDF de bilan d'un match : infos du match, détail des ventes
// (avec totaux par mode de paiement), puis état du stock au moment de la
// clôture. Généré entièrement côté navigateur (aucun serveur) via pdf-lib,
// puis uploadé dans le stockage Supabase par l'appelant.
//
// - match : { date_match, lieu, adversaire }
// - ventes : lignes renvoyées par lister_ventes_match (vente_id, cree_le,
//   benevole_nom, mode_paiement, total, montant_recu, monnaie_rendue, detail)
// - produitsActifs : produits (avec variantes_produit) à inclure dans l'état
//   des stocks — déjà filtrés/triés par l'appelant (corbeille/archive exclues)
export async function genererRapportMatchPdf({ match, ventes, produitsActifs }) {
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

  // Garantit qu'il reste au moins `hauteur` de place avant le bas de page ;
  // sinon démarre une nouvelle page. À appeler avant de dessiner un bloc.
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

  function espace(hauteur) {
    y -= hauteur
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

  // Découpe un texte en lignes qui tiennent dans `largeurMax` avec `taille`.
  function decouperTexte(texte, f, taille, largeurMax) {
    const mots = String(texte || '').split(' ')
    const lignes = []
    let courante = ''
    mots.forEach((mot) => {
      const essai = courante ? `${courante} ${mot}` : mot
      if (f.widthOfTextAtSize(essai, taille) > largeurMax && courante) {
        lignes.push(courante)
        courante = mot
      } else {
        courante = essai
      }
    })
    if (courante) lignes.push(courante)
    return lignes.length ? lignes : ['']
  }

  // ---------------------------------------------------------------------
  // En-tête
  // ---------------------------------------------------------------------
  ligne([{ texte: 'Boutique HCAT — Bilan de match', x: MARGE, police: policeGrasse, couleur: bleu }], {
    taille: 18,
    interligne: 26,
  })
  ligne(
    [
      {
        texte: `vs ${match.adversaire} — ${labelLieuMatch(match.lieu)} — ${new Date(
          match.date_match + 'T00:00:00'
        ).toLocaleDateString('fr-FR')}`,
        x: MARGE,
        police: policeGrasse,
      },
    ],
    { taille: 13, interligne: 20 }
  )
  ligne(
    [
      {
        texte: `Rapport généré le ${new Date().toLocaleString('fr-FR')}`,
        x: MARGE,
        couleur: gris,
      },
    ],
    { taille: 9, interligne: 18 }
  )
  traitHorizontal()

  // ---------------------------------------------------------------------
  // Ventes
  // ---------------------------------------------------------------------
  const colHeure = MARGE
  const colBenevole = MARGE + 55
  const colMode = MARGE + 150
  const colDetail = MARGE + 200
  const colTotal = LARGEUR - MARGE
  const largeurDetail = colTotal - colDetail - 60

  ligne([{ texte: `Ventes (${ventes.length})`, x: MARGE, police: policeGrasse }], {
    taille: 13,
    interligne: 20,
  })

  if (ventes.length === 0) {
    ligne([{ texte: 'Aucune vente enregistrée pour ce match.', x: MARGE, couleur: gris }])
  } else {
    ligne(
      [
        { texte: 'Heure', x: colHeure, police: policeGrasse },
        { texte: 'Bénévole', x: colBenevole, police: policeGrasse },
        { texte: 'Mode', x: colMode, police: policeGrasse },
        { texte: 'Détail', x: colDetail, police: policeGrasse },
        { texte: 'Total', x: colTotal - 60, police: policeGrasse, alignerDroite: true, largeurZone: 60 },
      ],
      { taille: 9, interligne: 14 }
    )
    traitHorizontal()

    let totalCB = 0
    let totalEspeces = 0

    ventes.forEach((v) => {
      const detailLignes = String(v.detail || '')
        .split('\n')
        .flatMap((l) => decouperTexte(l, police, 9, largeurDetail))
      const nbLignes = Math.max(1, detailLignes.length)
      assurerEspace(nbLignes * 12 + 4)

      const yDepart = y
      ligne(
        [
          {
            texte: new Date(v.cree_le).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            x: colHeure,
          },
          { texte: v.benevole_nom || '—', x: colBenevole },
          { texte: v.mode_paiement === 'cb' ? 'CB' : 'Espèces', x: colMode },
          { texte: detailLignes[0] || '', x: colDetail },
          {
            texte: formatEuros(v.total),
            x: colTotal - 60,
            alignerDroite: true,
            largeurZone: 60,
          },
        ],
        { taille: 9, interligne: 12 }
      )
      for (let i = 1; i < detailLignes.length; i++) {
        ligne([{ texte: detailLignes[i], x: colDetail }], { taille: 9, interligne: 12 })
      }
      void yDepart

      if (v.mode_paiement === 'cb') totalCB += Number(v.total)
      else totalEspeces += Number(v.total)
    })

    traitHorizontal()
    const totalGeneral = totalCB + totalEspeces
    ligne(
      [
        {
          texte: `CB : ${formatEuros(totalCB)}    Espèces : ${formatEuros(totalEspeces)}`,
          x: MARGE,
        },
        {
          texte: `Total : ${formatEuros(totalGeneral)}`,
          x: colTotal - 120,
          police: policeGrasse,
          alignerDroite: true,
          largeurZone: 120,
        },
      ],
      { taille: 11, interligne: 20 }
    )
  }

  espace(10)
  traitHorizontal()

  // ---------------------------------------------------------------------
  // Stock restant
  // ---------------------------------------------------------------------
  ligne(
    [
      {
        texte: 'Stock restant (état à la clôture du match)',
        x: MARGE,
        police: policeGrasse,
      },
    ],
    { taille: 13, interligne: 20 }
  )

  const colProduit = MARGE
  const colTaille = MARGE + 300
  const colStock = LARGEUR - MARGE - 60

  ligne(
    [
      { texte: 'Produit', x: colProduit, police: policeGrasse },
      { texte: 'Taille', x: colTaille, police: policeGrasse },
      { texte: 'Stock', x: colStock, police: policeGrasse },
    ],
    { taille: 9, interligne: 14 }
  )
  traitHorizontal()

  produitsActifs.forEach((produit) => {
    const variantes = (produit.variantes_produit || [])
      .slice()
      .sort((a, b) => comparerTailles(a.taille, b.taille))
    if (variantes.length === 0) return

    // Réserve la place du produit ET de toutes ses tailles d'un coup, pour
    // qu'un saut de page ne coupe jamais les tailles d'un même produit
    // entre deux pages (le nom du produit resterait sinon "orphelin" en
    // bas d'une page, ses tailles reprenant en haut de la suivante sans
    // rappel de son nom).
    assurerEspace(12 * (variantes.length + 1))
    ligne([{ texte: produit.nom, x: colProduit, police: policeGrasse }], {
      taille: 9,
      interligne: 12,
    })
    variantes.forEach((v) => {
      const texteStock = v.stock_qty === null || v.stock_qty === undefined ? 'non suivi' : String(v.stock_qty)
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
