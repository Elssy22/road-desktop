import { createClient } from '@supabase/supabase-js';

// Variables lues depuis .env.local : Vite n'expose au frontend que les variables
// préfixées VITE_ (envPrefix, vite.config.ts), inlinées au build.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes : vérifie .env.local (cf. .env.example) puis relance `npm run tauri dev`.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Session persistée dans le localStorage de la webview (conservé par Tauri
    // dans le dossier de données de l'app) : pas de reconnexion à chaque lancement.
    storage: window.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
