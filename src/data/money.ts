import { supabase } from '../lib/supabase';
import { fetchAll, insertRow, softDeleteRow, unwrap, updateRow, type BaseRow, type Fields } from './base';
import { contactNames } from './crm';
import { projectTitles } from './projects';

// Suivi financier léger : types et règles repris de mobile-legacy/src/db/moneyDb.ts.
// Commissions attendues, factures émises, paiements reçus : un montant, un statut,
// une échéance, et des liens facultatifs vers un contact et un projet.

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

const MONEY_ITEMS = 'money_items';

/** numeric Postgres : nombre ou chaîne selon la précision, normalisé en nombre. */
const toMoneyItem = (m: MoneyItem): MoneyItem => ({ ...m, amount: Number(m.amount ?? 0) });

/** Échéance la plus proche d'abord, lignes sans échéance ensuite. */
export async function listMoneyItems(): Promise<MoneyItemWithLinks[]> {
  const rows = (
    await fetchAll<MoneyItem>((from, to) =>
      supabase
        .from(MONEY_ITEMS)
        .select('*')
        .is('deleted_at', null)
        .order('due_date', { nullsFirst: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
    )
  ).map(toMoneyItem);
  const [names, titles] = await Promise.all([
    contactNames(rows.flatMap((r) => (r.contact_id ? [r.contact_id] : []))),
    projectTitles(rows.flatMap((r) => (r.project_id ? [r.project_id] : []))),
  ]);
  return rows.map((r) => ({
    ...r,
    contact_name: (r.contact_id && names.get(r.contact_id)) || null,
    project_title: (r.project_id && titles.get(r.project_id)) || null,
  }));
}

/** Ligne vivante, ou null si elle n'existe pas ou a été supprimée. */
export async function getMoneyItem(id: string): Promise<MoneyItem | null> {
  const item = unwrap(
    await supabase.from(MONEY_ITEMS).select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  ) as MoneyItem | null;
  return item && toMoneyItem(item);
}

export const addMoneyItem = (fields: Fields<MoneyItem>) => insertRow(MONEY_ITEMS, fields);

export const updateMoneyItem = (id: string, patch: Partial<Fields<MoneyItem>>) => updateRow(MONEY_ITEMS, id, patch);

export const softDeleteMoneyItem = (id: string) => softDeleteRow(MONEY_ITEMS, id);
