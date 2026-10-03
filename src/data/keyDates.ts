import { supabase } from '../lib/supabase';
import { fetchAll, type BaseRow } from './base';
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
};

export const KEY_DATE_CATEGORIES = ['fin_contrat', 'licence', 'autre'] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  fin_contrat: 'Fin de contrat client',
  licence: 'Licence',
  autre: 'Autre',
};

/** Date clé + nom du contact lié (null si aucun ou contact supprimé). */
export type KeyDateWithContact = KeyDate & { contact_name: string | null };

/** Dates clés comprises entre `from` et `to` inclus (YYYY-MM-DD). */
export async function listKeyDatesBetween(from: string, to: string): Promise<KeyDateWithContact[]> {
  const rows = await fetchAll<KeyDate>((a, b) =>
    supabase
      .from('key_dates')
      .select('*')
      .is('deleted_at', null)
      .gte('date', from)
      .lte('date', to)
      .order('date')
      .order('created_at')
      .range(a, b)
  );
  const names = await contactNames(rows.flatMap((r) => (r.contact_id ? [r.contact_id] : [])));
  return rows.map((r) => ({ ...r, contact_name: (r.contact_id && names.get(r.contact_id)) || null }));
}
