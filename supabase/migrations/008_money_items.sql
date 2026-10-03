-- 008 — Suivi financier léger : table money_items (commissions attendues,
-- factures émises, paiements reçus), synchronisée offline-first comme le CRM.
-- À exécuter dans Supabase > SQL Editor après 001 à 007. Idempotent.
--
-- À appliquer AVANT de lancer la version de l'app qui contient le suivi financier.
-- Sinon seule la sync de money_items échoue (erreur affichée) ; les autres
-- tables continuent de se synchroniser et l'outbox locale est conservée.
--
-- Pas de clé étrangère vers contacts ni projects (cf. 004 et DECISIONS.md §5).

create table if not exists public.money_items (
  id          uuid primary key,                       -- généré côté client (offline)
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  label       text not null default '',
  amount      numeric(12, 2) not null default 0 check (amount >= 0),
  currency    text not null default 'EUR',            -- code ISO 4217
  kind        text not null default 'commission_attendue', -- texte : commission_attendue, facture_emise, paiement_recu
  status      text not null default 'en_attente',     -- texte : en_attente, payé, en_retard
  due_date    date,                                   -- échéance facultative, sans fuseau
  contact_id  uuid,                                   -- contacts.id (sans FK), facultatif
  project_id  uuid,                                   -- projects.id (sans FK), facultatif
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),     -- horloge client : last-write-wins
  deleted_at  timestamptz,                            -- suppression logique (tombstone)
  server_updated_at timestamptz not null default now() -- curseur de pull
);

create index if not exists money_items_user_server_updated_idx
  on public.money_items (user_id, server_updated_at);
create index if not exists money_items_user_status_idx
  on public.money_items (user_id, status)
  where deleted_at is null;

drop trigger if exists money_items_before_write on public.money_items;
create trigger money_items_before_write
  before insert or update on public.money_items
  for each row execute function public.lww_before_write();

alter table public.money_items enable row level security;

drop policy if exists "money_items_select_own" on public.money_items;
create policy "money_items_select_own" on public.money_items
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "money_items_insert_own" on public.money_items;
create policy "money_items_insert_own" on public.money_items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "money_items_update_own" on public.money_items;
create policy "money_items_update_own" on public.money_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "money_items_delete_own" on public.money_items;
create policy "money_items_delete_own" on public.money_items
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.money_items to authenticated;
