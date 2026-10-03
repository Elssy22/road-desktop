// Compte-rendu de RDV assisté par IA. L'app n'appelle jamais OpenRouter : elle
// envoie les notes à l'Edge Function `summarize-meeting` (sans état), qui renvoie
// un résumé et des tâches suggérées (cf. DECISIONS.md §15).
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import type { DateKey } from './dates';
import { supabase } from './supabase';

export type SuggestedTask = { title: string; due_date: DateKey | null };
export type MeetingSummary = { summary: string; suggested_tasks: SuggestedTask[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Revalide la réponse : l'app ne fait pas confiance aveuglément au serveur. */
function normalize(data: unknown): MeetingSummary {
  const raw = data as { summary?: unknown; suggested_tasks?: unknown } | null;
  const summary = typeof raw?.summary === 'string' ? raw.summary.trim() : '';
  if (!summary) throw new Error('Réponse inattendue du serveur (résumé manquant). Réessaie.');
  const tasks = Array.isArray(raw?.suggested_tasks) ? raw.suggested_tasks : [];
  return {
    summary,
    suggested_tasks: tasks
      .map((t: { title?: unknown; due_date?: unknown }) => ({
        title: typeof t?.title === 'string' ? t.title.trim() : '',
        due_date: typeof t?.due_date === 'string' && DATE_RE.test(t.due_date) ? t.due_date : null,
      }))
      .filter((t) => t.title.length > 0),
  };
}

/** Lève une erreur au message lisible (réseau, quota, réponse illisible…). */
export async function summarizeMeeting(notes: string, today: DateKey): Promise<MeetingSummary> {
  const { data, error } = await supabase.functions.invoke('summarize-meeting', {
    method: 'POST',
    body: { notes, today },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
      throw new Error(`Le serveur a répondu avec une erreur (HTTP ${error.context.status}).`);
    }
    if (error instanceof FunctionsFetchError) {
      throw new Error('Pas de connexion au serveur. Vérifie le réseau et réessaie.');
    }
    throw new Error(error.message || 'Résumé impossible.');
  }
  return normalize(data);
}

/** Titre de la note enregistrée : « CR RDV · Nom · 2 octobre 2026 ». */
export function meetingNoteTitle(dateLabel: string, contactName: string | null): string {
  return ['CR RDV', contactName, dateLabel].filter(Boolean).join(' · ');
}

/** Corps de la note : le résumé, puis les notes brutes pour ne rien perdre. */
export function meetingNoteBody(summary: string, rawNotes: string): string {
  return `${summary.trim()}\n\n— Notes brutes —\n${rawNotes.trim()}`;
}
