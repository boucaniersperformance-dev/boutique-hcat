// Génération de l'étiquette de gourde Boucaniers (SVG, unités en mm).
// Fonction pure : aucune dépendance React, réutilisable ailleurs (aperçu, impression, script…).

export const NAVY = '#00114A';
export const GOLD = '#F2C21A';
export const POLICE = "'Oswald', 'Arial Narrow', 'DejaVu Sans Condensed', sans-serif";

// Format de l'étiquette (tour de la gourde) en mm
export const LARGEUR = 245;
export const HAUTEUR = 110;

const echapper = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function nettoyerPrenom(p) {
  return String(p || '').trim().replace(/\s+/g, ' ').slice(0, 14).toLocaleUpperCase('fr-FR');
}

export function nettoyerNumero(n) {
  return String(n || '').replace(/\D/g, '').slice(0, 2);
}

// Estimation de largeur si aucune mesure réelle n'est fournie (≈ Oswald Bold en capitales)
const mesureParDefaut = (texte, taille) => texte.length * 0.52 * taille;

// Texte « maillot » : navy, liseré or, contour navy. Se comprime si trop long.
function texteMaillot({ texte, x, y, taille, largeurMax, mesurer }) {
  let largeur = mesurer(texte, taille);
  // Nom très long : on réduit la taille pour ne pas écraser les lettres de plus de 30 %
  if (largeur > largeurMax * 1.3) {
    taille = +(taille * (largeurMax * 1.3) / largeur).toFixed(2);
    largeur = mesurer(texte, taille);
  }
  const ajuste = largeur > largeurMax ? ` textLength="${largeurMax}" lengthAdjust="spacingAndGlyphs"` : '';
  const commun = `x="${x}" y="${y}" font-family="${POLICE}" font-weight="700" font-size="${taille}" text-anchor="middle" stroke-linejoin="round"${ajuste}`;
  const t = echapper(texte);
  return `
    <text ${commun} fill="${NAVY}" stroke="${NAVY}" stroke-width="${(taille * 0.15).toFixed(2)}">${t}</text>
    <text ${commun} fill="${NAVY}" stroke="${GOLD}" stroke-width="${(taille * 0.085).toFixed(2)}">${t}</text>
    <text ${commun} fill="${NAVY}">${t}</text>`;
}

/**
 * Contenu de l'étiquette (sans balise <svg>), dans un repère 245 × 110 mm.
 * @param {object} o
 * @param {string} o.prenom
 * @param {string} [o.numero]   vide = pas de numéro
 * @param {string} o.logoUrl
 * @param {string} o.joueurUrl
 * @param {(texte:string, taille:number)=>number} [o.mesurer]  largeur réelle du texte en mm
 */
export function contenuEtiquette({ prenom, numero, logoUrl, joueurUrl, mesurer = mesureParDefaut }) {
  const nom = nettoyerPrenom(prenom) || 'PRÉNOM';
  const num = nettoyerNumero(numero);
  const cx = 140; // centre de la zone texte (entre logo et joueur)

  const textes = num
    ? `
    ${texteMaillot({ texte: nom, x: cx, y: 43, taille: 30, largeurMax: 74, mesurer })}
    <rect x="108" y="50" width="64" height="0.9" rx="0.45" fill="${GOLD}"/>
    ${texteMaillot({ texte: '#' + num, x: cx, y: 95, taille: 50, largeurMax: 72, mesurer })}`
    : `
    <rect x="112" y="30" width="56" height="0.9" rx="0.45" fill="${GOLD}"/>
    ${texteMaillot({ texte: nom, x: cx, y: 73, taille: 40, largeurMax: 76, mesurer })}
    <rect x="112" y="84" width="56" height="0.9" rx="0.45" fill="${GOLD}"/>`;

  return `
  <rect x="-2" y="-2" width="${LARGEUR + 4}" height="${HAUTEUR + 4}" fill="#fff"/>
  <rect x="-2" y="-2" width="${LARGEUR + 4}" height="6" fill="${NAVY}"/>
  <rect x="-2" y="4" width="${LARGEUR + 4}" height="1.6" fill="${GOLD}"/>
  <rect x="-2" y="104.4" width="${LARGEUR + 4}" height="1.6" fill="${GOLD}"/>
  <rect x="-2" y="106" width="${LARGEUR + 4}" height="6" fill="${NAVY}"/>
  <image href="${echapper(logoUrl)}" x="3" y="8" width="94" height="94" preserveAspectRatio="xMidYMid meet"/>
  <line x1="99" y1="18" x2="99" y2="92" stroke="${GOLD}" stroke-width="0.8" stroke-linecap="round"/>
  ${textes}
  <image href="${echapper(joueurUrl)}" x="181" y="15" width="60" height="78" preserveAspectRatio="xMidYMid meet"/>`;
}

/** SVG d'aperçu (s'adapte à la largeur de son conteneur). */
export function svgApercu(o) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGEUR} ${HAUTEUR}" width="100%" style="display:block">
  <defs><clipPath id="bord"><rect width="${LARGEUR}" height="${HAUTEUR}" rx="2"/></clipPath></defs>
  <g clip-path="url(#bord)">${contenuEtiquette(o)}</g></svg>`;
}

/** Page A4 paysage complète, étiquette à taille réelle + traits de coupe. */
export function pageImpression(o) {
  const nom = nettoyerPrenom(o.prenom) || 'PRÉNOM';
  const num = nettoyerNumero(o.numero);
  const ox = 26, oy = 50; // position de l'étiquette sur la feuille (mm)
  const coupe = `
  <g stroke="#999" stroke-width="0.25">
    <line x1="${ox}" y1="${oy - 10}" x2="${ox}" y2="${oy - 4}"/><line x1="${ox + LARGEUR}" y1="${oy - 10}" x2="${ox + LARGEUR}" y2="${oy - 4}"/>
    <line x1="${ox}" y1="${oy + HAUTEUR + 4}" x2="${ox}" y2="${oy + HAUTEUR + 10}"/><line x1="${ox + LARGEUR}" y1="${oy + HAUTEUR + 4}" x2="${ox + LARGEUR}" y2="${oy + HAUTEUR + 10}"/>
    <line x1="${ox - 10}" y1="${oy}" x2="${ox - 4}" y2="${oy}"/><line x1="${ox - 10}" y1="${oy + HAUTEUR}" x2="${ox - 4}" y2="${oy + HAUTEUR}"/>
    <line x1="${ox + LARGEUR + 4}" y1="${oy}" x2="${ox + LARGEUR + 10}" y2="${oy}"/><line x1="${ox + LARGEUR + 4}" y1="${oy + HAUTEUR}" x2="${ox + LARGEUR + 10}" y2="${oy + HAUTEUR}"/>
  </g>`;
  const legende = echapper(`Gourde ${nom}${num ? ' #' + num : ''} — 245 × 110 mm — imprimer à 100 % (taille réelle), couper aux traits`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210">
  <g transform="translate(${ox},${oy})">${contenuEtiquette(o)}</g>
  ${coupe}
  <text x="148.5" y="185" font-family="sans-serif" font-size="3.2" fill="#888" text-anchor="middle">${legende}</text>
  <text x="148.5" y="190" font-family="sans-serif" font-size="2.6" fill="#aaa" text-anchor="middle">Boucaniers Shop · GB-Kréation</text>
</svg>`;
}
