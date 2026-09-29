import { useEffect, useMemo, useState, useCallback } from 'react';
import logoSrc from './logo-boucaniers.webp';
import joueurSrc from './joueur-boucaniers.webp';
import {
  NAVY, GOLD, svgApercu, pageImpression, nettoyerPrenom, nettoyerNumero,
} from './etiquetteGourde';

const LIEN_POLICE = 'https://fonts.googleapis.com/css2?family=Oswald:wght@700&display=swap';

// Charge la police Oswald une seule fois dans la page
function useOswald() {
  const [prete, setPrete] = useState(false);
  useEffect(() => {
    if (!document.querySelector(`link[href="${LIEN_POLICE}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = LIEN_POLICE;
      document.head.appendChild(l);
    }
    document.fonts?.load('700 20px Oswald').finally(() => setPrete(true));
  }, []);
  return prete;
}

// Mesure réelle d'un texte (en mm, puisque la taille est en mm) via un canvas
function creerMesure() {
  const ctx = document.createElement('canvas').getContext('2d');
  return (texte, taille) => {
    ctx.font = `700 100px Oswald, 'Arial Narrow', sans-serif`;
    return (ctx.measureText(texte).width / 100) * taille;
  };
}

const absolu = (src) => new URL(src, window.location.href).href;

export default function GourdePerso() {
  const [prenom, setPrenom] = useState('');
  const [numero, setNumero] = useState('');
  const policePrete = useOswald();

  const options = useMemo(() => ({
    prenom,
    numero,
    logoUrl: absolu(logoSrc),
    joueurUrl: absolu(joueurSrc),
    mesurer: creerMesure(),
  // policePrete : on remesure une fois Oswald chargée
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [prenom, numero, policePrete]);

  const apercu = useMemo(() => svgApercu(options), [options]);

  const imprimer = useCallback(() => {
    const nom = nettoyerPrenom(prenom) || 'Gourde';
    const num = nettoyerNumero(numero);
    const w = window.open('', '_blank');
    if (!w) {
      alert("Autorisez les fenêtres pop-up pour imprimer l'étiquette.");
      return;
    }
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Gourde ${nom}${num ? ' ' + num : ''}</title>
<link rel="stylesheet" href="${LIEN_POLICE}">
<style>
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  svg { display: block; width: 297mm; height: 210mm; }
</style></head><body>${pageImpression(options)}
<script>
  const imgs = [...document.querySelectorAll('image')].map(i => new Promise(r => {
    const im = new Image(); im.onload = im.onerror = r; im.src = i.getAttribute('href');
  }));
  Promise.all([document.fonts.ready, ...imgs]).then(() => setTimeout(() => window.print(), 300));
<\/script></body></html>`);
    w.document.close();
  }, [options, prenom, numero]);

  const champ = {
    width: '100%', padding: '12px 14px', fontSize: 18, borderRadius: 10,
    border: `2px solid ${NAVY}`, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16, color: NAVY, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 24 }}>Gourde personnalisée</h2>
      <p style={{ margin: '0 0 16px', opacity: 0.75 }}>
        Étiquette 24,5 × 11 cm aux couleurs des Boucaniers.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 16 }}>
        <label style={{ fontWeight: 600 }}>
          Prénom
          <input
            style={{ ...champ, marginTop: 6 }}
            value={prenom}
            maxLength={14}
            placeholder="Spencer"
            autoComplete="off"
            onChange={(e) => setPrenom(e.target.value)}
          />
        </label>
        <label style={{ fontWeight: 600 }}>
          Numéro <span style={{ fontWeight: 400, opacity: 0.6 }}>(facultatif)</span>
          <input
            style={{ ...champ, marginTop: 6 }}
            value={numero}
            inputMode="numeric"
            placeholder="77"
            onChange={(e) => setNumero(nettoyerNumero(e.target.value))}
          />
        </label>
      </div>

      <div
        style={{ borderRadius: 8, boxShadow: '0 2px 12px rgba(0,17,74,.18)', overflow: 'hidden', background: '#fff' }}
        dangerouslySetInnerHTML={{ __html: apercu }}
      />

      <button
        type="button"
        onClick={imprimer}
        disabled={!nettoyerPrenom(prenom)}
        style={{
          marginTop: 16, width: '100%', padding: '14px 16px', fontSize: 18, fontWeight: 700,
          borderRadius: 10, border: `2px solid ${NAVY}`, cursor: 'pointer',
          background: nettoyerPrenom(prenom) ? NAVY : '#c9cdd8', color: nettoyerPrenom(prenom) ? GOLD : '#fff',
        }}
      >
        Imprimer / Enregistrer en PDF
      </button>

      <ul style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.85, paddingLeft: 18 }}>
        <li>Imprimer en <b>taille réelle (100 %)</b>, format A4 paysage, sur papier vinyle adhésif.</li>
        <li>Laisser sécher l'encre, puis poser un film de plastification transparent.</li>
        <li>Découper aux traits en gardant 3 à 5 mm de film autour, dégraisser la gourde à l'alcool, coller.</li>
      </ul>
    </div>
  );
}
