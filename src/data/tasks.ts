import { supabase } from '../lib/supabase';
import { fetchAll, insertRow, softDeleteRow, unwrap, updateRow } from './base';

// Tâches : type et opérations repris de mobile-legacy/src/db/localDb.ts.

/** 0 = normale, 1 = haute, 2 = urgente. */
export type TaskPriority = 0 | 1 | 2;

export const PRIORITY_LABELS = ['Normale', 'Haute', 'Urgente'] as const;

export type Task = {
  id: string;
  user_id: string;
  title: string;
  done: boolean;
  /** Jour d'échéance local, format YYYY-MM-DD (colonne `date` côté Postgres). */
  due_date: string | null;
  priority: TaskPriority;
  /** Projet de rattachement facultatif (Lot 2, migration Supabase 005). */
  project_id: string | null;
  /** Contact de rattachement (migration Supabase 014) ; seules les tâches automatiques en ont un. */
  contact_id: string | null;
  /** Étape de la séquence de relances CRM ; null = tâche manuelle (cf. lib/crmFollowups.ts). */
  auto_kind: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const TASKS = 'tasks';

/** Les tâches terminées plus anciennes ne sont pas chargées (section « Terminées »). */
const DONE_TASKS_DAYS = 30;

/**
 * Tâches vivantes à faire, et terminées depuis moins de DONE_TASKS_DAYS jours,
 * les plus récentes d'abord. `id` en dernier : un tri unique garde une
 * pagination stable au-delà de 1000 lignes.
 */
export const listTasks = (): Promise<Task[]> => {
  const doneSince = new Date(Date.now() - DONE_TASKS_DAYS * 86_400_000).toISOString();
  return fetchAll<Task>((from, to) =>
    supabase
      .from(TASKS)
      .select('*')
      .is('deleted_at', null)
      .or(`done.eq.false,updated_at.gte.${doneSince}`)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  );
};

/** Titres des tâches vivantes `ids` (pour les rappels liés). */
export async function taskTitles(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = unwrap(
    await supabase.from(TASKS).select('id, title').in('id', ids).is('deleted_at', null)
  ) as { id: string; title: string }[];
  return new Map(rows.map((r) => [r.id, r.title]));
}

export const addTask = (title: string, dueDate: string | null = null) =>
  insertRow(TASKS, { title, done: false, due_date: dueDate, priority: 0 });

export const setTaskDone = (task: Task, done: boolean) => updateRow(TASKS, task.id, { done });

export const setTaskDueDate = (task: Task, dueDate: string | null) => updateRow(TASKS, task.id, { due_date: dueDate });

export const setTaskPriority = (task: Task, priority: TaskPriority) => updateRow(TASKS, task.id, { priority });

/** Rattache la tâche à un projet (null = la détacher). */
export const setTaskProject = (task: Task, projectId: string | null) =>
  updateRow(TASKS, task.id, { project_id: projectId });

/** Suppression logique : la ligne reste en base avec deleted_at pour être propagée au mobile. */
export const softDeleteTask = (task: Task) => softDeleteRow(TASKS, task.id);
