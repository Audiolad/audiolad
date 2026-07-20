#!/usr/bin/env node
/**
 * Create audiolad_personal_materials_test from production-compatible schema (no data)
 * and apply 20260715143000_personal_materials_foundation.sql.
 *
 * Read-only against production `postgres` for schema dump.
 * Writes only to audiolad_personal_materials_test.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DOCKER_CONTAINER,
  PERSONAL_MATERIALS_TEST_DB,
  PERSONAL_MATERIALS_TEST_OPT_IN_ENV,
  PRODUCTION_DB_NAME,
  TEST_DATABASE_ENV,
  assertPersonalMaterialsTestDbAllowed,
  createPersonalMaterialsSqlHelpers,
  describePersonalMaterialsTestTarget,
} from "./lib/personal-materials-test-db.mjs";

const SCRIPT_NAME = "scripts/personal-materials-p1-setup-test-db.mjs";
const MIGRATION_FILES = [
  "supabase/migrations/20260715143000_personal_materials_foundation.sql",
  "supabase/migrations/20260720143000_personal_materials_clear_draft_audio.sql",
  "supabase/migrations/20260720180000_personal_materials_return_url.sql",
];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, options = {}) {
  return execSync(cmd, { encoding: "utf8", ...options });
}

function databaseExists(name) {
  const out = run(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${PRODUCTION_DB_NAME} -tAc ${JSON.stringify(
      `SELECT 1 FROM pg_database WHERE datname='${name.replace(/'/g, "''")}'`,
    )}`,
  ).trim();
  return out === "1";
}

function recreateDatabase() {
  run(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${PRODUCTION_DB_NAME} -v ON_ERROR_STOP=1 -c ${JSON.stringify(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${PERSONAL_MATERIALS_TEST_DB}' AND pid <> pg_backend_pid();`,
    )}`,
  );
  run(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${PRODUCTION_DB_NAME} -v ON_ERROR_STOP=1 -c ${JSON.stringify(
      `DROP DATABASE IF EXISTS ${PERSONAL_MATERIALS_TEST_DB};`,
    )}`,
  );
  run(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${PRODUCTION_DB_NAME} -v ON_ERROR_STOP=1 -c ${JSON.stringify(
      `CREATE DATABASE ${PERSONAL_MATERIALS_TEST_DB};`,
    )}`,
  );
}

function cloneSchemaOnly() {
  console.log(`[setup] cloning schema-only from ${PRODUCTION_DB_NAME} -> ${PERSONAL_MATERIALS_TEST_DB}`);
  const dump = run(
    `docker exec ${DOCKER_CONTAINER} pg_dump -U postgres -d ${PRODUCTION_DB_NAME} --schema-only --no-owner -n public -n auth -n storage -n extensions`,
  );
  const filtered = dump
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (/^CREATE SCHEMA (public|auth|storage|extensions);/.test(trimmed)) {
        return false;
      }
      if (/^COMMENT ON SCHEMA (public|auth|storage|extensions)/.test(trimmed)) {
        return false;
      }
      if (/^ALTER DEFAULT PRIVILEGES/.test(trimmed)) {
        return false;
      }
      return true;
    })
    .join("\n");
  run(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${PERSONAL_MATERIALS_TEST_DB} -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS storage;"`,
  );
  run(
    `docker exec -i ${DOCKER_CONTAINER} psql -U postgres -d ${PERSONAL_MATERIALS_TEST_DB} -v ON_ERROR_STOP=1`,
    { input: filtered },
  );
}

function applyMigrations({ sqlFile }) {
  for (const migrationFile of MIGRATION_FILES) {
    const migrationPath = path.join(ROOT, migrationFile);
    const sql = readFileSync(migrationPath, "utf8");
    console.log(`[setup] applying migration ${migrationFile}`);
    sqlFile(sql);
  }
}

function verifyFoundation({ sqlScalar }) {
  const tables = [
    "personal_materials",
    "personal_material_author_notes",
    "personal_material_progress",
  ];
  for (const table of tables) {
    const exists = sqlScalar(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}')`,
    );
    if (exists !== "t") {
      throw new Error(`missing table public.${table}`);
    }
  }

  const rpcs = [
    "create_personal_material",
    "update_personal_material_draft",
    "activate_personal_material",
    "rotate_personal_material_access_token",
    "revoke_personal_material",
    "soft_delete_personal_material",
    "claim_personal_material",
    "get_claimed_personal_material",
    "list_claimed_personal_materials",
    "get_personal_material_progress",
    "upsert_personal_material_progress",
    "clear_personal_material_draft_audio",
  ];

  for (const rpc of rpcs) {
    const exists = sqlScalar(
      `SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${rpc}')`,
    );
    if (exists !== "t") {
      throw new Error(`missing rpc public.${rpc}`);
    }
  }

  const bucketPublic = sqlScalar(
    `SELECT COALESCE(public::text, 'missing') FROM storage.buckets WHERE id='personal-materials'`,
  );
  if (bucketPublic !== "false") {
    throw new Error(`personal-materials bucket must be private (public=false), got ${bucketPublic}`);
  }
}

async function main() {
  if (process.env[TEST_DATABASE_ENV] !== "1") {
    console.log(`${SCRIPT_NAME}: skipped (${TEST_DATABASE_ENV} is not set)`);
    process.exit(0);
  }

  if (process.env[PERSONAL_MATERIALS_TEST_OPT_IN_ENV] !== "1") {
    console.log(`${SCRIPT_NAME}: skipped (${PERSONAL_MATERIALS_TEST_OPT_IN_ENV} is not set)`);
    process.exit(0);
  }

  const target = describePersonalMaterialsTestTarget();
  console.log("[setup] target:", target);

  const pmInProd = run(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${PRODUCTION_DB_NAME} -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='personal_materials')"`,
  ).trim();
  console.log(`[setup] personal_materials in production postgres: ${pmInProd}`);

  const started = Date.now();

  if (!databaseExists(PERSONAL_MATERIALS_TEST_DB)) {
    run(
      `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${PRODUCTION_DB_NAME} -v ON_ERROR_STOP=1 -c ${JSON.stringify(
        `CREATE DATABASE ${PERSONAL_MATERIALS_TEST_DB};`,
      )}`,
    );
  } else {
    console.log(`[setup] database ${PERSONAL_MATERIALS_TEST_DB} already exists`);
  }

  let tableCount = run(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${PERSONAL_MATERIALS_TEST_DB} -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'"`,
  ).trim();

  const pmExists = run(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${PERSONAL_MATERIALS_TEST_DB} -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='personal_materials')"`,
  ).trim();

  if (tableCount === "0") {
    console.log("[setup] empty public schema; recreating database for clean clone");
    recreateDatabase();
    cloneSchemaOnly();
    tableCount = run(
      `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${PERSONAL_MATERIALS_TEST_DB} -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'"`,
    ).trim();
  } else if (pmExists === "f") {
    console.log(
      `[setup] public schema populated (${tableCount} tables) without personal_materials; re-cloning with grants`,
    );
    recreateDatabase();
    cloneSchemaOnly();
    tableCount = run(
      `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${PERSONAL_MATERIALS_TEST_DB} -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'"`,
    ).trim();
  } else {
    console.log(
      `[setup] personal_materials already present (${tableCount} public tables); skipping clone`,
    );
  }

  assertPersonalMaterialsTestDbAllowed({ scriptName: SCRIPT_NAME });
  const { sqlFile, sqlScalar } = createPersonalMaterialsSqlHelpers();

  applyMigrations({ sqlFile });
  verifyFoundation({ sqlScalar });

  console.log(`[setup] re-applying migrations for idempotency check`);
  applyMigrations({ sqlFile });
  verifyFoundation({ sqlScalar });

  const elapsedMs = Date.now() - started;
  console.log(`personal-materials-p1-setup-test-db: PASS (${elapsedMs}ms)`);
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
