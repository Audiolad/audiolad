#!/usr/bin/env node
/**
 * Runs the grant-persistence fixture only against an explicitly named,
 * isolated copy database. It never supplies a default database URL.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ALLOWED_DATABASE = "audiolad_pr138_visibility_test";
const databaseUrl = process.env.AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_DATABASE_URL;
const requestedAllowedDatabase =
  process.env.AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_ALLOW_DB;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const transactionSql = join(
  root,
  "supabase/tests/catalog_visibility_grant_persistence_copy.sql",
);
const postcheckSql = join(
  root,
  "supabase/tests/catalog_visibility_grant_persistence_postcheck.sql",
);

export function parseAllowedDatabaseUrl(url, allowDatabase) {
  if (!url) {
    return { ok: false, reason: "database URL is required" };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "database URL is invalid" };
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    return { ok: false, reason: "database URL must use postgres protocol" };
  }

  const databaseName = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, "");
  if (!databaseName || databaseName.includes("/")) {
    return { ok: false, reason: "database URL must name exactly one database" };
  }

  const normalized = databaseName.toLowerCase();
  if (["postgres", "template0", "template1"].includes(normalized)) {
    return { ok: false, reason: `refusing unsafe database name: ${databaseName}` };
  }

  const allowed =
    allowDatabase === databaseName || databaseName === DEFAULT_ALLOWED_DATABASE;
  if (!allowed) {
    return {
      ok: false,
      reason:
        `database ${databaseName} is not allowed; use ${DEFAULT_ALLOWED_DATABASE} ` +
        "or set AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_ALLOW_DB to its exact name",
    };
  }

  return { ok: true, databaseName };
}

function runPsql(url, sqlPath) {
  return spawnSync(
    "psql",
    ["--dbname", url, "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
    { stdio: "inherit" },
  );
}

function main() {
  if (!databaseUrl) {
    console.log(
      "catalog-visibility-grant-persistence: skipped (set AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_DATABASE_URL for an isolated copy DB)",
    );
    return;
  }

  const target = parseAllowedDatabaseUrl(databaseUrl, requestedAllowedDatabase);
  if (!target.ok) {
    throw new Error(target.reason);
  }

  if (!existsSync(transactionSql) || !existsSync(postcheckSql)) {
    throw new Error("grant persistence SQL fixture or postcheck is missing");
  }

  console.log(`catalog-visibility-grant-persistence: target=${target.databaseName}`);
  const transaction = runPsql(databaseUrl, transactionSql);

  // psql disconnect rolls back an open transaction on an assertion error.
  // This separate read-only connection proves rollback also after a failure.
  const postcheck = runPsql(databaseUrl, postcheckSql);

  if (transaction.error) throw transaction.error;
  if (postcheck.error) throw postcheck.error;
  if (transaction.status !== 0) process.exitCode = transaction.status ?? 1;
  if (postcheck.status !== 0) process.exitCode = postcheck.status ?? 1;

  if (process.exitCode == null) {
    console.log("catalog-visibility-grant-persistence: ok");
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
