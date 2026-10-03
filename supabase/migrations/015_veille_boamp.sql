-- 015 — Veille BOAMP : appels d'offres publics repérés pour l'agence.
-- À exécuter dans Supabase > SQL Editor après 001 à 014. Idempotent.
--
-- À appliquer AVANT de lancer la version de l'app qui contient la Veille, et
-- avant de déployer l'Edge Function `boamp-sync`. Sinon seule la sync des
-- appels d'offres échoue (erreur affichée) ; les autres tables continuent de se
-- synchroniser et l'outbox locale est conservée.
--
-- - veille_settings : une ligne par utilisateur (mots-clés modifiables dans
--   l'app, état de la dernière synchro). Hors moteur offline-first, comme
--   qonto_items : lue et écrite en ligne. Créée avec les valeurs par défaut à la
--   première utilisation (par l'app ou par la fonction).
-- - tender_offers : avis importés par `boamp-sync` (service role), puis
--   synchronisés offline-first comme les autres tables (cf. DECISIONS.md §33) ;
--   l'app n'y change que le statut.

-- ---------------------------------------------------------------------------
-- Réglages de la veille
-- ---------------------------------------------------------------------------
create table if not exists public.veille_settings (
  user_id           uuid primary key default auth.uid()
                      references auth.users (id) on delete cascade,
  sport_keywords    text[] not null default array['sport', 'football', 'club'],
  activity_keywords text[] not null default array['communication', 'marketing', 'événementiel', 'réseaux sociaux'],
  last_run_at       timestamptz,                    -- dernière synchro réussie
  last_run_status   text check (last_run_status in ('ok', 'erreur')),
  last_run_message  text,                           -- détail de la dernière erreur
  created_at        timestamptz not null default now(),
  -- Dernier changement de mots-clés (pas des champs de synchro) : la fonction
  -- relit alors 30 jours d'avis au lieu de repartir de la dernière synchro.
  updated_at        timestamptz not null default now(),
  -- Garde-fou : la requête BOAMP grossit avec le nombre de mots.
  constraint veille_settings_keywords_max
    check (cardinality(sport_keywords) <= 30 and cardinality(activity_keywords) <= 30)
);

create or replace function public.veille_settings_touch()
returns trigger
language plpgsql
as $$
begin
  if new.sport_keywords is distinct from old.sport_keywords
     or new.activity_keywords is distinct from old.activity_keywords then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists veille_settings_touch on public.veille_settings;
create trigger veille_settings_touch
  before update on public.veille_settings
  for each row execute function public.veille_settings_touch();

alter table public.veille_settings enable row level security;

drop policy if exists "veille_settings_select_own" on public.veille_settings;
create policy "veille_settings_select_own" on public.veille_settings
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "veille_settings_insert_own" on public.veille_settings;
create policy "veille_settings_insert_own" on public.veille_settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "veille_settings_update_own" on public.veille_settings;
create policy "veille_settings_update_own" on public.veille_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- L'app ne modifie que les mots-clés ; l'état de la synchro est écrit par la
-- fonction (service role).
revoke all on public.veille_settings from anon, authenticated;
grant select on public.veille_settings to authenticated;
grant insert (user_id, sport_keywords, activity_keywords) on public.veille_settings to authenticated;
grant update (sport_keywords, activity_keywords) on public.veille_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Appels d'offres repérés
-- ---------------------------------------------------------------------------
create table if not exists public.tender_offers (
  id           uuid primary key default gen_random_uuid(),  -- généré par la fonction
  user_id      uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  source       text not null default 'boamp',
  external_id  text not null,                      -- idweb BOAMP (ex. 26-34317)
  buyer        text not null default '',
  title        text not null default '',
  categories   text[] not null default '{}',       -- descripteurs officiels
  procedure    text,
  department   text,                               -- code département (premier cité)
  published_on date,
  deadline_at  timestamptz,                        -- date limite de réponse
  url          text,                               -- avis officiel
  status       text not null default 'nouveau'
                 check (status in ('nouveau', 'interessant', 'ignore', 'candidate')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(), -- horloge client : last-write-wins
  deleted_at   timestamptz,                        -- suppression logique (tombstone)
  server_updated_at timestamptz not null default now(), -- curseur de pull
  constraint tender_offers_user_source_external_key unique (user_id, source, external_id)
);

create index if not exists tender_offers_user_server_updated_idx
  on public.tender_offers (user_id, server_updated_at);

drop trigger if exists tender_offers_before_write on public.tender_offers;
create trigger tender_offers_before_write
  before insert or update on public.tender_offers
  for each row execute function public.lww_before_write();

alter table public.tender_offers enable row level security;

drop policy if exists "tender_offers_select_own" on public.tender_offers;
create policy "tender_offers_select_own" on public.tender_offers
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Insert requis par l'upsert du push (INSERT … ON CONFLICT DO UPDATE), même si
-- l'app ne crée jamais d'avis elle-même.
drop policy if exists "tender_offers_insert_own" on public.tender_offers;
create policy "tender_offers_insert_own" on public.tender_offers
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "tender_offers_update_own" on public.tender_offers;
create policy "tender_offers_update_own" on public.tender_offers
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tender_offers_delete_own" on public.tender_offers;
create policy "tender_offers_delete_own" on public.tender_offers
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.tender_offers to authenticated;
