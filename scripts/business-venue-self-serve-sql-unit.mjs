import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync(new URL("../supabase/migrations/20270301120000_business_venue_self_serve_ten.sql", import.meta.url), "utf8");
const executable = migration.replace(/--[^\n]*/g, "");
assert.doesNotMatch(executable, /\b(?:GRANT|REVOKE|ALTER|CREATE|DELETE|TRUNCATE)\b/i, "data-only migration cannot widen access or delete locations");
assert.match(executable, /WHERE singleton AND default_limit < 10/);
const rollback = migration.match(/-- Rollback: (UPDATE[^\n]+)/)?.[1];
assert.ok(rollback, "documented rollback is executable SQL");
const checkLimit = (expected) => `DO $$ BEGIN
  IF (SELECT default_limit FROM public.business_venue_slot_settings WHERE singleton) <> ${expected} THEN
    RAISE EXCEPTION 'unexpected default_limit';
  END IF;
END $$;`;
const sql = `
CREATE TABLE public.business_venue_slot_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  default_limit smallint NOT NULL DEFAULT 3 CHECK (default_limit BETWEEN 1 AND 10),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.business_venue_slot_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.business_venue_slot_settings(singleton, default_limit) VALUES (true, 3);
${migration}
${checkLimit(10)}
-- Idempotent on the existing ceiling.
${migration}
${checkLimit(10)}
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.business_venue_slot_settings'::regclass AND (NOT relrowsecurity OR relacl IS NOT NULL)) THEN
    RAISE EXCEPTION 'access surface changed';
  END IF;
  BEGIN
    UPDATE public.business_venue_slot_settings SET default_limit = 11 WHERE singleton;
    RAISE EXCEPTION 'eleventh self-serve hall permitted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
${rollback}
${checkLimit(3)}
`;
const result = spawnSync("pg_virtualenv", ["psql", "-X", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
console.log("business-venue-self-serve-sql-unit: isolated PostgreSQL apply, repeat, ceiling, unchanged ACL/RLS, rollback: PASS");
