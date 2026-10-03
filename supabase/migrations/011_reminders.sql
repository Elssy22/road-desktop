-- 011 — Rappels ponctuels : table reminders (titre + instant, liés facultativement
-- à une tâche ou à un contact), synchronisée offline-first comme le CRM.
-- À exécuter dans Supabase > SQL Editor après 001 à 010. Idempotent.
--
-- À appliquer AVANT de lancer la version de l'app qui contient les rappels.
-- Sinon seule la sync des rappels échoue (erreur affichée) ; les autres
-- tables continuent de se synchroniser et l'outbox locale est conservée.
--
-- Pas de clé étrangère vers tasks ni contacts (cf. 004 et DECISIONS.md §5).

create table if not exists public.reminders (
  id          uuid primary key,                       -- généré côté client (offline)
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  title       text not null default '',
  remind_at   timestamptz not null,                   -- instant de la notification
  task_id     uuid,                                   -- tasks.id (sans FK), facultatif
  contact_id  uuid,                                   -- contacts.id (sans FK), facultatif
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),     -- horloge client : last-write-wins
  deleted_at  timestamptz,                            -- suppression logique (tombstone)
  server_updated_at timestamptz not null default now() -- curseur de pull
);

create index if not exists reminders_user_server_updated_idx
  on public.reminders (user_id, server_updated_at);
create index if not exists reminders_user_remind_at_idx
  on public.reminders (user_id, remind_at)
  where deleted_at is null;

drop trigger if exists reminders_before_write on public.reminders;
create trigger reminders_before_write
  before insert or update on public.reminders
  for each row execute function public.lww_before_write();

alter table public.reminders enable row level security;

drop policy if exists "reminders_select_own" on public.reminders;
create policy "reminders_select_own" on public.reminders
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "reminders_insert_own" on public.reminders;
create policy "reminders_insert_own" on public.reminders
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "reminders_update_own" on public.reminders;
create policy "reminders_update_own" on public.reminders
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "reminders_delete_own" on public.reminders;
create policy "reminders_delete_own" on public.reminders
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.reminders to authenticated;
