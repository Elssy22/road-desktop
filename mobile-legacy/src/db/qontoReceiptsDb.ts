import type { SQLiteDatabase } from 'expo-sqlite';

import type { DateKey } from '../lib/dates';
import { fetchQontoReceipts } from '../lib/qonto';
import { getMeta, now, setMeta } from './localDb';

// Copie locale (migration locale v16) des encaissements Qonto, en lecture seule :
// ni outbox ni curseur, la table est remplacée en entier à chaque rafraîchissement.
// Sert au calcul des objectifs de CA, qui reste ainsi possible hors ligne.

const refreshedKey = (userId: string) => `qonto_receipts_at:${userId}`;

/**
 * Relit les encaissements sur Supabase et remplace la copie locale. Lève une
 * erreur hors ligne (ou migration 009 absente) : la copie précédente est gardée.
 */
export async function refreshQontoReceipts(db: SQLiteDatabase, userId: string): Promise<void> {
  const rows = await fetchQontoReceipts(userId);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM qonto_receipts WHERE user_id = ?', userId);
    for (const r of rows) {
      await db.runAsync(
        'INSERT OR REPLACE INTO qonto_receipts (id, user_id, qonto_date, amount_cents) VALUES (?, ?, ?, ?)',
        r.id,
        userId,
        r.qonto_date,
        r.amount_cents
      );
    }
    await setMeta(db, refreshedKey(userId), now());
  });
}

/** Instant ISO du dernier rafraîchissement réussi, null si jamais fait sur cet appareil. */
export const qontoReceiptsRefreshedAt = (db: SQLiteDatabase, userId: string) => getMeta(db, refreshedKey(userId));

/** Somme des encaissements (centimes) dont la date tombe dans [start, end], bornes incluses. */
export async function sumQontoReceipts(
  db: SQLiteDatabase,
  userId: string,
  start: DateKey,
  end: DateKey
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(amount_cents) AS total FROM qonto_receipts WHERE user_id = ? AND qonto_date BETWEEN ? AND ?',
    userId,
    start,
    end
  );
  return row?.total ?? 0;
}
