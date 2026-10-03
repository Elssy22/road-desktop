import { useEffect, useState } from 'react';

import { onDataChanged } from './base';

/**
 * Lecture Supabase pour un écran (remplace useLocalQuery du mobile) : charge à
 * l'affichage et quand `load` change, puis relit après chaque écriture de l'app
 * et au retour sur la fenêtre (modifications faites depuis le mobile).
 * `load` doit être stable (useCallback) : chaque nouvelle référence relance la lecture.
 */
export function useRemoteQuery<T>(load: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Seule la réponse de la dernière lecture lancée est retenue.
    let latest = 0;
    const run = () => {
      const call = ++latest;
      load()
        .then((d) => {
          if (!active || call !== latest) return;
          setData(d);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!active || call !== latest) return;
          setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (active && call === latest) setLoading(false);
        });
    };
    run();
    const unsubscribe = onDataChanged(run);
    window.addEventListener('focus', run);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('focus', run);
    };
  }, [load]);

  return { data, error, loading };
}
