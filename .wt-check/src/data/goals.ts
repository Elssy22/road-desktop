import { caPeriodBounds, caProgress, type CaPeriod, type GoalKind } from '../lib/caGoals';
import { errorMessage } from '../lib/errors';
import { fetchQontoReceipts, type QontoReceipt } from '../lib/qonto';
import { supabase } from '../lib/supabase';
import { fetchAll, insertRow, softDeleteRow, unwrap, updateRow, type BaseRow, type Fields } from './base';
import { projectTitles } from './projects';

// Objectifs : types et règles repris de mobile-legacy/src/db/goalsDb.ts, rattachés
// facultativement à un projet. Objectifs de CA (DECISIONS.md §34) : le mobile
// somme une copie SQLite des encaissements Qonto ; ici, sans cache local (§35),
// les encaissements sont relus sur Supabase (qonto_items) à chaque lecture.

export type Goal = BaseRow & {
  title: string;
  /** Jour cible YYYY-MM-DD (colonne `date` Postgres), facultatif. */
  target_date: string | null;
  project_id: string | null;
  /** 0 à 100. Saisi à la main ; conservé mais ignoré pour un objectif de CA. */
  progress: number;
  /** 'manuel' (progress saisi) ou 'ca' (calculé depuis les encaissements Qonto). */
  kind: GoalKind;
  /** Cible en euros, objectifs de CA uniquement. */
  ca_target_amount: number | null;
  /** Fenêtre comptée, se terminant à target_date ; objectifs de CA uniquement. */
  ca_period: CaPeriod | null;
};

export const clampProgress = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/** Objectif de CA complet (cible, période et date cible renseignées). */
export const isCaGoal = (
  g: Goal
): g is Goal & { kind: 'ca'; ca_target_amount: number; ca_period: CaPeriod; target_date: string } =>
  g.kind === 'ca' && g.ca_target_amount != null && g.ca_period != null && g.target_date != null;

/**
 * Objectif + titre du projet lié (null si aucun ou projet supprimé). Pour un objectif
 * de CA calculé, `progress` est remplacé par l'avancement calculé et
 * `ca_collected_cents` donne le montant encaissé sur la période ; null pour un
 * objectif manuel, ou si les encaissements Qonto n'ont pas pu être lus.
 */
export type GoalWithProject = Goal & { project_title: string | null; ca_collected_cents: number | null };

/**
 * Encaissements Qonto lus pour le calcul : `receipts` null si la lecture a échoué
 * (table qonto_items absente, réseau…) ; `importedAt` = dernier import connu.
 */
export type QontoReceipts = { receipts: QontoReceipt[] | null; importedAt: string | null; error: string | null };

export type GoalList = { goals: GoalWithProject[]; qonto: QontoReceipts | null };

const GOALS = 'goals';

/** numeric Postgres : nombre ou chaîne selon la précision, normalisé en nombre. */
const toGoal = (g: Goal): Goal => ({
  ...g,
  ca_target_amount: g.ca_target_amount != null ? Number(g.ca_target_amount) : null,
});

/** Somme (centimes) des encaissements dont la date tombe dans [start, end], bornes incluses. */
export function sumReceipts(receipts: QontoReceipt[], start: string, end: string): number {
  let total = 0;
  for (const r of receipts) if (r.qonto_date >= start && r.qonto_date <= end) total += r.amount_cents;
  return total;
}

/**
 * Encaissements Qonto (cf. fetchQontoReceipts) et instant du dernier import
 * (updated_at le plus récent, posé par l'Edge Function qonto-sync). Ne lève pas :
 * un échec est rendu dans `error`, pour que les objectifs manuels restent affichés.
 */
export async function loadQontoReceipts(userId: string): Promise<QontoReceipts> {
  try {
    const [receipts, last] = await Promise.all([
      fetchQontoReceipts(userId),
      supabase.from('qonto_items').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    ]);
    const rows = unwrap(last) as { updated_at: string }[];
    return { receipts, importedAt: rows[0]?.updated_at ?? null, error: null };
  } catch (e) {
    return { receipts: null, importedAt: null, error: errorMessage(e) };
  }
}

/**
 * Échéance la plus proche d'abord, objectifs sans date ensuite, atteints en dernier.
 * Les encaissements Qonto ne sont lus que s'il existe au moins un objectif de CA.
 */
export async function listGoals(userId: string): Promise<GoalList> {
  const rows = (
    await fetchAll<Goal>((from, to) =>
      supabase
        .from(GOALS)
        .select('*')
        .is('deleted_at', null)
        .order('target_date', { nullsFirst: false })
        .order('created_at')
        .order('id')
        .range(from, to)
    )
  ).map(toGoal);
  const [titles, qonto] = await Promise.all([
    projectTitles(rows.flatMap((g) => (g.project_id ? [g.project_id] : []))),
    rows.some((g) => g.kind === 'ca') ? loadQontoReceipts(userId) : Promise.resolve(null),
  ]);
  const goals = rows.map((goal): GoalWithProject => {
    const project_title = (goal.project_id && titles.get(goal.project_id)) || null;
    if (isCaGoal(goal)) {
      // Encaissements illisibles : avancement inconnu, compté comme non atteint (le
      // progress manuel conservé en base ne vaut pas pour un objectif de CA).
      if (!qonto?.receipts) return { ...goal, project_title, ca_collected_cents: null, progress: 0 };
      const { start, end } = caPeriodBounds(goal.target_date, goal.ca_period);
      const collected = sumReceipts(qonto.receipts, start, end);
      return {
        ...goal,
        project_title,
        ca_collected_cents: collected,
        progress: caProgress(collected, goal.ca_target_amount),
      };
    }
    return { ...goal, project_title, ca_collected_cents: null };
  });
  // Tri stable : l'ordre de la requête est gardé, les objectifs atteints (calculés compris) passent à la fin.
  return { goals: goals.sort((a, b) => Number(a.progress >= 100) - Number(b.progress >= 100)), qonto };
}

/** Objectif vivant, ou null s'il n'existe pas ou a été supprimé. */
export async function getGoal(id: string): Promise<Goal | null> {
  const goal = unwrap(
    await supabase.from(GOALS).select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  ) as Goal | null;
  return goal && toGoal(goal);
}

type CaFields = 'kind' | 'ca_target_amount' | 'ca_period';

/** Objectif manuel par défaut si le type n'est pas précisé. */
export const addGoal = (fields: Omit<Fields<Goal>, CaFields> & Partial<Pick<Goal, CaFields>>) =>
  insertRow(GOALS, {
    kind: 'manuel',
    ca_target_amount: null,
    ca_period: null,
    ...fields,
    progress: clampProgress(fields.progress),
  });

export const updateGoal = (id: string, patch: Partial<Fields<Goal>>) => updateRow(GOALS, id, patch);

export const softDeleteGoal = (id: string) => softDeleteRow(GOALS, id);
