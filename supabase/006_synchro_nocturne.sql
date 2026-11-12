-- =====================================================================
-- Migration 006 — Synchronisation Drive automatique chaque nuit (≈ 2h15 heure de Paris)
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('synchro-drive-nuit') where exists (select 1 from cron.job where jobname = 'synchro-drive-nuit');

select cron.schedule(
  'synchro-drive-nuit',
  '15 1 * * *',   -- heure UTC
  $$
  select net.http_post(
    url := 'https://nguukssncxqibnibjqrh.supabase.co/functions/v1/sync-drive',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-sync-secret', (select valeur from prive.config where cle = 'sync_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
