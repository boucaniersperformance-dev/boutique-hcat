// Construit le classeur Excel téléchargé depuis l'Historique.
//
// C'est un vrai fichier .xlsx (format natif d'Excel depuis 2007 : un ZIP
// contenant plusieurs fichiers XML) construit directement en JavaScript,
// sans dépendre d'une bibliothèque externe à installer — pour garder
// l'application légère. Le fichier est donc reconnu par Excel sans aucun
// avertissement (contrairement à un ancien format XML "déguisé" en .xls,
// que les versions récentes d'Excel signalent comme suspect).

const NB_COLONNES = 7 // Date/heure, Bénévole, Mode, Détail, Total, Reçu, Monnaie

const COULEUR_MARINE = '1D3557'
const COULEUR_FOND_CLAIR = 'F1FAEE'
const COULEUR_BORDURE = 'E5E7EB'
const COULEUR_TEXTE_CLAIR = '555555'

// =====================================================================
// Utilitaires bas niveau : CRC32 et assemblage d'un ZIP non compressé
// ("stored"), suffisant pour un .xlsx — Excel n'exige pas que les
// fichiers internes soient compressés.
// =====================================================================

const TABLE_CRC32 = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(octets) {
  let crc = 0xffffffff
  for (let i = 0; i < octets.length; i++) {
    crc = TABLE_CRC32[(crc ^ octets[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

class TamponOctets {
  constructor() {
    this.morceaux = []
  }
  octets(arr) {
    this.morceaux.push(arr instanceof Uint8Array ? arr : new Uint8Array(arr))
    return this
  }
  u16(v) {
    return this.octets([v & 0xff, (v >>> 8) & 0xff])
  }
  u32(v) {
    return this.octets([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff])
  }
  texte(s) {
    return this.octets(new TextEncoder().encode(s))
  }
  construire() {
    const total = this.morceaux.reduce((s, m) => s + m.length, 0)
    const sortie = new Uint8Array(total)
    let decalage = 0
    for (const m of this.morceaux) {
      sortie.set(m, decalage)
      decalage += m.length
    }
    return sortie
  }
}

function dateVersDos(date) {
  const annee = Math.max(1980, date.getFullYear())
  const heureDos = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dateDos = ((annee - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { heureDos, dateDos }
}

// `fichiers` : [{ nom: 'xl/workbook.xml', contenu: '<?xml ...' }, ...]
function creerZipStocke(fichiers) {
  const encodeur = new TextEncoder()
  const { heureDos, dateDos } = dateVersDos(new Date())
  let decalage = 0
  const blocsLocaux = []
  const blocsCentraux = []

  for (const { nom, contenu } of fichiers) {
    const donnees = encodeur.encode(contenu)
    const nomOctets = encodeur.encode(nom)
    const crc = crc32(donnees)

    const local = new TamponOctets()
    local.u32(0x04034b50)
    local.u16(20)
    local.u16(0x0800)
    local.u16(0)
    local.u16(heureDos)
    local.u16(dateDos)
    local.u32(crc)
    local.u32(donnees.length)
    local.u32(donnees.length)
    local.u16(nomOctets.length)
    local.u16(0)
    local.octets(nomOctets)
    local.octets(donnees)
    const blocLocal = local.construire()

    const central = new TamponOctets()
    central.u32(0x02014b50)
    central.u16(20)
    central.u16(20)
    central.u16(0x0800)
    central.u16(0)
    central.u16(heureDos)
    central.u16(dateDos)
    central.u32(crc)
    central.u32(donnees.length)
    central.u32(donnees.length)
    central.u16(nomOctets.length)
    central.u16(0)
    central.u16(0)
    central.u16(0)
    central.u16(0)
    central.u32(0)
    central.u32(decalage)
    central.octets(nomOctets)
    const blocCentral = central.construire()

    blocsLocaux.push(blocLocal)
    blocsCentraux.push(blocCentral)
    decalage += blocLocal.length
  }

  const decalageCentral = decalage
  const tailleCentral = blocsCentraux.reduce((s, b) => s + b.length, 0)

  const fin = new TamponOctets()
  fin.u32(0x06054b50)
  fin.u16(0)
  fin.u16(0)
  fin.u16(fichiers.length)
  fin.u16(fichiers.length)
  fin.u32(tailleCentral)
  fin.u32(decalageCentral)
  fin.u16(0)

  const tout = new TamponOctets()
  for (const b of blocsLocaux) tout.octets(b)
  for (const b of blocsCentraux) tout.octets(b)
  tout.octets(fin.construire())
  return tout.construire()
}

// =====================================================================
// Génération du contenu (feuille de calcul OOXML)
// =====================================================================

function echapperXml(valeur) {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function lettreColonne(index) {
  // 1 -> A, 2 -> B ... 7 -> G (pas besoin d'aller au-delà ici)
  return String.fromCharCode(64 + index)
}

function ref(colonne, ligne) {
  return `${lettreColonne(colonne)}${ligne}`
}

function celluleTexte(colonne, numeroLigne, texte, style) {
  const attrStyle = style != null ? ` s="${style}"` : ''
  return `<c r="${ref(colonne, numeroLigne)}"${attrStyle} t="inlineStr"><is><t xml:space="preserve">${echapperXml(texte)}</t></is></c>`
}

function celluleNombre(colonne, numeroLigne, valeur, style) {
  const attrStyle = style != null ? ` s="${style}"` : ''
  if (valeur === '' || valeur === null || valeur === undefined) {
    return `<c r="${ref(colonne, numeroLigne)}"${attrStyle}/>`
  }
  return `<c r="${ref(colonne, numeroLigne)}"${attrStyle}><v>${Number(valeur)}</v></c>`
}

function celluleVide(colonne, numeroLigne, style) {
  const attrStyle = style != null ? ` s="${style}"` : ''
  return `<c r="${ref(colonne, numeroLigne)}"${attrStyle}/>`
}

function ligne(numeroLigne, cellulesXml, hauteur) {
  const attrHauteur = hauteur ? ` ht="${hauteur}" customHeight="1"` : ''
  return `<row r="${numeroLigne}"${attrHauteur}>${cellulesXml.join('')}</row>`
}

// Bandeau sur toute la largeur (titre, sous-titre, bannières de section) :
// texte dans la colonne A, les 6 autres cellules vides avec le même style
// — Excel fait naturellement déborder le texte par-dessus des cellules
// vides voisines, pas besoin de fusion pour l'effet visuel.
function ligneBandeau(numeroLigne, texte, style, hauteur) {
  const cellules = [celluleTexte(1, numeroLigne, texte, style)]
  for (let col = 2; col <= NB_COLONNES; col++) cellules.push(celluleVide(col, numeroLigne, style))
  return ligne(numeroLigne, cellules, hauteur)
}

// Ligne "étiquette / valeur" du récapitulatif : étiquette en colonnes A-B,
// valeur en colonne C, reste vide du même style que l'étiquette.
function ligneRecap(numeroLigne, etiquette, valeur, styleEtiquette, styleValeur) {
  const cellules = [
    celluleTexte(1, numeroLigne, etiquette, styleEtiquette),
    celluleVide(2, numeroLigne, styleEtiquette),
    celluleNombre(3, numeroLigne, valeur, styleValeur),
  ]
  for (let col = 4; col <= NB_COLONNES; col++) cellules.push(celluleVide(col, numeroLigne, styleEtiquette))
  return ligne(numeroLigne, cellules)
}

// Ligne du tableau "Récapitulatif des articles vendus" : étiquette en
// colonnes A-B, quantité en C (style sans format monétaire), prix unitaire
// en D et montant en E (style avec format monétaire), reste vide du style
// de l'étiquette. `prixUnitaire`/`montant` peuvent être null/undefined (la
// ligne de total n'a pas de "prix unitaire" global) : la cellule reste
// alors simplement vide plutôt que d'afficher 0.
function ligneArticle(numeroLigne, etiquette, quantite, prixUnitaire, montant, styleEtiquette, styleQuantite, styleMontant) {
  const cellules = [
    celluleTexte(1, numeroLigne, etiquette, styleEtiquette),
    celluleVide(2, numeroLigne, styleEtiquette),
    celluleNombre(3, numeroLigne, quantite, styleQuantite),
    celluleNombre(4, numeroLigne, prixUnitaire, styleMontant),
    celluleNombre(5, numeroLigne, montant, styleMontant),
  ]
  for (let col = 6; col <= NB_COLONNES; col++) cellules.push(celluleVide(col, numeroLigne, styleEtiquette))
  return ligne(numeroLigne, cellules)
}

const STYLE_IDS = {
  titre: 1,
  sousTitre: 2,
  banniere: 3,
  recapLabel: 4,
  recapValeurMontant: 5,
  recapValeurEntier: 6,
  enteteTableau: 7,
  cellule: 8,
  celluleMontant: 9,
  articleNom: 10,
  articleQuantite: 11,
  tailleNom: 12,
  tailleQuantite: 13,
  totalFinalLabel: 14,
  totalFinalValeurMontant: 15,
  totalFinalValeurNombre: 16,
  articleMontant: 17,
  tailleMontant: 18,
}

function formaterDateFr(iso) {
  const [annee, mois, jour] = iso.split('-')
  return `${jour}/${mois}/${annee}`
}

function libelleMode(mode) {
  return mode === 'cb' ? 'CB' : 'Espèces'
}

// `ventes` : lignes brutes renvoyées par lister_ventes (voir Historique.jsx).
// `totauxParArticle` : [{ nom, total, montant, prixUnitaire, tailles: [{
//   taille, quantite, montant, prixUnitaire }] }] déjà regroupées et
//   triées (voir totauxParArticle dans Historique.jsx).
// `caisseParJour` : [{ jour, fondDeCaisse, totalCompte, totalEspecesVentes,
//   ecart }] — un comptage de caisse par jour (voir caisseParJour dans
//   Historique.jsx) ; absent ou vide si aucun comptage sur la période.
function construireFeuilleXml({ dateDebut, dateFin, ventes, totauxParArticle, caisseParJour }) {
  const totalCB = ventes.filter((v) => v.mode_paiement === 'cb').reduce((s, v) => s + Number(v.total), 0)
  const totalEspeces = ventes
    .filter((v) => v.mode_paiement === 'especes')
    .reduce((s, v) => s + Number(v.total), 0)
  const totalGeneral = totalCB + totalEspeces
  const periodeUnJour = dateDebut === dateFin

  const lignes = []
  let n = 1

  lignes.push(ligneBandeau(n++, 'Historique des ventes — Boutique HCAT', STYLE_IDS.titre, 26))
  lignes.push(
    ligneBandeau(
      n++,
      periodeUnJour ? `Journée du ${formaterDateFr(dateDebut)}` : `Période du ${formaterDateFr(dateDebut)} au ${formaterDateFr(dateFin)}`,
      STYLE_IDS.sousTitre,
      18
    )
  )
  n++ // ligne vide

  lignes.push(ligneBandeau(n++, 'Récapitulatif', STYLE_IDS.banniere, 20))
  lignes.push(ligneRecap(n++, 'Nombre de ventes', ventes.length, STYLE_IDS.recapLabel, STYLE_IDS.recapValeurEntier))
  lignes.push(ligneRecap(n++, 'Total CB', totalCB, STYLE_IDS.recapLabel, STYLE_IDS.recapValeurMontant))
  lignes.push(ligneRecap(n++, 'Total Espèces', totalEspeces, STYLE_IDS.recapLabel, STYLE_IDS.recapValeurMontant))
  lignes.push(ligneRecap(n++, 'Total général', totalGeneral, STYLE_IDS.totalFinalLabel, STYLE_IDS.totalFinalValeurMontant))
  n += 2 // deux lignes vides

  lignes.push(ligneBandeau(n++, 'Détail des ventes', STYLE_IDS.banniere, 20))
  {
    const entetes = ['Date/heure', 'Bénévole', 'Mode', 'Détail', 'Total', 'Reçu', 'Monnaie']
    const cellules = entetes.map((texte, i) => celluleTexte(i + 1, n, texte, STYLE_IDS.enteteTableau))
    lignes.push(ligne(n, cellules, 18))
    n++
  }
  for (const v of ventes) {
    const detail = v.detail || ''
    const nbLignesDetail = detail.split('\n').length
    const cellules = [
      celluleTexte(1, n, new Date(v.cree_le).toLocaleString('fr-FR'), STYLE_IDS.cellule),
      celluleTexte(2, n, v.benevole_nom, STYLE_IDS.cellule),
      celluleTexte(3, n, libelleMode(v.mode_paiement), STYLE_IDS.cellule),
      celluleTexte(4, n, detail, STYLE_IDS.cellule),
      celluleNombre(5, n, v.total, STYLE_IDS.celluleMontant),
      celluleNombre(6, n, v.montant_recu, STYLE_IDS.celluleMontant),
      celluleNombre(7, n, v.monnaie_rendue, STYLE_IDS.celluleMontant),
    ]
    // Marge généreuse par ligne de détail (18pt + un peu de respiration) :
    // un calcul trop juste laisse Excel tronquer le texte au lieu de
    // l'afficher en entier, ce qu'il ne corrige pas tout seul à
    // l'ouverture d'un fichier généré (contrairement à une saisie manuelle).
    lignes.push(ligne(n, cellules, Math.max(18, nbLignesDetail * 18 + 6)))
    n++
  }
  n += 2 // deux lignes vides

  if (totauxParArticle.length > 0) {
    const totalGeneralArticles = totauxParArticle.reduce((s, g) => s + g.total, 0)
    const montantGeneralArticles = totauxParArticle.reduce((s, g) => s + g.montant, 0)
    lignes.push(ligneBandeau(n++, 'Récapitulatif des articles vendus', STYLE_IDS.banniere, 20))
    {
      const cellules = [
        celluleTexte(1, n, 'Article', STYLE_IDS.enteteTableau),
        celluleVide(2, n, STYLE_IDS.enteteTableau),
        celluleTexte(3, n, 'Quantité', STYLE_IDS.enteteTableau),
        celluleTexte(4, n, 'Prix unitaire', STYLE_IDS.enteteTableau),
        celluleTexte(5, n, 'Montant', STYLE_IDS.enteteTableau),
      ]
      for (let col = 6; col <= NB_COLONNES; col++) cellules.push(celluleVide(col, n, STYLE_IDS.enteteTableau))
      lignes.push(ligne(n, cellules, 18))
      n++
    }
    for (const groupe of totauxParArticle) {
      lignes.push(
        ligneArticle(
          n++,
          groupe.nom,
          groupe.total,
          groupe.prixUnitaire,
          groupe.montant,
          STYLE_IDS.articleNom,
          STYLE_IDS.articleQuantite,
          STYLE_IDS.articleMontant
        )
      )
      for (const { taille, quantite, prixUnitaire, montant } of groupe.tailles) {
        lignes.push(
          ligneArticle(
            n++,
            taille,
            quantite,
            prixUnitaire,
            montant,
            STYLE_IDS.tailleNom,
            STYLE_IDS.tailleQuantite,
            STYLE_IDS.tailleMontant
          )
        )
      }
    }
    lignes.push(
      ligneArticle(
        n++,
        'Total',
        totalGeneralArticles,
        null,
        montantGeneralArticles,
        STYLE_IDS.totalFinalLabel,
        STYLE_IDS.totalFinalValeurNombre,
        STYLE_IDS.totalFinalValeurMontant
      )
    )
  }

  if (caisseParJour && caisseParJour.length > 0) {
    n += 2 // deux lignes vides
    lignes.push(ligneBandeau(n++, 'Caisse (comptages espèces)', STYLE_IDS.banniere, 20))
    {
      const entetes = ['Jour', 'Fond de caisse', 'Total compté', 'Total espèces (ventes)', 'Écart']
      const cellules = entetes.map((texte, i) => celluleTexte(i + 1, n, texte, STYLE_IDS.enteteTableau))
      for (let col = entetes.length + 1; col <= NB_COLONNES; col++) {
        cellules.push(celluleVide(col, n, STYLE_IDS.enteteTableau))
      }
      lignes.push(ligne(n, cellules, 18))
      n++
    }
    for (const c of caisseParJour) {
      const cellules = [
        celluleTexte(1, n, formaterDateFr(c.jour), STYLE_IDS.cellule),
        celluleNombre(2, n, c.fondDeCaisse, STYLE_IDS.celluleMontant),
        celluleNombre(3, n, c.totalCompte, STYLE_IDS.celluleMontant),
        celluleNombre(4, n, c.totalEspecesVentes, STYLE_IDS.celluleMontant),
        celluleNombre(5, n, c.ecart, STYLE_IDS.celluleMontant),
      ]
      for (let col = 6; col <= NB_COLONNES; col++) cellules.push(celluleVide(col, n, STYLE_IDS.cellule))
      lignes.push(ligne(n, cellules, 15))
      n++
    }
  }

  const largeurs = [22, 16, 10, 58, 10, 10, 10]
  const colonnesXml = largeurs
    .map((l, i) => `<col min="${i + 1}" max="${i + 1}" width="${l}" customWidth="1"/>`)
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<cols>${colonnesXml}</cols>
<sheetData>${lignes.join('')}</sheetData>
</worksheet>`
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1">
<numFmt numFmtId="164" formatCode="#,##0.00&quot; €&quot;"/>
</numFmts>
<fonts count="6">
<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF${COULEUR_TEXTE_CLAIR}"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF${COULEUR_MARINE}"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF${COULEUR_MARINE}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF${COULEUR_FOND_CLAIR}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF${COULEUR_BORDURE}"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF${COULEUR_MARINE}"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
</cellStyleXfs>
<cellXfs count="19">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" indent="2"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="3" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="164" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
</cellXfs>
<cellStyles count="1">
<cellStyle name="Normal" xfId="0" builtinId="0"/>
</cellStyles>
</styleSheet>`

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

const RELS_RACINE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="Ventes" sheetId="1" r:id="rId1"/>
</sheets>
</workbook>`

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

// Construit le classeur complet et renvoie les octets du fichier .xlsx
// (un Uint8Array), prêt à être enveloppé dans un Blob.
export function construireClasseurVentesXlsx({ dateDebut, dateFin, ventes, totauxParArticle, caisseParJour }) {
  const feuilleXml = construireFeuilleXml({ dateDebut, dateFin, ventes, totauxParArticle, caisseParJour })

  return creerZipStocke([
    { nom: '[Content_Types].xml', contenu: CONTENT_TYPES_XML },
    { nom: '_rels/.rels', contenu: RELS_RACINE_XML },
    { nom: 'xl/workbook.xml', contenu: WORKBOOK_XML },
    { nom: 'xl/_rels/workbook.xml.rels', contenu: WORKBOOK_RELS_XML },
    { nom: 'xl/styles.xml', contenu: STYLES_XML },
    { nom: 'xl/worksheets/sheet1.xml', contenu: feuilleXml },
  ])
}
