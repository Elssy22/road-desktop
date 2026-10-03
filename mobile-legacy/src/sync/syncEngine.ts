import type { SQLiteDatabase } from 'expo-sqlite';

import {
  ackPending,
  applyRemoteTasks,
  getMeta,
  readPendingTasks,
  setMeta,
  type PendingBatch,
  type SyncEntity,
  type Task,
} from '../db/localDb';
import { APPOINTMENTS } from '../db/appointmentsDb';
import { CONTACTS, INTERACTIONS } from '../db/crmDb';
import {
  allColumns,
  applyRemoteEntity,
  normalizeRemote,
  readPendingEntity,
  type BaseRow,
  type EntitySpec,
} from '../db/entityTable';
import { applyRemoteNotes, readPendingNotes, type Note } from '../db/notesDb';
import { DOCUMENTS } from '../db/documentsDb';
import { GOALS } from '../db/goalsDb';
import { KEY_DATES } from '../db/keyDatesDb';
import { MONEY_ITEMS } from '../db/moneyDb';
import { PROJECT_STEPS, PROJECTS } from '../db/projectsDb';
import { REMINDERS } from '../db/remindersDb';
import { TENDER_OFFERS } from '../db/tenderOffersDb';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 500;

type Remote<T> = T & { server_updated_at: string };

// Postgres renvoie "2026-10-02T14:16:00.123456+00:00" alors que le client écrit
// "2026-10-02T14:16:00.123Z" : on normalise pour que la comparaison texte
// (last-write-wins côté SQLite) reste correcte.
const normalizeTs = (ts: string) => new Date(ts).toISOString();
const normalizeTask = (t: Remote<Task>): Task => ({
  id: t.id,
  user_id: t.user_id,
  title: t.title,
  done: t.done,
  // Colonne Postgres `date` : déjà au format YYYY-MM-DD, sans fuseau.
  due_date: t.due_date ?? null,
  priority: t.priority ?? 0,
  project_id: t.project_id ?? null,
  contact_id: t.contact_id ?? null,
  auto_kind: t.auto_kind ?? null,
  created_at: normalizeTs(t.created_at),
  updated_at: normalizeTs(t.updated_at),
  deleted_at: t.deleted_at ? normalizeTs(t.deleted_at) : null,
});
const normalizeNote = (n: Remote<Note>): Note => ({
  id: n.id,
  user_id: n.user_id,
  title: n.title ?? '',
  body: n.body ?? '',
  pinned: n.pinned ?? false,
  created_at: normalizeTs(n.created_at),
  updated_at: normalizeTs(n.updated_at),
  deleted_at: n.deleted_at ? normalizeTs(n.deleted_at) : null,
});

/** Tout ce qu'il faut pour synchroniser une table (même nom en local et sur Supabase). */
type SyncedTable<T> = {
  entity: SyncEntity;
  /** Colonnes lues au pull (server_updated_at sert de curseur). */
  columns: string;
  cursorKey: (userId: string) => string;
  readPending: (db: SQLiteDatabase, userId: string) => Promise<PendingBatch<T> | null>;
  normalize: (row: Remote<T>) => T;
  applyRemote: (db: SQLiteDatabase, rows: T[]) => Promise<void>;
};

const TASKS: SyncedTable<Task> = {
  entity: 'tasks',
  columns:
    // project_id : migration Supabase 005 requise (comme due_date/priority avec 002) ;
    // contact_id, auto_kind : migration 014.
    'id, user_id, title, done, due_date, priority, project_id, contact_id, auto_kind, created_at, updated_at, deleted_at, server_updated_at',
  // Clé historique (d'avant les notes), conservée pour ne pas tout re-télécharger.
  cursorKey: (userId) => `pull_cursor:${userId}`,
  readPending: readPendingTasks,
  normalize: normalizeTask,
  applyRemote: applyRemoteTasks,
};

const NOTES: SyncedTable<Note> = {
  entity: 'notes',
  columns: 'id, user_id, title, body, pinned, created_at, updated_at, deleted_at, server_updated_at',
  cursorKey: (userId) => `pull_cursor:notes:${userId}`,
  readPending: readPendingNotes,
  normalize: normalizeNote,
  applyRemote: applyRemoteNotes,
};

/** Tables du Lot 2 : tout est dérivé de la description des colonnes (entityTable.ts). */
function fromSpec<T extends BaseRow>(spec: EntitySpec<T>): SyncedTable<T> {
  return {
    entity: spec.entity,
    columns: [...allColumns(spec), 'server_updated_at'].join(', '),
    cursorKey: (userId) => `pull_cursor:${spec.entity}:${userId}`,
    readPending: (db, userId) => readPendingEntity(db, spec, userId),
    normalize: (row) => normalizeRemote(spec, row),
    applyRemote: (db, rows) => applyRemoteEntity(db, spec, rows),
  };
}

/**
 * Ordre de sync : les parents avant leurs enfants (un contact créé hors ligne
 * part avant ses interactions). Pas de clé étrangère côté serveur, l'ordre
 * n'est donc pas obligatoire, mais l'autre appareil reçoit ainsi le contact
 * avant ses interactions.
 */
const TABLES = [
  // Projets avant les tâches qui peuvent y être rattachées.
  fromSpec(PROJECTS),
  TASKS,
  NOTES,
  fromSpec(CONTACTS),
  fromSpec(INTERACTIONS),
  fromSpec(PROJECT_STEPS),
  fromSpec(GOALS),
  fromSpec(KEY_DATES),
  fromSpec(MONEY_ITEMS),
  fromSpec(DOCUMENTS),
  // Après les tâches et contacts auxquels un rappel peut être lié.
  fromSpec(REMINDERS),
  // Après les contacts et projets auxquels un RDV peut être lié.
  fromSpec(APPOINTMENTS),
  // Veille BOAMP : alimentée par l'Edge Function boamp-sync, l'app n'y pousse que les statuts.
  fromSpec(TENDER_OFFERS),
];

/** Envoie l'outbox locale. Le trigger serveur rejette les versions plus anciennes (LWW). */
async function push<T>(t: SyncedTable<T>, db: SQLiteDatabase, userId: string): Promise<number> {
  const batch = await t.readPending(db, userId);
  if (!batch) return 0;

  // Lignes vides si la ligne locale a disparu (ne devrait pas arriver) : on purge quand même.
  if (batch.rows.length > 0) {
    // Client non typé (pas de types générés) : le cast évite un faux positif sur T générique.
    const rows = batch.rows as Record<string, unknown>[];
    const { error } = await supabase.from(t.entity).upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`push ${t.entity}: ${error.message}`);
  }
  await ackPending(db, t.entity, userId, batch.maxSeq);
  return batch.rows.length;
}

/** Récupère tout ce qui a changé côté serveur depuis le dernier curseur. */
async function pull<T>(t: SyncedTable<T>, db: SQLiteDatabase, userId: string): Promise<number> {
  const key = t.cursorKey(userId);
  let cursor = await getMeta(db, key);
  let total = 0;

  for (;;) {
    let query = supabase
      .from(t.entity)
      .select(t.columns)
      .eq('user_id', userId)
      .order('server_updated_at', { ascending: true })
      .limit(PAGE_SIZE);
    // `gte` (et non `gt`) pour ne rien rater en bord de page ; ré-appliquer une
    // ligne déjà connue est sans effet.
    if (cursor) query = query.gte('server_updated_at', cursor);

    const { data: rows, error } = await query;
    if (error) throw new Error(`pull ${t.entity}: ${error.message}`);
    const data = rows as unknown as Remote<T>[] | null;
    if (!data || data.length === 0) break;

    await t.applyRemote(db, data.map(t.normalize));
    total += data.length;

    const last = data[data.length - 1].server_updated_at;
    if (last === cursor) break; // page entièrement sur le même horodatage
    cursor = last;
    await setMeta(db, key, cursor);
    if (data.length < PAGE_SIZE) break;
  }
  return total;
}

export type SyncResult = { pushed: number; pulled: number };

/**
 * Synchronise chaque table indépendamment : une erreur sur l'une (ex. table
 * `notes` pas encore créée côté Supabase) ne bloque pas les autres. L'erreur
 * est relancée à la fin pour être affichée ; l'outbox de la table fautive est
 * intacte et repartira au prochain déclencheur.
 */
export async function syncOnce(db: SQLiteDatabase, userId: string): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0 };
  const errors: string[] = [];

  const run = async <T>(t: SyncedTable<T>) => {
    try {
      result.pushed += await push(t, db, userId);
      result.pulled += await pull(t, db, userId);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  };
  // Séquentiel : une seule écriture SQLite à la fois, et l'ordre de TABLES est respecté.
  for (const t of TABLES) await run(t as SyncedTable<unknown>);

  if (errors.length > 0) throw new SyncError(errors.join(' · '), result);
  return result;
}

/** Échec partiel : `result` dit ce qui a quand même été synchronisé. */
export class SyncError extends Error {
  constructor(
    message: string,
    readonly result: SyncResult
  ) {
    super(message);
    this.name = 'SyncError';
  }
}
