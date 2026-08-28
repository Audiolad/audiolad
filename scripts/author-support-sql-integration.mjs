#!/usr/bin/env node
/**
 * Gated SQL integration for request-bound author support authority.
 * Never selects a default/production database.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.AUDIOLAD_AUTHOR_SUPPORT_TEST_DATABASE_URL;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const integrationSql = join(root, "supabase/tests/author_support_session_proof.sql");

if (!databaseUrl) {
  console.log("SKIPPED — no test DB");
  process.exit(0);
}

if (!existsSync(integrationSql)) {
  throw new Error("author support SQL integration file is missing");
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

console.log("author-support-sql-integration: ok");
