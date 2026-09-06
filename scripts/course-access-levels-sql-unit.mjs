#!/usr/bin/env node
/**
 * Parse-only (+ optional isolated Postgres) tests for course access levels.
 * Scratch database only. Never writes to production postgres.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const migrationName = "20260923120000_course_access_levels_foundation.sql";
const previousName = "20260922120000_admin_ratings_analytics.sql";
const migrationPath = join(migrationsDir, migrationName);
const stubPath = join(repoRoot, "scripts/lib/course-access-levels-sql-stub.sql");
const seedPath = join(repoRoot, "scripts/lib/course-access-levels-pre-migration-seed.sql");
const smokePath = join(
  repoRoot,
  "supabase/tests/course_access_levels_foundation_smoke.sql",
);
const dbName = "audiolad_course_access_levels_test";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sql = readFileSync(migrationPath, "utf8");

assert(existsSync(join(migrationsDir, previousName)), "previous latest migration stays intact");
assert(existsSync(migrationPath), "foundation migration exists");

const names = readdirSync(migrationsDir).filter((name) =>
  name.toLowerCase().endsWith(".sql"),
);
const versions = names.map((name) => name.match(/^(\d{8,})_/)?.[1]);
assert(new Set(versions).size === versions.length, "no duplicate timestamps");
assert(versions.includes("20260923120000"), "new stamp is listed");
assert(versions.includes("20260922120000"), "admin_ratings_analytics stamp remains");

assert(/CREATE TABLE IF NOT EXISTS public\.practice_access_levels/.test(sql));
assert(/REFERENCES public\.practices \(id\)/.test(sql));
assert(/ON DELETE CASCADE/.test(sql));
assert(/UNIQUE \(practice_id, level\)/.test(sql));
assert(/practice_access_levels_level_check/.test(sql));
assert(/level >= 1/.test(sql));
assert(/upgrade_price IS NULL OR upgrade_price >= 0/.test(sql));
assert(/currency = 'RUB'/.test(sql));
assert(/ADD COLUMN IF NOT EXISTS required_access_level integer NOT NULL DEFAULT 1/.test(sql));
assert(/course_lessons_required_access_level_check/.test(sql));
assert(/ADD COLUMN IF NOT EXISTS access_level integer NOT NULL DEFAULT 1/.test(sql));
assert(/user_practices_access_level_check/.test(sql));
assert(/CREATE OR REPLACE FUNCTION public\.grant_practice_access/.test(sql));
assert(/GREATEST\(/.test(sql));
assert(/ON CONFLICT \(user_id, practice_id\) DO UPDATE/.test(sql));
assert(/DETAIL = 'course_only'/.test(sql));
assert(/DETAIL = 'legacy_level_1_only'/.test(sql));
assert(/DETAIL = 'level_not_in_catalog'/.test(sql));
assert(/CREATE OR REPLACE FUNCTION public\.grant_practice_purchase_access/.test(sql));
assert(/grant_practice_access\(\s*locked_order\.user_id/.test(sql));
assert(/REVOKE ALL ON FUNCTION public\.grant_practice_access/.test(sql));
assert(/GRANT EXECUTE ON FUNCTION public\.grant_practice_purchase_access\(uuid\)/.test(sql));
assert(/FROM authenticated/.test(sql));
assert(/external_manual/.test(sql));
assert(/service_role must EXECUTE grant_practice_access/.test(sql));
assert(/service_role must EXECUTE grant_practice_purchase_access/.test(sql));
assert(/REVOKE INSERT, UPDATE, DELETE ON TABLE public\.user_practices/.test(sql));
assert(/ENABLE ROW LEVEL SECURITY/.test(sql));
assert(!/user_practices_keep_highest_access_level/.test(sql));
assert(!/user_practices_access_level_monotonic/.test(sql));
assert(!/INSERT INTO public\.practice_access_levels/.test(sql));
assert(!/UPDATE\s+public\.user_practices/i.test(sql));
assert(!/order_kind/.test(sql));
assert(!/target_access_level/.test(sql));
assert(!/DROP TABLE/.test(sql));
assert(!/TRUNCATE/.test(sql));

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

function runPsql(database, input, extraArgs = []) {
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
    const child = dockerAvailable()
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

async function runIsolatedSql() {
  if (!existsSync(stubPath) || !existsSync(seedPath) || !existsSync(smokePath)) {
    throw new Error("course access levels SQL stub, seed, or smoke file is missing");
  }

  adminSql(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
  adminSql(`CREATE DATABASE ${dbName};`);

  const bootstrap = [
    readFileSync(stubPath, "utf8"),
    readFileSync(seedPath, "utf8"),
    readFileSync(migrationPath, "utf8"),
    readFileSync(smokePath, "utf8"),
  ].join("\n");

  runPsql(dbName, bootstrap);

  const userA = "44444444-4444-4444-8444-444444444444";
  const userB = "55555555-5555-4555-8555-555555555555";
  const courseId = "c2222222-2222-4222-8222-222222222222";

  runPsql(
    dbName,
    `
INSERT INTO auth.users (id) VALUES ('${userA}'), ('${userB}');
`,
  );

  const grantSql = (userId, level) =>
    `SELECT public.grant_practice_access('${userId}'::uuid, '${courseId}'::uuid, ${level}, 'admin');`;

  await Promise.all([
    spawnPsql(dbName, grantSql(userA, 1)),
    spawnPsql(dbName, grantSql(userA, 2)),
  ]);

  const levelA = runPsql(
    dbName,
    `SELECT access_level FROM public.user_practices WHERE user_id = '${userA}' AND practice_id = '${courseId}';`,
    ["-At"],
  ).trim();
  assert(levelA === "2", `concurrent 1+2 must settle at 2, got ${levelA}`);

  const countA = runPsql(
    dbName,
    `SELECT count(*) FROM public.user_practices WHERE user_id = '${userA}' AND practice_id = '${courseId}';`,
    ["-At"],
  ).trim();
  assert(countA === "1", `concurrent grants must not duplicate rows, got ${countA}`);

  await Promise.all([
    spawnPsql(dbName, grantSql(userB, 2)),
    spawnPsql(dbName, grantSql(userB, 1)),
  ]);

  const levelB = runPsql(
    dbName,
    `SELECT access_level FROM public.user_practices WHERE user_id = '${userB}' AND practice_id = '${courseId}';`,
    ["-At"],
  ).trim();
  assert(levelB === "2", `concurrent grant 2+1 must settle at 2, got ${levelB}`);
}

const skipIsolatedSql = process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1";

if (!skipIsolatedSql && (dockerAvailable() || localPostgresAvailable())) {
  await runIsolatedSql();
  console.log("course-access-levels-sql-unit: parse + isolated sql ok");
} else {
  console.log(
    skipIsolatedSql
      ? "course-access-levels-sql-unit: parse-only ok (isolated SQL disabled)"
      : "course-access-levels-sql-unit: parse-only ok (no local postgres)",
  );
}
