#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeVersion,
  versionsFromMigrationFilenames,
  parseMigrationListOutput,
  planDatabaseMigrations,
  redactMigrationSecrets,
} from "../deploy/scripts/lib/database-migrations-plan.mjs";

const planner = join(
  dirname(fileURLToPath(import.meta.url)),
  "../deploy/scripts/lib/database-migrations-plan.mjs",
);

function runPlanner(mode, input, args = []) {
  const result = spawnSync(process.execPath, [planner, mode, ...args], {
    encoding: "utf8",
    input,
  });
  return result;
}

function testNormalizeAndFilenames() {
  assert.equal(normalizeVersion("20260821140000_olga_nevskaya_author_project_limit_override.sql"), "20260821140000");
  assert.equal(normalizeVersion("/abs/supabase/migrations/20260819183000_studio_guest_handoff.sql"), "20260819183000");
  assert.equal(normalizeVersion("20260821140000"), "20260821140000");
  assert.equal(normalizeVersion("not-a-migration.sql"), "");
  const versions = versionsFromMigrationFilenames([
    "20260819183000_studio_guest_handoff.sql",
    "20260821140000_olga_nevskaya_author_project_limit_override.sql",
    "20260819183000_studio_guest_handoff.sql",
  ]);
  assert.deepEqual(versions, ["20260819183000", "20260821140000"]);
}

function testParseTableAndJson() {
  const table = `
        LOCAL      │     REMOTE     │     TIME (UTC)
  ─────────────────┼────────────────┼──────────────────────
    20260819183000 │ 20260819183000 │ 2026-08-19 18:30:00
    20260821140000 │                │ 2026-08-21 14:00:00
                   │ 20240124010108 │ 2024-01-24 01:01:08
`;
  const parsed = parseMigrationListOutput(table);
  assert.deepEqual(parsed.localVersions, ["20260819183000", "20260821140000"]);
  assert.deepEqual(parsed.remoteVersions, ["20240124010108", "20260819183000"]);

  const ascii = `LOCAL | REMOTE | TIME
20260710115506 | 20260710115506 | 2026-07-10
20260821140000 |  |
`;
  const asciiParsed = parseMigrationListOutput(ascii);
  assert.deepEqual(asciiParsed.localVersions, ["20260710115506", "20260821140000"]);
  assert.deepEqual(asciiParsed.remoteVersions, ["20260710115506"]);

  const jsonObj = parseMigrationListOutput(
    JSON.stringify({
      local: ["20260819183000", "20260821140000"],
      remote: ["20260819183000"],
    }),
  );
  assert.deepEqual(jsonObj.localVersions, ["20260819183000", "20260821140000"]);
  assert.deepEqual(jsonObj.remoteVersions, ["20260819183000"]);

  const jsonRows = parseMigrationListOutput(
    JSON.stringify([
      { LOCAL: "20260819183000", REMOTE: "20260819183000" },
      { local: "20260821140000", remote: "" },
    ]),
  );
  assert.deepEqual(jsonRows.localVersions, ["20260819183000", "20260821140000"]);
  assert.deepEqual(jsonRows.remoteVersions, ["20260819183000"]);
}

function testOrdinaryPendingNewestOnlyApply() {
  const plan = planDatabaseMigrations({
    localVersions: ["20260818180000", "20260819183000", "20260821140000"],
    remoteVersions: ["20260818180000", "20260819183000"],
  });
  assert.equal(plan.action, "apply");
  assert.deepEqual(plan.pending, ["20260821140000"]);
  assert.equal(plan.database_migrations_pending, 1);
}

function testEmptyRemoteAbort() {
  const plan = planDatabaseMigrations({
    localVersions: ["20260710115506", "20260821140000"],
    remoteVersions: [],
    allowEmptyRemote: false,
  });
  assert.equal(plan.action, "abort");
  assert.equal(plan.code, "database_migration_history_uninitialized");
  assert.ok(plan.pending.length > 0);
}

function testHolesAbort() {
  const plan = planDatabaseMigrations({
    localVersions: ["20260818180000", "20260819183000", "20260821140000"],
    remoteVersions: ["20260819183000"],
  });
  assert.equal(plan.action, "abort");
  assert.equal(plan.code, "database_migration_history_drift");
  assert.ok(plan.pending.includes("20260818180000"));
}

function testNoop() {
  const plan = planDatabaseMigrations({
    localVersions: ["20260819183000"],
    remoteVersions: ["20260819183000"],
  });
  assert.equal(plan.action, "noop");
  assert.equal(plan.database_migrations_pending, 0);
  assert.deepEqual(plan.pending, []);
}

function testOlgaPendingAfterOlderRemotes() {
  const older = [
    "20260818180000",
    "20260819120000",
    "20260819183000",
  ];
  const plan = planDatabaseMigrations({
    localVersions: [...older, "20260821140000"],
    remoteVersions: older,
  });
  assert.equal(plan.action, "apply");
  assert.deepEqual(plan.pending, ["20260821140000"]);
  assert.equal(plan.database_migrations_pending, 1);
}

function testRedactHidesPostgresUrlAndServiceRole() {
  const url = "postgresql://secret-user:super-secret-pass@db.example/postgres";
  const serviceRole =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";
  const text = `db-url ${url} SUPABASE_SERVICE_ROLE_KEY=${serviceRole} also ${serviceRole}`;
  const redacted = redactMigrationSecrets(text);
  assert.equal(redacted.includes(url), false);
  assert.equal(redacted.includes("super-secret-pass"), false);
  assert.equal(redacted.includes(serviceRole), false);
  assert.equal(redacted.includes("secret-user"), false);
  assert.match(redacted, /postgresql:\/\/\[redacted\]/);
  assert.match(redacted, /\[redacted-jwt\]|\[redacted\]/);
}

function testCliModes() {
  const plan = runPlanner(
    "plan",
    JSON.stringify({
      localVersions: ["20260819183000", "20260821140000"],
      remoteVersions: ["20260819183000"],
    }),
  );
  assert.equal(plan.status, 0, plan.stderr);
  const planJson = JSON.parse(plan.stdout);
  assert.equal(planJson.action, "apply");
  assert.deepEqual(planJson.pending, ["20260821140000"]);

  const parsed = runPlanner(
    "parse-list",
    "LOCAL | REMOTE\n20260821140000 | \n",
  );
  assert.equal(parsed.status, 0, parsed.stderr);
  assert.deepEqual(JSON.parse(parsed.stdout).localVersions, ["20260821140000"]);

  const fromFiles = runPlanner("from-files", "", [
    "20260821140000_olga_nevskaya_author_project_limit_override.sql",
  ]);
  assert.equal(fromFiles.status, 0, fromFiles.stderr);
  assert.deepEqual(JSON.parse(fromFiles.stdout), ["20260821140000"]);

  const redacted = runPlanner(
    "redact",
    "postgresql://secret-user:super-secret-pass@db.example/postgres",
  );
  assert.equal(redacted.status, 0, redacted.stderr);
  assert.equal(redacted.stdout.includes("super-secret-pass"), false);
}

function main() {
  testNormalizeAndFilenames();
  testParseTableAndJson();
  testOrdinaryPendingNewestOnlyApply();
  testEmptyRemoteAbort();
  testHolesAbort();
  testNoop();
  testOlgaPendingAfterOlderRemotes();
  testRedactHidesPostgresUrlAndServiceRole();
  testCliModes();
  console.log("database-migrations-plan-unit: all tests passed");
}

main();
