import type { DateKey } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { fetchAll, insertRow, softDeleteRow, unwrap, updateRow, type BaseRow, type Fields } from './base';
import { contactNames } from './crm';
import { endOfDayIso, formatTimeOfDay, startOfDayIso } from './reminders';

// Agenda : type et requêtes repris de mobile-legacy/src/db/appointmentsDb.ts.
// De vrais rendez-vous, avec un début, une fin facultative et un lieu —
// distincts des tâches (un jour, à cocher), des dates clés et des rappels.
// Un RDV n'est pas « fait » : il est passé.

export type Appointment = BaseRow & {
  title: string;
  /** Instant ISO (timestamptz). */
  start_at: string;
  end_at: string | null;
  location: string | null;
  contact_id: string | null;
  project_id: string | null;
  notes: string | null;
  debrief_reminder_enabled: boolean;
};

/** RDV + nom du contact lié (null si aucun ou contact supprimé). */
export type AppointmentWithContact = Appointment & { contact_name: string | null };

const APPOINTMENTS = 'appointments';

/** Debrief : 1 h après la fin, ou 2 h après le début si le RDV n'a pas d'heure de fin. */
export const DEBRIEF_AFTER_END_MS = 60 * 60 * 1000;
export const DEBRIEF_AFTER_START_MS = 2 * 60 * 60 * 1000;

/**
 * Instant de la notification de debrief (null si désactivée). La notification
 * est programmée par le mobile ; le desktop n'en affiche que l'heure prévue.
 */
export function debriefAt(a: Pick<Appointment, 'start_at' | 'end_at' | 'debrief_reminder_enabled'>): Date | null {
  if (!a.debrief_reminder_enabled) return null;
  return a.end_at
    ? new Date(new Date(a.end_at).getTime() + DEBRIEF_AFTER_END_MS)
    : new Date(new Date(a.start_at).getTime() + DEBRIEF_AFTER_START_MS);
}

/** RDV commençant dans les jours locaux `from` à `to` inclus, par heure de début. */
export async function listAppointmentsBetween(from: DateKey, to: DateKey): Promise<AppointmentWithContact[]> {
  const rows = await fetchAll<Appointment>((a, b) =>
    supabase
      .from(APPOINTMENTS)
      .select('*')
      .is('deleted_at', null)
      .gte('start_at', startOfDayIso(from))
      .lt('start_at', endOfDayIso(to))
      .order('start_at')
      .order('created_at')
      .range(a, b)
  );
  const names = await contactNames(rows.flatMap((r) => (r.contact_id ? [r.contact_id] : [])));
  return rows.map((r) => ({ ...r, contact_name: (r.contact_id && names.get(r.contact_id)) || null }));
}

/** RDV vivant, ou null s'il n'existe pas ou a été supprimé. */
export async function getAppointment(id: string): Promise<Appointment | null> {
  return unwrap(await supabase.from(APPOINTMENTS).select('*').eq('id', id).is('deleted_at', null).maybeSingle());
}

export const addAppointment = (fields: Fields<Appointment>) => insertRow(APPOINTMENTS, fields);

export const updateAppointment = (id: string, patch: Partial<Fields<Appointment>>) =>
  updateRow(APPOINTMENTS, id, patch);

export const softDeleteAppointment = (id: string) => softDeleteRow(APPOINTMENTS, id);

/** « 14:00 – 15:30 », ou « 14:00 » sans heure de fin. */
export function formatTimeRange(a: Pick<Appointment, 'start_at' | 'end_at'>): string {
  return a.end_at ? `${formatTimeOfDay(a.start_at)} – ${formatTimeOfDay(a.end_at)}` : formatTimeOfDay(a.start_at);
}
