#!/usr/bin/env node
/**
 * Parse checks plus an optional disposable Postgres smoke for guest ratings.
 * The smoke creates its own cluster and never uses production postgres.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20270116120000_guest_practice_ratings.sql";
const migration = readFileSync(
  join(repoRoot, "supabase/migrations", migrationName),
  "utf8",
);

const tables = [
  "guest_listen_stats",
  "guest_listen_item_credit",
  "guest_practice_ratings",
  "guest_practice_rating_events",
  "guest_captcha_tokens",
  "guest_rating_activity",
  "guest_rating_network_guests",
];

for (const table of tables) {
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  assert.match(
    migration,
    new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`),
  );
  assert.match(
    migration,
    new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`),
  );
  assert.match(migration, new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`));
}

assert.match(migration, /UNIQUE \(guest_id, practice_id\)/);
assert.match(migration, /CHECK \(stars >= 1 AND stars <= 5\)/);
assert.match(migration, /token_hash text PRIMARY KEY/);
assert.match(migration, /guest_rating_listen_threshold_ms/);
assert.match(migration, /RETURN 30000/);
assert.match(migration, /v_duration <= 5000/);
assert.match(migration, /v_duration \* 0\.8/);
assert.match(migration, /v_elapsed > 20000/);
assert.match(migration, /LEAST\(v_accepted, 15000\)/);
assert.match(migration, /FLOOR\(v_elapsed \* 1\.5\)/);
assert.match(migration, /high_water_ms/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /SET search_path = public, pg_temp/);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.guest_rating_listen_threshold_ms\(bigint\) FROM PUBLIC, anon, authenticated/,
);
assert.match(migration, /p_copy_to_account boolean DEFAULT false/);
assert.match(migration, /IF COALESCE\(p_copy_to_account, false\) THEN/);
assert.match(migration, /PERFORM public\.set_practice_rating/);
assert.match(migration, /action := 'linked'/);
assert.match(migration, /captcha_failures = public\.guest_rating_activity\.captcha_failures \+ 1/);
assert.match(migration, /reset_guest_captcha_failures/);
assert.match(migration, /superseded_reason = 'account_vote'/);
assert.match(migration, /superseded_reason = 'claimed_to_account'/);
assert.match(migration, /action IN \('first', 'changed', 'claimed', 'superseded', 'linked'\)/);
{
  const copyAt = migration.indexOf("IF COALESCE(p_copy_to_account, false) THEN");
  const performAt = migration.indexOf("PERFORM public.set_practice_rating");
  const linkedAt = migration.indexOf("action := 'linked'");
  assert.ok(copyAt >= 0 && performAt > copyAt && linkedAt > performAt);
}
assert.match(migration, /v_row\.stars = p_stars/);
{
  const claimAt = migration.indexOf("CREATE OR REPLACE FUNCTION public.claim_guest_practice_ratings");
  const loopAt = migration.indexOf("FOR v_guest IN", claimAt);
  const exclAt = migration.indexOf("AND excluded_at IS NULL", loopAt);
  const forUpdateAt = migration.indexOf("FOR UPDATE", loopAt);
  assert.ok(claimAt >= 0 && loopAt > claimAt && exclAt > loopAt && forUpdateAt > exclAt);
}
assert.equal(
  migration.match(/IF FOUND AND \(v_row\.superseded_at IS NOT NULL OR v_row\.claimed_by_user_id IS NOT NULL\) THEN/g)?.length,
  2,
);
assert.doesNotMatch(migration, /CREATE POLICY/);
assert.doesNotMatch(migration, /INSERT INTO auth\.users/i);
assert.doesNotMatch(migration, /DELETE FROM/i);
assert.doesNotMatch(migration, /DROP TABLE/i);
assert.doesNotMatch(migration, /ALTER TABLE public\.practice_ratings/);
assert.doesNotMatch(migration, /ALTER TABLE public\.practice_listen_stats/);

for (const line of migration.split("\n")) {
  if (!line.includes("GRANT ")) continue;
  assert.doesNotMatch(line, / TO (PUBLIC|anon|authenticated)\b/);
}

function findPgBin() {
  const candidates = [];
  if (process.env.AUDIOLAD_PG_BINDIR) candidates.push(process.env.AUDIOLAD_PG_BINDIR);
  try {
    candidates.push(execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim());
  } catch {
    /* ignore */
  }
  try {
    for (const version of readdirSync("/usr/lib/postgresql").sort().reverse()) {
      candidates.push(`/usr/lib/postgresql/${version}/bin`);
    }
  } catch {
    /* ignore */
  }
  return (
    candidates.find(
      (dir) => existsSync(join(dir, "initdb")) && existsSync(join(dir, "pg_ctl")),
    ) ?? null
  );
}

function runIsolatedSmoke() {
  const bin = findPgBin();
  if (!bin || process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") {
    console.log(
      bin
        ? "guest-ratings-sql-unit: parse-only ok (isolated SQL disabled)"
        : "guest-ratings-sql-unit: parse-only ok (no local postgres)",
    );
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "al-guest-ratings-pg-"));
  const data = join(dir, "data");
  const port = String(20000 + Math.floor(Math.random() * 30000));
  let started = false;
  try {
    execFileSync(join(bin, "initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--no-sync"], {
      stdio: "ignore",
    });
    execFileSync(
      join(bin, "pg_ctl"),
      [
        "-D",
        data,
        "-w",
        "-l",
        join(dir, "pg.log"),
        "-o",
        `-k ${dir} -p ${port} -c listen_addresses=''`,
        "start",
      ],
      { stdio: "ignore" },
    );
    started = true;
    const sql = [
      readFileSync(join(repoRoot, "scripts/lib/guest-ratings-smoke.sql"), "utf8"),
      migration,
      readFileSync(join(repoRoot, "supabase/tests/guest_practice_ratings_smoke.sql"), "utf8"),
    ].join("\n");
    const psql = existsSync(join(bin, "psql")) ? join(bin, "psql") : "psql";
    const out = execFileSync(
      psql,
      ["-X", "-h", dir, "-p", port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"],
      { input: sql, stdio: ["pipe", "pipe", "inherit"] },
    ).toString();
    assert.match(out, /guest_practice_ratings_smoke: PASS/);
    console.log("guest-ratings-sql-unit: parse + isolated RLS/eligibility ok");
  } finally {
    if (started) {
      try {
        execFileSync(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "stop"], {
          stdio: "ignore",
        });
      } catch {
        /* ignore */
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

runIsolatedSmoke();
