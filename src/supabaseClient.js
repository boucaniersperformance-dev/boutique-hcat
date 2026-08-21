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
