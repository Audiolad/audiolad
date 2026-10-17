-- Extra stub columns/tables for isolated admin «Оценки → Слушатели» tests.
-- Applied AFTER scripts/lib/admin-ratings-analytics-stub.sql. Never apply to production.

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS created_at timestamptz;

CREATE TABLE IF NOT EXISTS public.analytics_test_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT ''
);

GRANT ALL ON TABLE public.analytics_test_accounts TO service_role;
