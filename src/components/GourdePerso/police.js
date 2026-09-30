import { useEffect, useState } from 'react';

export const LIEN_POLICE = 'https://fonts.googleapis.com/css2?family=Oswald:wght@700&display=swap';

// Charge la police Oswald une seule fois dans la page
export function useOswald() {
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
export function creerMesure() {
  const ctx = document.createElement('canvas').getContext('2d');
  return (texte, taille) => {
    ctx.font = `700 100px Oswald, 'Arial Narrow', sans-serif`;
    return (ctx.measureText(texte).width / 100) * taille;
  };
}

