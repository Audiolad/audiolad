#!/usr/bin/env node
/**
 * Validate admin_operation_log migrations on audiolad-test-db only.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_TEST_DB_CONTAINER,
  bootstrapTestUserResetDockerIntegration,
  quoteLiteral,
  sqlFile,
  sqlScalar,
} from "./lib/test-user-reset-docker-db.mjs";
import { INTEGRATION_OPT_IN_ENV } from "./lib/test-user-reset-integration-env.mjs";

const SCRIPT_NAME = "scripts/admin-operation-log-migration-validation.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION_FILES = [
  "20260722180000_test_user_reset_audit_log.sql",
  "20260722190000_admin_operation_log_reconciliation.sql",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

if (process.env[INTEGRATION_OPT_IN_ENV] !== "1") {
  process.env[INTEGRATION_OPT_IN_ENV] = "1";
}

bootstrapTestUserResetDockerIntegration({ scriptName: SCRIPT_NAME });

function readMigration(fileName) {
  return readFileSync(path.join(ROOT, "supabase/migrations", fileName), "utf8");
}

function applyAllMigrations() {
  for (const file of MIGRATION_FILES) {
    sqlFile(readMigration(file));
  }
}

function grantCountFor(role) {
  return Number(
    sqlScalar(
      `SELECT COUNT(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='admin_operation_log' AND grantee='${role}'`,
    ),
  );
}

function assertFinalState(label) {
  assert(
    sqlScalar("SELECT to_regclass('public.admin_operation_log') IS NOT NULL") === "t",
    `${label}: table exists`,
  );
  assert(grantCountFor("service_role") > 0, `${label}: service_role grants present`);
  assert(grantCountFor("anon") === 0, `${label}: anon grants revoked`);
  assert(grantCountFor("authenticated") === 0, `${label}: authenticated grants revoked`);
}

function seedDriftedTable() {
  sqlFile(`
BEGIN;
DROP TABLE IF EXISTS public.admin_operation_log CASCADE;
CREATE TABLE public.admin_operation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  actor_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  target_auth_user_id uuid NULL,
  target_email_hash text NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_operation_log_status_check
    CHECK (status IN ('success', 'partial', 'failed'))
);
CREATE INDEX admin_operation_log_operation_created_at_idx
  ON public.admin_operation_log (operation, created_at DESC);
ALTER TABLE public.admin_operation_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.admin_operation_log TO anon;
GRANT ALL ON TABLE public.admin_operation_log TO authenticated;
GRANT ALL ON TABLE public.admin_operation_log TO service_role;
INSERT INTO public.admin_operation_log (operation, target_email_hash, status)
VALUES ('test_user_reset', 'seed', 'success');
COMMIT;
`);
}

function main() {
  assert(process.env.AUDIOLAD_TEST_DOCKER_CONTAINER == null ||
    process.env.AUDIOLAD_TEST_DOCKER_CONTAINER === ALLOWED_TEST_DB_CONTAINER,
    "migration validation uses audiolad-test-db only",
  );

  sqlFile("DROP TABLE IF EXISTS public.admin_operation_log CASCADE;");
  applyAllMigrations();
  assertFinalState("clean-db");

  seedDriftedTable();
  applyAllMigrations();
  assertFinalState("drifted-db");
  assert(
    sqlScalar("SELECT COUNT(*) FROM public.admin_operation_log") === "1",
    "drifted-db keeps existing audit row",
  );

  applyAllMigrations();
  assertFinalState("reapply");

  console.log("admin-operation-log-migration-validation: ok");
}

main();
