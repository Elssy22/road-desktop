import type { SQLiteDatabase } from 'expo-sqlite';

import { fromDateKey, type DateKey } from '../lib/dates';
import { fromSqlRow, getRow, insertRow, type BaseRow, type EntitySpec, type Fields } from './entityTable';

// Rappels ponctuels (migration locale v11) : un titre et un instant, liés
// facultativement à une tâche ou à un contact. Notification locale à l'heure
// dite (src/notifications/), cochés « fait » depuis la Vue du jour.

export type Reminder = BaseRow & {
  title: string;
  /** Instant ISO (timestamptz) : un rappel a une heure, contrairement à une échéance. */
  remind_at: string;
  task_id: string | null;
  contact_id: string | null;
  done: boolean;
};

export const REMINDERS: EntitySpec<Reminder> = {
  entity: 'reminders',
  columns: { title: 'text', remind_at: 'ts', task_id: 'text', contact_id: 'text', done: 'bool' },
};

/** Rappel + libellés des éléments liés (null si aucun ou élément supprimé). */
export type ReminderWithLinks = Reminder & { task_title: string | null; contact_name: string | null };

const SELECT_WITH_LINKS = `
  SELECT r.*, t.title AS task_title, c.name AS contact_name
  FROM reminders r
  LEFT JOIN tasks t ON t.id = r.task_id AND t.deleted_at IS NULL
  LEFT JOIN contacts c ON c.id = r.contact_id AND c.deleted_at IS NULL
  WHERE r.user_id = ? AND r.deleted_at IS NULL`;

const withLinks = (r: Record<string, unknown>): ReminderWithLinks => ({
  ...fromSqlRow(REMINDERS, r),
  task_title: (r.task_title as string | null) ?? null,
  contact_name: (r.contact_name as string | null) ?? null,
});

/** Début du jour local `day`, en ISO UTC (même format que remind_at). */
export const startOfDayIso = (day: DateKey) => fromDateKey(day).toISOString();

/**
 * Rappels dont l'instant tombe dans les jours locaux `from` à `to` inclus.
 * Comparaison texte valable : remind_at est toujours normalisé en `toISOString()`.
 */
export async function listRemindersBetween(
  db: SQLiteDatabase,
  userId: string,
  from: DateKey,
  to: DateKey
): Promise<ReminderWithLinks[]> {
  const end = fromDateKey(to);
  end.setDate(end.getDate() + 1);
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${SELECT_WITH_LINKS} AND r.remind_at >= ? AND r.remind_at < ? ORDER BY r.remind_at, r.created_at`,
    userId,
    startOfDayIso(from),
    end.toISOString()
  );
  return rows.map(withLinks);
}

/** Vue du jour : rappels non faits d'aujourd'hui, plus ceux des jours passés restés non faits. */
export async function listOpenRemindersUntil(
  db: SQLiteDatabase,
  userId: string,
  day: DateKey
): Promise<ReminderWithLinks[]> {
  const end = fromDateKey(day);
  end.setDate(end.getDate() + 1);
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${SELECT_WITH_LINKS} AND r.done = 0 AND r.remind_at < ? ORDER BY r.remind_at, r.created_at`,
    userId,
    end.toISOString()
  );
  return rows.map(withLinks);
}

/** Notifications : rappels non faits encore à venir, les plus proches d'abord. */
export async function listUpcomingReminders(
  db: SQLiteDatabase,
  userId: string,
  after: Date,
  limit: number
): Promise<ReminderWithLinks[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${SELECT_WITH_LINKS} AND r.done = 0 AND r.remind_at > ? ORDER BY r.remind_at LIMIT ?`,
    userId,
    after.toISOString(),
    limit
  );
  return rows.map(withLinks);
}

/** Rappels encore à faire liés à un contact (fiche contact). */
export async function listOpenRemindersForContact(
  db: SQLiteDatabase,
  userId: string,
  contactId: string
): Promise<ReminderWithLinks[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${SELECT_WITH_LINKS} AND r.done = 0 AND r.contact_id = ? ORDER BY r.remind_at`,
    userId,
    contactId
  );
  return rows.map(withLinks);
}

export const getReminder = (db: SQLiteDatabase, id: string) => getRow(db, REMINDERS, id);

export const addReminder = (db: SQLiteDatabase, userId: string, fields: Fields<Reminder>) =>
  insertRow(db, REMINDERS, userId, fields);

/** « 14:05 » (heure locale). */
export function formatTimeOfDay(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
