-- Schedule coordinated preset V2 storage maintenance.
-- Runs on the 1st and 16th of each month at 04:23 database time.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM cron.job
     WHERE jobname = 'kessho-v2-storage-maintenance'
  ) THEN
    PERFORM cron.unschedule('kessho-v2-storage-maintenance');
  END IF;
END
$$;

SELECT cron.schedule(
  'kessho-v2-storage-maintenance',
  '23 4 1,16 * *',
  'select * from public.kessho_run_preset_storage_maintenance_v2(false);'
);
