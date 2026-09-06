#!/usr/bin/env node
/**
 * Parse-only + optional isolated Postgres tests for Phase 5 access links.
 * Scratch / local isolated database only. Never writes to production.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const previousName = "20260925120600_course_upgrade_canonical_sales_amount_match.sql";
const migrationName = "20260926120000_practice_access_links.sql";
const reactivateName = "20260927120000_practice_access_link_permanent_entitlement.sql";
const foundationName = "20260923120100_course_access_levels_foundation.sql";
const stubPath = join(repoRoot, "scripts/lib/course-access-levels-sql-stub.sql");
const extraStubPath = join(repoRoot, "scripts/lib/practice-access-links-sql-stub.sql");
const seedPath = join(repoRoot, "scripts/lib/course-access-levels-pre-migration-seed.sql");
const smokePath = join(repoRoot, "supabase/tests/practice_access_links_smoke.sql");
const dbName = "audiolad_practice_access_links_test";
const isolatedDbName = "audiolad_practice_access_links_isolated";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sql = readFileSync(join(migrationsDir, migrationName), "utf8");

assert(existsSync(join(migrationsDir, previousName)), "previous latest migration stays intact");
assert(existsSync(join(migrationsDir, migrationName)), "access links migration exists");
assert(existsSync(join(migrationsDir, reactivateName)), "permanent entitlement follow-up exists");

const names = readdirSync(migrationsDir).filter((name) =>
  name.toLowerCase().endsWith(".sql"),
);
const versions = names.map((name) => name.match(/^(\d{8,})_/)?.[1]);
assert(new Set(versions).size === versions.length, "no duplicate timestamps");
assert(versions.includes("20260926120000"), "new stamp is listed");
assert(versions.includes("20260927120000"), "reactivate stamp is listed");
assert(versions.includes("20260925120600"), "phase 4 stamp remains");

assert(/CREATE TABLE IF NOT EXISTS public\.practice_access_links/.test(sql));
assert(/token_hash text NOT NULL/.test(sql));
assert(/token_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(sql));
assert(/UNIQUE \(token_hash\)/.test(sql));
assert(/status IN \('active', 'redeemed', 'revoked'\)/.test(sql));
assert(/CREATE OR REPLACE FUNCTION public\.redeem_practice_access_link/.test(sql));
assert(/CREATE OR REPLACE FUNCTION public\.preview_practice_access_link/.test(sql));
assert(/FOR UPDATE/.test(sql));
assert(/grant_practice_access\(/.test(sql));
assert(/'external_manual'/.test(sql));
assert(/granted_via', 'external_access_link'/.test(sql));
assert(/already_redeemed_by_you/.test(sql));
assert(/link_already_used/.test(sql));
assert(/target_level_not_configured/.test(sql));
assert(/ENABLE ROW LEVEL SECURITY/.test(sql));
assert(/authenticated must not INSERT practice_access_links/.test(sql));
assert(/authenticated must not SELECT practice_access_links/.test(sql));
assert(/authenticated must not EXECUTE redeem_practice_access_link/.test(sql));
assert(/GRANT EXECUTE ON FUNCTION public\.redeem_practice_access_link\(text, uuid\)/.test(sql));
assert(!/DROP TABLE/.test(sql));
assert(!/TRUNCATE/.test(sql));
assert(!/tochka|orders|payment|finance/i.test(sql.replace(/COMMENT[\s\S]*?;/g, "")));

const reactivateSql = readFileSync(join(migrationsDir, reactivateName), "utf8");
assert(/CREATE OR REPLACE FUNCTION public\.activate_permanent_practice_access/.test(reactivateSql));
assert(/SET expires_at = NULL/.test(reactivateSql));
assert(/entitlement_still_expired/.test(reactivateSql));
assert(/PERFORM public\.activate_permanent_practice_access/.test(reactivateSql));
assert(/grant_practice_access\(/.test(reactivateSql));
assert(!/DROP TABLE/.test(reactivateSql));
assert(!/ALTER FUNCTION public\.grant_practice_access/.test(reactivateSql));

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function localPostgresAvailable() {
  try {
    execFileSync("sudo", ["-n", "-u", "postgres", "psql", "-c", "SELECT 1"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function isolatedDatabaseUrl() {
  return process.env.AUDIOLAD_PRACTICE_ACCESS_LINKS_DATABASE_URL || "";
}

function runPsql(database, input, extraArgs = []) {
  const url = isolatedDatabaseUrl();
  if (url && database === isolatedDbName) {
    return execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", ...extraArgs], {
      input,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  }

  if (dockerAvailable()) {
    const container = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        ...extraArgs,
      ],
      { input, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  }

  return execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", ...extraArgs],
    { input, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
}

function adminSql(sqlText) {
  const url = isolatedDatabaseUrl();
  if (url) {
    const adminUrl = url.replace(/\/[^/]+$/, "/postgres");
    return execFileSync("psql", [adminUrl, "-v", "ON_ERROR_STOP=1", "-c", sqlText], {
      encoding: "utf8",
    });
  }

  if (dockerAvailable()) {
    const container = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sqlText,
      ],
      { encoding: "utf8" },
    );
  }

  return execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", sqlText],
    { encoding: "utf8" },
  );
}

function spawnPsql(database, input) {
  return new Promise((resolve, reject) => {
    const url = isolatedDatabaseUrl();
    const child =
      url && database === isolatedDbName
        ? spawn("psql", [url, "-v", "ON_ERROR_STOP=1", "-At", "-c", input], {
            stdio: ["ignore", "pipe", "pipe"],
          })
        : dockerAvailable()
          ? spawn(
              "docker",
              [
                "exec",
                "-i",
                process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db",
                "psql",
                "-U",
                "postgres",
                "-d",
                database,
                "-v",
                "ON_ERROR_STOP=1",
                "-At",
                "-c",
                input,
              ],
              { stdio: ["ignore", "pipe", "pipe"] },
            )
          : spawn(
              "sudo",
              [
                "-n",
                "-u",
                "postgres",
                "psql",
                "-d",
                database,
                "-v",
                "ON_ERROR_STOP=1",
                "-At",
                "-c",
                input,
              ],
              { stdio: ["ignore", "pipe", "pipe"] },
            );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || stdout || `psql exited ${code}`));
      }
    });
  });
}

async function runIsolatedSql(targetDb) {
  if (
    !existsSync(stubPath) ||
    !existsSync(extraStubPath) ||
    !existsSync(seedPath) ||
    !existsSync(join(migrationsDir, reactivateName)) ||
    !existsSync(smokePath)
  ) {
    throw new Error("access links SQL stub, seed, or smoke file is missing");
  }

  if (!isolatedDatabaseUrl() || targetDb !== isolatedDbName) {
    adminSql(`DROP DATABASE IF EXISTS ${targetDb} WITH (FORCE);`);
    adminSql(`CREATE DATABASE ${targetDb};`);
  }

  const bootstrap = [
    readFileSync(stubPath, "utf8"),
    readFileSync(extraStubPath, "utf8"),
    readFileSync(seedPath, "utf8"),
    readFileSync(join(migrationsDir, foundationName), "utf8"),
    readFileSync(join(migrationsDir, migrationName), "utf8"),
    readFileSync(join(migrationsDir, reactivateName), "utf8"),
    readFileSync(smokePath, "utf8"),
  ].join("\n");

  runPsql(targetDb, bootstrap);

  const hashA = runPsql(
    targetDb,
    `SELECT encode(digest('raceTokenA000000000000000000000000000015', 'sha256'), 'hex');`,
    ["-At"],
  ).trim();
  const hashUnused = runPsql(
    targetDb,
    `SELECT encode(digest('raceTokenB000000000000000000000000000016', 'sha256'), 'hex');`,
    ["-At"],
  ).trim();
  assert(hashA.length === 64, "race token hash A");
  assert(hashUnused.length === 64, "race token hash B");

  runPsql(
    targetDb,
    `
SELECT public.create_practice_access_link(
  'c2222222-2222-4222-8222-222222222222',
  2,
  '${hashA}',
  '33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);
`,
  );

  const userA = "77777777-7777-4777-8777-777777777777";
  const userB = "88888888-8888-4888-8888-888888888888";
  runPsql(
    targetDb,
    `INSERT INTO auth.users (id) VALUES ('${userA}'), ('${userB}');`,
  );

  const results = await Promise.allSettled([
    spawnPsql(
      targetDb,
      `SELECT public.redeem_practice_access_link('${hashA}', '${userA}');`,
    ),
    spawnPsql(
      targetDb,
      `SELECT public.redeem_practice_access_link('${hashA}', '${userB}');`,
    ),
  ]);

  const winners = results.filter((item) => item.status === "fulfilled");
  const losers = results.filter((item) => item.status === "rejected");
  assert(winners.length === 1, `exactly one race winner, got ${winners.length}`);
  assert(losers.length === 1, `exactly one race loser, got ${losers.length}`);
  assert(
    String(losers[0].reason).includes("link_already_used") ||
      String(losers[0].reason).includes("already_redeemed_by_you"),
    `loser must be deterministic, got ${losers[0].reason}`,
  );

  const redeemedCount = runPsql(
    targetDb,
    `SELECT count(*) FROM public.practice_access_links WHERE token_hash = '${hashA}' AND status = 'redeemed';`,
    ["-At"],
  ).trim();
  assert(redeemedCount === "1", `race must redeem once, got ${redeemedCount}`);

  const entitlementCount = runPsql(
    targetDb,
    `SELECT count(*) FROM public.user_practices WHERE practice_id = 'c2222222-2222-4222-8222-222222222222' AND user_id IN ('${userA}', '${userB}');`,
    ["-At"],
  ).trim();
  assert(
    entitlementCount === "1",
    `race must grant exactly one user, got ${entitlementCount}`,
  );
}

const forceIsolated = process.env.AUDIOLAD_PRACTICE_ACCESS_LINKS_ISOLATED === "1";
const skipIsolatedSql = process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1";

if (forceIsolated) {
  await runIsolatedSql(isolatedDatabaseUrl() ? isolatedDbName : isolatedDbName);
  console.log("practice-access-links-sql-unit: isolated sql ok");
} else if (!skipIsolatedSql && (dockerAvailable() || localPostgresAvailable())) {
  await runIsolatedSql(dbName);
  console.log("practice-access-links-sql-unit: parse + isolated sql ok");
} else {
  console.log(
    skipIsolatedSql
      ? "practice-access-links-sql-unit: parse-only ok (isolated SQL disabled)"
      : "practice-access-links-sql-unit: parse-only ok (no local postgres)",
  );
}
