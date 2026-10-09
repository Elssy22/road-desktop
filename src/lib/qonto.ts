// Import Qonto (lecture seule). L'app n'appelle jamais l'API Qonto : elle déclenche
// l'Edge Function `qonto-sync` puis relit la table qonto_items (cf. DECISIONS.md §14).
// Seule écriture de l'app : le projet lié (project_id, migration 020), choisi à la main.
import { FunctionsHttpError } from '@supabase/supabase-js';

import { notifyDataChanged, unwrap } from '../data/base';
import type { DateKey } from './dates';
import { supabase } from './supabase';

export type QontoKind = 'transaction' | 'client_invoice' | 'quote';

export type QontoItem = {
  id: string;
  qonto_id: string;
  kind: QontoKind;
  label: string;
  amount: number;
  currency: string;
  status: string;
  qonto_date: string | null;
  due_date: string | null;
  /** projects.id (sans FK, migration 020) : lien manuel, jamais déduit automatiquement. */
  project_id: string | null;
};

export type QontoSyncResult = {
  imported: Partial<Record<QontoKind, number>>;
  total: number;
  errors: { kind: QontoKind; message: string }[];
  synced_at: string;
};

/** Plafond d'affichage : les transactions s'accumulent vite. */
const FETCH_LIMIT = 300;

export const QONTO_KIND_LABELS: Record<QontoKind, string> = {
  client_invoice: 'Factures clients',
  quote: 'Devis',
  transaction: 'Transactions',
};

/** Groupes affichés, dans l'ordre : par type puis par statut. */
const GROUPS: { kind: QontoKind; status: string; title: string; tone: 'danger' | 'success' | 'muted' }[] = [
  { kind: 'client_invoice', status: 'late', title: 'Factures en retard', tone: 'danger' },
  { kind: 'client_invoice', status: 'unpaid', title: 'Factures impayées', tone: 'muted' },
  { kind: 'client_invoice', status: 'draft', title: 'Factures brouillons', tone: 'muted' },
  { kind: 'client_invoice', status: 'paid', title: 'Factures payées', tone: 'success' },
  { kind: 'client_invoice', status: 'canceled', title: 'Factures annulées', tone: 'muted' },
  { kind: 'quote', status: 'pending_approval', title: 'Devis en attente', tone: 'muted' },
  { kind: 'quote', status: 'approved', title: 'Devis acceptés', tone: 'success' },
  { kind: 'quote', status: 'canceled', title: 'Devis annulés', tone: 'muted' },
  { kind: 'transaction', status: 'pending', title: 'Transactions en cours', tone: 'muted' },
  { kind: 'transaction', status: 'completed', title: 'Transactions', tone: 'muted' },
];

export type QontoGroup = {
  key: string;
  title: string;
  tone: 'danger' | 'success' | 'muted';
  data: QontoItem[];
};

/** Facture impayée dont l'échéance est passée → groupe « en retard » (calculé, comme money_items). */
const groupStatus = (item: QontoItem, today: DateKey) =>
  item.kind === 'client_invoice' && item.status === 'unpaid' && item.due_date && item.due_date < today
    ? 'late'
    : item.status;

const STATUS_LABELS: Partial<Record<QontoKind, Record<string, string>>> = {
  client_invoice: { late: 'En retard', unpaid: 'Impayée', draft: 'Brouillon', paid: 'Payée', canceled: 'Annulée' },
  quote: { pending_approval: 'En attente', approved: 'Accepté', canceled: 'Annulé' },
};

/** « Facture · Impayée », « Devis · Accepté » ; statut Qonto brut s'il est inconnu de l'app. */
export function qontoStatusLabel(item: QontoItem, today: DateKey): string {
  const status = groupStatus(item, today);
  const kind = item.kind === 'quote' ? 'Devis' : item.kind === 'client_invoice' ? 'Facture' : 'Transaction';
  return `${kind} · ${STATUS_LABELS[item.kind]?.[status] ?? status}`;
}

export function groupQontoItems(items: QontoItem[], today: DateKey): QontoGroup[] {
  const byKey = new Map<string, QontoItem[]>();
  for (const item of items) {
    const key = `${item.kind}:${groupStatus(item, today)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }
  const known = GROUPS.map((g) => ({ key: `${g.kind}:${g.status}`, title: g.title, tone: g.tone }));
  // Statut Qonto inconnu de l'app : affiché quand même, en fin de liste.
  const extra = [...byKey.keys()]
    .filter((k) => !known.some((g) => g.key === k))
    .map((k) => {
      const [kind, status] = k.split(':');
      return { key: k, title: `${QONTO_KIND_LABELS[kind as QontoKind] ?? kind} · ${status}`, tone: 'muted' as const };
    });
  return [...known, ...extra].filter((g) => byKey.has(g.key)).map((g) => ({ ...g, data: byKey.get(g.key)! }));
}

const ITEM_COLUMNS = 'id, qonto_id, kind, label, amount, currency, status, qonto_date, due_date, project_id';

// numeric arrive en chaîne ou en nombre selon la précision : on normalise.
const toItem = (r: Record<string, unknown>) => ({ ...r, amount: Number(r.amount) }) as QontoItem;

/** Factures clients et devis : seules lignes Qonto qu'on peut lier à un projet. */
export const isProjectLinkable = (item: QontoItem) => item.kind === 'client_invoice' || item.kind === 'quote';

/** Lignes importées, les plus récentes d'abord. Nécessite le réseau. */
export async function fetchQontoItems(userId: string): Promise<QontoItem[]> {
  const { data, error } = await supabase
    .from('qonto_items')
    .select(ITEM_COLUMNS)
    .eq('user_id', userId)
    .order('qonto_date', { ascending: false, nullsFirst: false })
    .limit(FETCH_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toItem);
}

/** Factures et devis liés au projet, les plus récents d'abord. Nécessite le réseau. */
export async function fetchProjectQontoItems(projectId: string): Promise<QontoItem[]> {
  const { data, error } = await supabase
    .from('qonto_items')
    .select(ITEM_COLUMNS)
    .eq('project_id', projectId)
    .in('kind', ['client_invoice', 'quote'])
    .order('qonto_date', { ascending: false, nullsFirst: false })
    .order('id');
  if (error) throw new Error(error.message);
  return (data ?? []).map(toItem);
}

/**
 * Lie une facture ou un devis à un projet (null : détache). project_id est la
 * seule colonne de qonto_items que l'app peut écrire (droit de colonne + RLS,
 * migration 020) ; la synchro ne l'envoie pas, donc ne l'écrase pas.
 */
export async function setQontoItemProject(itemId: string, projectId: string | null) {
  try {
    const rows = unwrap(
      await supabase.from('qonto_items').update({ project_id: projectId }).eq('id', itemId).select('id')
    );
    if (rows.length === 0) throw new Error('Ligne Qonto introuvable ou non modifiable (migration 020 appliquée ?).');
  } finally {
    notifyDataChanged();
  }
}

/** Détache toutes les lignes Qonto d'un projet (suppression du projet). */
export async function detachQontoItemsFromProject(projectId: string) {
  unwrap(await supabase.from('qonto_items').update({ project_id: null }).eq('project_id', projectId));
}

/** Encaissement Qonto compté dans le CA : transaction effectuée, créditrice, en euros. */
export type QontoReceipt = { id: string; qonto_date: string; amount_cents: number };

const RECEIPTS_PAGE_SIZE = 1000;

/**
 * Tous les encaissements importés (pas de plafond : les objectifs de CA couvrent
 * jusqu'à un an). Nécessite le réseau ; copiés en local par qontoReceiptsDb.ts.
 */
export async function fetchQontoReceipts(userId: string): Promise<QontoReceipt[]> {
  const out: QontoReceipt[] = [];
  for (let from = 0; ; from += RECEIPTS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('qonto_items')
      .select('id, amount, qonto_date')
      .eq('user_id', userId)
      .eq('kind', 'transaction')
      .eq('status', 'completed')
      .eq('currency', 'EUR')
      .gt('amount', 0)
      .not('qonto_date', 'is', null)
      .order('id')
      .range(from, from + RECEIPTS_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      // numeric arrive en chaîne ou en nombre : centimes entiers pour des sommes exactes.
      out.push({ id: r.id, qonto_date: r.qonto_date, amount_cents: Math.round(Number(r.amount) * 100) });
    }
    if (!data || data.length < RECEIPTS_PAGE_SIZE) break;
  }
  return out;
}

/** Déclenche l'import côté serveur. Lève une erreur lisible si rien n'a pu être importé. */
export async function syncQonto(): Promise<QontoSyncResult> {
  const { data, error } = await supabase.functions.invoke<QontoSyncResult>('qonto-sync', { method: 'POST' });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.errors?.length) throw new Error(body.errors.map((e: { message: string }) => e.message).join('\n'));
      if (body?.error) throw new Error(body.error);
    }
    throw new Error(error.message || 'Synchronisation Qonto impossible.');
  }
  if (!data) throw new Error('Réponse vide de la fonction qonto-sync.');
  return data;
}
