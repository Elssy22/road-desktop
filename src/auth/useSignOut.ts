import { useState } from 'react';

import { supabase } from '../lib/supabase';

/**
 * Déconnexion (barre latérale et Réglages). Hors ligne, la révocation côté
 * serveur échoue et supabase-js garde alors la session : on la retire au moins
 * de cet ordinateur (`scope: 'local'`), ce qui émet SIGNED_OUT (retour à
 * l'écran de connexion, clé du Coffre effacée de la mémoire).
 */
export function useSignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: remote } = await supabase.auth.signOut().catch((e: unknown) => ({ error: e }));
      if (remote) {
        const { error: local } = await supabase.auth.signOut({ scope: 'local' });
        if (local) setError(`Déconnexion impossible : ${local.message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return { signOut, busy, error };
}
