import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { enqueue, now, readPendingRows, type PendingBatch, type SyncEntity } from './localDb';

// Couche données générique pour les tables du Lot 2 (contacts, projets, …).
// Même modèle que tasks/notes — écriture locale immédiate + entrée dans l'outbox
// commune, last-write-wins au pull — mais le SQL est dérivé d'une description
// des colonnes au lieu d'être réécrit à la main pour chaque table.
// tasks et notes gardent leur code dédié : on ne touche pas à ce qui marche.

/**
 * Type d'une colonne métier :
 * - `text` / `int` : tels quels ;
 * - `num` : décimal (REAL en SQLite, `numeric` Postgres) ; converti en nombre au pull
 *   au cas où PostgREST le renverrait sous forme de texte ;
 * - `bool` : INTEGER 0/1 en SQLite, boolean côté app et Supabase ;
 * - `date` : jour calendaire YYYY-MM-DD (colonne `date` Postgres, sans fuseau) ;
 * - `ts` : instant ISO (timestamptz), normalisé au pull comme updated_at ;
 * - `list` : liste de textes (`text[]` Postgres), JSON en SQLite, `string[]` côté app.
 */
export type ColumnKind = 'text' | 'int' | 'num' | 'bool' | 'date' | 'ts' | 'list';

/** Colonnes communes à toutes les tables synchronisées. */
export type BaseRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EntitySpec<T extends BaseRow> = {
  entity: SyncEntity;
  /** Colonnes métier (hors colonnes communes). */
  columns: { [K in Exclude<keyof T, keyof BaseRow>]: ColumnKind };
};

/** Champs modifiables par l'app. */
export type Fields<T extends BaseRow> = Omit<T, keyof BaseRow>;

const BASE_COLUMNS = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at'] as const;

const dataColumns = <T extends BaseRow>(spec: EntitySpec<T>) =>
  Object.keys(spec.columns) as (keyof Fields<T> & string)[];

/** Toutes les colonnes, dans un ordre stable (sert aussi au select du pull). */
export const allColumns = <T extends BaseRow>(spec: EntitySpec<T>): string[] => [
  ...BASE_COLUMNS,
  ...dataColumns(spec),
];

const kindOf = <T extends BaseRow>(spec: EntitySpec<T>, col: string): ColumnKind | undefined =>
  (spec.columns as Record<string, ColumnKind>)[col];

/** Valeur app → valeur SQLite. */
const toSql = (kind: ColumnKind | undefined, v: unknown): string | number | null => {
  if (v === undefined || v === null) return null;
  if (kind === 'bool') return v ? 1 : 0;
  if (kind === 'list') return JSON.stringify(v);
  return v as string | number;
};

/** Liste stockée en JSON ; texte illisible ou absent → liste vide. */
const parseList = (v: unknown): string[] => {
  if (typeof v !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/** Ligne SQLite → objet app (booléens et listes convertis). */
export function fromSqlRow<T extends BaseRow>(spec: EntitySpec<T>, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...row };
  for (const col of dataColumns(spec)) {
    const kind = kindOf(spec, col);
    if (kind === 'bool') out[col] = row[col] === 1;
    else if (kind === 'list') out[col] = parseList(row[col]);
  }
  return out as T;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Lignes non supprimées de l'utilisateur. `orderBy` est une constante du code
 * appelant (jamais une saisie), interpolée telle quelle.
 */
export async function listRows<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  userId: string,
  orderBy: string
): Promise<T[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM ${spec.entity} WHERE user_id = ? AND deleted_at IS NULL ORDER BY ${orderBy}`,
    userId
  );
  return rows.map((r) => fromSqlRow(spec, r));
}

export async function getRow<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  id: string
): Promise<T | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM ${spec.entity} WHERE id = ? AND deleted_at IS NULL`,
    id
  );
  return row ? fromSqlRow(spec, row) : null;
}

// ---------------------------------------------------------------------------
// Écritures locales (immédiates, même hors ligne) + ajout dans l'outbox.
// Les variantes `…InTx` s'utilisent dans une transaction ouverte par l'appelant
// (ex. supprimer un contact et ses interactions d'un coup).
// ---------------------------------------------------------------------------

export async function insertRowInTx<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  userId: string,
  fields: Fields<T>
): Promise<string> {
  const id = randomUUID();
  const ts = now();
  const cols = dataColumns(spec);
  const values = cols.map((c) => toSql(kindOf(spec, c), (fields as Record<string, unknown>)[c]));
  await db.runAsync(
    `INSERT INTO ${spec.entity} (id, user_id, created_at, updated_at, ${cols.join(', ')})
     VALUES (?, ?, ?, ?, ${cols.map(() => '?').join(', ')})`,
    id,
    userId,
    ts,
    ts,
    ...values
  );
  await enqueue(db, spec.entity, id, userId);
  return id;
}

export async function insertRow<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  userId: string,
  fields: Fields<T>
): Promise<string> {
  let id = '';
  await db.withTransactionAsync(async () => {
    id = await insertRowInTx(db, spec, userId, fields);
  });
  return id;
}

export async function updateRowInTx<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  row: Pick<T, 'id' | 'user_id'>,
  patch: Partial<Fields<T>>
) {
  const cols = Object.keys(patch).filter((c) => kindOf(spec, c) !== undefined);
  if (cols.length === 0) return;
  const values = cols.map((c) => toSql(kindOf(spec, c), (patch as Record<string, unknown>)[c]));
  await db.runAsync(
    `UPDATE ${spec.entity} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    ...values,
    now(),
    row.id
  );
  await enqueue(db, spec.entity, row.id, row.user_id);
}

export async function updateRow<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  row: Pick<T, 'id' | 'user_id'>,
  patch: Partial<Fields<T>>
) {
  await db.withTransactionAsync(() => updateRowInTx(db, spec, row, patch));
}

/** Suppression logique : la ligne reste en base avec deleted_at pour être propagée. */
export async function softDeleteRowInTx<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  row: Pick<T, 'id' | 'user_id'>
) {
  const ts = now();
  await db.runAsync(
    `UPDATE ${spec.entity} SET deleted_at = ?, updated_at = ? WHERE id = ?`,
    ts,
    ts,
    row.id
  );
  await enqueue(db, spec.entity, row.id, row.user_id);
}

export async function softDeleteRow<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  row: Pick<T, 'id' | 'user_id'>
) {
  await db.withTransactionAsync(() => softDeleteRowInTx(db, spec, row));
}

/**
 * Suppression logique de toutes les lignes vivantes de `spec` dont `column`
 * vaut `value` (enfants d'un parent supprimé), chacune ajoutée à l'outbox.
 */
export async function softDeleteWhereInTx<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  column: keyof Fields<T> & string,
  value: string
) {
  const rows = await db.getAllAsync<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM ${spec.entity} WHERE ${column} = ? AND deleted_at IS NULL`,
    value
  );
  for (const r of rows) await softDeleteRowInTx(db, spec, r);
}

/**
 * Met `column` à null sur toutes les lignes vivantes de `spec` qui pointent vers
 * `value` (lien facultatif vers un parent supprimé), chacune ajoutée à l'outbox.
 */
export async function detachWhereInTx<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  column: keyof Fields<T> & string,
  value: string
) {
  const rows = await db.getAllAsync<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM ${spec.entity} WHERE ${column} = ? AND deleted_at IS NULL`,
    value
  );
  const patch = { [column]: null } as Partial<Fields<T>>;
  for (const r of rows) await updateRowInTx(db, spec, r, patch);
}

// ---------------------------------------------------------------------------
// Primitives utilisées par le moteur de sync
// ---------------------------------------------------------------------------

export async function readPendingEntity<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  userId: string
): Promise<PendingBatch<T> | null> {
  const batch = await readPendingRows<Record<string, unknown>>(db, spec.entity, userId);
  return batch && { maxSeq: batch.maxSeq, rows: batch.rows.map((r) => fromSqlRow(spec, r)) };
}

// Postgres renvoie "…T14:16:00.123456+00:00" alors que le client écrit
// "…T14:16:00.123Z" : on normalise pour que la comparaison texte (LWW) tienne.
const normalizeTs = (ts: string) => new Date(ts).toISOString();

/** Ligne Supabase → objet app (horodatages normalisés, colonnes inconnues ignorées). */
export function normalizeRemote<T extends BaseRow>(
  spec: EntitySpec<T>,
  row: Record<string, unknown>
): T {
  const out: Record<string, unknown> = {
    id: row.id,
    user_id: row.user_id,
    created_at: normalizeTs(row.created_at as string),
    updated_at: normalizeTs(row.updated_at as string),
    deleted_at: row.deleted_at ? normalizeTs(row.deleted_at as string) : null,
  };
  for (const col of dataColumns(spec)) {
    const v = row[col] ?? null;
    const kind = kindOf(spec, col);
    out[col] =
      kind === 'ts' && typeof v === 'string'
        ? normalizeTs(v)
        : kind === 'num' && typeof v === 'string'
          ? Number(v)
          : kind === 'list'
            ? (Array.isArray(v) ? v : [])
            : v;
  }
  return out as T;
}

/** Last-write-wins, comme applyRemoteTasks / applyRemoteNotes. */
export async function applyRemoteEntity<T extends BaseRow>(
  db: SQLiteDatabase,
  spec: EntitySpec<T>,
  rows: T[]
) {
  if (rows.length === 0) return;
  const cols = allColumns(spec);
  const updatable = cols.filter((c) => c !== 'id' && c !== 'user_id' && c !== 'created_at');
  const sql = `INSERT INTO ${spec.entity} (${cols.join(', ')})
     VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${updatable.map((c) => `${c} = excluded.${c}`).join(', ')}
     WHERE excluded.updated_at >= ${spec.entity}.updated_at`;
  await db.withTransactionAsync(async () => {
    for (const r of rows) {
      const rec = r as Record<string, unknown>;
      await db.runAsync(sql, ...cols.map((c) => toSql(kindOf(spec, c), rec[c])));
    }
  });
}
