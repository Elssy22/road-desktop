import { supabase } from '../lib/supabase';
import { notifyDataChanged, unwrap } from './base';

// Enregistrement d'un compte-rendu de RDV validé par l'utilisateur (DECISIONS.md
// §15), repris de mobile-legacy/src/db/meetingReportDb.ts. Sans transaction
// PostgREST, la note part en premier : elle contient résumé et notes brutes,
// rien n'est perdu si la suite échoue.

export type MeetingReportDraft = {
  noteTitle: string;
  noteBody: string;
  /** Tâches cochées par l'utilisateur, seules créées. */
  tasks: { title: string; due_date: string | null }[];
  /** Si présent, le résumé est aussi ajouté à l'historique du contact (type « rdv »). */
  interaction: { contact_id: string; summary: string } | null;
};

export async function saveMeetingReport(draft: MeetingReportDraft) {
  const ts = new Date().toISOString();
  const stamp = { created_at: ts, updated_at: ts };
  try {
    unwrap(
      await supabase
        .from('notes')
        .insert({ id: crypto.randomUUID(), title: draft.noteTitle, body: draft.noteBody, pinned: false, ...stamp })
    );
    if (draft.tasks.length > 0) {
      unwrap(
        await supabase.from('tasks').insert(
          draft.tasks.map((t) => ({
            id: crypto.randomUUID(),
            title: t.title,
            done: false,
            due_date: t.due_date,
            priority: 0,
            ...stamp,
          }))
        )
      );
    }
    if (draft.interaction) {
      unwrap(
        await supabase.from('interactions').insert({
          id: crypto.randomUUID(),
          contact_id: draft.interaction.contact_id,
          type: 'rdv',
          summary: draft.interaction.summary,
          happened_at: ts,
          ...stamp,
        })
      );
    }
  } finally {
    notifyDataChanged();
  }
}
