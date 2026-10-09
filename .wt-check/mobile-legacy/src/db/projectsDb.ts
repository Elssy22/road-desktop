import type { SQLiteDatabase } from 'expo-sqlite';

import {
  detachWhereInTx,
  fromSqlRow,
  getRow,
  insertRow,
  softDeleteRowInTx,
  softDeleteWhereInTx,
  updateRowInTx,
  type BaseRow,
  type EntitySpec,
} from './entityTable';
import { APPOINTMENTS } from './appointmentsDb';
import { DOCUMENTS } from './documentsDb';
import { GOALS } from './goalsDb';
import { enqueue, now, toTask, type Task, type TaskRow } from './localDb';
import { MONEY_ITEMS } from './moneyDb';

// Projets et étapes (migration locale v5). Les tâches rattachées à un projet
// restent dans la table `tasks` (colonne project_id).

export const PROJECT_STATUSES = ['actif', 'en_pause', 'terminé'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  actif: 'Actif',
  en_pause: 'En pause',
  terminé: 'Terminé',
};

export type Project = BaseRow & {
  title: string;
  /** Texte libre côté base ; l'app utilise PROJECT_STATUSES. */
  status: string;
  description: string | null;
};

export type ProjectStep = BaseRow & {
  project_id: string;
  title: string;
  done: boolean;
  /** Ordre d'affichage croissant (pas forcément contigu). */
  position: number;
};

export const PROJECTS: EntitySpec<Project> = {
  entity: 'projects',
  columns: { title: 'text', status: 'text', description: 'text' },
};

export const PROJECT_STEPS: EntitySpec<ProjectStep> = {
  entity: 'project_steps',
  columns: { project_id: 'text', title: 'text', done: 'bool', position: 'int' },
};

export type ProjectWithProgress = Project & { steps_total: number; steps_done: number };

export async function listProjects(db: SQLiteDatabase, userId: string): Promise<ProjectWithProgress[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM project_steps s WHERE s.project_id = p.id AND s.deleted_at IS NULL) AS steps_total,
       (SELECT COUNT(*) FROM project_steps s WHERE s.project_id = p.id AND s.deleted_at IS NULL AND s.done = 1) AS steps_done
     FROM projects p
     WHERE p.user_id = ? AND p.deleted_at IS NULL
     ORDER BY p.updated_at DESC`,
    userId
  );
  return rows.map((r) => ({
    ...fromSqlRow(PROJECTS, r),
    steps_total: Number(r.steps_total ?? 0),
    steps_done: Number(r.steps_done ?? 0),
  }));
}

export const getProject = (db: SQLiteDatabase, id: string) => getRow(db, PROJECTS, id);

export async function listSteps(db: SQLiteDatabase, projectId: string): Promise<ProjectStep[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM project_steps WHERE project_id = ? AND deleted_at IS NULL
     ORDER BY position, created_at`,
    projectId
  );
  return rows.map((r) => fromSqlRow(PROJECT_STEPS, r));
}

/** Tâches (non supprimées) rattachées au projet. */
export async function listProjectTasks(db: SQLiteDatabase, projectId: string): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(
    `SELECT * FROM tasks WHERE project_id = ? AND deleted_at IS NULL
     ORDER BY done, created_at DESC`,
    projectId
  );
  return rows.map(toTask);
}

/** Tâches à faire, sans projet : candidates au rattachement. */
export async function listLinkableTasks(db: SQLiteDatabase, userId: string): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(
    `SELECT * FROM tasks
     WHERE user_id = ? AND deleted_at IS NULL AND done = 0 AND project_id IS NULL
     ORDER BY created_at DESC`,
    userId
  );
  return rows.map(toTask);
}

export const addProject = (db: SQLiteDatabase, userId: string, title: string) =>
  insertRow(db, PROJECTS, userId, { title, status: 'actif', description: null });

/** Nouvelle étape en fin de liste. */
export async function addStep(db: SQLiteDatabase, userId: string, projectId: string, title: string) {
  const row = await db.getFirstAsync<{ maxPos: number | null }>(
    'SELECT MAX(position) AS maxPos FROM project_steps WHERE project_id = ? AND deleted_at IS NULL',
    projectId
  );
  await insertRow(db, PROJECT_STEPS, userId, {
    project_id: projectId,
    title,
    done: false,
    position: (row?.maxPos ?? -1) + 1,
  });
}

/**
 * Déplace l'étape `index` d'un cran (`-1` vers le haut, `+1` vers le bas).
 * Les positions sont renumérotées 0..n-1 dans l'ordre affiché (deux appareils
 * peuvent avoir créé des étapes de même position) ; seules les étapes dont la
 * position change sont écrites et poussées.
 */
export async function moveStep(db: SQLiteDatabase, steps: ProjectStep[], index: number, delta: -1 | 1) {
  const target = index + delta;
  if (target < 0 || target >= steps.length) return;
  const order = [...steps];
  [order[index], order[target]] = [order[target], order[index]];
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < order.length; i++) {
      if (order[i].position !== i) await updateRowInTx(db, PROJECT_STEPS, order[i], { position: i });
    }
  });
}

/**
 * Supprime le projet et ses étapes ; les tâches, objectifs, lignes financières,
 * documents et rendez-vous rattachés sont conservés mais détachés.
 */
export async function softDeleteProject(db: SQLiteDatabase, project: Pick<Project, 'id' | 'user_id'>) {
  await db.withTransactionAsync(async () => {
    await softDeleteWhereInTx(db, PROJECT_STEPS, 'project_id', project.id);
    await detachWhereInTx(db, MONEY_ITEMS, 'project_id', project.id);
    await detachWhereInTx(db, DOCUMENTS, 'project_id', project.id);
    await detachWhereInTx(db, APPOINTMENTS, 'project_id', project.id);
    const goals = await db.getAllAsync<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM goals WHERE project_id = ? AND deleted_at IS NULL',
      project.id
    );
    for (const g of goals) await updateRowInTx(db, GOALS, g, { project_id: null });
    const tasks = await db.getAllAsync<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM tasks WHERE project_id = ? AND deleted_at IS NULL',
      project.id
    );
    for (const t of tasks) {
      await db.runAsync('UPDATE tasks SET project_id = NULL, updated_at = ? WHERE id = ?', now(), t.id);
      await enqueue(db, 'tasks', t.id, t.user_id);
    }
    await softDeleteRowInTx(db, PROJECTS, project);
  });
}
