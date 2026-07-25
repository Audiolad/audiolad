#!/usr/bin/env node
/**
 * Validate platform RBAC migration on audiolad-test-db only.
 * Does not touch production.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_TEST_DB_CONTAINER,
  bootstrapTestUserResetDockerIntegration,
  sqlFile,
  sqlScalar,
} from "./lib/test-user-reset-docker-db.mjs";
import { INTEGRATION_OPT_IN_ENV } from "./lib/test-user-reset-integration-env.mjs";

const SCRIPT_NAME = "scripts/platform-rbac-migration-validation.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION_FILE = "20260725120000_platform_rbac_foundation.sql";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

if (process.env[INTEGRATION_OPT_IN_ENV] !== "1") {
  process.env[INTEGRATION_OPT_IN_ENV] = "1";
}

bootstrapTestUserResetDockerIntegration({ scriptName: SCRIPT_NAME });

const migrationSql = readFileSync(
  path.join(ROOT, "supabase/migrations", MIGRATION_FILE),
  "utf8",
);

sqlFile(migrationSql);

assert(
  sqlScalar("SELECT to_regclass('public.platform_permissions') IS NOT NULL") ===
    "t",
  "platform_permissions exists",
);
assert(
  sqlScalar("SELECT to_regclass('public.platform_roles') IS NOT NULL") === "t",
  "platform_roles exists",
);
assert(
  sqlScalar("SELECT to_regclass('public.platform_role_permissions') IS NOT NULL") ===
    "t",
  "platform_role_permissions exists",
);
assert(
  sqlScalar("SELECT to_regclass('public.platform_user_roles') IS NOT NULL") ===
    "t",
  "platform_user_roles exists",
);

const permissionCount = Number(
  sqlScalar("SELECT count(*) FROM public.platform_permissions"),
);
assert(permissionCount >= 15, `expected >=15 permissions, got ${permissionCount}`);

const roleCount = Number(sqlScalar("SELECT count(*) FROM public.platform_roles"));
assert(roleCount === 6, `expected 6 roles, got ${roleCount}`);

const nullDenied = sqlScalar(
  "SELECT public.has_platform_permission(NULL, 'admin_panel.access')::text",
);
assert(
  nullDenied === "f" || nullDenied === "false",
  `null user denied (got ${nullDenied})`,
);

// Idempotent re-apply
sqlFile(migrationSql);
assert(
  sqlScalar("SELECT count(*) FROM public.platform_roles") === "6",
  "re-apply keeps 6 roles",
);

const ownerLegacy = Number(
  sqlScalar(
    "SELECT count(*) FROM public.profiles WHERE role = 'platform_owner'",
  ),
);
const ownerAssigned = Number(
  sqlScalar(
    "SELECT count(*) FROM public.platform_user_roles WHERE role_code = 'owner'",
  ),
);

console.log(
  JSON.stringify(
    {
      ok: true,
      container: ALLOWED_TEST_DB_CONTAINER,
      migration: MIGRATION_FILE,
      ownerLegacy,
      ownerAssigned,
      note:
        ownerLegacy === 0
          ? "no legacy platform_owner in test DB; owner not invented"
          : "legacy owners mapped when present",
    },
    null,
    2,
  ),
);
