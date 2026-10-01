#!/usr/bin/env node
/**
 * Contract + scratch-DB smoke for Music Passport Basic (P1-01).
 * Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261214120000_music_passport_basic.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const stubPath = join(repoRoot, "scripts/lib/business-rights-foundation-sql-stub.sql");
const smokePath = join(repoRoot, "supabase/tests/music_passport_basic_smoke.sql");
const dbName = "audiolad_music_passport_basic_test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function resolveDockerDbContainer() {
  if (process.env.AUDIOLAD_SUPABASE_DB_CONTAINER?.trim()) {
    return process.env.AUDIOLAD_SUPABASE_DB_CONTAINER.trim();
  }
  const candidates = ["supabase-db", "audiolad-seo-attach-pg", "audiolad-test-db"];
  for (const name of candidates) {
    try {
      execFileSync(
        "docker",
        ["exec", name, "psql", "-U", "postgres", "-c", "SELECT 1"],
        { stdio: "ignore" },
      );
      return name;
    } catch {
      // try next
    }
  }
  return null;
}

function localPostgresAvailable() {
  try {
    execFileSync("sudo", ["-u", "postgres", "psql", "-d", "postgres", "-c", "SELECT 1"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

assert(existsSync(migrationPath), `missing migration ${migrationName}`);
assert(existsSync(stubPath), "missing stub");
assert(existsSync(smokePath), "missing smoke");

const migration = readFileSync(migrationPath, "utf8");
const smoke = readFileSync(smokePath, "utf8");
const stub = readFileSync(stubPath, "utf8");
const contract = readFileSync(
  join(repoRoot, "src/lib/music-passport/contract.ts"),
  "utf8",
);

assert(migration.includes("CREATE TABLE IF NOT EXISTS public.music_passport_versions"), "versions table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.music_passport_attributes"), "attributes table");
assert(migration.includes("get_music_passport_basic"), "read rpc");
assert(migration.includes("upsert_music_passport_basic"), "write rpc");
assert(migration.includes("NO_PASSPORT"), "fail closed status");
assert(migration.includes("HAS_PASSPORT"), "present status");
assert(migration.includes("'measured'"), "measured origin");
assert(migration.includes("'interpreted'"), "interpreted origin");
assert(migration.includes("music_passport_measured_confidence_required"), "measured confidence");
assert(migration.includes("'musical_key'"), "key slot");
assert(migration.includes("'genre_class'"), "genre slot");
assert(migration.includes("'mood'"), "mood slot");
assert(migration.includes("'bpm'"), "bpm slot");
assert(migration.includes("'energy'"), "energy slot");
assert(migration.includes("'loudness_lufs'"), "loudness slot");
assert(migration.includes("'vocal_role'"), "vocal slot");
assert(migration.includes("'instrument'"), "instrument slot");
assert(migration.includes("analysis_version"), "analysis version");
assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "RLS");
assert(migration.includes("REVOKE ALL ON TABLE public.music_passport_versions FROM PUBLIC, anon, authenticated"), "revoke versions");
assert(migration.includes("GRANT EXECUTE ON FUNCTION public.get_music_passport_basic"), "read execute");
assert(migration.includes("GRANT EXECUTE ON FUNCTION public.upsert_music_passport_basic"), "write execute");
assert(!/ALTER TABLE public\.audio_items/i.test(migration), "track identity table untouched");
assert(!/music_track_code_seq/i.test(migration), "track code issuer untouched");
assert(!/CREATE TABLE[^;]*music_rights_grants/i.test(migration), "no rights table");
assert(!/INSERT INTO public\.music_rights/i.test(migration), "no rights seed");
assert(!/CREATE TABLE[^;]*music_lab_/i.test(migration), "no lab table");
assert(!/INSERT INTO public\.music_lab_/i.test(migration), "no lab write");
assert(!/INSERT INTO public\.music_passport_versions[\s\S]{0,120}SELECT/i.test(migration), "no passport backfill select");
assert(!/INSERT INTO public\.audio_items/i.test(migration), "no audio seed");
assert(!/\bELIGIBLE\b/.test(migration), "no eligibility token");
assert(!/\blicensed\b/i.test(migration), "no licensed flag");
assert(!/ALTER TABLE public\.playback_usage_facts/i.test(migration), "no playback ledger change");
assert(migration.includes("audio_item_not_found"), "missing track");
assert(migration.includes("audio_item_not_music"), "non-music");
assert(migration.includes("music_track_code_required"), "identity required");
assert(migration.includes("music_passport_attribute_sealed"), "sealed attributes");
assert(smoke.includes("Case2"), "smoke empty read");
assert(smoke.includes("Case13"), "smoke measured vs interpreted");
assert(smoke.includes("Case17"), "smoke history");
assert(smoke.includes("NO_PASSPORT"), "smoke fail closed");
assert(!/\bELIGIBLE\b/.test(smoke), "smoke has no eligibility token");
assert(contract.includes("get_music_rights_passport_basic"), "contract names the other passport");
assert(contract.includes("NO_PASSPORT"), "contract fail closed");
assert(!/\beligible\s*=\s*true/i.test(contract), "contract does not claim eligibility");

{
  const docs = [
    readFileSync(join(repoRoot, "docs/DATABASE.md"), "utf8"),
    readFileSync(join(repoRoot, "docs/ARCHITECTURE.md"), "utf8"),
    readFileSync(join(repoRoot, "docs/DECISIONS.md"), "utf8"),
    readFileSync(join(repoRoot, "docs/PROJECT_STATE.md"), "utf8"),
  ].join("\n");
  assert(docs.includes("music_passport_versions"), "docs: versions table");
  assert(/measured/.test(docs) && /interpreted/.test(docs), "docs: origin split");
  assert(docs.includes("get_music_passport_basic"), "docs: read rpc");
  assert(docs.includes("NO_PASSPORT"), "docs: fail closed");
  assert(/music_lab/.test(docs), "docs: lab stays separate");
  assert(/get_music_rights_passport_basic/.test(docs), "docs: rights passport stays named");
}

function runSql(db, input) {
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", db, "-v", "ON_ERROR_STOP=1"],
    { input, stdio: ["pipe", "pipe", "inherit"] },
  );
}

function runDockerSql(container, db, input) {
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"],
    { input, stdio: ["pipe", "pipe", "inherit"] },
  );
}

function runIsolatedSql() {
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") {
    return "skipped";
  }
  const sql = [stub, migration, smoke].join("\n");
  const container = dockerAvailable() ? resolveDockerDbContainer() : null;
  if (container) {
    execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
        "-c", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`],
      { stdio: "ignore" },
    );
    execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
        "-c", `CREATE DATABASE ${dbName};`],
      { stdio: "ignore" },
    );
    runDockerSql(container, dbName, sql);
    return `docker:${container}`;
  }

  if (!localPostgresAvailable()) {
    console.log("music-passport-basic-sql-unit: contract ok; isolated SQL skipped (no postgres)");
    return "no-db";
  }

  runSql("postgres", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);\nCREATE DATABASE ${dbName};\n`);
  runSql(dbName, sql);
  return "local-postgres";
}

const mode = runIsolatedSql();
console.log(`music-passport-basic-sql-unit: ok (${mode})`);
