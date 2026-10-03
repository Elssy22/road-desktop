import type { SQLiteDatabase } from 'expo-sqlite';

import { fromSqlRow, getRow, insertRow, type BaseRow, type EntitySpec, type Fields } from './entityTable';

// Échéancier contractuel (migration locale v7) : fins de contrat client,
// licences… liés facultativement à un contact du CRM.

export type KeyDate = BaseRow & {
  title: string;
  /** Jour YYYY-MM-DD (colonne `date` Postgres, sans fuseau). */
  date: string;
  /** Texte libre ; l'app propose KEY_DATE_CATEGORIES. */
  category: string;
  contact_id: string | null;
  notes: string | null;
};

export const KEY_DATES: EntitySpec<KeyDate> = {
  entity: 'key_dates',
  columns: { title: 'text', date: 'date', category: 'text', contact_id: 'text', notes: 'text' },
};

export const KEY_DATE_CATEGORIES = ['fin_contrat', 'licence', 'autre'] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  fin_contrat: 'Fin de contrat client',
  licence: 'Licence',
  autre: 'Autre',
};

/** Date clé + nom du contact lié (null si aucun ou contact supprimé). */
export type KeyDateWithContact = KeyDate & { contact_name: string | null };

const SELECT_WITH_CONTACT = `
  SELECT k.*, c.name AS contact_name
  FROM key_dates k
  LEFT JOIN contacts c ON c.id = k.contact_id AND c.deleted_at IS NULL
  WHERE k.user_id = ? AND k.deleted_at IS NULL`;

const withContact = (r: Record<string, unknown>): KeyDateWithContact => ({
  ...fromSqlRow(KEY_DATES, r),
  contact_name: (r.contact_name as string | null) ?? null,
});

/** Toutes les dates clés, de la plus proche à la plus lointaine. */
export async function listKeyDates(db: SQLiteDatabase, userId: string): Promise<KeyDateWithContact[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${SELECT_WITH_CONTACT} ORDER BY k.date, k.created_at`,
    userId
  );
  return rows.map(withContact);
}

/** Dates clés comprises entre `from` et `to` inclus (YYYY-MM-DD). */
export async function listKeyDatesBetween(
  db: SQLiteDatabase,
  userId: string,
  from: string,
  to: string
): Promise<KeyDateWithContact[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${SELECT_WITH_CONTACT} AND k.date BETWEEN ? AND ? ORDER BY k.date, k.created_at`,
    userId,
    from,
    to
  );
  return rows.map(withContact);
}

export const getKeyDate = (db: SQLiteDatabase, id: string) => getRow(db, KEY_DATES, id);

export const addKeyDate = (db: SQLiteDatabase, userId: string, fields: Fields<KeyDate>) =>
  insertRow(db, KEY_DATES, userId, fields);
