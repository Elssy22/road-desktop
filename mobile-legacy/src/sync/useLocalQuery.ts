import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { useSync } from './SyncProvider';

/**
 * Lecture SQLite relancée à chaque changement signalé par <SyncProvider>
 * (`dataVersion`), comme useOfflineTasks / useOfflineNotes mais générique.
 * `load` doit être stable (useCallback) : il fait partie des dépendances.
 */
export function useLocalQuery<T>(load: (db: SQLiteDatabase) => Promise<T>, initial: T) {
  const db = useSQLiteContext();
  const { dataVersion } = useSync();
  const [data, setData] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    load(db)
      .then((d) => {
        if (!active) return;
        setData(d);
        setLoaded(true);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [db, load, dataVersion]);

  return { data, loaded, error };
}
