-- =====================================================================
-- Migration 005 — Synchronisation depuis le Drive « Application Ornano »
--   * chefs d'agrès / formateurs (venant du tableau Agents)
--   * visibilité des documents selon le sous-dossier du Drive
--   * journal des synchronisations
--   * configuration privée (secret d'appel de la tâche nocturne)
-- =====================================================================

-- ---------- Agents ----------
alter table personnel add column if not exists chef_agres boolean not null default false;
alter table personnel add column if not exists formateur  boolean not null default false;
alter table personnel add column if not exists source     text    not null default 'app';  -- 'app' | 'drive'

alter table acces_autorises add column if not exists source text not null default 'app';

-- ---------- Documents ----------
alter table documents add column if not exists visibilite text not null default 'tous'
  check (visibilite in ('tous', 'chefs', 'formateurs'));
alter table documents add column if not exists drive_file_id  text unique;
alter table documents add column if not exists drive_modified timestamptz;

-- ---------- Droits liés au profil de l'agent connecté ----------
create or replace function je_suis_formateur() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mon_role() = 'formateur', false)
      or coalesce((select formateur from personnel where id = mon_personnel_id()), false);
$$;

create or replace function je_suis_chef() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select chef_agres from personnel where id = mon_personnel_id()), false);
$$;

create or replace function peut_voir_document(p_visibilite text, p_actif boolean) returns boolean
language sql stable as $$
  select peut_gerer_formation()
      or (a_un_acces() and p_actif and (
            p_visibilite = 'tous'
         or peut_tout_lire()
         or (p_visibilite = 'chefs'      and (je_suis_chef() or je_suis_formateur()))
         or (p_visibilite = 'formateurs' and je_suis_formateur())
      ));
$$;

drop policy if exists lecture on documents;
create policy lecture on documents for select using (peut_voir_document(visibilite, actif));

-- Le fichier PDF n'est lisible que si la fiche du document l'est
drop policy if exists "referentiels lecture" on storage.objects;
create policy "referentiels lecture" on storage.objects for select
  using (bucket_id = 'referentiels' and exists (select 1 from public.documents d where d.fichier_path = storage.objects.name));

-- ---------- Journal des synchronisations ----------
create table if not exists synchro_journal (
  id         bigint generated always as identity primary key,
  debut      timestamptz not null default now(),
  fin        timestamptz,
  origine    text,                 -- 'nuit' | 'manuel'
  statut     text not null default 'en cours' check (statut in ('en cours', 'ok', 'partiel', 'erreur')),
  resume     jsonb,
  erreurs    text[]
);
alter table synchro_journal enable row level security;
create policy lecture on synchro_journal for select using (peut_gerer_formation());

-- ---------- Configuration privée (jamais exposée à l'API) ----------
create schema if not exists prive;
revoke all on schema prive from anon, authenticated;
create table if not exists prive.config (cle text primary key, valeur text not null);
insert into prive.config (cle, valeur)
values ('sync_secret', encode(gen_random_bytes(24), 'hex'))
on conflict (cle) do nothing;

-- Lu par la fonction de synchronisation (service_role uniquement)
create or replace function public.sync_secret_valide(p text) returns boolean
language sql stable security definer set search_path = prive, public as $$
  select exists (select 1 from prive.config where cle = 'sync_secret' and valeur = p);
$$;
revoke execute on function public.sync_secret_valide(text) from public, anon, authenticated;
grant execute on function public.sync_secret_valide(text) to service_role;
