import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Variables lues depuis .env.local : Vite n'expose au frontend que les variables
// préfixées VITE_ (envPrefix, vite.config.ts), inlinées au build.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes : vérifie .env.local (cf. .env.example) puis relance `npm run tauri dev`.'
  );
}

/** Message affiché quand une lecture est refusée faute de jeton utilisateur valide. */
export const SESSION_UNAVAILABLE =
  'Session momentanément indisponible (connexion perdue ou jeton en cours de renouvellement). Les données affichées ne sont peut-être pas à jour ; elles se rechargeront dès le retour de la connexion.';

/** Services protégés par la RLS ou par un contrôle d'utilisateur : jamais appelés en anonyme. */
const PROTECTED_PATHS = ['/rest/v1/', '/storage/v1/', '/functions/v1/'].map((p) => new URL(p, supabaseUrl).href);

/**
 * Garde contre le bug « listes vides » : quand le renouvellement du jeton échoue
 * de façon passagère (réseau pas encore revenu après une veille, par exemple),
 * `auth.getSession()` renvoie `session: null` sans déconnecter (pas de
 * SIGNED_OUT). supabase-js envoie alors la requête avec la clé anon comme
 * jeton ; la RLS répond 200 avec zéro ligne, et l'écran remplaçait les vraies
 * données par des listes vides. Ici, une telle requête est refusée avant
 * de partir : l'écran garde ses données et affiche une erreur passagère.
 */
const guardedFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (PROTECTED_PATHS.some((p) => url.startsWith(p))) {
    const auth = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get(
      'Authorization'
    );
    if (!auth || auth === `Bearer ${supabaseAnonKey}`) return Promise.reject(new Error(SESSION_UNAVAILABLE));
  }
  return fetch(input, init);
};

const create = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Session persistée dans le localStorage de la webview (conservé par Tauri
      // dans le dossier de données de l'app) : pas de reconnexion à chaque lancement.
      storage: window.localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: guardedFetch },
  });

// Un seul client par fenêtre, même quand le HMR de Vite réévalue ce module en
// développement : deux GoTrueClient sur la même clé de stockage se disputeraient
// le renouvellement du jeton (« Multiple GoTrueClient instances »).
const holder = globalThis as typeof globalThis & { __roadSupabase?: SupabaseClient };
export const supabase = (holder.__roadSupabase ??= create());
