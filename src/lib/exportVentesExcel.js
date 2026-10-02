// Construit le classeur "Excel" téléchargé depuis l'Historique.
//
// Plutôt qu'un simple CSV, ce fichier est un vrai classeur Excel mis en
// forme (bandeaux de couleur, tableaux encadrés, montants alignés et
// formatés en euros, tailles indentées sous chaque article) — sans
// dépendre d'une bibliothèque externe : il s'agit du format "SpreadsheetML"
// (XML), compris nativement par Excel depuis Office 2003 et enregistré
// avec l'extension .xls. Google Sheets et LibreOffice l'ouvrent également
// sans problème.

const COULEUR_MARINE = '#1D3557'
const COULEUR_FOND_CLAIR = '#F1FAEE'
const COULEUR_BORDURE = '#E5E7EB'
const COULEUR_TEXTE_CLAIR = '#555555'

function echapperXml(valeur) {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function celluleTexte(valeur, { style, mergeAcross } = {}) {
  const attrStyle = style ? ` ss:StyleID="${style}"` : ''
  const attrMerge = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : ''
  const texte = echapperXml(valeur).replace(/\n/g, '&#10;')
  return `<Cell${attrStyle}${attrMerge}><Data ss:Type="String">${texte}</Data></Cell>`
}

function celluleNombre(valeur, { style } = {}) {
  const attrStyle = style ? ` ss:StyleID="${style}"` : ''
  if (valeur === '' || valeur === null || valeur === undefined) {
    return `<Cell${attrStyle}/>`
  }
  return `<Cell${attrStyle}><Data ss:Type="Number">${Number(valeur)}</Data></Cell>`
}

function celluleVide({ style, mergeAcross } = {}) {
  const attrStyle = style ? ` ss:StyleID="${style}"` : ''
  const attrMerge = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : ''
  return `<Cell${attrStyle}${attrMerge}/>`
}

function ligne(cellules, { hauteur } = {}) {
  const attrHauteur = hauteur ? ` ss:Height="${hauteur}"` : ''
  return `<Row${attrHauteur}>${cellules.join('')}</Row>`
}

const NB_COLONNES_DETAIL = 7 // Date/heure, Bénévole, Mode, Détail, Total, Reçu, Monnaie

const STYLES = `
<Style ss:ID="sTitre">
 <Font ss:Bold="1" ss:Size="15" ss:Color="#FFFFFF"/>
 <Interior ss:Color="${COULEUR_MARINE}" ss:Pattern="Solid"/>
 <Alignment ss:Vertical="Center"/>
</Style>
<Style ss:ID="sSousTitre">
 <Font ss:Italic="1" ss:Color="${COULEUR_TEXTE_CLAIR}" ss:Size="10"/>
 <Alignment ss:Vertical="Center"/>
</Style>
<Style ss:ID="sBanniereSection">
 <Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="11"/>
 <Interior ss:Color="${COULEUR_MARINE}" ss:Pattern="Solid"/>
 <Alignment ss:Vertical="Center"/>
</Style>
<Style ss:ID="sRecapLabel">
 <Font ss:Bold="1" ss:Color="${COULEUR_MARINE}"/>
 <Interior ss:Color="${COULEUR_FOND_CLAIR}" ss:Pattern="Solid"/>
 <Alignment ss:Vertical="Center"/>
 <Borders>
  <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COULEUR_BORDURE}"/>
 </Borders>
</Style>
<Style ss:ID="sRecapValeur">
 <Font ss:Bold="1" ss:Color="${COULEUR_MARINE}"/>
 <Interior ss:Color="${COULEUR_FOND_CLAIR}" ss:Pattern="Solid"/>
 <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
 <Borders>
  <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COULEUR_BORDURE}"/>
 </Borders>
 <NumberFormat ss:Format="#,##0.00&quot; €&quot;"/>
</Style>
<Style ss:ID="sRecapValeurEntier">
 <Font ss:Bold="1" ss:Color="${COULEUR_MARINE}"/>
 <Interior ss:Color="${COULEUR_FOND_CLAIR}" ss:Pattern="Solid"/>
 <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
 <Borders>
  <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COULEUR_BORDURE}"/>
 </Borders>
</Style>
<Style ss:ID="sEnteteTableau">
 <Font ss:Bold="1" ss:Color="#FFFFFF"/>
 <Interior ss:Color="${COULEUR_MARINE}" ss:Pattern="Solid"/>
 <Alignment ss:Vertical="Center" ss:WrapText="1"/>
 <Borders>
  <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COULEUR_MARINE}"/>
 </Borders>
</Style>
<Style ss:ID="sCellule">
 <Alignment ss:Vertical="Top" ss:WrapText="1"/>
 <Borders>
  <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COULEUR_BORDURE}"/>
 </Borders>
</Style>
<Style ss:ID="sCelluleMontant">
 <Alignment ss:Vertical="Top" ss:Horizontal="Right"/>
 <Borders>
  <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COULEUR_BORDURE}"/>
 </Borders>
 <NumberFormat ss:Format="#,##0.00&quot; €&quot;"/>
</Style>
<Style ss:ID="sArticleNom">
 <Font ss:Bold="1"/>
 <Interior ss:Color="${COULEUR_FOND_CLAIR}" ss:Pattern="Solid"/>
 <Borders>
  <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COULEUR_BORDURE}"/>
 </Borders>
</Style>
<Style ss:ID="sArticleQuantite">
 <Font ss:Bold="1"/>
 <Interior ss:Color="${COULEUR_FOND_CLAIR}" ss:Pattern="Solid"/>
 <Alignment ss:Horizontal="Right"/>
 <Borders>
  <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COULEUR_BORDURE}"/>
 </Borders>
</Style>
<Style ss:ID="sTailleNom">
 <Alignment ss:Horizontal="Left" ss:Indent="2"/>
 <Borders>
  <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COULEUR_BORDURE}"/>
 </Borders>
</Style>
<Style ss:ID="sTailleQuantite">
 <Alignment ss:Horizontal="Right"/>
 <Borders>
  <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${COULEUR_BORDURE}"/>
 </Borders>
</Style>
<Style ss:ID="sTotalFinalLabel">
 <Font ss:Bold="1" ss:Color="#FFFFFF"/>
 <Interior ss:Color="${COULEUR_MARINE}" ss:Pattern="Solid"/>
</Style>
<Style ss:ID="sTotalFinalValeur">
 <Font ss:Bold="1" ss:Color="#FFFFFF"/>
 <Interior ss:Color="${COULEUR_MARINE}" ss:Pattern="Solid"/>
 <Alignment ss:Horizontal="Right"/>
</Style>
`.trim()

function formaterDateFr(iso) {
  const [annee, mois, jour] = iso.split('-')
  return `${jour}/${mois}/${annee}`
}

function libelleMode(mode) {
  return mode === 'cb' ? 'CB' : 'Espèces'
}

// `ventes` : lignes brutes renvoyées par lister_ventes (voir Historique.jsx).
// `totauxParArticle` : [{ nom, total, tailles: [{ taille, quantite }] }]
//   déjà regroupées et triées (voir totauxParArticle dans Historique.jsx).
export function construireClasseurVentesXml({ dateDebut, dateFin, ventes, totauxParArticle }) {
  const lignesXml = []

  const totalCB = ventes.filter((v) => v.mode_paiement === 'cb').reduce((s, v) => s + Number(v.total), 0)
  const totalEspeces = ventes
    .filter((v) => v.mode_paiement === 'especes')
    .reduce((s, v) => s + Number(v.total), 0)
  const totalGeneral = totalCB + totalEspeces
  const periodeUnJour = dateDebut === dateFin

  // --- Titre ---
  lignesXml.push(
    ligne([celluleTexte('Historique des ventes — Boutique HCAT', { style: 'sTitre', mergeAcross: NB_COLONNES_DETAIL - 1 })], {
      hauteur: 26,
    })
  )
  lignesXml.push(
    ligne(
      [
        celluleTexte(
          periodeUnJour ? `Journée du ${formaterDateFr(dateDebut)}` : `Période du ${formaterDateFr(dateDebut)} au ${formaterDateFr(dateFin)}`,
          { style: 'sSousTitre', mergeAcross: NB_COLONNES_DETAIL - 1 }
        ),
      ],
      { hauteur: 18 }
    )
  )
  lignesXml.push(ligne([celluleVide()]))

  // --- Récapitulatif (au tout début, comme demandé) ---
  lignesXml.push(
    ligne([celluleTexte('Récapitulatif', { style: 'sBanniereSection', mergeAcross: NB_COLONNES_DETAIL - 1 })], { hauteur: 20 })
  )
  lignesXml.push(
    ligne([
      celluleTexte('Nombre de ventes', { style: 'sRecapLabel', mergeAcross: 1 }),
      celluleNombre(ventes.length, { style: 'sRecapValeurEntier' }),
      celluleVide({ style: 'sRecapLabel', mergeAcross: 3 }),
    ])
  )
  lignesXml.push(
    ligne([
      celluleTexte('Total CB', { style: 'sRecapLabel', mergeAcross: 1 }),
      celluleNombre(totalCB, { style: 'sRecapValeur' }),
      celluleVide({ style: 'sRecapLabel', mergeAcross: 3 }),
    ])
  )
  lignesXml.push(
    ligne([
      celluleTexte('Total Espèces', { style: 'sRecapLabel', mergeAcross: 1 }),
      celluleNombre(totalEspeces, { style: 'sRecapValeur' }),
      celluleVide({ style: 'sRecapLabel', mergeAcross: 3 }),
    ])
  )
  lignesXml.push(
    ligne([
      celluleTexte('Total général', { style: 'sTotalFinalLabel', mergeAcross: 1 }),
      celluleNombre(totalGeneral, { style: 'sTotalFinalValeur' }),
      celluleVide({ style: 'sTotalFinalLabel', mergeAcross: 3 }),
    ])
  )
  lignesXml.push(ligne([celluleVide()]))
  lignesXml.push(ligne([celluleVide()]))

  // --- Détail des ventes ---
  lignesXml.push(
    ligne([celluleTexte('Détail des ventes', { style: 'sBanniereSection', mergeAcross: NB_COLONNES_DETAIL - 1 })], { hauteur: 20 })
  )
  lignesXml.push(
    ligne(
      ['Date/heure', 'Bénévole', 'Mode', 'Détail', 'Total', 'Reçu', 'Monnaie'].map((t) =>
        celluleTexte(t, { style: 'sEnteteTableau' })
      ),
      { hauteur: 18 }
    )
  )
  for (const v of ventes) {
    const detail = v.detail || ''
    const nbLignesDetail = detail.split('\n').length
    lignesXml.push(
      ligne(
        [
          celluleTexte(new Date(v.cree_le).toLocaleString('fr-FR'), { style: 'sCellule' }),
          celluleTexte(v.benevole_nom, { style: 'sCellule' }),
          celluleTexte(libelleMode(v.mode_paiement), { style: 'sCellule' }),
          celluleTexte(detail, { style: 'sCellule' }),
          celluleNombre(v.total, { style: 'sCelluleMontant' }),
          celluleNombre(v.montant_recu, { style: 'sCelluleMontant' }),
          celluleNombre(v.monnaie_rendue, { style: 'sCelluleMontant' }),
        ],
        { hauteur: Math.max(15, nbLignesDetail * 14) }
      )
    )
  }
  lignesXml.push(ligne([celluleVide()]))
  lignesXml.push(ligne([celluleVide()]))

  // --- Récapitulatif des articles vendus ---
  if (totauxParArticle.length > 0) {
    const totalGeneralArticles = totauxParArticle.reduce((s, g) => s + g.total, 0)
    lignesXml.push(
      ligne([celluleTexte('Récapitulatif des articles vendus', { style: 'sBanniereSection', mergeAcross: NB_COLONNES_DETAIL - 1 })], {
        hauteur: 20,
      })
    )
    lignesXml.push(
      ligne(
        [
          celluleTexte('Article', { style: 'sEnteteTableau', mergeAcross: 1 }),
          celluleTexte('Quantité', { style: 'sEnteteTableau' }),
          celluleVide({ style: 'sEnteteTableau', mergeAcross: 3 }),
        ],
        { hauteur: 18 }
      )
    )
    for (const groupe of totauxParArticle) {
      lignesXml.push(
        ligne([
          celluleTexte(groupe.nom, { style: 'sArticleNom', mergeAcross: 1 }),
          celluleNombre(groupe.total, { style: 'sArticleQuantite' }),
          celluleVide({ style: 'sArticleNom', mergeAcross: 3 }),
        ])
      )
      for (const { taille, quantite } of groupe.tailles) {
        lignesXml.push(
          ligne([
            celluleTexte(taille, { style: 'sTailleNom', mergeAcross: 1 }),
            celluleNombre(quantite, { style: 'sTailleQuantite' }),
            celluleVide({ style: 'sTailleNom', mergeAcross: 3 }),
          ])
        )
      }
    }
    lignesXml.push(
      ligne([
        celluleTexte('Total', { style: 'sTotalFinalLabel', mergeAcross: 1 }),
        celluleNombre(totalGeneralArticles, { style: 'sTotalFinalValeur' }),
        celluleVide({ style: 'sTotalFinalLabel', mergeAcross: 3 }),
      ])
    )
  }

  const colonnes = [120, 95, 55, 280, 65, 65, 70]
    .map((largeur) => `<Column ss:Width="${largeur}"/>`)
    .join('')

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>Boutique HCAT</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
${STYLES}
 </Styles>
 <Worksheet ss:Name="Ventes">
  <Table ss:DefaultColumnWidth="80">
${colonnes}
${lignesXml.join('\n')}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Layout x:Orientation="Landscape"/>
   </PageSetup>
  </WorksheetOptions>
 </Worksheet>
</Workbook>
`
}
