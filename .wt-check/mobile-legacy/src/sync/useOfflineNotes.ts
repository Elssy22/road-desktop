import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { listNotes, setNotePinned, softDeleteNote, type Note } from '../db/notesDb';
import { useSync } from './SyncProvider';

/**
 * Notes de l'utilisateur, lues depuis SQLite (offline-first), relues à chaque
 * changement signalé par <SyncProvider> (`dataVersion`). Même principe que
 * useOfflineTasks.
 */
export function useOfflineNotes(userId: string) {
  const db = useSQLiteContext();
  const { syncing, lastError, syncNow, runLocal, dataVersion } = useSync();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listNotes(db, userId)
      .then((n) => {
        if (active) setNotes(n);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, [db, userId, dataVersion]);

  return {
    notes,
    syncing,
    lastError: lastError ?? loadError,
    syncNow,
    togglePin: (note: Note) => runLocal(() => setNotePinned(db, note, !note.pinned)),
    remove: (note: Note) => runLocal(() => softDeleteNote(db, note)),
  };
}
