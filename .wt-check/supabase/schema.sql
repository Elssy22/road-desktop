-- Spike offline-first : table `tasks` synchronisée depuis l'app Expo.
-- À exécuter dans Supabase > SQL Editor (idempotent : peut être relancé).
--
-- Ce fichier correspond à la migration 001. Les évolutions suivantes sont dans
-- supabase/migrations/ et s'appliquent dans l'ordre, après celui-ci :
--   002_tasks_due_priority.sql  — tasks.due_date, tasks.priority
--   003_notes.sql               — table notes (même sync + RLS que tasks)
--   004_crm.sql                 — tables contacts, interactions
--   005_projects.sql            — tables projects, project_steps ; tasks.project_id
--   006_goals.sql               — table goals
--   007_key_dates.sql           — table key_dates (échéancier)
--   008_money_items.sql         — table money_items (suivi financier)
--   009_qonto_items.sql         — table qonto_items (import Qonto, lecture seule)
--   010_documents.sql           — table documents + bucket vault-documents (coffre)
--   011_reminders.sql           — table reminders (rappels ponctuels)
--   012_appointments.sql        — table appointments (agenda, RDV)
--   013_crm_pipeline.sql        — contacts : segment, pipeline de prospection
--   014_tasks_crm_followups.sql — tasks.contact_id, tasks.auto_kind (relances CRM)

create table if not exists public.tasks (
  id          uuid primary key,                       -- généré côté client (offline)
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  title       text not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),     -- horloge client : sert au last-write-wins
  deleted_at  timestamptz,                            -- suppression logique (tombstone)
  -- Colonne technique ajoutée pour le spike : horodatage SERVEUR de la dernière
  -- écriture. Sert de curseur de "pull" fiable, indépendant des horloges clients.
  server_updated_at timestamptz not null default now()
);

create index if not exists tasks_user_server_updated_idx
  on public.tasks (user_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- Last-write-wins + curseur serveur
-- ---------------------------------------------------------------------------
-- Un appareil resté hors ligne longtemps peut pousser une version plus ANCIENNE
-- qu'une version déjà présente. Dans ce cas on ignore la mise à jour
-- (retourner NULL dans un trigger BEFORE annule l'écriture de la ligne, y
-- compris pour un upsert `on conflict do update`).
create or replace function public.tasks_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null; -- la version serveur est plus récente : on la garde
    end if;
    new.user_id    := old.user_id;    -- une tâche ne change pas de propriétaire
    new.created_at := old.created_at;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists tasks_before_write on public.tasks;
create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- ---------------------------------------------------------------------------
-- Row Level Security : chaque utilisateur ne voit / modifie que ses tâches
-- ---------------------------------------------------------------------------
alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own" on public.tasks
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Pas de DELETE physique depuis l'app (suppression logique via deleted_at).
-- Policy fournie quand même pour une future purge des tombstones.
drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own" on public.tasks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.tasks to authenticated;

-- ---------------------------------------------------------------------------
-- Migrations suivantes : voir supabase/migrations/ (002+)
-- ---------------------------------------------------------------------------
