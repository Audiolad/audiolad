-- Rollback of 20270305120000_business_player_device_events.sql (t1390u, hall device journal).
-- Not needed to roll back the application: the previous app simply does not write the table.
-- Apply only with Sergey's decision: it deletes the diagnostic journal (no playback, billing,
-- device or venue data is touched).
BEGIN;
DROP TABLE IF EXISTS public.business_player_device_events;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270305120000';
NOTIFY pgrst, 'reload schema';
COMMIT;
