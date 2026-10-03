-- 005 — Projets & suivi : projects, project_steps, et rattachement facultatif
-- d'une tâche à un projet (tasks.project_id). Synchronisés offline-first comme
-- tasks/notes/CRM. À exécuter dans Supabase > SQL Editor après 001 à 004.
-- Idempotent.
--
-- IMPORTANT : à appliquer AVANT de lancer la version de l'app qui contient les
-- projets. L'app envoie désormais `project_id` avec chaque tâche : sans cette
-- migration, la sync des TÂCHES échoue aussi ("column tasks.project_id does not
-- exist"), comme pour 002. L'outbox locale est conservée et repartira dès que
-- la migration sera appliquée ; notes et CRM continuent de se synchroniser.
--
-- Pas de clé étrangère entre tables synchronisées (cf. 004 et DECISIONS.md §5).

-- ---------------------------------------------------------------------------
-- tasks.project_id (nullable : les tâches existantes restent sans projet)
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists project_id uuid;  -- projects.id (sans FK)

create index if not exists tasks_project_idx
  on public.tasks (project_id)
  where deleted_at is null;

-- Rien à changer côté RLS ni trigger last-write-wins : ils portent sur la ligne entière.

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key,                       -- généré côté client (offline)
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  title       text not null default '',
  status      text not null default 'actif',          -- texte : actif, en_pause, terminé
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),     -- horloge client : last-write-wins
  deleted_at  timestamptz,                            -- suppression logique (tombstone)
  server_updated_at timestamptz not null default now() -- curseur de pull
);

create index if not exists projects_user_server_updated_idx
  on public.projects (user_id, server_updated_at);

drop trigger if exists projects_before_write on public.projects;
create trigger projects_before_write
  before insert or update on public.projects
  for each row execute function public.lww_before_write();

alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.projects to authenticated;

-- ---------------------------------------------------------------------------
-- project_steps
-- ---------------------------------------------------------------------------
create table if not exists public.project_steps (
  id          uuid primary key,
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  project_id  uuid not null,                          -- projects.id (sans FK, cf. en-tête)
  title       text not null default '',
  done        boolean not null default false,
  position    integer not null default 0,             -- ordre d'affichage croissant
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  server_updated_at timestamptz not null default now()
);

create index if not exists project_steps_user_server_updated_idx
  on public.project_steps (user_id, server_updated_at);
create index if not exists project_steps_project_idx
  on public.project_steps (project_id, position)
  where deleted_at is null;

drop trigger if exists project_steps_before_write on public.project_steps;
create trigger project_steps_before_write
  before insert or update on public.project_steps
  for each row execute function public.lww_before_write();

alter table public.project_steps enable row level security;

drop policy if exists "project_steps_select_own" on public.project_steps;
create policy "project_steps_select_own" on public.project_steps
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "project_steps_insert_own" on public.project_steps;
create policy "project_steps_insert_own" on public.project_steps
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "project_steps_update_own" on public.project_steps;
create policy "project_steps_update_own" on public.project_steps
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "project_steps_delete_own" on public.project_steps;
create policy "project_steps_delete_own" on public.project_steps
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.project_steps to authenticated;
