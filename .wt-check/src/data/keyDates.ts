import { occurrencesBetween, type Recurrence } from '../lib/keyDateRecurrence';
import { supabase } from '../lib/supabase';
import { fetchAll, insertRow, softDeleteRow, unwrap, updateRow, type BaseRow, type Fields } from './base';
import { contactNames } from './crm';

// Échéancier contractuel : type et requêtes repris de mobile-legacy/src/db/keyDatesDb.ts.
// Fins de contrat client, licences… liés facultativement à un contact du CRM.

export type KeyDate = BaseRow & {
  title: string;
  /** Jour YYYY-MM-DD (colonne `date` Postgres, sans fuseau). */
  date: string;
  /** Texte libre ; l'app propose KEY_DATE_CATEGORIES. */
  category: string;
  contact_id: string | null;
  notes: string | null;
  /** Null = ponctuelle ; sinon `date` est la première échéance (lib/keyDateRecurrence.ts). */
  recurrence: Recurrence | null;
  /** Jour du mois (1-31) des séries mensuelles et trimestrielles. */
  recurrence_day: number | null;
};

export const KEY_DATE_CATEGORIES = ['fin_contrat', 'licence', 'admin', 'autre'] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  fin_contrat: 'Fin de contrat client',
  licence: 'Licence',
  admin: 'Fiscal / URSSAF',
  autre: 'Autre',
};

/** Date clé + nom du contact lié (null si aucun ou contact supprimé). */
export type KeyDateWithContact = KeyDate & { contact_name: string | null };

const KEY_DATES = 'key_dates';

/** Ajoute le nom du contact lié à chaque date clé. */
async function withContacts(rows: KeyDate[]): Promise<KeyDateWithContact[]> {
  const names = await contactNames(rows.flatMap((r) => (r.contact_id ? [r.contact_id] : [])));
  return rows.map((r) => ({ ...r, contact_name: (r.contact_id && names.get(r.contact_id)) || null }));
}

/**
 * Toutes les dates clés, de la plus proche à la plus lointaine, telles qu'en base :
 * `date` est la première échéance des séries récurrentes (cf. atNextOccurrence).
 */
export async function listKeyDates(): Promise<KeyDateWithContact[]> {
  const rows = await fetchAll<KeyDate>((a, b) =>
    supabase
      .from(KEY_DATES)
      .select('*')
      .is('deleted_at', null)
      .order('date')
      .order('created_at')
      .order('id')
      .range(a, b)
  );
  return withContacts(rows);
}

/**
 * Dates clés comprises entre `from` et `to` inclus (YYYY-MM-DD). Une série récurrente
 * donne une ligne par occurrence de la période, `date` remplacée par l'occurrence
 * (même `id` : deux lignes possibles sur une période de plus d'un mois).
 */
export async function listKeyDatesBetween(from: string, to: string): Promise<KeyDateWithContact[]> {
  const [oneOff, series] = await Promise.all([
    fetchAll<KeyDate>((a, b) =>
      supabase
        .from(KEY_DATES)
        .select('*')
        .is('deleted_at', null)
        .is('recurrence', null)
        .gte('date', from)
        .lte('date', to)
        .order('date')
        .order('created_at')
        .order('id')
        .range(a, b)
    ),
    // Peu nombreuses : toutes celles déjà commencées, dépliées sur la période.
    fetchAll<KeyDate>((a, b) =>
      supabase
        .from(KEY_DATES)
        .select('*')
        .is('deleted_at', null)
        .not('recurrence', 'is', null)
        .lte('date', to)
        .order('created_at')
        .order('id')
        .range(a, b)
    ),
  ]);
  const occurrences = series.flatMap((k) => occurrencesBetween(k, from, to).map((date) => ({ ...k, date })));
  // Tri stable : à date égale, les ponctuelles puis les séries, chacune par création.
  const rows = [...oneOff, ...occurrences].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return withContacts(rows);
}

/** Date clé vivante, ou null si elle n'existe pas ou a été supprimée. */
export async function getKeyDate(id: string): Promise<KeyDate | null> {
  return unwrap(await supabase.from(KEY_DATES).select('*').eq('id', id).is('deleted_at', null).maybeSingle());
}

export const addKeyDate = (fields: Fields<KeyDate>) => insertRow(KEY_DATES, fields);

export const updateKeyDate = (id: string, patch: Partial<Fields<KeyDate>>) => updateRow(KEY_DATES, id, patch);

export const softDeleteKeyDate = (id: string) => softDeleteRow(KEY_DATES, id);
