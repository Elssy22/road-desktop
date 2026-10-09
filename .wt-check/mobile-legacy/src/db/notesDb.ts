import type { SQLiteDatabase } from 'expo-sqlite';

import { enqueue, now, readPendingRows, type PendingBatch } from './localDb';

// Table `notes` créée par la migration locale v3 (cf. localDb.ts). Même logique
// que les tâches : écriture locale immédiate + entrée dans l'outbox commune.

export type Note = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** Contenu éditable d'une note (le reste est géré par la couche données). */
export type NoteDraft = Pick<Note, 'id' | 'user_id' | 'title' | 'body' | 'pinned'>;

type NoteRow = Omit<Note, 'pinned'> & { pinned: number };

const toNote = (row: NoteRow): Note => ({ ...row, pinned: row.pinned === 1 });

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Épinglées d'abord, puis les plus récemment modifiées. */
export async function listNotes(db: SQLiteDatabase, userId: string): Promise<Note[]> {
  const rows = await db.getAllAsync<NoteRow>(
    `SELECT * FROM notes WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY pinned DESC, updated_at DESC`,
    userId
  );
  return rows.map(toNote);
}

/** `null` si la note n'existe pas (encore) en local ou a été supprimée. */
export async function getNote(db: SQLiteDatabase, id: string): Promise<Note | null> {
  const row = await db.getFirstAsync<NoteRow>(
    'SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL',
    id
  );
  return row ? toNote(row) : null;
}

// ---------------------------------------------------------------------------
// Écritures locales (immédiates, même hors ligne) + ajout dans l'outbox
// ---------------------------------------------------------------------------

/**
 * Crée ou met à jour une note. L'id est généré par l'éditeur dès l'ouverture
 * d'une nouvelle note : la première sauvegarde l'insère, les suivantes la
 * mettent à jour (created_at n'est posé qu'à l'insertion).
 */
export async function saveNote(db: SQLiteDatabase, note: NoteDraft) {
  const ts = now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO notes (id, user_id, title, body, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         body = excluded.body,
         pinned = excluded.pinned,
         updated_at = excluded.updated_at`,
      note.id,
      note.user_id,
      note.title,
      note.body,
      note.pinned ? 1 : 0,
      ts,
      ts
    );
    await enqueue(db, 'notes', note.id, note.user_id);
  });
}

export async function setNotePinned(db: SQLiteDatabase, note: Note, pinned: boolean) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE notes SET pinned = ?, updated_at = ? WHERE id = ?',
      pinned ? 1 : 0,
      now(),
      note.id
    );
    await enqueue(db, 'notes', note.id, note.user_id);
  });
}

/** Suppression logique : la ligne reste en base avec deleted_at pour être propagée. */
export async function softDeleteNote(db: SQLiteDatabase, note: Pick<Note, 'id' | 'user_id'>) {
  const ts = now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?',
      ts,
      ts,
      note.id
    );
    await enqueue(db, 'notes', note.id, note.user_id);
  });
}

// ---------------------------------------------------------------------------
// Primitives utilisées par le moteur de sync
// ---------------------------------------------------------------------------

export async function readPendingNotes(
  db: SQLiteDatabase,
  userId: string
): Promise<PendingBatch<Note> | null> {
  const batch = await readPendingRows<NoteRow>(db, 'notes', userId);
  return batch && { maxSeq: batch.maxSeq, rows: batch.rows.map(toNote) };
}

/** Last-write-wins, comme applyRemoteTasks. */
export async function applyRemoteNotes(db: SQLiteDatabase, notes: Note[]) {
  if (notes.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const n of notes) {
      await db.runAsync(
        `INSERT INTO notes (id, user_id, title, body, pinned, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           body = excluded.body,
           pinned = excluded.pinned,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at
         WHERE excluded.updated_at >= notes.updated_at`,
        n.id,
        n.user_id,
        n.title,
        n.body,
        n.pinned ? 1 : 0,
        n.created_at,
        n.updated_at,
        n.deleted_at
      );
    }
  });
}
