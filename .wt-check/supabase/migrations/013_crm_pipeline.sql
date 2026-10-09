-- 013 — CRM : segment de contact et pipeline de prospection, portés par la
-- table `contacts` existante (pas de table « prospects » séparée : un contact
-- EST un prospect tant que son pipeline_stage est renseigné). Cf. DECISIONS.md §31.
-- À exécuter dans Supabase > SQL Editor après 001 à 012. Idempotent.
--
-- À appliquer AVANT de publier la version de l'app qui contient le pipeline
-- (eas update). Sinon le push et le pull de `contacts` échouent (colonnes
-- inconnues, erreur affichée) ; les autres tables continuent de se
-- synchroniser et l'outbox locale des contacts est conservée.
--
-- Toutes les colonnes sont NULLABLES : les contacts existants ne changent pas
-- (pas de segment, hors pipeline).

alter table public.contacts add column if not exists segment           text;
alter table public.contacts add column if not exists pipeline_stage    text;        -- NULL = hors pipeline
alter table public.contacts add column if not exists pipeline_amount   numeric;     -- montant potentiel du deal
alter table public.contacts add column if not exists next_followup_date date;       -- prochaine relance prévue
alter table public.contacts add column if not exists stage_changed_at  timestamptz; -- rempli par trigger

alter table public.contacts drop constraint if exists contacts_segment_check;
alter table public.contacts add constraint contacts_segment_check
  check (segment is null or segment in (
    'club_amateur', 'club_pro', 'marque', 'agence', 'joueur', 'createur_contenu',
    'ligue', 'district', 'artiste', 'organisme_etat', 'subvention', 'mecene',
    'sponsor', 'autre'
  ));

alter table public.contacts drop constraint if exists contacts_pipeline_stage_check;
alter table public.contacts add constraint contacts_pipeline_stage_check
  check (pipeline_stage is null or pipeline_stage in (
    'a_demarcher', 'deck_envoye', 'a_relancer', 'signe', 'perdu'
  ));

alter table public.contacts drop constraint if exists contacts_pipeline_amount_check;
alter table public.contacts add constraint contacts_pipeline_amount_check
  check (pipeline_amount is null or pipeline_amount >= 0);

create index if not exists contacts_user_pipeline_idx
  on public.contacts (user_id, pipeline_stage)
  where deleted_at is null and pipeline_stage is not null;

-- ---------------------------------------------------------------------------
-- stage_changed_at : horodaté à chaque changement de pipeline_stage.
--
-- L'app écrit aussi la colonne en local (affichage hors ligne). Le serveur
-- garde la main : si l'étape change, on retient l'heure envoyée par l'app
-- (changement fait hors ligne puis poussé plus tard) bornée à now() ; si
-- l'app n'en fournit pas de nouvelle, now(). Si l'étape ne change pas, la
-- valeur serveur est conservée.
--
-- Le trigger se nomme `contacts_stage_changed` : les triggers BEFORE d'une
-- table s'exécutent par ordre alphabétique, il passe donc APRÈS
-- `contacts_before_write` (LWW) — une écriture rejetée par le LWW (return
-- null) ne l'atteint pas.
-- ---------------------------------------------------------------------------
create or replace function public.contacts_stage_changed()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.pipeline_stage is not null then
      new.stage_changed_at := least(coalesce(new.stage_changed_at, now()), now());
    else
      new.stage_changed_at := null;
    end if;
  elsif new.pipeline_stage is distinct from old.pipeline_stage then
    if new.stage_changed_at is null
       or new.stage_changed_at is not distinct from old.stage_changed_at then
      new.stage_changed_at := now();
    else
      new.stage_changed_at := least(new.stage_changed_at, now());
    end if;
  else
    new.stage_changed_at := old.stage_changed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_stage_changed on public.contacts;
create trigger contacts_stage_changed
  before insert or update on public.contacts
  for each row execute function public.contacts_stage_changed();
