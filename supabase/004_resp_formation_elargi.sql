-- =====================================================================
-- Migration 004 — Le responsable formation gère aussi le personnel et les emplois
-- (l'administrateur reste seul à gérer les accès)
-- =====================================================================
drop policy if exists gestion on personnel;
create policy gestion on personnel for all using (peut_gerer_formation()) with check (peut_gerer_formation());

drop policy if exists gestion on referentiels;
create policy gestion on referentiels for all using (peut_gerer_formation()) with check (peut_gerer_formation());
