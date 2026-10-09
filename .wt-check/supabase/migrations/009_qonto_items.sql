-- 009 — Import Qonto : table qonto_items (transactions, factures clients, devis),
-- alimentée UNIQUEMENT par l'Edge Function `qonto-sync` (service role).
-- À exécuter dans Supabase > SQL Editor après 001 à 008. Idempotent.
--
-- Lecture seule depuis l'app : RLS select sur user_id = auth.uid(), aucun droit
-- d'écriture pour anon/authenticated. La service role contourne la RLS.
-- Pas d'outbox ni de sync offline (cf. DECISIONS.md §14).

create table if not exists public.qonto_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  qonto_id    text not null unique,                   -- id Qonto (UUID côté Qonto)
  kind        text not null check (kind in ('transaction', 'client_invoice', 'quote')),
  label       text not null default '',
  amount      numeric(14, 2) not null default 0,      -- signé : débit < 0 pour les transactions
  currency    text not null default 'EUR',            -- code ISO 4217
  status      text not null default '',               -- statut Qonto brut (paid, unpaid, completed…)
  qonto_date  date,                                   -- règlement / émission selon le type
  due_date    date,                                   -- échéance (factures) ou expiration (devis)
  raw         jsonb not null default '{}'::jsonb,     -- objet Qonto complet
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists qonto_items_user_kind_date_idx
  on public.qonto_items (user_id, kind, qonto_date desc);

alter table public.qonto_items enable row level security;

drop policy if exists "qonto_items_select_own" on public.qonto_items;
create policy "qonto_items_select_own" on public.qonto_items
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Aucune policy insert/update/delete : seule la service role (Edge Function) écrit.
revoke all on public.qonto_items from anon, authenticated;
grant select on public.qonto_items to authenticated;
