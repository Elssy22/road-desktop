-- 006 — Objectifs : table goals, synchronisée offline-first comme le CRM et les
-- projets. À exécuter dans Supabase > SQL Editor après 001 à 005. Idempotent.
--
-- À appliquer AVANT de lancer la version de l'app qui contient les objectifs.
-- Sinon seule la sync des objectifs échoue (erreur affichée) ; les autres tables
-- continuent de se synchroniser et l'outbox locale des objectifs est conservée.
--
-- Pas de clé étrangère vers projects (cf. 004 et DECISIONS.md §5).

create table if not exists public.goals (
  id          uuid primary key,                       -- généré côté client (offline)
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  title       text not null default '',
  target_date date,                                   -- jour cible, sans fuseau
  project_id  uuid,                                   -- projects.id (sans FK), facultatif
  progress    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),     -- horloge client : last-write-wins
  deleted_at  timestamptz,                            -- suppression logique (tombstone)
  server_updated_at timestamptz not null default now() -- curseur de pull
);

alter table public.goals drop constraint if exists goals_progress_range;
alter table public.goals add constraint goals_progress_range check (progress between 0 and 100);

create index if not exists goals_user_server_updated_idx
  on public.goals (user_id, server_updated_at);

drop trigger if exists goals_before_write on public.goals;
create trigger goals_before_write
  before insert or update on public.goals
  for each row execute function public.lww_before_write();

alter table public.goals enable row level security;

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own" on public.goals
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own" on public.goals
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own" on public.goals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own" on public.goals
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.goals to authenticated;
