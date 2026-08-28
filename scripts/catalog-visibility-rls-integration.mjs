#!/usr/bin/env node
/**
 * Executes the real RLS recursion regression against an explicitly supplied
 * isolated/local/preview database. It never selects a default database.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.AUDIOLAD_VISIBILITY_RLS_DATABASE_URL;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const integrationSql = join(
  root,
  "supabase/tests/catalog_visibility_rls_integration.sql",
);

if (!databaseUrl) {
  console.log(
    "catalog-visibility-rls-integration: skipped (set AUDIOLAD_VISIBILITY_RLS_DATABASE_URL for isolated/preview DB)",
  );
  process.exit(0);
}

if (!existsSync(integrationSql)) {
  throw new Error("catalog visibility RLS integration SQL is missing");
}

const result = spawnSync(
  "psql",
  [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", integrationSql],
  { stdio: "inherit" },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("catalog-visibility-rls-integration: ok");
