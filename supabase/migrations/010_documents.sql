-- 010 — Coffre documentaire chiffré : table documents (métadonnées, synchronisées
-- offline-first comme le CRM) + bucket Storage privé « vault-documents ».
-- À exécuter dans Supabase > SQL Editor après 001 à 009. Idempotent.
--
-- Les fichiers sont chiffrés CÔTÉ CLIENT (AES-256-GCM, clé dérivée d'une phrase
-- secrète jamais envoyée) : le bucket ne contient que des octets illisibles.
-- Le titre, lui, est en clair (cf. DECISIONS.md §16).
--
-- Pas de clé étrangère vers contacts ni projects (cf. 004 et DECISIONS.md §5).

create table if not exists public.documents (
  id            uuid primary key,                     -- généré côté client (offline)
  user_id       uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  title         text not null default '',
  storage_path  text not null,                        -- « <user_id>/<uuid>.bin » dans vault-documents
  contact_id    uuid,                                 -- contacts.id (sans FK), facultatif
  project_id    uuid,                                 -- projects.id (sans FK), facultatif
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),   -- horloge client : last-write-wins
  deleted_at    timestamptz,                          -- suppression logique (tombstone)
  server_updated_at timestamptz not null default now() -- curseur de pull
);

create index if not exists documents_user_server_updated_idx
  on public.documents (user_id, server_updated_at);

drop trigger if exists documents_before_write on public.documents;
create trigger documents_before_write
  before insert or update on public.documents
  for each row execute function public.lww_before_write();

alter table public.documents enable row level security;

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own" on public.documents
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own" on public.documents
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own" on public.documents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own" on public.documents
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.documents to authenticated;

-- ---------------------------------------------------------------------------
-- Storage : bucket privé, chaque utilisateur limité à son dossier « <user_id>/ ».
-- Limite de taille alignée sur l'app (20 Mo de clair + en-tête et tag GCM).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('vault-documents', 'vault-documents', false, 21 * 1024 * 1024)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "vault_documents_select_own" on storage.objects;
create policy "vault_documents_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vault-documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "vault_documents_insert_own" on storage.objects;
create policy "vault_documents_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vault-documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "vault_documents_update_own" on storage.objects;
create policy "vault_documents_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vault-documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'vault-documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "vault_documents_delete_own" on storage.objects;
create policy "vault_documents_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vault-documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
