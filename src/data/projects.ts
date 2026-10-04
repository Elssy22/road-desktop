import { supabase } from '../lib/supabase';
import {
  fetchAll,
  insertRow,
  notifyDataChanged,
  softDeleteRow,
  unwrap,
  updateRow,
  type BaseRow,
  type Fields,
} from './base';
import type { Task } from './tasks';

// Projets et étapes : types et opérations repris de mobile-legacy/src/db/projectsDb.ts.
// Les tâches rattachées à un projet restent dans la table `tasks` (colonne project_id).

export const PROJECT_STATUSES = ['actif', 'en_pause', 'terminé'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  actif: 'Actif',
  en_pause: 'En pause',
  terminé: 'Terminé',
};

/** Couleur du badge de statut (statusColor du mobile, en variables CSS). */
export const statusColor = (status: string) =>
  status === 'actif'
    ? 'var(--color-success)'
    : status === 'en_pause'
      ? 'var(--color-warning)'
      : 'var(--color-text-faint)';

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

export type ProjectWithProgress = Project & { steps_total: number; steps_done: number };

const PROJECTS = 'projects';
const STEPS = 'project_steps';
const TASKS = 'tasks';

// --- Lectures ----------------------------------------------------------------

/** Projets vivants avec l'avancement de leurs étapes, les plus récemment modifiés d'abord. */
export async function listProjects(): Promise<ProjectWithProgress[]> {
  type StepRow = Pick<ProjectStep, 'project_id' | 'done'>;
  const [projects, steps] = await Promise.all([
    fetchAll<Project>((from, to) =>
      supabase
        .from(PROJECTS)
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .order('id')
        .range(from, to)
    ),
    fetchAll<StepRow>((from, to) =>
      supabase.from(STEPS).select('project_id, done').is('deleted_at', null).order('id').range(from, to)
    ),
  ]);
  // Remplace les sous-requêtes COUNT du mobile.
  const counts = new Map<string, { total: number; done: number }>();
  for (const s of steps) {
    const c = counts.get(s.project_id) ?? { total: 0, done: 0 };
    c.total += 1;
    if (s.done) c.done += 1;
    counts.set(s.project_id, c);
  }
  return projects.map((p) => ({
    ...p,
    steps_total: counts.get(p.id)?.total ?? 0,
    steps_done: counts.get(p.id)?.done ?? 0,
  }));
}

/** Projet vivant, ou null s'il n'existe pas ou a été supprimé. */
export async function getProject(id: string): Promise<Project | null> {
  return unwrap(await supabase.from(PROJECTS).select('*').eq('id', id).is('deleted_at', null).maybeSingle());
}

/**
 * Titres des projets vivants `ids`. Remplace les `LEFT JOIN projects` du mobile :
 * pas de clé étrangère vers projects (migration 005), donc pas d'embarquement PostgREST.
 */
export async function projectTitles(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = unwrap(await supabase.from(PROJECTS).select('id, title').in('id', unique).is('deleted_at', null)) as {
    id: string;
    title: string;
  }[];
  return new Map(rows.map((r) => [r.id, r.title]));
}

/** Étapes du projet, dans l'ordre d'affichage. */
export const listSteps = (projectId: string): Promise<ProjectStep[]> =>
  fetchAll<ProjectStep>((from, to) =>
    supabase
      .from(STEPS)
      .select('*')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('position')
      .order('created_at')
      .order('id')
      .range(from, to)
  );

/** Tâches (non supprimées) rattachées au projet : à faire d'abord, puis les plus récentes. */
export const listProjectTasks = (projectId: string): Promise<Task[]> =>
  fetchAll<Task>((from, to) =>
    supabase
      .from(TASKS)
      .select('*')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('done')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  );

/** Tâches à faire, sans projet : candidates au rattachement. */
export const listLinkableTasks = (): Promise<Task[]> =>
  fetchAll<Task>((from, to) =>
    supabase
      .from(TASKS)
      .select('*')
      .is('deleted_at', null)
      .eq('done', false)
      .is('project_id', null)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  );

// --- Écritures ---------------------------------------------------------------

export const addProject = (title: string) => insertRow(PROJECTS, { title, status: 'actif', description: null });

export const updateProject = (id: string, patch: Partial<Fields<Project>>) => updateRow(PROJECTS, id, patch);

/** Nouvelle étape en fin de liste. */
export async function addStep(projectId: string, title: string) {
  const last = unwrap(
    await supabase
      .from(STEPS)
      .select('position')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('position', { ascending: false })
      .limit(1)
  ) as { position: number }[];
  await insertRow(STEPS, { project_id: projectId, title, done: false, position: (last[0]?.position ?? -1) + 1 });
}

export const setStepDone = (step: ProjectStep, done: boolean) => updateRow(STEPS, step.id, { done });

export const softDeleteStep = (step: ProjectStep) => softDeleteRow(STEPS, step.id);

/**
 * Déplace l'étape `index` d'un cran (`-1` vers le haut, `+1` vers le bas).
 * Les positions sont renumérotées 0..n-1 dans l'ordre affiché (deux appareils
 * peuvent avoir créé des étapes de même position) ; seules les étapes dont la
 * position change sont écrites.
 */
export async function moveStep(steps: ProjectStep[], index: number, delta: -1 | 1) {
  const target = index + delta;
  if (target < 0 || target >= steps.length) return;
  const order = [...steps];
  [order[index], order[target]] = [order[target], order[index]];
  const ts = new Date().toISOString();
  try {
    for (let i = 0; i < order.length; i++) {
      if (order[i].position !== i) {
        unwrap(await supabase.from(STEPS).update({ position: i, updated_at: ts }).eq('id', order[i].id));
      }
    }
  } finally {
    // Même après un échec en route, les positions déjà écrites doivent s'afficher.
    notifyDataChanged();
  }
}

/** Tables dont le lien facultatif vers un projet est détaché à sa suppression. */
const DETACHED_ON_DELETE = ['money_items', 'documents', 'appointments', 'goals', TASKS];

/**
 * Supprime le projet et ses étapes ; les tâches, objectifs, lignes financières,
 * documents et rendez-vous rattachés sont conservés mais détachés. Pas de
 * transaction via PostgREST : le projet est supprimé en dernier, une erreur en
 * route laisse donc la fiche visible et la suppression peut être relancée.
 */
export async function softDeleteProject(projectId: string) {
  const ts = new Date().toISOString();
  try {
    unwrap(
      await supabase
        .from(STEPS)
        .update({ deleted_at: ts, updated_at: ts })
        .eq('project_id', projectId)
        .is('deleted_at', null)
    );
    for (const table of DETACHED_ON_DELETE) {
      unwrap(
        await supabase
          .from(table)
          .update({ project_id: null, updated_at: ts })
          .eq('project_id', projectId)
          .is('deleted_at', null)
      );
    }
    unwrap(await supabase.from(PROJECTS).update({ deleted_at: ts, updated_at: ts }).eq('id', projectId));
  } finally {
    notifyDataChanged();
  }
}
