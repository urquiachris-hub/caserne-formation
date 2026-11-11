-- =====================================================================
-- Caserne Formation — schéma Supabase (PostgreSQL)
-- À exécuter UNE FOIS dans Supabase > SQL Editor, puis exécuter seed.sql
-- =====================================================================

-- ---------- Types ----------
create type domaine_ref as enum ('SAP', 'INC', 'SPE', 'AUTRE');
create type type_session as enum ('FMPA', 'FI', 'RECYCLAGE', 'MANOEUVRE', 'AUTRE');
create type statut_participation as enum ('INSCRIT', 'PRESENT', 'ABSENT', 'EXCUSE');
create type role_app as enum ('admin', 'agent');

-- ---------- Personnel ----------
create table personnel (
  id            uuid primary key default gen_random_uuid(),
  matricule     text unique,
  nom           text not null,
  prenom        text not null,
  grade         text,
  statut        text check (statut in ('SPV', 'SPP', 'PATS', 'JSP')) default 'SPV',
  date_entree   date,
  email         text,
  telephone     text,
  actif         boolean not null default true,
  user_id       uuid unique references auth.users(id) on delete set null, -- lien compte agent (V2)
  created_at    timestamptz not null default now()
);

-- ---------- Référentiels (catalogue des qualifications) ----------
create table referentiels (
  id                      uuid primary key default gen_random_uuid(),
  code                    text unique not null,
  libelle                 text not null,
  domaine                 domaine_ref not null,
  periodicite_mois        int,           -- validité avant recyclage (null = pas de recyclage)
  heures_fc_annuelles     numeric(5,1),  -- heures de formation continue attendues / an
  prerequis_id            uuid references referentiels(id),
  ordre                   int default 100,
  actif                   boolean not null default true
);

-- ---------- Qualifications détenues par chaque agent ----------
create table qualifications (
  id                      uuid primary key default gen_random_uuid(),
  personnel_id            uuid not null references personnel(id) on delete cascade,
  referentiel_id          uuid not null references referentiels(id) on delete restrict,
  date_obtention          date not null,
  date_dernier_recyclage  date,
  suspendu                boolean not null default false,
  commentaire             text,
  created_at              timestamptz not null default now(),
  unique (personnel_id, referentiel_id)
);

-- ---------- Sessions de formation (planning / FMPA) ----------
create table sessions_formation (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null,
  type            type_session not null default 'FMPA',
  referentiel_id  uuid references referentiels(id) on delete set null,
  date_debut      timestamptz not null,
  date_fin        timestamptz,
  duree_heures    numeric(5,1) not null default 3,
  lieu            text,
  formateur       text,
  places_max      int,
  description     text,
  created_at      timestamptz not null default now()
);

create table participations (
  session_id      uuid not null references sessions_formation(id) on delete cascade,
  personnel_id    uuid not null references personnel(id) on delete cascade,
  statut          statut_participation not null default 'INSCRIT',
  heures_validees numeric(5,1),
  primary key (session_id, personnel_id)
);

-- ---------- Profils applicatifs (rôles) ----------
create table profils (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  role      role_app not null default 'agent',
  created_at timestamptz not null default now()
);

-- ---------- Fonctions utilitaires ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where user_id = auth.uid() and role = 'admin');
$$;

create or replace function mon_personnel_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from personnel where user_id = auth.uid();
$$;

-- ---------- Vue : état de chaque qualification ----------
create or replace view v_qualifications with (security_invoker = true) as
select
  q.*,
  r.code, r.libelle, r.domaine, r.periodicite_mois,
  p.nom, p.prenom, p.grade, p.actif as agent_actif,
  case when r.periodicite_mois is null then null
       else (coalesce(q.date_dernier_recyclage, q.date_obtention)
             + make_interval(months => r.periodicite_mois))::date
  end as date_echeance,
  case
    when q.suspendu then 'SUSPENDU'
    when r.periodicite_mois is null then 'VALIDE'
    when (coalesce(q.date_dernier_recyclage, q.date_obtention)
          + make_interval(months => r.periodicite_mois))::date < current_date then 'EXPIRE'
    when (coalesce(q.date_dernier_recyclage, q.date_obtention)
          + make_interval(months => r.periodicite_mois))::date < current_date + 60 then 'A_RECYCLER'
    else 'VALIDE'
  end as etat
from qualifications q
join referentiels r on r.id = q.referentiel_id
join personnel p on p.id = q.personnel_id;

-- ---------- Vue : heures de formation par agent et par année ----------
create or replace view v_heures_annuelles with (security_invoker = true) as
select
  pa.personnel_id,
  extract(year from s.date_debut)::int as annee,
  s.type,
  sum(coalesce(pa.heures_validees, s.duree_heures)) as heures
from participations pa
join sessions_formation s on s.id = pa.session_id
where pa.statut = 'PRESENT'
group by 1, 2, 3;

-- ---------- Sécurité (Row Level Security) ----------
alter table personnel           enable row level security;
alter table referentiels        enable row level security;
alter table qualifications      enable row level security;
alter table sessions_formation  enable row level security;
alter table participations      enable row level security;
alter table profils             enable row level security;

-- Admins : accès complet
create policy admin_all on personnel          for all using (is_admin()) with check (is_admin());
create policy admin_all on referentiels       for all using (is_admin()) with check (is_admin());
create policy admin_all on qualifications     for all using (is_admin()) with check (is_admin());
create policy admin_all on sessions_formation for all using (is_admin()) with check (is_admin());
create policy admin_all on participations     for all using (is_admin()) with check (is_admin());
create policy admin_all on profils            for all using (is_admin()) with check (is_admin());

-- Agents (préparé pour la V2) : lecture de SES propres données uniquement
create policy agent_self on personnel      for select using (user_id = auth.uid());
create policy agent_read on referentiels   for select using (auth.uid() is not null);
create policy agent_self on qualifications for select using (personnel_id = mon_personnel_id());
create policy agent_read on sessions_formation for select using (auth.uid() is not null);
create policy agent_self on participations for select using (personnel_id = mon_personnel_id());
create policy self_read on profils         for select using (user_id = auth.uid());

-- Index
create index on qualifications (personnel_id);
create index on participations (personnel_id);
create index on sessions_formation (date_debut);
