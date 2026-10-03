-- 014 — Relances CRM automatiques : une tâche peut être rattachée à un contact
-- (tasks.contact_id) et marquée comme tâche automatique de la séquence de
-- relances (tasks.auto_kind). Cf. DECISIONS.md §32.
-- À exécuter dans Supabase > SQL Editor après 001 à 013. Idempotent.
--
-- À appliquer AVANT de publier la version de l'app qui contient les relances
-- automatiques (eas update). Sinon le push et le pull de `tasks` échouent
-- (colonnes inconnues, erreur affichée) ; les autres tables continuent de se
-- synchroniser et l'outbox locale des tâches est conservée.
--
-- Colonnes NULLABLES : les tâches existantes restent des tâches manuelles.

alter table public.tasks add column if not exists contact_id uuid;  -- contacts.id (sans FK, comme project_id)
alter table public.tasks add column if not exists auto_kind  text;  -- NULL = tâche manuelle

alter table public.tasks drop constraint if exists tasks_auto_kind_check;
alter table public.tasks add constraint tasks_auto_kind_check
  check (auto_kind is null or auto_kind in ('deck', 'relance_1', 'relance_2', 'relance_3', 'perdu'));

create index if not exists tasks_contact_idx
  on public.tasks (contact_id)
  where contact_id is not null;

-- Pas de contrainte d'unicité (contact_id, auto_kind) : l'app dérive l'id d'une
-- tâche automatique de (utilisateur, contact, étape). Deux appareils hors ligne
-- créent donc la MÊME ligne, que l'upsert fusionne (last-write-wins) au lieu de
-- rejeter tout le lot de l'outbox.
-- Rien à changer côté RLS ni trigger last-write-wins : ils portent sur la ligne entière.
