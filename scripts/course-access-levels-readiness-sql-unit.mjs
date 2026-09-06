#!/usr/bin/env node
/**
 * Parse-only (+ optional isolated Postgres) tests for course access-level
 * moderation readiness. Scratch database only. Never writes to production.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ACCESS_LEVEL_READINESS_CASES } from "./lib/course-access-levels-readiness-cases.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const previousFunction = "20260913120000_minimal_product_moderation_readiness.sql";
const oldCourseFunction = "20260902120000_course_moderation_readiness.sql";
const migrationName = "20260924120000_course_access_levels_moderation_readiness.sql";
const previousLatest = "20260923120100_course_access_levels_foundation.sql";
const migrationPath = join(migrationsDir, migrationName);
const stubPath = join(
  repoRoot,
  "scripts/lib/course-access-levels-readiness-sql-stub.sql",
);
const smokePath = join(
  repoRoot,
  "supabase/tests/course_access_levels_readiness_smoke.sql",
);
const dbName = "audiolad_course_access_levels_readiness_test";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sql = readFileSync(migrationPath, "utf8");
const previousSql = readFileSync(join(migrationsDir, previousFunction), "utf8");
const oldCourseSql = readFileSync(join(migrationsDir, oldCourseFunction), "utf8");

assert(existsSync(join(migrationsDir, previousLatest)), "previous latest migration stays intact");
assert(existsSync(migrationPath), "new readiness migration exists");
assert(existsSync(join(migrationsDir, previousFunction)), "v5 function file stays intact");

const names = readdirSync(migrationsDir).filter((name) =>
  name.toLowerCase().endsWith(".sql"),
);
const versions = names.map((name) => name.match(/^(\d{8,})_/)?.[1]);
assert(new Set(versions).size === versions.length, "no duplicate timestamps");
assert(versions.includes("20260924120000"), "new stamp is listed");
assert(versions.includes("20260923120100"), "foundation stamp remains");
assert(versions.includes("20260913120000"), "v5 stamp remains");

assert(/CREATE OR REPLACE FUNCTION public\.assert_practice_moderation_ready/.test(sql));
assert(/internal-moderation-readiness:v6/.test(sql));
assert(!/internal-moderation-readiness:v5;/.test(sql));
assert(/internal-moderation-readiness:v5/.test(previousSql));
assert(/internal-moderation-readiness:v4/.test(oldCourseSql));
assert(!/DETAIL = 'missing_access_level_1'/.test(previousSql));
assert(!/DETAIL = 'missing_access_level_1'/.test(oldCourseSql));

const courseBranch = sql.slice(
  sql.indexOf("IF v_practice.publication_class = 'course'"),
  sql.lastIndexOf("ELSE"),
);
assert(/FROM public\.practice_access_levels/.test(courseBranch));
assert(/DETAIL = 'missing_access_level_1'/.test(courseBranch));
assert(/DETAIL = 'access_levels_not_contiguous'/.test(courseBranch));
assert(/DETAIL = 'invalid_level_1_upgrade_price'/.test(courseBranch));
assert(/DETAIL = 'invalid_paid_upgrade_price'/.test(courseBranch));
assert(/DETAIL = 'lesson_level_not_in_catalog'/.test(courseBranch));
assert(/DETAIL = 'paid_level_missing_lessons'/.test(courseBranch));
assert(/Empty catalog = legacy/.test(sql) || /empty catalog/i.test(sql));
assert(!/UPDATE\s+public\.practices/i.test(sql));
assert(!/ALTER TABLE/.test(sql));
assert(!/DROP TABLE/.test(sql));
assert(!/order_kind/.test(sql));
assert(!/target_access_level/.test(sql));

const elseBranch = sql.slice(sql.lastIndexOf("ELSE"));
assert(/DETAIL = 'missing_audio'/.test(elseBranch));
assert(!/DETAIL = 'missing_access_level_1'/.test(elseBranch));

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

const sqlCaseIds = {
  A: "a0000000-0000-4000-8000-00000000000a",
  B: "b0000000-0000-4000-8000-00000000000b",
  C: "c0000000-0000-4000-8000-00000000000c",
  D: "d0000000-0000-4000-8000-00000000000d",
  E: "e0000000-0000-4000-8000-00000000000e",
  F1: "f1000000-0000-4000-8000-0000000000f1",
  F2: "f2000000-0000-4000-8000-0000000000f2",
  G: "g0000000-0000-4000-8000-00000000000g",
  H: "h0000000-0000-4000-8000-00000000000h",
};

function runIsolatedSql() {
  if (!existsSync(stubPath) || !existsSync(smokePath)) {
    throw new Error("readiness SQL stub or smoke file is missing");
  }

  adminSql(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
  adminSql(`CREATE DATABASE ${dbName};`);

  const bootstrap = [
    readFileSync(stubPath, "utf8"),
    readFileSync(migrationPath, "utf8"),
    readFileSync(smokePath, "utf8"),
  ].join("\n");

  runPsql(dbName, bootstrap);

  for (const testCase of ACCESS_LEVEL_READINESS_CASES) {
    const practiceId = sqlCaseIds[testCase.id];
    assert(practiceId, `missing SQL id for case ${testCase.id}`);
    const detail = runPsql(
      dbName,
      `SELECT public._test_ready_detail('${practiceId}'::uuid);`,
      ["-At"],
    ).trim();

    if (testCase.expected.ok) {
      assert(
        detail === "READY",
        `case ${testCase.id} (${testCase.label}) expected READY, got ${detail}`,
      );
    } else {
      assert(
        detail === testCase.expected.code,
        `case ${testCase.id} (${testCase.label}) expected ${testCase.expected.code}, got ${detail}`,
      );
    }
  }
}

const skipIsolatedSql = process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1";

if (!skipIsolatedSql && (dockerAvailable() || localPostgresAvailable())) {
  runIsolatedSql();
  console.log("course-access-levels-readiness-sql-unit: parse + isolated sql A-H ok");
} else {
  console.log(
    skipIsolatedSql
      ? "course-access-levels-readiness-sql-unit: parse-only ok (isolated SQL disabled)"
      : "course-access-levels-readiness-sql-unit: parse-only ok (no local postgres)",
  );
}
