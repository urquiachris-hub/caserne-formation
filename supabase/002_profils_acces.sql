-- =====================================================================
-- Migration 002 — Profils d'accès par email + connexion par lien email
-- À exécuter APRÈS schema.sql et seed.sql
--
-- Principe : la table acces_autorises est la liste blanche.
--   - un email absent de la liste ne peut pas se connecter (inscription refusée)
--   - le profil (role) de l'email détermine ce que la personne voit / modifie
--   - retirer une ligne = retirer l'accès immédiatement
-- =====================================================================

-- ---------- Nettoyage du modèle V1 (profils par compte) ----------
drop table if exists profils cascade;
drop type if exists role_app;

-- ---------- Liste blanche ----------
create table acces_autorises (
  email       text primary key check (email = lower(trim(email))),
  role        text not null check (role in ('admin', 'encadrement', 'resp_formation', 'formateur', 'agent')),
  commentaire text,
  created_at  timestamptz not null default now()
);
comment on table acces_autorises is
  'admin = tout ; encadrement = lecture de tout ; resp_formation = gère planning, présences, qualifications ; formateur = appel sur ses sessions + son suivi ; agent = son suivi';

-- ---------- Formateur rattaché à une session ----------
alter table sessions_formation
  add column if not exists formateur_id uuid references personnel(id) on delete set null;

-- ---------- Fonctions de droits ----------
create or replace function mon_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function mon_role() returns text
language sql stable security definer set search_path = public as $$
  select role from acces_autorises where email = mon_email();
$$;

create or replace function a_un_acces() returns boolean
language sql stable as $$ select mon_role() is not null; $$;

create or replace function is_admin() returns boolean
language sql stable as $$ select coalesce(mon_role() = 'admin', false); $$;

create or replace function peut_tout_lire() returns boolean
language sql stable as $$ select coalesce(mon_role() in ('admin', 'encadrement', 'resp_formation'), false); $$;

create or replace function peut_gerer_formation() returns boolean
language sql stable as $$ select coalesce(mon_role() in ('admin', 'resp_formation'), false); $$;

-- Fiche personnel liée à l'utilisateur connecté (par l'email de la fiche)
create or replace function mon_personnel_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from personnel where lower(email) = mon_email() and mon_email() <> '' limit 1;
$$;

-- La session est-elle animée par l'utilisateur connecté ?
create or replace function est_formateur_de(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sessions_formation
    where id = p_session and formateur_id is not null and formateur_id = mon_personnel_id()
  );
$$;

-- L'agent participe-t-il à une session animée par l'utilisateur connecté ?
create or replace function est_mon_stagiaire(p_personnel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from participations pa
    join sessions_formation s on s.id = pa.session_id
    where pa.personnel_id = p_personnel and s.formateur_id = mon_personnel_id()
  );
$$;

-- ---------- Liste blanche appliquée à l'inscription ----------
create or replace function public.verifier_email_autorise() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.acces_autorises where email = lower(new.email)) then
    raise exception 'Adresse email non autorisée';
  end if;
  return new;
end;
$$;

drop trigger if exists verifier_email_autorise on auth.users;
create trigger verifier_email_autorise
  before insert on auth.users
  for each row execute function public.verifier_email_autorise();

-- ---------- Règles de sécurité (on repart de zéro) ----------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('personnel','referentiels','qualifications','sessions_formation','participations')
  loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

alter table acces_autorises enable row level security;

-- Liste blanche : chacun voit sa propre ligne (pour connaître son profil) ; admin gère tout
create policy lecture on acces_autorises for select using (email = mon_email() or is_admin());
create policy gestion on acces_autorises for all using (is_admin()) with check (is_admin());

-- Personnel
create policy lecture on personnel for select using (
  peut_tout_lire() or id = mon_personnel_id() or est_mon_stagiaire(id)
);
create policy gestion on personnel for all using (is_admin()) with check (is_admin());

-- Référentiels
create policy lecture on referentiels for select using (a_un_acces());
create policy gestion on referentiels for all using (is_admin()) with check (is_admin());

-- Qualifications
create policy lecture on qualifications for select using (
  peut_tout_lire() or personnel_id = mon_personnel_id()
);
create policy gestion on qualifications for all using (peut_gerer_formation()) with check (peut_gerer_formation());

-- Sessions (planning visible par tous les profils)
create policy lecture on sessions_formation for select using (a_un_acces());
create policy gestion on sessions_formation for all using (peut_gerer_formation()) with check (peut_gerer_formation());

-- Participations
create policy lecture on participations for select using (
  peut_tout_lire() or personnel_id = mon_personnel_id() or est_formateur_de(session_id)
);
create policy gestion on participations for all using (peut_gerer_formation()) with check (peut_gerer_formation());
create policy appel_formateur on participations for update
  using (est_formateur_de(session_id)) with check (est_formateur_de(session_id));

-- =====================================================================
-- AJOUTER / MODIFIER / RETIRER UN ACCÈS
--   insert into acces_autorises (email, role) values ('prenom.nom@gmail.com', 'encadrement');
--   update acces_autorises set role = 'resp_formation' where email = 'prenom.nom@gmail.com';
--   delete from acces_autorises where email = 'prenom.nom@gmail.com';
-- Formateur et agent : l'email doit aussi figurer sur leur fiche Personnel.
-- =====================================================================
