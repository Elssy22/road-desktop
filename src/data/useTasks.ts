import { useState } from 'react';

import { addDays, todayKey } from '../lib/dates';
import {
  addTask,
  listTasks,
  setTaskDone,
  setTaskDueDate,
  setTaskPriority,
  softDeleteTask,
  type Task,
  type TaskPriority,
} from './tasks';
import { useRemoteQuery } from './useRemoteQuery';

const NO_TASKS: Task[] = [];

/**
 * Tâches de l'utilisateur, lues sur Supabase (remplace useOfflineTasks du
 * mobile). Une écriture échouée est signalée par `writeError`.
 */
export function useTasks() {
  const { data: tasks, error, loading } = useRemoteQuery(listTasks, NO_TASKS);
  const [writeError, setWriteError] = useState<string | null>(null);

  const run = (write: () => Promise<unknown>) =>
    write()
      .then(() => setWriteError(null))
      .catch((e: unknown) => setWriteError(e instanceof Error ? e.message : String(e)));

  return {
    tasks,
    loading,
    error: writeError ?? error,
    add: (title: string, dueDate: string | null = null) => run(() => addTask(title, dueDate)),
    toggle: (task: Task) => run(() => setTaskDone(task, !task.done)),
    remove: (task: Task) => run(() => softDeleteTask(task)),
    setDueDate: (task: Task, dueDate: string | null) => run(() => setTaskDueDate(task, dueDate)),
    /** "Reporter à demain" : demain par rapport à aujourd'hui, pas à l'échéance. */
    postponeToTomorrow: (task: Task) => run(() => setTaskDueDate(task, addDays(todayKey(), 1))),
    setPriority: (task: Task, priority: TaskPriority) => run(() => setTaskPriority(task, priority)),
  };
}

export type TasksApi = ReturnType<typeof useTasks>;
