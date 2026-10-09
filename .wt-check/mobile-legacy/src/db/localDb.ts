import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export const DB_NAME = 'spike.db';

/** 0 = normale, 1 = haute, 2 = urgente. */
export type TaskPriority = 0 | 1 | 2;

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

export type TaskRow = Omit<Task, 'done' | 'priority'> & { done: number; priority: number };

const toPriority = (n: number): TaskPriority => (n >= 2 ? 2 : n === 1 ? 1 : 0);

export const toTask = (row: TaskRow): Task => ({
  ...row,
  done: row.done === 1,
  priority: toPriority(row.priority),
});

export const now = () => new Date().toISOString();

/** Tables synchronisées ; même nom en local (SQLite) et côté Supabase. */
export type SyncEntity =
  | 'tasks'
  | 'notes'
  | 'contacts'
  | 'interactions'
  | 'projects'
  | 'project_steps'
  | 'goals'
  | 'key_dates'
  | 'money_items'
  | 'documents'
  | 'reminders'
  | 'appointments'
  | 'tender_offers';

/**
 * Schéma local, versionné par `PRAGMA user_version` : chaque étape ne tourne
 * qu'une fois, y compris sur les bases créées par le spike (version 0).
 * `sync_queue` est l'outbox : une ligne par action utilisateur pas encore
 * confirmée par Supabase (c'est elle qui alimente le compteur "en attente").
 */
const MIGRATIONS: string[] = [
  // v1 — schéma du spike
  `
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS tasks_user_idx ON tasks (user_id, deleted_at);
    CREATE TABLE IF NOT EXISTS sync_queue (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
  `,
  // v2 — échéance et priorité. On repart de zéro pour le curseur de pull afin
  // de récupérer ces colonnes pour les tâches déjà connues (cf. applyRemoteTasks).
  `
    ALTER TABLE tasks ADD COLUMN due_date TEXT;
    ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS tasks_user_due_idx ON tasks (user_id, due_date);
    DELETE FROM sync_meta WHERE key LIKE 'pull_cursor:%';
  `,
  // v3 — notes, et outbox commune à plusieurs tables : `entity` dit dans quelle
  // table relire la ligne `row_id`. Les actions déjà en attente sont des tâches.
  `
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS notes_user_idx ON notes (user_id, deleted_at);
    ALTER TABLE sync_queue RENAME COLUMN task_id TO row_id;
    ALTER TABLE sync_queue ADD COLUMN entity TEXT NOT NULL DEFAULT 'tasks';
    CREATE INDEX IF NOT EXISTS sync_queue_user_entity_idx ON sync_queue (user_id, entity, seq);
  `,
  // v4 — CRM : contacts et historique des interactions (cf. crmDb.ts).
  `
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      club TEXT,
      phone TEXT,
      email TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS contacts_user_idx ON contacts (user_id, deleted_at);
    CREATE TABLE IF NOT EXISTS interactions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'appel',
      summary TEXT NOT NULL DEFAULT '',
      happened_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS interactions_contact_idx ON interactions (contact_id, deleted_at, happened_at);
  `,
  // v5 — projets, étapes, et rattachement facultatif d'une tâche à un projet.
  // Pas de remise à zéro du curseur des tâches : aucune tâche n'a encore de projet.
  `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'actif',
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id, deleted_at);
    CREATE TABLE IF NOT EXISTS project_steps (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS project_steps_project_idx ON project_steps (project_id, deleted_at, position);
    ALTER TABLE tasks ADD COLUMN project_id TEXT;
    CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks (project_id);
  `,
  // v6 — objectifs (rattachement facultatif à un projet).
  `
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      target_date TEXT,
      project_id TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS goals_user_idx ON goals (user_id, deleted_at);
  `,
  // v7 — échéancier contractuel (dates clés), lié facultativement à un contact.
  `
    CREATE TABLE IF NOT EXISTS key_dates (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'autre',
      contact_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS key_dates_user_date_idx ON key_dates (user_id, deleted_at, date);
  `,
  // v8 — suivi financier léger (commissions, factures, paiements).
  `
    CREATE TABLE IF NOT EXISTS money_items (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'EUR',
      kind TEXT NOT NULL DEFAULT 'commission_attendue',
      status TEXT NOT NULL DEFAULT 'en_attente',
      due_date TEXT,
      contact_id TEXT,
      project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS money_items_user_idx ON money_items (user_id, deleted_at, status);
  `,
  // v9 — revues hebdomadaires : locales uniquement (pas d'outbox, pas de sync).
  `
    CREATE TABLE IF NOT EXISTS weekly_reviews (
      user_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      done_text TEXT NOT NULL DEFAULT '',
      slipping_text TEXT NOT NULL DEFAULT '',
      next_priority_text TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, week_start)
    );
  `,
  // v10 — coffre documentaire : métadonnées synchronisées, fichier chiffré dans Storage.
  `
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL,
      contact_id TEXT,
      project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS documents_user_idx ON documents (user_id, deleted_at);
  `,
  // v11 — rappels ponctuels (instant ISO), liés facultativement à une tâche ou un contact.
  `
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      remind_at TEXT NOT NULL,
      task_id TEXT,
      contact_id TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS reminders_user_at_idx ON reminders (user_id, deleted_at, remind_at);
  `,
  // v12 — agenda : rendez-vous (début, fin facultative, lieu), liés facultativement à un contact / projet.
  `
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      start_at TEXT NOT NULL,
      end_at TEXT,
      location TEXT,
      contact_id TEXT,
      project_id TEXT,
      notes TEXT,
      debrief_reminder_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS appointments_user_start_idx ON appointments (user_id, deleted_at, start_at);
  `,
  // v13 — CRM : segment et pipeline de prospection sur les contacts (Supabase 013).
  // Curseur de pull des contacts remis à zéro (comme en v2) : un autre appareil a
  // pu renseigner ces colonnes avant que celui-ci ne soit à jour.
  `
    ALTER TABLE contacts ADD COLUMN segment TEXT;
    ALTER TABLE contacts ADD COLUMN pipeline_stage TEXT;
    ALTER TABLE contacts ADD COLUMN pipeline_amount REAL;
    ALTER TABLE contacts ADD COLUMN next_followup_date TEXT;
    ALTER TABLE contacts ADD COLUMN stage_changed_at TEXT;
    DELETE FROM sync_meta WHERE key LIKE 'pull_cursor:contacts:%';
  `,
  // v14 — relances CRM automatiques (Supabase 014) : tâche rattachée à un contact,
  // et étape de la séquence. Pas de remise à zéro du curseur : aucune tâche
  // distante n'a encore ces colonnes.
  `
    ALTER TABLE tasks ADD COLUMN contact_id TEXT;
    ALTER TABLE tasks ADD COLUMN auto_kind TEXT;
    CREATE INDEX IF NOT EXISTS tasks_contact_idx ON tasks (contact_id);
  `,
  // v15 — veille BOAMP (Supabase 015) : appels d'offres importés par l'Edge
  // Function boamp-sync ; l'app n'en modifie que le statut. categories : JSON.
  `
    CREATE TABLE IF NOT EXISTS tender_offers (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'boamp',
      external_id TEXT NOT NULL,
      buyer TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      categories TEXT NOT NULL DEFAULT '[]',
      procedure TEXT,
      department TEXT,
      published_on TEXT,
      deadline_at TEXT,
      url TEXT,
      status TEXT NOT NULL DEFAULT 'nouveau',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS tender_offers_user_idx ON tender_offers (user_id, deleted_at, status);
  `,
  // v16 — objectifs de CA (Supabase 016). Pas de remise à zéro du curseur : aucun
  // objectif distant n'a encore ces colonnes. qonto_receipts : copie locale en
  // lecture seule des encaissements Qonto (hors outbox), base du calcul du CA.
  `
    ALTER TABLE goals ADD COLUMN kind TEXT NOT NULL DEFAULT 'manuel';
    ALTER TABLE goals ADD COLUMN ca_target_amount REAL;
    ALTER TABLE goals ADD COLUMN ca_period TEXT;
    CREATE TABLE IF NOT EXISTS qonto_receipts (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      qonto_date TEXT NOT NULL,
      amount_cents INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS qonto_receipts_user_date_idx ON qonto_receipts (user_id, qonto_date);
  `,
];

export async function migrateDb(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    try {
      await db.execAsync(`BEGIN; ${MIGRATIONS[v]} PRAGMA user_version = ${v + 1}; COMMIT;`);
    } catch (e) {
      await db.execAsync('ROLLBACK;').catch(() => undefined);
      throw new Error(`Migration locale v${v + 1} échouée`, { cause: e });
    }
  }
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function listTasks(db: SQLiteDatabase, userId: string): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(
    'SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    userId
  );
  return rows.map(toTask);
}

/** Échéances (YYYY-MM-DD) des tâches non faites dues au plus tard le `until`. */
export async function listOpenDueDates(db: SQLiteDatabase, userId: string, until: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ due_date: string }>(
    `SELECT due_date FROM tasks
     WHERE user_id = ? AND deleted_at IS NULL AND done = 0 AND due_date IS NOT NULL AND due_date <= ?`,
    userId,
    until
  );
  return rows.map((r) => r.due_date);
}

export async function countPending(db: SQLiteDatabase, userId: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM sync_queue WHERE user_id = ?',
    userId
  );
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Écritures locales (immédiates, même hors ligne) + ajout dans l'outbox
// ---------------------------------------------------------------------------

/** À appeler dans la même transaction que l'écriture locale. */
export async function enqueue(
  db: SQLiteDatabase,
  entity: SyncEntity,
  rowId: string,
  userId: string
) {
  await db.runAsync(
    'INSERT INTO sync_queue (entity, row_id, user_id, created_at) VALUES (?, ?, ?, ?)',
    entity,
    rowId,
    userId,
    now()
  );
}

export async function addTask(
  db: SQLiteDatabase,
  userId: string,
  title: string,
  dueDate: string | null = null
) {
  const ts = now();
  const id = randomUUID();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO tasks (id, user_id, title, done, due_date, priority, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, 0, ?, ?)`,
      id,
      userId,
      title,
      dueDate,
      ts,
      ts
    );
    await enqueue(db, 'tasks', id, userId);
  });
}

export async function setTaskDueDate(db: SQLiteDatabase, task: Task, dueDate: string | null) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?',
      dueDate,
      now(),
      task.id
    );
    await enqueue(db, 'tasks', task.id, task.user_id);
  });
}

export async function setTaskPriority(db: SQLiteDatabase, task: Task, priority: TaskPriority) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?',
      priority,
      now(),
      task.id
    );
    await enqueue(db, 'tasks', task.id, task.user_id);
  });
}

export async function setTaskDone(db: SQLiteDatabase, task: Task, done: boolean) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE tasks SET done = ?, updated_at = ? WHERE id = ?',
      done ? 1 : 0,
      now(),
      task.id
    );
    await enqueue(db, 'tasks', task.id, task.user_id);
  });
}

/** Rattache la tâche à un projet (ou la détache avec `null`). */
export async function setTaskProject(db: SQLiteDatabase, task: Task, projectId: string | null) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE tasks SET project_id = ?, updated_at = ? WHERE id = ?',
      projectId,
      now(),
      task.id
    );
    await enqueue(db, 'tasks', task.id, task.user_id);
  });
}

/** Suppression logique : la ligne reste en base avec deleted_at pour être propagée. */
export async function softDeleteTask(db: SQLiteDatabase, task: Task) {
  const ts = now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?',
      ts,
      ts,
      task.id
    );
    await enqueue(db, 'tasks', task.id, task.user_id);
  });
}

/**
 * Supprime (logiquement) les tâches vivantes rattachées à un contact supprimé —
 * aujourd'hui, ses relances automatiques. Dans la transaction de l'appelant.
 * `anonymize` (purge RGPD) vide aussi le titre, qui contient le nom du contact,
 * y compris sur les tâches déjà supprimées (tombstones synchronisés).
 */
export async function softDeleteContactTasksInTx(
  db: SQLiteDatabase,
  contactId: string,
  anonymize = false
) {
  const rows = await db.getAllAsync<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM tasks WHERE contact_id = ?${anonymize ? '' : ' AND deleted_at IS NULL'}`,
    contactId
  );
  const ts = now();
  for (const r of rows) {
    await db.runAsync(
      `UPDATE tasks SET deleted_at = COALESCE(deleted_at, ?), updated_at = ?${anonymize ? ", title = ''" : ''}
       WHERE id = ?`,
      ts,
      ts,
      r.id
    );
    await enqueue(db, 'tasks', r.id, r.user_id);
  }
}

// ---------------------------------------------------------------------------
// Primitives utilisées par le moteur de sync
// ---------------------------------------------------------------------------

export type PendingBatch<Row> = { maxSeq: number; rows: Row[] };

/**
 * Snapshot des lignes de `entity` à pousser (état courant de chaque ligne
 * touchée), lues brutes : la conversion SQLite → objet revient à l'appelant.
 */
export async function readPendingRows<Row>(
  db: SQLiteDatabase,
  entity: SyncEntity,
  userId: string
): Promise<PendingBatch<Row> | null> {
  const max = await db.getFirstAsync<{ maxSeq: number | null }>(
    'SELECT MAX(seq) AS maxSeq FROM sync_queue WHERE user_id = ? AND entity = ?',
    userId,
    entity
  );
  if (max?.maxSeq == null) return null;
  // `entity` vient du type SyncEntity, jamais d'une saisie : interpolation sûre.
  const rows = await db.getAllAsync<Row>(
    `SELECT t.* FROM ${entity} t
     WHERE t.id IN (
       SELECT DISTINCT row_id FROM sync_queue WHERE user_id = ? AND entity = ? AND seq <= ?
     )`,
    userId,
    entity,
    max.maxSeq
  );
  return { maxSeq: max.maxSeq, rows };
}

/** Purge l'outbox de `entity` jusqu'à `maxSeq` (les actions faites pendant le push restent). */
export async function ackPending(
  db: SQLiteDatabase,
  entity: SyncEntity,
  userId: string,
  maxSeq: number
) {
  await db.runAsync(
    'DELETE FROM sync_queue WHERE user_id = ? AND entity = ? AND seq <= ?',
    userId,
    entity,
    maxSeq
  );
}

/** Tâches à pousser, converties pour l'upsert Supabase. */
export async function readPendingTasks(
  db: SQLiteDatabase,
  userId: string
): Promise<PendingBatch<Task> | null> {
  const batch = await readPendingRows<TaskRow>(db, 'tasks', userId);
  return batch && { maxSeq: batch.maxSeq, rows: batch.rows.map(toTask) };
}

/**
 * Applique des tâches venues du serveur en last-write-wins : la version locale
 * n'est écrasée que si la version distante est au moins aussi récente.
 * (`>=` et non `>` : à version égale le contenu est le même, mais ça permet de
 * compléter les colonnes ajoutées après coup — due_date, priority — sur les
 * tâches déjà synchronisées avant la migration locale v2.)
 */
export async function applyRemoteTasks(db: SQLiteDatabase, tasks: Task[]) {
  if (tasks.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const t of tasks) {
      await db.runAsync(
        `INSERT INTO tasks (id, user_id, title, done, due_date, priority, project_id, contact_id, auto_kind,
                            created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           done = excluded.done,
           due_date = excluded.due_date,
           priority = excluded.priority,
           project_id = excluded.project_id,
           contact_id = excluded.contact_id,
           auto_kind = excluded.auto_kind,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at
         WHERE excluded.updated_at >= tasks.updated_at`,
        t.id,
        t.user_id,
        t.title,
        t.done ? 1 : 0,
        t.due_date,
        t.priority,
        t.project_id,
        t.contact_id,
        t.auto_kind,
        t.created_at,
        t.updated_at,
        t.deleted_at
      );
    }
  });
}

export async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}
