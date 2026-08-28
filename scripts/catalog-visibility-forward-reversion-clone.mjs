#!/usr/bin/env node
/**
 * Isolated CASE 2 / CASE 3 apply for the catalog-visibility forward restamp.
 * Never talks to production. Never supplies a default database URL.
 * Refuses postgres / template0 / template1.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ALLOWED_DATABASE = "audiolad_visibility_reversion_clone";
const databaseUrl = process.env.AUDIOLAD_VISIBILITY_REVERSION_DATABASE_URL;
const requestedAllowedDatabase =
  process.env.AUDIOLAD_VISIBILITY_REVERSION_ALLOW_DB;
const mode = process.env.AUDIOLAD_VISIBILITY_REVERSION_MODE || "case2";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ARCHIVE_DIR = join(
  root,
  "deploy/migration-baseline/catalog-visibility-20260830",
);
const LIVE_DIR = join(root, "supabase/migrations");

const OLD_FILES = [
  "20260830120100_practice_catalog_visibility_modes.sql",
  "20260830120200_create_practice_order_visibility.sql",
  "20260830120300_public_playlist_selected_visibility.sql",
  "20260830120400_fix_visibility_allowlist_author_policy.sql",
];
const NEW_FILES = [
  "20260902120100_practice_catalog_visibility_modes.sql",
  "20260902120200_create_practice_order_visibility.sql",
  "20260902120300_public_playlist_selected_visibility.sql",
  "20260902120400_fix_visibility_allowlist_author_policy.sql",
];

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

  return parseAllowedDatabaseName(databaseName, allowDatabase);
}

export function parseAllowedDatabaseName(databaseName, allowDatabase) {
  if (typeof databaseName !== "string" || !databaseName) {
    return { ok: false, reason: "database name is required" };
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
        "or set AUDIOLAD_VISIBILITY_REVERSION_ALLOW_DB to its exact name",
    };
  }

  return { ok: true, databaseName };
}

function filesForMode(selectedMode) {
  if (selectedMode === "case3") {
    return [
      ...OLD_FILES.map((name) => join(ARCHIVE_DIR, name)),
      ...NEW_FILES.map((name) => join(LIVE_DIR, name)),
    ];
  }
  if (selectedMode === "case2" || selectedMode === "case1") {
    return NEW_FILES.map((name) => join(LIVE_DIR, name));
  }
  return null;
}

function runUrlPsql(url, sqlPath) {
  return spawnSync(
    "psql",
    ["--dbname", url, "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
    { stdio: "inherit" },
  );
}

function main() {
  if (!databaseUrl) {
    console.log(
      "catalog-visibility-forward-reversion-clone: skipped " +
        "(set AUDIOLAD_VISIBILITY_REVERSION_DATABASE_URL for an isolated clone)",
    );
    return;
  }

  const target = parseAllowedDatabaseUrl(databaseUrl, requestedAllowedDatabase);
  if (!target.ok) {
    throw new Error(target.reason);
  }

  const files = filesForMode(mode);
  if (!files) {
    throw new Error(`unknown AUDIOLAD_VISIBILITY_REVERSION_MODE: ${mode}`);
  }

  for (const file of files) {
    if (!existsSync(file)) {
      throw new Error(`migration file missing: ${file}`);
    }
    const result = runUrlPsql(databaseUrl, file);
    if (result.status !== 0) {
      throw new Error(`psql failed for ${file}`);
    }
  }

  console.log(
    `catalog-visibility-forward-reversion-clone: applied ${files.length} files ` +
      `mode=${mode} db=${target.databaseName}`,
  );
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
