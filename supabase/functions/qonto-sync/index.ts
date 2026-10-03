// Edge Function `qonto-sync` : importe transactions, factures clients et devis
// Qonto dans public.qonto_items. Seul endroit où la clé Qonto est utilisée :
// elle est lue dans les secrets Supabase (Deno.env), jamais dans l'app.
//
// Déploiement : supabase functions deploy qonto-sync
// Secrets requis : QONTO_ORGANIZATION_SLUG, QONTO_SECRET_KEY, QONTO_ALLOWED_USER_IDS
// (cf. DECISIONS.md §14).

import { createClient } from 'npm:@supabase/supabase-js@2';

const QONTO_API = 'https://thirdparty.qonto.com/v2';
/** Fenêtre d'import des transactions (par date de mise à jour Qonto). */
const TRANSACTIONS_WINDOW_DAYS = 90;
const PER_PAGE = 100;
/** Garde-fou contre une pagination qui ne se termine pas. */
const MAX_PAGES = 50;
const UPSERT_CHUNK = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

type Kind = 'transaction' | 'client_invoice' | 'quote';

type QontoRow = {
  user_id: string;
  qonto_id: string;
  kind: Kind;
  label: string;
  amount: number;
  currency: string;
  status: string;
  qonto_date: string | null;
  due_date: string | null;
  raw: unknown;
  updated_at: string;
};

// deno-lint-ignore no-explicit-any
type QontoObject = Record<string, any>;

/** Clé service role : nouvelles clés (SUPABASE_SECRET_KEYS) puis clé historique. */
function serviceKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // format inattendu : repli sur la clé historique
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('Clé service role introuvable dans l’environnement de la fonction.');
  return legacy;
}

/** GET paginé sur l'API Qonto. Ne journalise jamais l'en-tête Authorization. */
async function qontoList(path: string, params: [string, string][], listKey: string): Promise<QontoObject[]> {
  const slug = Deno.env.get('QONTO_ORGANIZATION_SLUG');
  const secret = Deno.env.get('QONTO_SECRET_KEY');
  if (!slug || !secret) throw new Error('Secrets Qonto non configurés côté Supabase.');

  const out: QontoObject[] = [];
  let page: number | null = 1;
  for (let i = 0; page && i < MAX_PAGES; i++) {
    const qs = new URLSearchParams([...params, ['per_page', String(PER_PAGE)], ['page', String(page)]]);
    const res = await fetch(`${QONTO_API}${path}?${qs}`, {
      headers: { Authorization: `${slug}:${secret}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`Qonto ${path} : HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
    }
    const body = await res.json();
    out.push(...((body[listKey] as QontoObject[] | undefined) ?? []));
    page = body.meta?.next_page ?? null;
  }
  return out;
}

const toDate = (v: unknown): string | null => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);

function clientName(client: QontoObject | null | undefined): string {
  if (!client) return '';
  return client.name || [client.first_name, client.last_name].filter(Boolean).join(' ') || '';
}

async function fetchTransactions(userId: string, now: string): Promise<QontoRow[]> {
  const accounts = await qontoList('/bank_accounts', [], 'bank_accounts');
  const since = new Date(Date.now() - TRANSACTIONS_WINDOW_DAYS * 86_400_000).toISOString();
  const rows: QontoRow[] = [];
  for (const account of accounts) {
    const txs = await qontoList(
      '/transactions',
      [
        ['bank_account_id', account.id],
        ['status[]', 'completed'],
        ['status[]', 'pending'],
        ['updated_at_from', since],
      ],
      'transactions',
    );
    for (const t of txs) {
      const amount = Number(t.amount) || 0;
      rows.push({
        user_id: userId,
        qonto_id: String(t.id),
        kind: 'transaction',
        label: t.label ?? '',
        amount: t.side === 'debit' ? -Math.abs(amount) : Math.abs(amount),
        currency: t.currency ?? 'EUR',
        status: t.status ?? '',
        qonto_date: toDate(t.settled_at) ?? toDate(t.emitted_at),
        due_date: null,
        raw: t,
        updated_at: now,
      });
    }
  }
  return rows;
}

async function fetchInvoices(userId: string, now: string): Promise<QontoRow[]> {
  const invoices = await qontoList('/client_invoices', [], 'client_invoices');
  return invoices.map((inv) => ({
    user_id: userId,
    qonto_id: String(inv.id),
    kind: 'client_invoice',
    label: [inv.number ? `Facture ${inv.number}` : 'Facture', clientName(inv.client)].filter(Boolean).join(' · '),
    amount: Number(inv.total_amount?.value) || 0,
    currency: inv.total_amount?.currency ?? inv.currency ?? 'EUR',
    status: inv.status ?? '',
    qonto_date: toDate(inv.issue_date),
    due_date: toDate(inv.due_date),
    raw: inv,
    updated_at: now,
  }));
}

async function fetchQuotes(userId: string, now: string): Promise<QontoRow[]> {
  const quotes = await qontoList('/quotes', [], 'quotes');
  return quotes.map((q) => ({
    user_id: userId,
    qonto_id: String(q.id),
    kind: 'quote',
    label: [q.number ? `Devis ${q.number}` : 'Devis', clientName(q.client)].filter(Boolean).join(' · '),
    amount: Number(q.total_amount?.value) || 0,
    currency: q.total_amount?.currency ?? q.currency ?? 'EUR',
    status: q.status ?? '',
    qonto_date: toDate(q.issue_date),
    due_date: toDate(q.expiry_date),
    raw: q,
    updated_at: now,
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  // 1. Authentification : JWT Supabase de l'appelant.
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Non authentifié.' }, 401);

  let admin;
  try {
    admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (e) {
    console.error('qonto-sync: configuration', (e as Error).message);
    return json({ error: 'Fonction mal configurée.' }, 500);
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ error: 'Session invalide ou expirée.' }, 401);

  // 2. Autorisation : les données bancaires de l'organisation ne sont visibles que
  // des comptes listés (fail closed si le secret est absent).
  const allowed = (Deno.env.get('QONTO_ALLOWED_USER_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.includes(userId)) return json({ error: 'Compte non autorisé à synchroniser Qonto.' }, 403);

  // 3. Import : chaque type est indépendant (un devis en erreur ne bloque pas les transactions).
  const now = new Date().toISOString();
  const sources: [Kind, (u: string, n: string) => Promise<QontoRow[]>][] = [
    ['transaction', fetchTransactions],
    ['client_invoice', fetchInvoices],
    ['quote', fetchQuotes],
  ];
  const imported: Partial<Record<Kind, number>> = {};
  const errors: { kind: Kind; message: string }[] = [];

  for (const [kind, fetcher] of sources) {
    try {
      const rows = await fetcher(userId, now);
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const { error } = await admin
          .from('qonto_items')
          .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: 'qonto_id' });
        if (error) throw new Error(`Base : ${error.message}`);
      }
      imported[kind] = rows.length;
    } catch (e) {
      const message = (e as Error).message;
      console.error(`qonto-sync: ${kind}`, message);
      errors.push({ kind, message });
    }
  }

  const total = Object.values(imported).reduce((a, b) => a + (b ?? 0), 0);
  const status = errors.length === sources.length ? 502 : 200;
  return json({ imported, total, errors, synced_at: now }, status);
});
