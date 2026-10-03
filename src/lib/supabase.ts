import { createClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';

// Variables lues depuis .env.local (préfixe EXPO_PUBLIC_ => inlinées par Metro).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY manquantes : vérifie .env.local puis relance `npx expo start -c`.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Session persistée en local (SQLite key-value) => l'app redémarre hors ligne
    // sans redemander de connexion.
    storage: Storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
