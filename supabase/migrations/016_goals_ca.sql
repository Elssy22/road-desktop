-- 016 — Objectifs de chiffre d'affaires calculés depuis Qonto. À exécuter dans
-- Supabase > SQL Editor après 001 à 015. Idempotent.
--
-- À appliquer AVANT de publier la version de l'app qui contient les objectifs de CA :
-- l'app lit et pousse ces colonnes avec les objectifs. Sinon seule la sync des
-- objectifs échoue (erreur affichée) ; les autres tables continuent et l'outbox
-- locale des objectifs est conservée.
--
-- Les objectifs existants prennent kind = 'manuel' (comportement inchangé : progress
-- saisi à la main). Pour kind = 'ca', progress n'est pas utilisé : l'app calcule
-- l'avancement en local depuis les encaissements Qonto (cf. DECISIONS.md §34).

alter table public.goals add column if not exists kind text not null default 'manuel';
alter table public.goals add column if not exists ca_target_amount numeric(14, 2);  -- euros
alter table public.goals add column if not exists ca_period text;                   -- fenêtre se terminant à target_date

alter table public.goals drop constraint if exists goals_kind_check;
alter table public.goals add constraint goals_kind_check check (kind in ('manuel', 'ca'));

alter table public.goals drop constraint if exists goals_ca_period_check;
alter table public.goals add constraint goals_ca_period_check
  check (ca_period is null or ca_period in ('trimestre', 'semestre', 'annee'));

alter table public.goals drop constraint if exists goals_ca_target_amount_check;
alter table public.goals add constraint goals_ca_target_amount_check
  check (ca_target_amount is null or ca_target_amount > 0);
