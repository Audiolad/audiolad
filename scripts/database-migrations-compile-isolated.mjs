#!/usr/bin/env node
/**
 * Applies the documented empty-database baseline path to a disposable,
 * localhost-only Supabase Postgres database. It never reads production config.
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  listLocalMigrationFiles,
  planDatabaseMigrations,
} from "../deploy/scripts/lib/database-migrations-plan.mjs";

const adminUrl = process.env.AUDIOLAD_MIGRATION_COMPILE_ADMIN_URL ?? "";
const expectedDatabase = "audiolad_migration_compile_isolated";
const targetVersion = "20261006120200";
const preMigrationFixtures = new Map([
  [
    "20260714180000",
    {
      label: "pre-unified-audio legacy fixture",
      path: "scripts/lib/supabase-compile-pre-unified-audio-seed.sql",
    },
  ],
]);
const baselineEquivalentVersions = [
  "20260710115506",
  "20260710122053",
  "20260710123015",
  "20260710123518",
  "20260710125301",
  "20260711071529",
];

function isolatedUrl(value, database) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("AUDIOLAD_MIGRATION_COMPILE_ADMIN_URL must be a PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("migration compile only permits a localhost PostgreSQL URL");
  }
  url.pathname = `/${database}`;
  return url.toString();
}

function runPsql(url, args) {
  const result = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", ...args], {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`psql failed (${args.join(" ")})`);
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function applyFile(label, file) {
  process.stdout.write(`Applying ${label}: ${file}\n`);
  try {
    runPsql(databaseUrl, ["-f", file]);
  } catch (error) {
    throw new Error(`SQL compile failed while applying ${label} (${file}): ${error.message}`);
  }
}

const validatedAdminUrl = isolatedUrl(adminUrl, "postgres");
const databaseUrl = isolatedUrl(adminUrl, expectedDatabase);
runPsql(validatedAdminUrl, ["-c", `CREATE DATABASE ${expectedDatabase};`]);

const root = resolve(new URL("..", import.meta.url).pathname);
const migrationDirectory = resolve(root, "supabase/migrations");
const migrations = listLocalMigrationFiles(migrationDirectory);
if (migrations.duplicates.length > 0) {
  throw new Error(`duplicate migration versions: ${JSON.stringify(migrations.duplicates)}`);
}

const baselineFiles = readdirSync(resolve(root, "supabase/baseline"))
  .filter((file) => /^\d{4}.*\.sql$/i.test(file))
  .sort()
  .map((file) => resolve(root, "supabase/baseline", file));
if (baselineFiles.length !== 5) {
  throw new Error(`expected five baseline files, found ${baselineFiles.length}`);
}

const knownVersions = new Set(migrations.versions);
for (const version of baselineEquivalentVersions) {
  if (!knownVersions.has(version)) throw new Error(`baseline equivalent migration is missing: ${version}`);
}

applyFile("Supabase prerequisites", resolve(root, "scripts/lib/supabase-compile-prerequisites.sql"));
for (const file of baselineFiles) applyFile("baseline", file);

runPsql(databaseUrl, [
  "-c",
  "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY);",
]);
runPsql(databaseUrl, [
  "-c",
  `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ${baselineEquivalentVersions.map((version) => `(${sqlLiteral(version)})`).join(", ")} ON CONFLICT DO NOTHING;`,
]);

const plan = planDatabaseMigrations({
  localVersions: migrations.versions.filter((version) => version <= targetVersion),
  remoteVersions: baselineEquivalentVersions,
});
if (plan.action !== "apply") throw new Error(`unexpected baseline migration plan: ${plan.code}`);

const pending = new Set(plan.pending);
for (const migration of migrations.files) {
  if (migration.version > targetVersion || !pending.has(migration.version)) continue;
  const fixture = preMigrationFixtures.get(migration.version);
  if (fixture) applyFile(fixture.label, resolve(root, fixture.path));
  applyFile(`migration ${migration.version}`, migration.path);
  runPsql(databaseUrl, [
    "-c",
    `INSERT INTO supabase_migrations.schema_migrations (version) VALUES (${sqlLiteral(migration.version)});`,
  ]);
}

if (!pending.has("20261006120000") || !pending.has("20261006120200")) {
  throw new Error("analytics migrations were not included in the disposable replay");
}
applyFile("post-apply analytics smoke", resolve(root, "supabase/tests/database_migrations_compile_analytics_smoke.sql"));
process.stdout.write(`REAL SQL COMPILE: passed through ${targetVersion} (${pending.size} incremental migrations)\n`);
