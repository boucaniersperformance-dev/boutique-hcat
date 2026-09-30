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
 * @param {number} [o.joueurRatio]  largeur / hauteur de l'image du joueur (portrait < 1, paysage > 1)
 * @param {(texte:string, taille:number)=>number} [o.mesurer]  largeur réelle du texte en mm
 */
export function contenuEtiquette({ prenom, numero, logoUrl, joueurUrl, joueurRatio = 0.785, mesurer = mesureParDefaut }) {
  const nom = nettoyerPrenom(prenom) || 'PRÉNOM';
  const num = nettoyerNumero(numero);
  // Image en paysage (gardien, mise au jeu…) : logo un peu plus petit pour lui laisser de la place
  const paysage = joueurRatio > 1.1;
  const L = paysage
    ? { logo: { x: 4, y: 16, t: 78 }, sep: 85, cx: 124, img: { x: 164, w: 79 } }
    : { logo: { x: 3, y: 8, t: 94 }, sep: 99, cx: 140, img: { x: 181, w: 60 } };
  const cx = L.cx; // centre de la zone texte (entre logo et joueur)
  const imgH = Math.min(78, L.img.w / joueurRatio);
  const imgY = (55 - imgH / 2).toFixed(1);

  const textes = num
    ? `
    ${texteMaillot({ texte: nom, x: cx, y: 43, taille: 30, largeurMax: 74, mesurer })}
    <rect x="${cx - 32}" y="50" width="64" height="0.9" rx="0.45" fill="${GOLD}"/>
    ${texteMaillot({ texte: '#' + num, x: cx, y: 95, taille: 50, largeurMax: 72, mesurer })}`
    : `
    <rect x="${cx - 28}" y="30" width="56" height="0.9" rx="0.45" fill="${GOLD}"/>
    ${texteMaillot({ texte: nom, x: cx, y: 73, taille: 40, largeurMax: 76, mesurer })}
    <rect x="${cx - 28}" y="84" width="56" height="0.9" rx="0.45" fill="${GOLD}"/>`;

  return `
  <rect x="-2" y="-2" width="${LARGEUR + 4}" height="${HAUTEUR + 4}" fill="#fff"/>
  <rect x="-2" y="-2" width="${LARGEUR + 4}" height="6" fill="${NAVY}"/>
  <rect x="-2" y="4" width="${LARGEUR + 4}" height="1.6" fill="${GOLD}"/>
  <rect x="-2" y="104.4" width="${LARGEUR + 4}" height="1.6" fill="${GOLD}"/>
  <rect x="-2" y="106" width="${LARGEUR + 4}" height="6" fill="${NAVY}"/>
  <image href="${echapper(logoUrl)}" x="${L.logo.x}" y="${L.logo.y}" width="${L.logo.t}" height="${L.logo.t}" preserveAspectRatio="xMidYMid meet"/>
  <line x1="${L.sep}" y1="18" x2="${L.sep}" y2="92" stroke="${GOLD}" stroke-width="0.8" stroke-linecap="round"/>
  ${textes}
  <image href="${echapper(joueurUrl)}" x="${L.img.x}" y="${imgY}" width="${L.img.w}" height="${imgH.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
}

/** SVG d'aperçu (s'adapte à la largeur de son conteneur). */
export function svgApercu(o) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGEUR} ${HAUTEUR}" width="100%" style="display:block">
  <defs><clipPath id="bord"><rect width="${LARGEUR}" height="${HAUTEUR}" rx="2"/></clipPath></defs>
  <g clip-path="url(#bord)">${contenuEtiquette(o)}</g></svg>`;
}

/** Petit sticker prénom + numéro (80 × 28 mm) pour casque, crosse, sac… */
export const STICKER = { l: 80, h: 28 };

function contenuSticker({ prenom, numero, logoUrl, mesurer = mesureParDefaut }) {
  const nom = nettoyerPrenom(prenom) || 'PRÉNOM';
  const num = nettoyerNumero(numero);
  const { l, h } = STICKER;
  const cx = 53;
  const textes = num
    ? `${texteMaillot({ texte: nom, x: cx, y: 13.2, taille: 10, largeurMax: 44, mesurer })}
       ${texteMaillot({ texte: '#' + num, x: cx, y: 24.3, taille: 11, largeurMax: 30, mesurer })}`
    : texteMaillot({ texte: nom, x: cx, y: 18.6, taille: 13, largeurMax: 46, mesurer });
  return `
  <rect x="-1.5" y="-1.5" width="${l + 3}" height="${h + 3}" rx="5" fill="none" stroke="#aaa" stroke-width="0.25" stroke-dasharray="1.2 1"/>
  <rect x="0.6" y="0.6" width="${l - 1.2}" height="${h - 1.2}" rx="3.5" fill="#fff" stroke="${NAVY}" stroke-width="1.2"/>
  <rect x="2.2" y="2.2" width="${l - 4.4}" height="${h - 4.4}" rx="2.4" fill="none" stroke="${GOLD}" stroke-width="0.5"/>
  <image href="${echapper(logoUrl)}" x="3.5" y="2.5" width="23" height="23" preserveAspectRatio="xMidYMid meet"/>
  ${textes}`;
}

/**
 * Page A4 paysage : l'étiquette de gourde en haut (taille réelle, traits de coupe)
 * et, dans la bande libre du bas, 6 petits stickers prénom + numéro.
 * @param {object} o  mêmes options que contenuEtiquette, plus o.stickers (true par défaut)
 */
export function pageImpression(o) {
  const nom = nettoyerPrenom(o.prenom) || 'PRÉNOM';
  const num = nettoyerNumero(o.numero);
  const avecStickers = o.stickers !== false;
  const ox = 26, oy = 11; // position de l'étiquette sur la feuille (mm)
  const coupe = `
  <g stroke="#999" stroke-width="0.25">
    <line x1="${ox}" y1="${oy - 8}" x2="${ox}" y2="${oy - 3}"/><line x1="${ox + LARGEUR}" y1="${oy - 8}" x2="${ox + LARGEUR}" y2="${oy - 3}"/>
    <line x1="${ox}" y1="${oy + HAUTEUR + 3}" x2="${ox}" y2="${oy + HAUTEUR + 8}"/><line x1="${ox + LARGEUR}" y1="${oy + HAUTEUR + 3}" x2="${ox + LARGEUR}" y2="${oy + HAUTEUR + 8}"/>
    <line x1="${ox - 10}" y1="${oy}" x2="${ox - 3}" y2="${oy}"/><line x1="${ox - 10}" y1="${oy + HAUTEUR}" x2="${ox - 3}" y2="${oy + HAUTEUR}"/>
    <line x1="${ox + LARGEUR + 3}" y1="${oy}" x2="${ox + LARGEUR + 10}" y2="${oy}"/><line x1="${ox + LARGEUR + 3}" y1="${oy + HAUTEUR}" x2="${ox + LARGEUR + 10}" y2="${oy + HAUTEUR}"/>
  </g>`;

  // Grille de stickers : 3 colonnes × 2 lignes, centrée sous l'étiquette
  let stickers = '';
  if (avecStickers) {
    const ecart = 6, cols = 3, lignes = 2;
    const x0 = (297 - (cols * STICKER.l + (cols - 1) * ecart)) / 2;
    const y0 = 133;
    for (let r = 0; r < lignes; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * (STICKER.l + ecart);
        const y = y0 + r * (STICKER.h + ecart);
        stickers += `<g transform="translate(${x},${y})">${contenuSticker(o)}</g>`;
      }
    }
  }

  const legende = echapper(
    `Gourde ${nom}${num ? ' #' + num : ''} — étiquette 245 × 110 mm${avecStickers ? ' + 6 stickers 80 × 28 mm' : ''} — imprimer à 100 % (taille réelle), couper aux traits`
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210">
  <g transform="translate(${ox},${oy})">${contenuEtiquette(o)}</g>
  ${coupe}
  ${stickers}
  <text x="148.5" y="${avecStickers ? 201 : 180}" font-family="sans-serif" font-size="2.8" fill="#888" text-anchor="middle">${legende}</text>
  <text x="148.5" y="${avecStickers ? 205 : 185}" font-family="sans-serif" font-size="2.3" fill="#aaa" text-anchor="middle">Boucaniers Shop · GB-Kréation</text>
</svg>`;
}
