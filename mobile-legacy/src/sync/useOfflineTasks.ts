import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import {
  addTask,
  listTasks,
  setTaskDone,
  setTaskDueDate,
  setTaskPriority,
  softDeleteTask,
  type Task,
  type TaskPriority,
} from '../db/localDb';
import { addDays, todayKey } from '../lib/dates';
import { useSync } from './SyncProvider';

/**
 * Tâches de l'utilisateur, lues depuis SQLite (offline-first). La boucle de
 * sync elle-même vit dans <SyncProvider> ; ce hook relit la base à chaque
 * changement signalé (`dataVersion`).
 */
export function useOfflineTasks(userId: string) {
  const db = useSQLiteContext();
  const { pending, online, syncing, lastError, lastSyncAt, syncNow, runLocal, dataVersion } =
    useSync();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listTasks(db, userId)
      .then((t) => {
        if (active) setTasks(t);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, [db, userId, dataVersion]);

  return {
    tasks,
    pending,
    online,
    syncing,
    lastError: lastError ?? loadError,
    lastSyncAt,
    syncNow,
    add: (title: string, dueDate: string | null = null) =>
      runLocal(() => addTask(db, userId, title, dueDate)),
    toggle: (task: Task) => runLocal(() => setTaskDone(db, task, !task.done)),
    remove: (task: Task) => runLocal(() => softDeleteTask(db, task)),
    setDueDate: (task: Task, dueDate: string | null) =>
      runLocal(() => setTaskDueDate(db, task, dueDate)),
    /** "Reporter à demain" : demain par rapport à aujourd'hui, pas à l'échéance. */
    postponeToTomorrow: (task: Task) =>
      runLocal(() => setTaskDueDate(db, task, addDays(todayKey(), 1))),
    setPriority: (task: Task, priority: TaskPriority) =>
      runLocal(() => setTaskPriority(db, task, priority)),
  };
}

export type OfflineTasks = ReturnType<typeof useOfflineTasks>;
