import { useEffect, useMemo, useState, useCallback } from 'react';
import logoSrc from './logo-boucaniers.webp';
import { POSES } from './poses';
import { LIEN_POLICE, useOswald, creerMesure } from './police';
import { supabase } from '../../supabaseClient';
import {
  NAVY, GOLD, svgApercu, pageImpression, nettoyerPrenom, nettoyerNumero,
} from './etiquetteGourde';

const absolu = (src) => new URL(src, window.location.href).href;

export default function GourdePerso({ benevole }) {
  const [prenom, setPrenom] = useState('');
  const [numero, setNumero] = useState('');
  const [poseId, setPoseId] = useState(POSES[0].id);
  const [stickers, setStickers] = useState(true);
  const pose = POSES.find((p) => p.id === poseId) || POSES[0];
  const policePrete = useOswald();

  // Commandes passées depuis l'écran Vente (produit « Custom Gourde »)
  const [commandes, setCommandes] = useState([]);
  const [erreurCommandes, setErreurCommandes] = useState(null);
  const [commandeActive, setCommandeActive] = useState(null);

  const chargerCommandes = useCallback(async () => {
    if (!benevole) return;
    const { data, error } = await supabase.rpc('lister_commandes_gourde', {
      p_benevole_id: benevole.id,
      p_inclure_remises: false,
    });
    if (error) {
      setErreurCommandes(
        "Commandes indisponibles : le script supabase/commandes_gourde.sql a-t-il été exécuté dans Supabase ?"
      );
    } else {
      setErreurCommandes(null);
      setCommandes(data || []);
    }
  }, [benevole]);

  useEffect(() => {
    chargerCommandes();
  }, [chargerCommandes]);

  async function changerStatut(commande, statut) {
    const { error } = await supabase.rpc('changer_statut_commande_gourde', {
      p_benevole_id: benevole.id,
      p_commande_id: commande.id,
      p_statut: statut,
    });
    if (error) alert("Le statut n'a pas pu être modifié. Vérifie ta connexion.");
    chargerCommandes();
  }

  function preparer(commande) {
    setPrenom(commande.prenom || '');
    setNumero(commande.numero || '');
    setPoseId(POSES.some((p) => p.id === commande.illustration) ? commande.illustration : POSES[0].id);
    setStickers(commande.stickers !== false);
    setCommandeActive(commande);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const options = useMemo(() => ({
    prenom,
    numero,
    logoUrl: absolu(logoSrc),
    joueurUrl: absolu(pose.src),
    joueurRatio: pose.ratio,
    stickers,
    mesurer: creerMesure(),
  // policePrete : on remesure une fois Oswald chargée
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [prenom, numero, pose, stickers, policePrete]);

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
    // Une commande préparée puis imprimée passe automatiquement à « imprimée »
    if (commandeActive && commandeActive.statut === 'a_imprimer') {
      changerStatut(commandeActive, 'imprimee');
      setCommandeActive(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, prenom, numero, commandeActive]);

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

      {benevole && (
        <section style={{ background: '#fff', border: `2px solid ${NAVY}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>
              Commandes à préparer {commandes.length > 0 && `(${commandes.length})`}
            </h3>
            <button type="button" className="bouton-secondaire" onClick={chargerCommandes} style={{ padding: '6px 12px' }}>
              Actualiser
            </button>
          </div>
          {erreurCommandes && <p className="erreur">{erreurCommandes}</p>}
          {!erreurCommandes && commandes.length === 0 && (
            <p style={{ margin: '8px 0 0', opacity: 0.7 }}>Aucune commande en attente.</p>
          )}
          {commandes.map((c) => {
            const imprimee = c.statut === 'imprimee';
            const active = commandeActive?.id === c.id;
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, justifyContent: 'space-between',
                  padding: '10px 0', borderTop: '1px solid #e3e6ee',
                  background: active ? '#fff8dc' : 'transparent',
                }}
              >
                <div style={{ minWidth: 200, flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>
                    {c.prenom}
                    {c.numero ? ` #${c.numero}` : ''}{' '}
                    <span style={{ fontWeight: 500, opacity: 0.7 }}>
                      · {(POSES.find((p) => p.id === c.illustration) || POSES[0]).nom} ·{' '}
                      {c.stickers === false ? 'sans stickers' : '+ 6 stickers'}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.85 }}>
                    {c.contact_nom} · <a href={`tel:${c.contact_tel}`}>{c.contact_tel}</a> ·{' '}
                    {new Date(c.cree_le).toLocaleDateString('fr-FR')}
                  </div>
                  <div
                    style={{
                      display: 'inline-block', marginTop: 4, fontSize: 12, fontWeight: 700, padding: '2px 8px',
                      borderRadius: 999, background: imprimee ? '#dff3e4' : '#fff1c2', color: imprimee ? '#1d6b35' : '#7a5a00',
                    }}
                  >
                    {imprimee ? 'Imprimée, à remettre' : 'À imprimer'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="bouton-secondaire" onClick={() => preparer(c)} style={{ padding: '8px 12px' }}>
                    Préparer
                  </button>
                  {!imprimee && (
                    <button type="button" className="bouton-secondaire" onClick={() => changerStatut(c, 'imprimee')} style={{ padding: '8px 12px' }}>
                      Imprimée ✓
                    </button>
                  )}
                  {imprimee && (
                    <button type="button" className="bouton-principal" onClick={() => changerStatut(c, 'remise')} style={{ padding: '8px 12px' }}>
                      Remise ✓
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {commandeActive && (
        <p style={{ background: '#fff8dc', border: `1px solid ${GOLD}`, borderRadius: 8, padding: '8px 12px' }}>
          Commande de <b>{commandeActive.contact_nom}</b> chargée : vérifiez l'aperçu puis imprimez. Elle passera
          automatiquement à « imprimée ».
        </p>
      )}

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

      <div style={{ fontWeight: 600, marginBottom: 6 }}>Illustration</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {POSES.map((p) => {
          const actif = p.id === pose.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPoseId(p.id)}
              aria-pressed={actif}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: 6, borderRadius: 10, background: '#fff', color: NAVY,
                border: actif ? `3px solid ${GOLD}` : '2px solid #d5d9e3',
                boxShadow: actif ? `0 0 0 2px ${NAVY}` : 'none',
              }}
            >
              <img src={p.src} alt="" style={{ width: '100%', height: 64, objectFit: 'contain' }} />
              <span style={{ fontSize: 12, fontWeight: actif ? 700 : 500, lineHeight: 1.2 }}>{p.nom}</span>
            </button>
          );
        })}
      </div>

      <div
        style={{ borderRadius: 8, boxShadow: '0 2px 12px rgba(0,17,74,.18)', overflow: 'hidden', background: '#fff' }}
        dangerouslySetInnerHTML={{ __html: apercu }}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontWeight: 600, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={stickers}
          onChange={(e) => setStickers(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: NAVY }}
        />
        Ajouter 6 petits stickers prénom + numéro (casque, crosse, sac) dans le bas de la feuille
      </label>

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
