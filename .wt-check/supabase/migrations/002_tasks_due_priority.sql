-- 002 — Échéance et priorité des tâches.
-- À exécuter dans Supabase > SQL Editor sur une base où supabase/schema.sql (spike,
-- équivalent de la migration 001) a déjà été appliqué. Idempotent.
--
-- IMPORTANT : à appliquer AVANT de lancer la nouvelle version de l'app, sinon
-- push/pull échouent ("column tasks.due_date does not exist") ; l'outbox locale
-- est conservée et repartira dès que la colonne existera.

-- Jour d'échéance (sans heure ni fuseau) : l'app envoie "YYYY-MM-DD" en heure locale.
alter table public.tasks add column if not exists due_date date;

-- 0 = normale, 1 = haute, 2 = urgente.
alter table public.tasks add column if not exists priority smallint not null default 0;

alter table public.tasks drop constraint if exists tasks_priority_range;
alter table public.tasks add constraint tasks_priority_range check (priority between 0 and 2);

-- Vue du jour / regroupement par échéance.
create index if not exists tasks_user_due_idx
  on public.tasks (user_id, due_date)
  where deleted_at is null;

-- Rien à changer côté RLS ni trigger last-write-wins : ils portent sur la ligne entière.
