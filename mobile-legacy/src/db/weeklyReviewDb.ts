import type { SQLiteDatabase } from 'expo-sqlite';

import { fromDateKey, type DateKey } from '../lib/dates';
import { now, toTask, type Task, type TaskRow } from './localDb';

// Revue de la semaine (migration locale v9). Les données agrégées sont lues
// dans les tables existantes ; seuls les trois champs libres sont stockés,
// en local uniquement (pas d'outbox ni de sync serveur pour le MVP).

export type WeeklyReviewText = {
  done_text: string;
  slipping_text: string;
  next_priority_text: string;
};

export const EMPTY_REVIEW: WeeklyReviewText = { done_text: '', slipping_text: '', next_priority_text: '' };

export async function getWeeklyReview(
  db: SQLiteDatabase,
  userId: string,
  weekStart: DateKey
): Promise<WeeklyReviewText> {
  const row = await db.getFirstAsync<WeeklyReviewText>(
    `SELECT done_text, slipping_text, next_priority_text FROM weekly_reviews
     WHERE user_id = ? AND week_start = ?`,
    userId,
    weekStart
  );
  return row ?? EMPTY_REVIEW;
}

export async function saveWeeklyReview(
  db: SQLiteDatabase,
  userId: string,
  weekStart: DateKey,
  review: WeeklyReviewText
) {
  await db.runAsync(
    `INSERT INTO weekly_reviews (user_id, week_start, done_text, slipping_text, next_priority_text, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, week_start) DO UPDATE SET
       done_text = excluded.done_text,
       slipping_text = excluded.slipping_text,
       next_priority_text = excluded.next_priority_text,
       updated_at = excluded.updated_at`,
    userId,
    weekStart,
    review.done_text,
    review.slipping_text,
    review.next_priority_text,
    now()
  );
}

/**
 * Tâches cochées entre `from` (inclus) et `to` (exclu), jours locaux.
 * Pas de colonne `completed_at` : on prend la dernière modification d'une tâche
 * faite (approximation documentée dans DECISIONS.md §12).
 */
export async function listTasksDoneBetween(
  db: SQLiteDatabase,
  userId: string,
  from: DateKey,
  to: DateKey
): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(
    `SELECT * FROM tasks
     WHERE user_id = ? AND deleted_at IS NULL AND done = 1 AND updated_at >= ? AND updated_at < ?
     ORDER BY updated_at DESC`,
    userId,
    fromDateKey(from).toISOString(),
    fromDateKey(to).toISOString()
  );
  return rows.map(toTask);
}

/** Tâches à faire dont l'échéance est passée, la plus ancienne d'abord. */
export async function listOverdueTasks(db: SQLiteDatabase, userId: string, today: DateKey): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(
    `SELECT * FROM tasks
     WHERE user_id = ? AND deleted_at IS NULL AND done = 0 AND due_date IS NOT NULL AND due_date < ?
     ORDER BY due_date, priority DESC`,
    userId,
    today
  );
  return rows.map(toTask);
}
