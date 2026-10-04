import { supabase } from '../lib/supabase';

// Couche données du desktop : accès direct à Supabase, sans cache local ni
// outbox (DECISIONS.md §35). Les types des lignes et les constantes métier sont
// repris de mobile-legacy/src/db/ ; les requêtes SQLite y deviennent des
// requêtes PostgREST, filtrées par la RLS (chaque utilisateur ne voit que ses lignes).
//
// Les écritures suivent les règles des tables synchronisées avec le mobile :
// - `id` généré côté client (uuid), `user_id` posé par défaut (auth.uid()) ;
// - `updated_at` avancé à chaque écriture : le trigger serveur fait du
//   last-write-wins sur cette horloge client ;
// - jamais de DELETE : suppression logique (`deleted_at`), sinon le mobile ne
//   verrait jamais la suppression (il ne tire que les lignes modifiées).

/** Colonnes communes à toutes les tables synchronisées. */
export type BaseRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** Champs modifiables par l'app. */
export type Fields<T extends BaseRow> = Omit<T, keyof BaseRow>;

type Result<T> = { data: T | null; error: { message: string } | null };

/** Données d'une réponse Supabase, ou exception avec le message du serveur. */
export function unwrap<T>({ data, error }: Result<T>): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/** Plafond de lignes par requête PostgREST (max-rows par défaut de Supabase). */
const PAGE_SIZE = 1000;

/** Toutes les lignes d'une requête, page par page (`range` inclusif). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Result<T[]>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const chunk = unwrap(await page(from, from + PAGE_SIZE - 1)) ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}

// --- Signal de changement -------------------------------------------------
// Équivalent minimal du `dataVersion` de la sync mobile : chaque écriture
// réussie prévient les écrans montés, qui relisent leurs données.

const listeners = new Set<() => void>();

export function onDataChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyDataChanged() {
  for (const l of listeners) l();
}

// --- Écritures génériques --------------------------------------------------

/** `id` fourni quand l'écran le connaît avant l'insertion (éditeur de note). */
export async function insertRow(
  table: string,
  fields: Record<string, unknown>,
  id: string = crypto.randomUUID()
): Promise<string> {
  const ts = new Date().toISOString();
  unwrap(await supabase.from(table).insert({ ...fields, id, created_at: ts, updated_at: ts }));
  notifyDataChanged();
  return id;
}

/**
 * Champs de `next` qui diffèrent de la ligne lue à l'ouverture d'un formulaire.
 * Un formulaire n'envoie que ceux-là : une modification faite entre-temps sur
 * le mobile, sur un autre champ, n'est pas écrasée (last-write-wins par ligne).
 */
export function changedFields<T extends Record<string, unknown>>(original: Record<string, unknown>, next: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(next).filter(([k, v]) => JSON.stringify(original[k] ?? null) !== JSON.stringify(v ?? null))
  ) as Partial<T>;
}

/** Message quand la ligne visée n'existe plus (supprimée depuis le mobile pendant l'édition, par ex.). */
export const ROW_GONE = 'Cet élément a été supprimé entre-temps (peut-être depuis le mobile) : rien n’a été enregistré.';

/**
 * Met à jour une ligne vivante. Lève ROW_GONE si aucune ligne n'a été touchée :
 * sans ce contrôle, PostgREST répond « succès » pour 0 ligne modifiée.
 */
export async function updateRow(table: string, id: string, patch: Record<string, unknown>) {
  const rows = unwrap(
    await supabase
      .from(table)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
  );
  notifyDataChanged();
  if (rows.length === 0) throw new Error(ROW_GONE);
}

/** Suppression logique ; une ligne déjà supprimée ailleurs n'est pas une erreur. */
export async function softDeleteRow(table: string, id: string) {
  const ts = new Date().toISOString();
  unwrap(await supabase.from(table).update({ deleted_at: ts, updated_at: ts }).eq('id', id).is('deleted_at', null));
  notifyDataChanged();
}
