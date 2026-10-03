import { fromDateKey, type DateKey } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { fetchAll, insertRow, softDeleteRow, unwrap, updateRow, type BaseRow, type Fields } from './base';
import { contactNames } from './crm';
import { taskTitles } from './tasks';

// Rappels ponctuels : type et requêtes repris de mobile-legacy/src/db/remindersDb.ts.
// Un titre et un instant, liés facultativement à une tâche ou à un contact.

export type Reminder = BaseRow & {
  title: string;
  /** Instant ISO (timestamptz) : un rappel a une heure, contrairement à une échéance. */
  remind_at: string;
  task_id: string | null;
  contact_id: string | null;
  done: boolean;
};

/** Rappel + libellés des éléments liés (null si aucun ou élément supprimé). */
export type ReminderWithLinks = Reminder & { task_title: string | null; contact_name: string | null };

const REMINDERS = 'reminders';

/** Début du jour local `day`, en ISO UTC (même format que remind_at). */
export const startOfDayIso = (day: DateKey) => fromDateKey(day).toISOString();

/** Début du jour local suivant `day`, en ISO UTC (borne exclusive). */
export const endOfDayIso = (day: DateKey) => {
  const end = fromDateKey(day);
  end.setDate(end.getDate() + 1);
  return end.toISOString();
};

async function withLinks(rows: Reminder[]): Promise<ReminderWithLinks[]> {
  const [tasks, contacts] = await Promise.all([
    taskTitles(rows.flatMap((r) => (r.task_id ? [r.task_id] : []))),
    contactNames(rows.flatMap((r) => (r.contact_id ? [r.contact_id] : []))),
  ]);
  return rows.map((r) => ({
    ...r,
    task_title: (r.task_id && tasks.get(r.task_id)) || null,
    contact_name: (r.contact_id && contacts.get(r.contact_id)) || null,
  }));
}

/** Rappels dont l'instant tombe dans les jours locaux `from` à `to` inclus. */
export async function listRemindersBetween(from: DateKey, to: DateKey): Promise<ReminderWithLinks[]> {
  const rows = await fetchAll<Reminder>((a, b) =>
    supabase
      .from(REMINDERS)
      .select('*')
      .is('deleted_at', null)
      .gte('remind_at', startOfDayIso(from))
      .lt('remind_at', endOfDayIso(to))
      .order('remind_at')
      .order('created_at')
      .range(a, b)
  );
  return withLinks(rows);
}

/** Vue du jour : rappels non faits d'aujourd'hui, plus ceux des jours passés restés non faits. */
export async function listOpenRemindersUntil(day: DateKey): Promise<ReminderWithLinks[]> {
  const rows = await fetchAll<Reminder>((a, b) =>
    supabase
      .from(REMINDERS)
      .select('*')
      .is('deleted_at', null)
      .eq('done', false)
      .lt('remind_at', endOfDayIso(day))
      .order('remind_at')
      .order('created_at')
      .range(a, b)
  );
  return withLinks(rows);
}

/** Fiche contact : rappels non faits liés au contact, par instant. */
export async function listOpenRemindersForContact(contactId: string): Promise<ReminderWithLinks[]> {
  const rows = await fetchAll<Reminder>((a, b) =>
    supabase
      .from(REMINDERS)
      .select('*')
      .is('deleted_at', null)
      .eq('done', false)
      .eq('contact_id', contactId)
      .order('remind_at')
      .order('created_at')
      .range(a, b)
  );
  return withLinks(rows);
}

/** Rappel vivant, ou null s'il n'existe pas ou a été supprimé. */
export async function getReminder(id: string): Promise<Reminder | null> {
  return unwrap(await supabase.from(REMINDERS).select('*').eq('id', id).is('deleted_at', null).maybeSingle());
}

export const addReminder = (fields: Fields<Reminder>) => insertRow(REMINDERS, fields);

export const updateReminder = (id: string, patch: Partial<Fields<Reminder>>) => updateRow(REMINDERS, id, patch);

export const softDeleteReminder = (id: string) => softDeleteRow(REMINDERS, id);

export const setReminderDone = (reminder: Reminder, done: boolean) => updateRow(REMINDERS, reminder.id, { done });

/** « 14:05 » (heure locale). */
export function formatTimeOfDay(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
