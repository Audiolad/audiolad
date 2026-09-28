#!/usr/bin/env node
/**
 * Contract + optional isolated scratch-DB smoke for Business Playback Attribution (A3).
 * Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261203120000_business_playback_attribution.sql";
const a1Migration = "20261201120000_business_domain_core.sql";
const a2Migration = "20261202120000_business_player_foundation.sql";
const playbackMigration = "20261127120000_playback_usage_facts.sql";
const authorStatsMigration = "20261130120000_author_stats_listening_time.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const a1Path = join(repoRoot, "supabase/migrations", a1Migration);
const a2Path = join(repoRoot, "supabase/migrations", a2Migration);
const playbackPath = join(repoRoot, "supabase/migrations", playbackMigration);
const authorStatsPath = join(repoRoot, "supabase/migrations", authorStatsMigration);
const stubPath = join(repoRoot, "scripts/lib/business-playback-attribution-sql-stub.sql");
const smokePath = join(repoRoot, "supabase/tests/business_playback_attribution_smoke.sql");
const dbName = "audiolad_business_playback_attribution_test";

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

assert(existsSync(migrationPath), `missing migration ${migrationName}`);
assert(existsSync(a1Path), "missing A1 migration");
assert(existsSync(a2Path), "missing A2 migration");
assert(existsSync(playbackPath), "missing playback_usage_facts migration");
assert(existsSync(authorStatsPath), "missing author_stats migration");
assert(existsSync(stubPath), "missing stub");
assert(existsSync(smokePath), "missing smoke");

const migration = readFileSync(migrationPath, "utf8");
const smoke = readFileSync(smokePath, "utf8");
const stub = readFileSync(stubPath, "utf8");

assert(migration.includes("usage_kind"), "usage_kind column");
assert(migration.includes("'consumer'"), "consumer kind");
assert(migration.includes("'business'"), "business kind");
assert(migration.includes("organization_id"), "organization_id");
assert(migration.includes("location_id"), "location_id");
assert(migration.includes("zone_id"), "zone_id");
assert(migration.includes("player_id"), "player_id");
assert(migration.includes("playback_usage_contexts_usage_kind_attribution_check"), "contexts attribution check");
assert(migration.includes("playback_usage_facts_usage_kind_attribution_check"), "facts attribution check");
assert(migration.includes("AND f.usage_kind = 'consumer'"), "consumer filter on analytics");
assert(
  (migration.match(/AND f\.usage_kind = 'consumer'/g) || []).length >= 2,
  "consumer filter on admin + author facts",
);
assert(migration.includes("apply_business_playback_usage_heartbeat"), "B2B RPC");
assert(migration.includes("'business:' ||"), "listening_key composed server-side");
assert(migration.includes("FOR SHARE"), "player row share lock");
assert(migration.includes("player_not_assigned"), "not assigned reject");
assert(migration.includes("client_event_identity_conflict"), "identity-safe idempotency");
assert(!/\bSET\s+royalty_eligible_ms\s*=/i.test(migration), "must not SET royalty_eligible_ms");
assert(!/\bSET\s+billing_period_start\s*=/i.test(migration), "must not SET billing_period_start");
assert(migration.includes("Evidence only"), "evidence-only comment");
assert(migration.includes("last_reported_at = CASE"), "reassignment re-baseline clears last_reported_at");
assert(migration.includes("canonical playback event time"), "occurred_at column comment");
assert(migration.includes("ledger write time"), "created_at / ledger write time semantics");
{
  const docs = [
    readFileSync(join(repoRoot, "docs/DATABASE.md"), "utf8"),
    readFileSync(join(repoRoot, "docs/ARCHITECTURE.md"), "utf8"),
    readFileSync(join(repoRoot, "docs/DECISIONS.md"), "utf8"),
  ].join("\n");
  const affirmativeServerTime = [
    /`occurred_at`\s*=\s*server time/i,
    /occurred_at\s*=\s*server time(?!\s+as\s+a\s+forever)/i,
    /- `occurred_at` = server time/i,
  ];
  for (const re of affirmativeServerTime) {
    const m = docs.match(re);
    if (m) {
      const idx = docs.search(re);
      const window = docs.slice(Math.max(0, idx - 60), idx + 80);
      assert(
        /do not|не универсал|forever-universal synonym|not a universal/i.test(window),
        "docs must not claim universal occurred_at = server time; near: " + window.replace(/\s+/g, " "),
      );
    }
  }
  assert(!/- `occurred_at` = server time\n/i.test(docs), "DATABASE bullet must not be occurred_at = server time");
  assert(docs.includes("canonical playback event time"), "docs: canonical playback event time");
  assert(docs.includes("online"), "docs: online A3 path");
  assert(
    /re-baselines media-time|reassignment re-baselines|первый sample нового assignment = media-time baseline/i.test(docs),
    "docs: reassignment re-baseline",
  );
  const projectState = readFileSync(join(repoRoot, "docs/PROJECT_STATE.md"), "utf8");
  assert(
    /online evidence foundation/i.test(projectState),
    "PROJECT_STATE: online evidence foundation implemented",
  );
  assert(
    !/Proof of Play \/ B2B attribution \/ billing/i.test(projectState),
    "PROJECT_STATE must not lump B2B attribution with unimplemented Proof of Play",
  );
  assert(/в рамках A[3-5]/i.test(projectState), "PROJECT_STATE stop flags refer to A3+ Foundation draft");
}

assert(migration.includes("audio_item_not_music"), "music-only gate");
assert(migration.includes("v_row.usage_kind"), "fact copies usage_kind from context");
assert(migration.includes("v_row.organization_id"), "fact copies org from context");
assert(!/CREATE TABLE[\s\S]*business_playback_facts/i.test(migration), "no second ledger table");
assert(!/proof_of_play_facts/i.test(migration), "no proof_of_play_facts");
assert(!/business_usage_ledger/i.test(migration), "no business_usage_ledger");
assert(!/BUSINESS_HOME_MOCK/.test(migration), "no UI mock wiring");
assert(!/music_passport|sonic_dna|bpm|rights_passport/i.test(migration), "no analyzer/passport");
assert(
  /GRANT EXECUTE ON FUNCTION public\.apply_business_playback_usage_heartbeat\([^)]+\)\s+TO anon/i.test(migration),
  "anon execute B2B RPC",
);
assert(migration.includes("destructive FK on B2B snapshot columns"), "post-check no FK");
assert(migration.includes("browser roles must not SELECT facts"), "post-check no SELECT");
assert(
  migration.includes("idx_playback_usage_facts_business_org_occurred")
    || migration.includes("(organization_id, occurred_at)"),
  "org partial index",
);
assert(
  migration.includes("idx_playback_usage_facts_business_player_occurred")
    || migration.includes("(player_id, occurred_at)"),
  "player partial index",
);

assert(smoke.includes("Case1"), "smoke Case1");
assert(smoke.includes("Case2/3"), "smoke Case2/3");
assert(smoke.includes("Case4"), "smoke Case4");
assert(smoke.includes("Case5-7"), "smoke Case5-7");
assert(smoke.includes("Case9"), "smoke Case9");
assert(smoke.includes("Case10"), "smoke Case10");
assert(smoke.includes("Case11"), "smoke Case11");
assert(smoke.includes("Case12"), "smoke Case12");
assert(smoke.includes("Case13"), "smoke Case13");
assert(smoke.includes("Case14"), "smoke Case14");
assert(smoke.includes("Case15"), "smoke Case15");
assert(smoke.includes("Case16"), "smoke Case16");
assert(smoke.includes("Case17"), "smoke Case17");
assert(smoke.includes("first sample after reassignment must baseline"), "smoke reassignment baseline");
assert(smoke.includes("v_session, 7, audio_id2"), "smoke same session after reassignment");
assert(smoke.includes("Case18"), "smoke Case18");
assert(smoke.includes("Case23"), "smoke Case23");
assert(smoke.includes("Case24"), "smoke Case24");
assert(smoke.includes("Case25"), "smoke Case25");
assert(smoke.includes("Case26"), "smoke Case26");
assert(smoke.includes("Case27"), "smoke Case27");
assert(smoke.includes("Case28"), "smoke Case28");
assert(smoke.includes("player_not_assigned"), "smoke not assigned");
assert(smoke.includes("client_event_identity_conflict"), "smoke identity conflict");
assert(smoke.includes("playback_usage_admin_facts"), "smoke admin isolation");
assert(smoke.includes("author_stats_listening_facts"), "smoke author isolation");
assert(!/CREATE EXTENSION IF NOT EXISTS pgcrypto/i.test(stub), "stub must not install pgcrypto");

function runIsolatedSql() {
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") {
    return "skipped";
  }
  const sql = [
    stub,
    readFileSync(playbackPath, "utf8"),
    readFileSync(authorStatsPath, "utf8"),
    readFileSync(a1Path, "utf8"),
    readFileSync(a2Path, "utf8"),
    migration,
    smoke,
  ].join("\n");
  const container = dockerAvailable() ? resolveDockerDbContainer() : null;
  if (!container) {
    console.log("business-playback-attribution-sql-unit: contract ok; isolated SQL skipped (no docker db)");
    return "no-db";
  }

  execFileSync(
    "docker",
    [
      "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1",
      "-c", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "docker",
    [
      "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1",
      "-c", `CREATE DATABASE ${dbName};`,
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "docker",
    [
      "exec", "-i", container, "psql", "-U", "postgres", "-d", dbName,
      "-v", "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "pipe", "inherit"] },
  );
  return `docker:${container}`;
}

const mode = runIsolatedSql();
console.log(`business-playback-attribution-sql-unit: ok (${mode})`);
