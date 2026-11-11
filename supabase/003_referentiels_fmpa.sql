-- =====================================================================
-- Migration 003 — Référentiels documentaires (PDF) + suivi des FMPA
-- À exécuter APRÈS 002_profils_acces.sql
-- =====================================================================

-- ---------- 1. Référentiels documentaires ----------
create table documents (
  id            uuid primary key default gen_random_uuid(),
  categorie     text not null check (categorie in ('SUAP', 'INC', 'TOP', 'FDC')), -- FDC = formation du centre
  theme         text,                       -- sous-rubrique (ex. « Bilans », « ARI », « LSPCC »)
  titre         text not null,
  description   text,
  version       text,                       -- ex. « Édition 2026 »
  date_maj      date,
  fichier_path  text,                       -- chemin dans le stockage « referentiels »
  fichier_nom   text,
  ordre         int not null default 100,
  actif         boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on documents (categorie, theme);

alter table documents enable row level security;
create policy lecture on documents for select using (a_un_acces() and (actif or peut_gerer_formation()));
create policy gestion on documents for all using (peut_gerer_formation()) with check (peut_gerer_formation());

-- Stockage privé des PDF (accessible uniquement aux personnes autorisées)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('referentiels', 'referentiels', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create policy "referentiels lecture" on storage.objects for select
  using (bucket_id = 'referentiels' and public.a_un_acces());
create policy "referentiels ajout" on storage.objects for insert
  with check (bucket_id = 'referentiels' and public.peut_gerer_formation());
create policy "referentiels modif" on storage.objects for update
  using (bucket_id = 'referentiels' and public.peut_gerer_formation());
create policy "referentiels suppr" on storage.objects for delete
  using (bucket_id = 'referentiels' and public.peut_gerer_formation());

-- ---------- 2. Catalogue annuel des modules FMPA ----------
create table fmpa_modules (
  id            uuid primary key default gen_random_uuid(),
  annee         int not null,
  code          text not null,
  libelle       text not null,
  domaine       text not null default 'SUAP' check (domaine in ('SUAP', 'INC', 'TOP', 'AUTRE')),
  duree_heures  numeric(5,1),
  description   text,
  tous_agents   boolean not null default false,  -- obligatoire pour tous les agents actifs
  ordre         int not null default 100,
  actif         boolean not null default true,
  unique (annee, code)
);

-- Emplois / qualifications qui rendent le module obligatoire
create table fmpa_module_emplois (
  module_id       uuid not null references fmpa_modules(id) on delete cascade,
  referentiel_id  uuid not null references referentiels(id) on delete cascade,
  primary key (module_id, referentiel_id)
);

-- Validations (une par agent et par module)
create table fmpa_validations (
  id               uuid primary key default gen_random_uuid(),
  personnel_id     uuid not null references personnel(id) on delete cascade,
  module_id        uuid not null references fmpa_modules(id) on delete cascade,
  date_validation  date not null default current_date,
  session_id       uuid references sessions_formation(id) on delete set null,
  commentaire      text,
  created_at       timestamptz not null default now(),
  unique (personnel_id, module_id)
);
create index on fmpa_validations (personnel_id);

alter table sessions_formation
  add column if not exists fmpa_module_id uuid references fmpa_modules(id) on delete set null;

alter table fmpa_modules        enable row level security;
alter table fmpa_module_emplois enable row level security;
alter table fmpa_validations    enable row level security;

create policy lecture on fmpa_modules        for select using (a_un_acces());
create policy gestion on fmpa_modules        for all using (peut_gerer_formation()) with check (peut_gerer_formation());
create policy lecture on fmpa_module_emplois for select using (a_un_acces());
create policy gestion on fmpa_module_emplois for all using (peut_gerer_formation()) with check (peut_gerer_formation());
create policy lecture on fmpa_validations    for select using (peut_tout_lire() or personnel_id = mon_personnel_id());
create policy gestion on fmpa_validations    for all using (peut_gerer_formation()) with check (peut_gerer_formation());

-- ---------- 3. Validation automatique à l'appel ----------
-- Présent à une session liée à un module FMPA => module validé.
-- Repassé en absent / retiré => la validation issue de cette session est annulée.
create or replace function sync_fmpa_validation() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_module uuid;
  v_date   date;
begin
  if tg_op in ('INSERT', 'UPDATE') and new.statut = 'PRESENT' then
    select fmpa_module_id, date_debut::date into v_module, v_date
      from sessions_formation where id = new.session_id;
    if v_module is not null then
      insert into fmpa_validations (personnel_id, module_id, date_validation, session_id)
      values (new.personnel_id, v_module, v_date, new.session_id)
      on conflict (personnel_id, module_id) do nothing;
    end if;
  end if;

  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.statut = 'PRESENT' and new.statut <> 'PRESENT') then
    delete from fmpa_validations
     where personnel_id = old.personnel_id and session_id = old.session_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_fmpa_validation on participations;
create trigger sync_fmpa_validation
  after insert or update or delete on participations
  for each row execute function sync_fmpa_validation();

-- ---------- 4. Vue de suivi : modules attendus par agent ----------
create or replace view v_fmpa_suivi with (security_invoker = true) as
select
  p.id  as personnel_id, p.nom, p.prenom, p.grade,
  m.id  as module_id, m.annee, m.code, m.libelle, m.domaine, m.duree_heures, m.ordre,
  v.id is not null as valide,
  v.date_validation, v.session_id, v.commentaire
from personnel p
join fmpa_modules m on m.actif
left join fmpa_validations v on v.personnel_id = p.id and v.module_id = m.id
where p.actif
  and (
    m.tous_agents
    or exists (
      select 1
      from fmpa_module_emplois me
      join qualifications q on q.referentiel_id = me.referentiel_id
      where me.module_id = m.id and q.personnel_id = p.id and not q.suspendu
    )
  );

-- ---------- 5. Temps réel (« Mes FMPA » se met à jour dès l'appel) ----------
do $$ begin
  alter publication supabase_realtime add table fmpa_validations;
exception when others then raise notice 'publication temps réel non modifiée : %', sqlerrm;
end $$;
