import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { INTERACTIONS } from './crmDb';
import { insertRowInTx } from './entityTable';
import { enqueue, now } from './localDb';

// Enregistrement d'un compte-rendu de RDV validé par l'utilisateur (cf. DECISIONS.md §15).
// Tout est écrit dans UNE transaction locale (note + tâches + interaction) puis
// part par l'outbox habituelle : rien n'est envoyé à moitié.

export type MeetingReportDraft = {
  noteTitle: string;
  noteBody: string;
  /** Tâches cochées par l'utilisateur, seules créées. */
  tasks: { title: string; due_date: string | null }[];
  /** Si présent, le résumé est aussi ajouté à l'historique du contact (type « rdv »). */
  interaction: { contact_id: string; summary: string } | null;
};

export async function saveMeetingReport(db: SQLiteDatabase, userId: string, draft: MeetingReportDraft) {
  const ts = now();
  await db.withTransactionAsync(async () => {
    const noteId = randomUUID();
    await db.runAsync(
      `INSERT INTO notes (id, user_id, title, body, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      noteId,
      userId,
      draft.noteTitle,
      draft.noteBody,
      ts,
      ts
    );
    await enqueue(db, 'notes', noteId, userId);

    for (const t of draft.tasks) {
      const taskId = randomUUID();
      await db.runAsync(
        `INSERT INTO tasks (id, user_id, title, done, due_date, priority, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, 0, ?, ?)`,
        taskId,
        userId,
        t.title,
        t.due_date,
        ts,
        ts
      );
      await enqueue(db, 'tasks', taskId, userId);
    }

    if (draft.interaction) {
      await insertRowInTx(db, INTERACTIONS, userId, {
        contact_id: draft.interaction.contact_id,
        type: 'rdv',
        summary: draft.interaction.summary,
        happened_at: ts,
      });
    }
  });
}
