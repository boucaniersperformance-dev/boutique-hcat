import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Erreur volontairement bruyante : sans ces variables d'environnement
  // configurées sur Vercel (ou dans un .env local), rien ne peut fonctionner.
  console.error(
    "Configuration Supabase manquante : vérifie VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY."
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Toutes les tables sont protégées par RLS et exigent une session
// "authenticated". On utilise la connexion anonyme de Supabase : elle ne
// crée pas de compte email, elle ouvre juste une session technique qui
// permet aux règles de sécurité de distinguer "un navigateur qui a chargé
// l'appli" d'un accès public totalement anonyme (ex. requête brute sur
// l'API sans jamais avoir ouvert l'appli).
let sessionReadyPromise = null

export function ensureSupabaseSession() {
  if (!sessionReadyPromise) {
    sessionReadyPromise = (async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }
    })()
  }
  return sessionReadyPromise
}

// Vrai si la session Supabase actuelle est une vraie connexion (Google),
// par opposition à la session technique anonyme utilisée par défaut pour
// le code PIN — seule une session réelle porte une adresse e-mail.
export function estUneSessionGoogle(session) {
  return !!(session && session.user && session.user.email && !session.user.is_anonymous)
}

// Lance la connexion Google (redirection complète du navigateur vers
// Google, puis retour sur l'appli). Réservé au bouton de l'écran de
// connexion, pour les responsables dont l'adresse Gmail a été autorisée
// par un autre responsable (écran Bénévoles).
export async function connecterAvecGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw error
}
