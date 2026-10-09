-- 004 — CRM : contacts et interactions, synchronisés offline-first comme tasks/notes.
-- À exécuter dans Supabase > SQL Editor après 001 (schema.sql), 002 et 003
-- (003 crée la fonction générique public.lww_before_write()). Idempotent.
--
-- À appliquer AVANT de lancer la version de l'app qui contient le CRM. Sinon la
-- sync de ces tables échoue (erreur affichée), mais tâches et notes continuent
-- de se synchroniser et l'outbox locale du CRM est conservée.
--
-- Pas de clé étrangère entre tables synchronisées : chaque table se synchronise
-- indépendamment (une interaction peut arriver avant son contact) et les
-- suppressions sont logiques (deleted_at). Cf. DECISIONS.md §5.

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id          uuid primary key,                       -- généré côté client (offline)
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  name        text not null default '',
  role        text not null default '',               -- texte libre : Créateur, Club, Coach…
  club        text,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),     -- horloge client : last-write-wins
  deleted_at  timestamptz,                            -- suppression logique (tombstone)
  server_updated_at timestamptz not null default now() -- curseur de pull
);

create index if not exists contacts_user_server_updated_idx
  on public.contacts (user_id, server_updated_at);

drop trigger if exists contacts_before_write on public.contacts;
create trigger contacts_before_write
  before insert or update on public.contacts
  for each row execute function public.lww_before_write();

alter table public.contacts enable row level security;

drop policy if exists "contacts_select_own" on public.contacts;
create policy "contacts_select_own" on public.contacts
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "contacts_insert_own" on public.contacts;
create policy "contacts_insert_own" on public.contacts
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "contacts_update_own" on public.contacts;
create policy "contacts_update_own" on public.contacts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "contacts_delete_own" on public.contacts;
create policy "contacts_delete_own" on public.contacts
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.contacts to authenticated;

-- ---------------------------------------------------------------------------
-- interactions
-- ---------------------------------------------------------------------------
create table if not exists public.interactions (
  id          uuid primary key,
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  contact_id  uuid not null,                          -- contacts.id (sans FK, cf. en-tête)
  type        text not null default 'appel',          -- texte libre : appel, rdv, mail…
  summary     text not null default '',
  happened_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  server_updated_at timestamptz not null default now()
);

create index if not exists interactions_user_server_updated_idx
  on public.interactions (user_id, server_updated_at);
create index if not exists interactions_contact_idx
  on public.interactions (contact_id, happened_at desc)
  where deleted_at is null;

drop trigger if exists interactions_before_write on public.interactions;
create trigger interactions_before_write
  before insert or update on public.interactions
  for each row execute function public.lww_before_write();

alter table public.interactions enable row level security;

drop policy if exists "interactions_select_own" on public.interactions;
create policy "interactions_select_own" on public.interactions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "interactions_insert_own" on public.interactions;
create policy "interactions_insert_own" on public.interactions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "interactions_update_own" on public.interactions;
create policy "interactions_update_own" on public.interactions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "interactions_delete_own" on public.interactions;
create policy "interactions_delete_own" on public.interactions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.interactions to authenticated;
