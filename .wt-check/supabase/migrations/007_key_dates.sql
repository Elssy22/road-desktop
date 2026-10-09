-- 007 — Échéancier contractuel : table key_dates (fins de contrat client,
-- licences…), synchronisée offline-first comme le CRM. À exécuter dans
-- Supabase > SQL Editor après 001 à 006. Idempotent.
--
-- À appliquer AVANT de lancer la version de l'app qui contient l'échéancier.
-- Sinon seule la sync des dates clés échoue (erreur affichée) ; les autres
-- tables continuent de se synchroniser et l'outbox locale est conservée.
--
-- Pas de clé étrangère vers contacts (cf. 004 et DECISIONS.md §5).

create table if not exists public.key_dates (
  id          uuid primary key,                       -- généré côté client (offline)
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  title       text not null default '',
  date        date not null,                          -- jour de l'échéance, sans fuseau
  category    text not null default 'autre',          -- texte : fin_contrat, licence, autre
  contact_id  uuid,                                   -- contacts.id (sans FK), facultatif
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),     -- horloge client : last-write-wins
  deleted_at  timestamptz,                            -- suppression logique (tombstone)
  server_updated_at timestamptz not null default now() -- curseur de pull
);

create index if not exists key_dates_user_server_updated_idx
  on public.key_dates (user_id, server_updated_at);
create index if not exists key_dates_user_date_idx
  on public.key_dates (user_id, date)
  where deleted_at is null;

drop trigger if exists key_dates_before_write on public.key_dates;
create trigger key_dates_before_write
  before insert or update on public.key_dates
  for each row execute function public.lww_before_write();

alter table public.key_dates enable row level security;

drop policy if exists "key_dates_select_own" on public.key_dates;
create policy "key_dates_select_own" on public.key_dates
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "key_dates_insert_own" on public.key_dates;
create policy "key_dates_insert_own" on public.key_dates
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "key_dates_update_own" on public.key_dates;
create policy "key_dates_update_own" on public.key_dates
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "key_dates_delete_own" on public.key_dates;
create policy "key_dates_delete_own" on public.key_dates
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.key_dates to authenticated;
