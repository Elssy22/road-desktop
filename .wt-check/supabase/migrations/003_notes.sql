-- 003 — Notes, synchronisées offline-first comme les tâches.
-- À exécuter dans Supabase > SQL Editor après schema.sql (001) et 002. Idempotent.
--
-- À appliquer AVANT de lancer la version de l'app qui contient les notes. Sinon
-- la sync des notes échoue ("relation public.notes does not exist") : l'erreur
-- est affichée, mais la sync des tâches continue et l'outbox locale des notes
-- est conservée jusqu'à ce que la table existe.

create table if not exists public.notes (
  id          uuid primary key,                       -- généré côté client (offline)
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),     -- horloge client : sert au last-write-wins
  deleted_at  timestamptz,                            -- suppression logique (tombstone)
  -- Horodatage SERVEUR de la dernière écriture : curseur de pull (cf. tasks).
  server_updated_at timestamptz not null default now()
);

create index if not exists notes_user_server_updated_idx
  on public.notes (user_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- Last-write-wins + curseur serveur
-- ---------------------------------------------------------------------------
-- Même logique que public.tasks_before_write(), mais dans une fonction générique
-- (elle ne référence aucune colonne propre à une table) pour les tables à venir.
-- tasks garde sa fonction d'origine : on ne touche pas à ce qui marche.
create or replace function public.lww_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null; -- la version serveur est plus récente : on la garde
    end if;
    new.user_id    := old.user_id;    -- une ligne ne change pas de propriétaire
    new.created_at := old.created_at;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists notes_before_write on public.notes;
create trigger notes_before_write
  before insert or update on public.notes
  for each row execute function public.lww_before_write();

-- ---------------------------------------------------------------------------
-- Row Level Security : chaque utilisateur ne voit / modifie que ses notes
-- ---------------------------------------------------------------------------
alter table public.notes enable row level security;

drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own" on public.notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own" on public.notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Pas de DELETE physique depuis l'app (suppression logique via deleted_at).
-- Policy fournie quand même pour une future purge des tombstones.
drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own" on public.notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.notes to authenticated;
