import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { toDateKey, type DateKey } from '../lib/dates';
import {
  isAutoKind,
  planFollowups,
  type AutoKind,
  type PlanAction,
  type PlannerEvent,
  type PlannerTask,
} from '../lib/crmFollowups';
import { CONTACTS, type Contact } from './crmDb';
import { updateRowInTx, fromSqlRow } from './entityTable';
import { enqueue, now } from './localDb';

// Application locale des relances CRM automatiques (DECISIONS.md §32) : lit
// prospects, interactions, RDV et tâches automatiques dans SQLite, appelle
// planFollowups() et écrit le résultat (outbox comprise). Idempotent : un
// second passage juste après ne produit aucune action.

const dayOf = (iso: string): DateKey => toDateKey(new Date(iso));

/**
 * Id d'une tâche automatique, dérivé de (utilisateur, contact, étape) : deux
 * appareils hors ligne créent la même ligne, que l'upsert fusionne au lieu de
 * la doubler. Format UUID (colonne `uuid` Postgres), version 8 (« custom »).
 */
export async function autoTaskId(userId: string, contactId: string, kind: AutoKind): Promise<string> {
  const hex = await digestStringAsync(CryptoDigestAlgorithm.SHA256, `road-followup:${userId}:${contactId}:${kind}`);
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export type ContactPlan = { contact: Contact; actions: PlanAction[] };

/** Plans non vides de tous les contacts concernés (prospects, ou contacts avec une relance ouverte). */
export async function planAllFollowups(db: SQLiteDatabase, userId: string, today: DateKey): Promise<ContactPlan[]> {
  const contactRows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM contacts c
     WHERE c.user_id = ? AND c.deleted_at IS NULL
       AND (c.pipeline_stage IS NOT NULL OR EXISTS (
         SELECT 1 FROM tasks t
         WHERE t.contact_id = c.id AND t.auto_kind IS NOT NULL AND t.deleted_at IS NULL AND t.done = 0
       ))`,
    userId
  );
  if (contactRows.length === 0) return [];

  const interactionRows = await db.getAllAsync<{ contact_id: string; type: string; happened_at: string; created_at: string }>(
    `SELECT contact_id, type, happened_at, created_at FROM interactions
     WHERE user_id = ? AND deleted_at IS NULL`,
    userId
  );
  const appointmentRows = await db.getAllAsync<{ contact_id: string; start_at: string; created_at: string }>(
    `SELECT contact_id, start_at, created_at FROM appointments
     WHERE user_id = ? AND deleted_at IS NULL AND contact_id IS NOT NULL`,
    userId
  );
  // Tombstones compris : une tâche automatique supprimée à la main = étape sautée.
  const taskRows = await db.getAllAsync<{
    id: string;
    contact_id: string;
    auto_kind: string;
    title: string;
    done: number;
    due_date: string | null;
    updated_at: string;
    deleted_at: string | null;
  }>(
    `SELECT id, contact_id, auto_kind, title, done, due_date, updated_at, deleted_at FROM tasks
     WHERE user_id = ? AND contact_id IS NOT NULL AND auto_kind IS NOT NULL`,
    userId
  );

  const events = new Map<string, PlannerEvent[]>();
  const pushEvent = (contactId: string, e: PlannerEvent) => {
    const list = events.get(contactId) ?? [];
    list.push(e);
    events.set(contactId, list);
  };
  for (const i of interactionRows) {
    pushEvent(i.contact_id, { type: i.type, day: dayOf(i.happened_at), created_at: i.created_at });
  }
  // Un RDV à l'agenda = le prospect a répondu, comme une interaction « RDV ».
  for (const a of appointmentRows) {
    pushEvent(a.contact_id, { type: 'rdv', day: dayOf(a.start_at), created_at: a.created_at });
  }

  const tasks = new Map<string, PlannerTask[]>();
  for (const t of taskRows) {
    if (!isAutoKind(t.auto_kind)) continue;
    const list = tasks.get(t.contact_id) ?? [];
    list.push({
      id: t.id,
      auto_kind: t.auto_kind,
      title: t.title,
      done: t.done === 1,
      deleted: t.deleted_at !== null,
      due_date: t.due_date,
      updated_at: t.updated_at,
      updated_day: dayOf(t.updated_at),
    });
    tasks.set(t.contact_id, list);
  }

  const plans: ContactPlan[] = [];
  for (const row of contactRows) {
    const contact = fromSqlRow(CONTACTS, row);
    const actions = planFollowups(
      {
        name: contact.name,
        pipeline_stage: contact.pipeline_stage,
        next_followup_date: contact.next_followup_date,
        created_day: dayOf(contact.created_at),
        stage_changed_day: contact.stage_changed_at ? dayOf(contact.stage_changed_at) : null,
        updated_at: contact.updated_at,
      },
      events.get(contact.id) ?? [],
      tasks.get(contact.id) ?? [],
      today
    );
    if (actions.length > 0) plans.push({ contact, actions });
  }
  return plans;
}

/** Écrit les actions planifiées, en une transaction. */
export async function applyFollowupPlans(db: SQLiteDatabase, userId: string, plans: ContactPlan[]) {
  // Ids calculés hors transaction (hachage asynchrone).
  const ids = new Map<string, string>();
  for (const { contact, actions } of plans) {
    for (const a of actions) {
      if (a.kind === 'insert') ids.set(`${contact.id}:${a.autoKind}`, await autoTaskId(userId, contact.id, a.autoKind));
    }
  }

  await db.withTransactionAsync(async () => {
    for (const { contact, actions } of plans) {
      for (const a of actions) {
        const ts = now();
        if (a.kind === 'setFollowup') {
          await updateRowInTx(db, CONTACTS, contact, { next_followup_date: a.date });
          continue;
        }
        let taskId: string;
        if (a.kind === 'insert') {
          taskId = ids.get(`${contact.id}:${a.autoKind}`)!;
          // Même id qu'une tâche retirée plus tôt par l'automatisation (prospect
          // repassé de Perdu à À démarcher, par ex.) : elle est ressuscitée.
          await db.runAsync(
            `INSERT INTO tasks (id, user_id, title, done, due_date, priority, contact_id, auto_kind, created_at, updated_at)
             VALUES (?, ?, ?, 0, ?, 1, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title, done = 0, due_date = excluded.due_date,
               contact_id = excluded.contact_id, auto_kind = excluded.auto_kind,
               deleted_at = NULL, updated_at = excluded.updated_at`,
            taskId,
            userId,
            a.title,
            a.dueDate,
            contact.id,
            a.autoKind,
            ts,
            ts
          );
        } else {
          taskId = a.taskId;
          if (a.kind === 'complete') {
            await db.runAsync('UPDATE tasks SET done = 1, updated_at = ? WHERE id = ?', ts, taskId);
          } else if (a.kind === 'retitle') {
            await db.runAsync('UPDATE tasks SET title = ?, updated_at = ? WHERE id = ?', a.title, ts, taskId);
          } else if (a.kind === 'reschedule') {
            await db.runAsync('UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?', a.dueDate, ts, taskId);
          } else {
            // Retrait par l'automatisation : auto_kind effacé pour ne pas être pris
            // pour une étape sautée (suppression à la main, qui le conserve).
            await db.runAsync(
              'UPDATE tasks SET deleted_at = ?, auto_kind = NULL, updated_at = ? WHERE id = ?',
              ts,
              ts,
              taskId
            );
          }
        }
        await enqueue(db, 'tasks', taskId, userId);
      }
    }
  });
}

/** Relance automatique ouverte d'un contact (affichée sur sa fiche), la plus proche d'abord. */
export async function getOpenAutoTask(
  db: SQLiteDatabase,
  contactId: string
): Promise<{ id: string; title: string; due_date: string | null } | null> {
  return db.getFirstAsync(
    `SELECT id, title, due_date FROM tasks
     WHERE contact_id = ? AND auto_kind IS NOT NULL AND deleted_at IS NULL AND done = 0
     ORDER BY due_date`,
    contactId
  );
}
