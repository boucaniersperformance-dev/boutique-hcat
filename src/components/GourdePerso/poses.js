// Illustrations disponibles pour l'étiquette de gourde, partagées entre
// l'onglet Gourde et le formulaire de commande de l'écran Vente.
// ratio = largeur / hauteur de l'image.
// Pour en ajouter une : déposer le .webp dans ce dossier, l'importer ici et l'ajouter à la liste.
import attaquantSrc from './joueur-boucaniers.webp';
import gardienSrc from './joueur-gardien.webp';
import paletSrc from './joueur-palet.webp';
import miseAuJeuSrc from './joueur-mise-au-jeu.webp';

export const POSES = [
  { id: 'attaquant', nom: 'Attaquant', src: attaquantSrc, ratio: 0.785 },
  { id: 'palet', nom: 'Conduite de palet', src: paletSrc, ratio: 1.579 },
  { id: 'gardien', nom: 'Gardien', src: gardienSrc, ratio: 1.482 },
  { id: 'mise-au-jeu', nom: 'Mise au jeu', src: miseAuJeuSrc, ratio: 1.874 },
];

export const trouverPose = (id) => POSES.find((p) => p.id === id) || POSES[0];

// Nom exact du produit qui déclenche le formulaire de personnalisation dans l'écran Vente
export const NOM_PRODUIT_GOURDE = 'Custom Gourde';
export const estProduitGourde = (produit) =>
  (produit?.nom || '').trim().toLowerCase() === NOM_PRODUIT_GOURDE.toLowerCase();
