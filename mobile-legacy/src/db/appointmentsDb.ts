import type { SQLiteDatabase } from 'expo-sqlite';

import { fromDateKey, type DateKey } from '../lib/dates';
import { fromSqlRow, getRow, insertRow, type BaseRow, type EntitySpec, type Fields } from './entityTable';
import { formatTimeOfDay, startOfDayIso } from './remindersDb';

// Agenda (migration locale v12) : de vrais rendez-vous, avec un début, une fin
// facultative et un lieu — distincts des tâches (un jour, à cocher), des dates
// clés (contractuelles) et des rappels (un instant, à cocher). Un RDV n'est pas
// « fait » : il est passé. Notification de debrief après le RDV (src/notifications/).

export type Appointment = BaseRow & {
  title: string;
  /** Instant ISO (timestamptz), toujours écrit en `toISOString()`. */
  start_at: string;
  end_at: string | null;
  location: string | null;
  contact_id: string | null;
  project_id: string | null;
  notes: string | null;
  debrief_reminder_enabled: boolean;
};

export const APPOINTMENTS: EntitySpec<Appointment> = {
  entity: 'appointments',
  columns: {
    title: 'text',
    start_at: 'ts',
    end_at: 'ts',
    location: 'text',
    contact_id: 'text',
    project_id: 'text',
    notes: 'text',
    debrief_reminder_enabled: 'bool',
  },
};

/** RDV + nom du contact lié (null si aucun ou contact supprimé). */
export type AppointmentWithContact = Appointment & { contact_name: string | null };

const SELECT_WITH_CONTACT = `
  SELECT a.*, c.name AS contact_name
  FROM appointments a
  LEFT JOIN contacts c ON c.id = a.contact_id AND c.deleted_at IS NULL
  WHERE a.user_id = ? AND a.deleted_at IS NULL`;

const withContact = (r: Record<string, unknown>): AppointmentWithContact => ({
  ...fromSqlRow(APPOINTMENTS, r),
  contact_name: (r.contact_name as string | null) ?? null,
});

/** Debrief : 1 h après la fin, ou 2 h après le début si le RDV n'a pas d'heure de fin. */
export const DEBRIEF_AFTER_END_MS = 60 * 60 * 1000;
export const DEBRIEF_AFTER_START_MS = 2 * 60 * 60 * 1000;

/** Instant de la notification de debrief (null si désactivée). */
export function debriefAt(a: Pick<Appointment, 'start_at' | 'end_at' | 'debrief_reminder_enabled'>): Date | null {
  if (!a.debrief_reminder_enabled) return null;
  return a.end_at
    ? new Date(new Date(a.end_at).getTime() + DEBRIEF_AFTER_END_MS)
    : new Date(new Date(a.start_at).getTime() + DEBRIEF_AFTER_START_MS);
}

/** Même calcul que `debriefAt`, en SQL (format `datetime()` de SQLite, comparable en texte). */
const DEBRIEF_AT_SQL = `CASE WHEN a.end_at IS NOT NULL THEN datetime(a.end_at, '+1 hour') ELSE datetime(a.start_at, '+2 hours') END`;

/**
 * RDV commençant dans les jours locaux `from` à `to` inclus, par heure de début.
 * Comparaison texte valable : start_at est toujours normalisé en `toISOString()`.
 */
export async function listAppointmentsBetween(
  db: SQLiteDatabase,
  userId: string,
  from: DateKey,
  to: DateKey
): Promise<AppointmentWithContact[]> {
  const end = fromDateKey(to);
  end.setDate(end.getDate() + 1);
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${SELECT_WITH_CONTACT} AND a.start_at >= ? AND a.start_at < ? ORDER BY a.start_at, a.created_at`,
    userId,
    startOfDayIso(from),
    end.toISOString()
  );
  return rows.map(withContact);
}

/** Notifications : RDV dont le debrief (activé) est encore à venir, les plus proches d'abord. */
export async function listUpcomingDebriefs(
  db: SQLiteDatabase,
  userId: string,
  after: Date,
  limit: number
): Promise<AppointmentWithContact[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${SELECT_WITH_CONTACT} AND a.debrief_reminder_enabled = 1 AND ${DEBRIEF_AT_SQL} > datetime(?)
     ORDER BY ${DEBRIEF_AT_SQL} LIMIT ?`,
    userId,
    after.toISOString(),
    limit
  );
  return rows.map(withContact);
}

export const getAppointment = (db: SQLiteDatabase, id: string) => getRow(db, APPOINTMENTS, id);

export const addAppointment = (db: SQLiteDatabase, userId: string, fields: Fields<Appointment>) =>
  insertRow(db, APPOINTMENTS, userId, fields);

/** « 14:00 – 15:30 », ou « 14:00 » sans heure de fin. */
export function formatTimeRange(a: Pick<Appointment, 'start_at' | 'end_at'>): string {
  return a.end_at ? `${formatTimeOfDay(a.start_at)} – ${formatTimeOfDay(a.end_at)}` : formatTimeOfDay(a.start_at);
}
