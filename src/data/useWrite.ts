import { useCallback, useState } from 'react';

import { errorMessage } from '../lib/errors';

/**
 * Écritures d'un écran : `run` exécute l'écriture et retient son erreur
 * (effacée à la réussite suivante), à afficher dans un ErrorBanner. Renvoie
 * true si l'écriture a réussi.
 */
export function useWrite() {
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (write: () => Promise<unknown>): Promise<boolean> => {
    try {
      await write();
      setError(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }, []);

  return { run, error };
}
