-- Schedule automatic cleanup of expired ticket reservations every minute.
-- pg_cron is enabled by default on Supabase hosted projects.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-expired-reservations',
  '* * * * *',
  $$SELECT cleanup_expired_reservations()$$
);
