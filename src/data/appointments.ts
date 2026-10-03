import type { DateKey } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { fetchAll, type BaseRow } from './base';
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

/** RDV commençant dans les jours locaux `from` à `to` inclus, par heure de début. */
export async function listAppointmentsBetween(from: DateKey, to: DateKey): Promise<AppointmentWithContact[]> {
  const rows = await fetchAll<Appointment>((a, b) =>
    supabase
      .from('appointments')
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

/** « 14:00 – 15:30 », ou « 14:00 » sans heure de fin. */
export function formatTimeRange(a: Pick<Appointment, 'start_at' | 'end_at'>): string {
  return a.end_at ? `${formatTimeOfDay(a.start_at)} – ${formatTimeOfDay(a.end_at)}` : formatTimeOfDay(a.start_at);
}
