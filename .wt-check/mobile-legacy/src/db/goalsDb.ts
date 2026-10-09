import type { SQLiteDatabase } from 'expo-sqlite';

import { caPeriodBounds, caProgress, type CaPeriod, type GoalKind } from '../lib/caGoals';
import { fromSqlRow, getRow, insertRow, type BaseRow, type EntitySpec, type Fields } from './entityTable';
import { sumQontoReceipts } from './qontoReceiptsDb';

// Objectifs (migration locale v6), rattachés facultativement à un projet.
// v16 : objectifs de CA, dont l'avancement est calculé depuis Qonto (DECISIONS.md §34).

export type Goal = BaseRow & {
  title: string;
  /** Jour cible YYYY-MM-DD (colonne `date` Postgres), facultatif. */
  target_date: string | null;
  project_id: string | null;
  /** 0 à 100. Saisi à la main ; ignoré (laissé à 0) pour un objectif de CA. */
  progress: number;
  /** 'manuel' (progress saisi) ou 'ca' (calculé depuis les encaissements Qonto). */
  kind: GoalKind;
  /** Cible en euros, objectifs de CA uniquement. */
  ca_target_amount: number | null;
  /** Fenêtre comptée, se terminant à target_date ; objectifs de CA uniquement. */
  ca_period: CaPeriod | null;
};

export const GOALS: EntitySpec<Goal> = {
  entity: 'goals',
  columns: {
    title: 'text',
    target_date: 'date',
    project_id: 'text',
    progress: 'int',
    kind: 'text',
    ca_target_amount: 'num',
    ca_period: 'text',
  },
};

export const clampProgress = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/** Objectif de CA complet (cible, période et date cible renseignées). */
export const isCaGoal = (
  g: Goal
): g is Goal & { kind: 'ca'; ca_target_amount: number; ca_period: CaPeriod; target_date: string } =>
  g.kind === 'ca' && g.ca_target_amount != null && g.ca_period != null && g.target_date != null;

/**
 * Objectif + titre du projet lié (null si aucun ou projet supprimé). Pour un objectif
 * de CA, `progress` est remplacé par l'avancement calculé et `ca_collected_cents`
 * donne le montant encaissé sur la période (null pour un objectif manuel).
 */
export type GoalWithProject = Goal & { project_title: string | null; ca_collected_cents: number | null };

/**
 * Échéance la plus proche d'abord, objectifs sans date ensuite, atteints en dernier.
 * Les objectifs de CA sont calculés ici, depuis la copie locale des encaissements :
 * tous les écrans qui listent les objectifs (Agence, revue hebdo) en profitent.
 */
export async function listGoals(db: SQLiteDatabase, userId: string): Promise<GoalWithProject[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT g.*, p.title AS project_title
     FROM goals g
     LEFT JOIN projects p ON p.id = g.project_id AND p.deleted_at IS NULL
     WHERE g.user_id = ? AND g.deleted_at IS NULL
     ORDER BY g.target_date IS NULL, g.target_date, g.created_at`,
    userId
  );
  const goals: GoalWithProject[] = [];
  for (const r of rows) {
    const goal = fromSqlRow(GOALS, r);
    const project_title = (r.project_title as string | null) ?? null;
    if (isCaGoal(goal)) {
      const { start, end } = caPeriodBounds(goal.target_date, goal.ca_period);
      const collected = await sumQontoReceipts(db, userId, start, end);
      goals.push({
        ...goal,
        project_title,
        ca_collected_cents: collected,
        progress: caProgress(collected, goal.ca_target_amount),
      });
    } else {
      goals.push({ ...goal, project_title, ca_collected_cents: null });
    }
  }
  // Tri stable : l'ordre SQL est gardé, les objectifs atteints (calculés compris) passent à la fin.
  return goals.sort((a, b) => Number(a.progress >= 100) - Number(b.progress >= 100));
}

/** Au moins un objectif de CA : évite de relire Qonto pour rien. */
export async function hasCaGoals(db: SQLiteDatabase, userId: string): Promise<boolean> {
  const row = await db.getFirstAsync(
    "SELECT 1 FROM goals WHERE user_id = ? AND kind = 'ca' AND deleted_at IS NULL LIMIT 1",
    userId
  );
  return row != null;
}

export const getGoal =(db: SQLiteDatabase, id: string) => getRow(db, GOALS, id);

type CaFields = 'kind' | 'ca_target_amount' | 'ca_period';

/** Objectif manuel par défaut si le type n'est pas précisé. */
export const addGoal = (
  db: SQLiteDatabase,
  userId: string,
  fields: Omit<Fields<Goal>, CaFields> & Partial<Pick<Goal, CaFields>>
) =>
  insertRow(db, GOALS, userId, {
    kind: 'manuel',
    ca_target_amount: null,
    ca_period: null,
    ...fields,
    progress: clampProgress(fields.progress),
  });
