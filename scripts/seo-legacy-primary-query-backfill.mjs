#!/usr/bin/env node
/**
 * Dry-run preview for legacy published SEO primary queries.
 *
 * Default: print the SELECT and exit. Does not connect to any database.
 * Write mode is refused unless every guard below is present, and even then
 * it only accepts a localhost URL. Never point this at production.
 * Not referenced by CI.
 *
 *   node scripts/seo-legacy-primary-query-backfill.mjs
 *   node scripts/seo-legacy-primary-query-backfill.mjs --write
 *     requires SEO_LEGACY_BACKFILL_DATABASE_URL=postgresql://...@127.0.0.1/...
 *     and SEO_LEGACY_BACKFILL_CONFIRM=localhost-only
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW_SQL = join(
  ROOT,
  "scripts/sql/seo-legacy-primary-query-backfill-preview.sql",
);

export function resolveBackfillMode(argv, env = process.env) {
  const write = argv.includes("--write");
  const databaseUrl = (env.SEO_LEGACY_BACKFILL_DATABASE_URL || "").trim();
  const confirm = (env.SEO_LEGACY_BACKFILL_CONFIRM || "").trim();
  if (!write) {
    return { mode: "dry-run", databaseUrl: null };
  }
  if (!databaseUrl) {
    return {
      mode: "refuse",
      reason: "write mode requires SEO_LEGACY_BACKFILL_DATABASE_URL",
    };
  }
  let hostname = "";
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    return { mode: "refuse", reason: "database URL is not parseable" };
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    return {
      mode: "refuse",
      reason: "write mode allows only localhost",
    };
  }
  if (confirm !== "localhost-only") {
    return {
      mode: "refuse",
      reason: "write mode requires SEO_LEGACY_BACKFILL_CONFIRM=localhost-only",
    };
  }
  return { mode: "write-localhost", databaseUrl };
}

function main() {
  const decision = resolveBackfillMode(process.argv.slice(2));
  const preview = readFileSync(PREVIEW_SQL, "utf8");
  if (decision.mode === "dry-run") {
    process.stdout.write(
      `${preview}\n-- dry-run: no database connection, no UPDATE\n`,
    );
    return;
  }
  if (decision.mode === "refuse") {
    process.stderr.write(`seo-legacy-primary-query-backfill: ${decision.reason}\n`);
    process.exitCode = 2;
    return;
  }
  process.stderr.write(
    "seo-legacy-primary-query-backfill: write mode is not executed by this script. Review the preview SQL and apply it only on a non-production database with an explicit operator step.\n",
  );
  process.exitCode = 2;
}

const isDirect = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (isDirect) main();
