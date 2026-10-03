-- 012 — Agenda : table appointments (vrais rendez-vous, avec heure de début,
-- heure de fin facultative et lieu), distincte des tâches, échéances clés et
-- rappels. Synchronisée offline-first comme les rappels (011).
-- À exécuter dans Supabase > SQL Editor après 001 à 011. Idempotent.
--
-- À appliquer AVANT de lancer la version de l'app qui contient l'agenda.
-- Sinon seule la sync des RDV échoue (erreur affichée) ; les autres tables
-- continuent de se synchroniser et l'outbox locale est conservée.
--
-- Pas de clé étrangère vers contacts ni projects (cf. 004 et DECISIONS.md §5).

create table if not exists public.appointments (
  id          uuid primary key,                       -- généré côté client (offline)
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  title       text not null default '',
  start_at    timestamptz not null,                   -- début du RDV
  end_at      timestamptz,                            -- fin, facultative
  location    text,                                   -- lieu, texte libre
  contact_id  uuid,                                   -- contacts.id (sans FK), facultatif
  project_id  uuid,                                   -- projects.id (sans FK), facultatif
  notes       text,
  debrief_reminder_enabled boolean not null default true, -- notification de debrief après le RDV
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),     -- horloge client : last-write-wins
  deleted_at  timestamptz,                            -- suppression logique (tombstone)
  server_updated_at timestamptz not null default now() -- curseur de pull
);

create index if not exists appointments_user_server_updated_idx
  on public.appointments (user_id, server_updated_at);
create index if not exists appointments_user_start_at_idx
  on public.appointments (user_id, start_at)
  where deleted_at is null;

drop trigger if exists appointments_before_write on public.appointments;
create trigger appointments_before_write
  before insert or update on public.appointments
  for each row execute function public.lww_before_write();

alter table public.appointments enable row level security;

drop policy if exists "appointments_select_own" on public.appointments;
create policy "appointments_select_own" on public.appointments
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "appointments_insert_own" on public.appointments;
create policy "appointments_insert_own" on public.appointments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "appointments_update_own" on public.appointments;
create policy "appointments_update_own" on public.appointments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "appointments_delete_own" on public.appointments;
create policy "appointments_delete_own" on public.appointments
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.appointments to authenticated;
