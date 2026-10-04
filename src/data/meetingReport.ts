import { supabase } from '../lib/supabase';
import { notifyDataChanged, unwrap } from './base';

// Enregistrement d'un compte-rendu de RDV validé par l'utilisateur (DECISIONS.md
// §15), repris de mobile-legacy/src/db/meetingReportDb.ts. Sans transaction
// PostgREST, la note part en premier : elle contient résumé et notes brutes,
// rien n'est perdu si la suite échoue.
//
// Ids fournis par l'écran et insertion « si absente » (upsert ignoreDuplicates) :
// relancer l'enregistrement après un échec à mi-chemin ne crée que les lignes
// manquantes, sans doubler la note ni les tâches déjà écrites.

export type MeetingReportDraft = {
  noteId: string;
  noteTitle: string;
  noteBody: string;
  /** Tâches cochées par l'utilisateur, seules créées. */
  tasks: { id: string; title: string; due_date: string | null }[];
  /** Si présent, le résumé est aussi ajouté à l'historique du contact (type « rdv »). */
  interaction: { id: string; contact_id: string; summary: string } | null;
};

const insertMissing = async (table: string, rows: Record<string, unknown>[]) =>
  unwrap(await supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));

export async function saveMeetingReport(draft: MeetingReportDraft) {
  const ts = new Date().toISOString();
  const stamp = { created_at: ts, updated_at: ts };
  try {
    await insertMissing('notes', [
      { id: draft.noteId, title: draft.noteTitle, body: draft.noteBody, pinned: false, ...stamp },
    ]);
    if (draft.tasks.length > 0) {
      await insertMissing(
        'tasks',
        draft.tasks.map((t) => ({ id: t.id, title: t.title, done: false, due_date: t.due_date, priority: 0, ...stamp }))
      );
    }
    if (draft.interaction) {
      await insertMissing('interactions', [
        {
          id: draft.interaction.id,
          contact_id: draft.interaction.contact_id,
          type: 'rdv',
          summary: draft.interaction.summary,
          happened_at: ts,
          ...stamp,
        },
      ]);
    }
  } finally {
    notifyDataChanged();
  }
}
