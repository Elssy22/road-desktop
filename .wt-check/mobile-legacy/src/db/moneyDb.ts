import type { SQLiteDatabase } from 'expo-sqlite';

import { fromSqlRow, getRow, insertRow, type BaseRow, type EntitySpec, type Fields } from './entityTable';

// Suivi financier léger (migration locale v8) : commissions attendues, factures
// émises, paiements reçus. Pas de comptabilité : un montant, un statut, une
// échéance, et des liens facultatifs vers un contact et un projet.

export type MoneyItem = BaseRow & {
  label: string;
  /** Montant décimal (colonne `numeric` Postgres). */
  amount: number;
  /** Code ISO 4217, `EUR` par défaut. */
  currency: string;
  /** Texte libre ; l'app propose MONEY_KINDS. */
  kind: string;
  /** Texte libre ; l'app propose MONEY_STATUSES. */
  status: string;
  /** Jour YYYY-MM-DD, facultatif. */
  due_date: string | null;
  contact_id: string | null;
  project_id: string | null;
};

export const MONEY_ITEMS: EntitySpec<MoneyItem> = {
  entity: 'money_items',
  columns: {
    label: 'text',
    amount: 'num',
    currency: 'text',
    kind: 'text',
    status: 'text',
    due_date: 'date',
    contact_id: 'text',
    project_id: 'text',
  },
};

export const MONEY_KINDS = ['commission_attendue', 'facture_emise', 'paiement_recu'] as const;
export const KIND_LABELS: Record<string, string> = {
  commission_attendue: 'Commission attendue',
  facture_emise: 'Facture émise',
  paiement_recu: 'Paiement reçu',
};

/** Ordre d'affichage des groupes : ce qui demande une action d'abord. */
export const MONEY_STATUSES = ['en_retard', 'en_attente', 'payé'] as const;
export const MONEY_STATUS_LABELS: Record<string, string> = {
  en_retard: 'En retard',
  en_attente: 'En attente',
  payé: 'Payé',
};

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const;

/**
 * Statut affiché : une ligne « en attente » dont l'échéance est passée compte
 * comme « en retard » sans qu'il faille la modifier à la main.
 */
export const effectiveStatus = (item: Pick<MoneyItem, 'status' | 'due_date'>, today: string): string =>
  item.status === 'en_attente' && item.due_date != null && item.due_date < today ? 'en_retard' : item.status;

/** Ligne + nom du contact et titre du projet liés (null si aucun ou supprimé). */
export type MoneyItemWithLinks = MoneyItem & { contact_name: string | null; project_title: string | null };

/** Échéance la plus proche d'abord, lignes sans échéance ensuite. */
export async function listMoneyItems(db: SQLiteDatabase, userId: string): Promise<MoneyItemWithLinks[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT m.*, c.name AS contact_name, p.title AS project_title
     FROM money_items m
     LEFT JOIN contacts c ON c.id = m.contact_id AND c.deleted_at IS NULL
     LEFT JOIN projects p ON p.id = m.project_id AND p.deleted_at IS NULL
     WHERE m.user_id = ? AND m.deleted_at IS NULL
     ORDER BY m.due_date IS NULL, m.due_date, m.created_at DESC`,
    userId
  );
  return rows.map((r) => ({
    ...fromSqlRow(MONEY_ITEMS, r),
    amount: Number(r.amount ?? 0),
    contact_name: (r.contact_name as string | null) ?? null,
    project_title: (r.project_title as string | null) ?? null,
  }));
}

export const getMoneyItem = (db: SQLiteDatabase, id: string) => getRow(db, MONEY_ITEMS, id);

export const addMoneyItem = (db: SQLiteDatabase, userId: string, fields: Fields<MoneyItem>) =>
  insertRow(db, MONEY_ITEMS, userId, fields);
