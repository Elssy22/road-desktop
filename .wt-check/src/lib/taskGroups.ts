import type { Task } from '../data/tasks';
import type { DateKey } from './dates';

export type TaskGroupKey = 'overdue' | 'today' | 'upcoming' | 'nodate' | 'done';

export type TaskGroup = { key: TaskGroupKey; title: string; data: Task[] };

const TITLES: Record<TaskGroupKey, string> = {
  overdue: 'En retard',
  today: "Aujourd'hui",
  upcoming: 'À venir',
  nodate: 'Sans date',
  done: 'Terminées',
};

const ORDER: TaskGroupKey[] = ['overdue', 'today', 'upcoming', 'nodate', 'done'];

/** Les tâches faites vont dans « Terminées », quelle que soit leur échéance. */
export function groupKeyOf(task: Task, today: DateKey): TaskGroupKey {
  if (task.done) return 'done';
  if (!task.due_date) return 'nodate';
  if (task.due_date < today) return 'overdue';
  if (task.due_date === today) return 'today';
  return 'upcoming';
}

// Priorité décroissante, puis échéance la plus proche, puis la plus récente.
const byUrgency = (a: Task, b: Task) =>
  b.priority - a.priority ||
  (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
  b.created_at.localeCompare(a.created_at);

const byRecentlyUpdated = (a: Task, b: Task) => b.updated_at.localeCompare(a.updated_at);

export function groupTasks(tasks: Task[], today: DateKey): TaskGroup[] {
  const buckets = new Map<TaskGroupKey, Task[]>(ORDER.map((k) => [k, []]));
  for (const t of tasks) buckets.get(groupKeyOf(t, today))!.push(t);
  return ORDER.map((key) => ({
    key,
    title: TITLES[key],
    data: buckets.get(key)!.sort(key === 'done' ? byRecentlyUpdated : byUrgency),
  })).filter((g) => g.data.length > 0);
}

/** Vue du jour : en retard (non faites) + toutes celles du jour (faites en dernier). */
export function tasksForToday(tasks: Task[], today: DateKey): Task[] {
  const overdue = tasks.filter((t) => !t.done && t.due_date != null && t.due_date < today);
  const dueToday = tasks.filter((t) => t.due_date === today);
  return [
    ...overdue.sort(byUrgency),
    ...dueToday.filter((t) => !t.done).sort(byUrgency),
    ...dueToday.filter((t) => t.done).sort(byRecentlyUpdated),
  ];
}
