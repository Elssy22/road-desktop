import { fromDateKey, type DateKey } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { fetchAll } from './base';
import type { Task } from './tasks';

// Revue de la semaine : requêtes reprises de mobile-legacy/src/db/weeklyReviewDb.ts.
// Les données agrégées sont lues dans les tables existantes. Les trois champs
// libres du bilan ne sont pas synchronisés (pas de table Supabase) : comme sur
// le mobile, ils restent sur l'appareil, ici dans le localStorage de la webview.

export type WeeklyReviewText = {
  done_text: string;
  slipping_text: string;
  next_priority_text: string;
};

export const EMPTY_REVIEW: WeeklyReviewText = { done_text: '', slipping_text: '', next_priority_text: '' };

const reviewKey = (userId: string, weekStart: DateKey) => `weekly_review:${userId}:${weekStart}`;

export function loadWeeklyReview(userId: string, weekStart: DateKey): WeeklyReviewText {
  try {
    const raw = window.localStorage.getItem(reviewKey(userId, weekStart));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return EMPTY_REVIEW;
    const p = parsed as Record<string, unknown>;
    const text = (k: keyof WeeklyReviewText) => (typeof p[k] === 'string' ? p[k] : '');
    return {
      done_text: text('done_text'),
      slipping_text: text('slipping_text'),
      next_priority_text: text('next_priority_text'),
    };
  } catch {
    return EMPTY_REVIEW;
  }
}

export function saveWeeklyReview(userId: string, weekStart: DateKey, review: WeeklyReviewText) {
  try {
    window.localStorage.setItem(reviewKey(userId, weekStart), JSON.stringify(review));
  } catch {
    // Stockage plein ou indisponible : la saisie reste à l'écran, simplement non conservée.
  }
}

/**
 * Tâches cochées entre `from` (inclus) et `to` (exclu), jours locaux.
 * Pas de colonne `completed_at` : on prend la dernière modification d'une tâche
 * faite (approximation documentée dans DECISIONS.md §12).
 */
export const listTasksDoneBetween = (from: DateKey, to: DateKey): Promise<Task[]> =>
  fetchAll<Task>((a, b) =>
    supabase
      .from('tasks')
      .select('*')
      .is('deleted_at', null)
      .eq('done', true)
      .gte('updated_at', fromDateKey(from).toISOString())
      .lt('updated_at', fromDateKey(to).toISOString())
      .order('updated_at', { ascending: false })
      .order('id')
      .range(a, b)
  );

/** Tâches à faire dont l'échéance est passée, la plus ancienne d'abord. */
export const listOverdueTasks = (today: DateKey): Promise<Task[]> =>
  fetchAll<Task>((a, b) =>
    supabase
      .from('tasks')
      .select('*')
      .is('deleted_at', null)
      .eq('done', false)
      .not('due_date', 'is', null)
      .lt('due_date', today)
      .order('due_date')
      .order('priority', { ascending: false })
      .order('id')
      .range(a, b)
  );
