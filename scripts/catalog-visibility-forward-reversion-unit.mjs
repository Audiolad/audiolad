#!/usr/bin/env node
/**
 * Incident regression + CASE 1/2/3 fixtures for the catalog-visibility
 * forward restamp. Does not talk to a database. Does not change the planner.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  listLocalMigrationFiles,
  planDatabaseMigrations,
} from "../deploy/scripts/lib/database-migrations-plan.mjs";
import {
  parseAllowedDatabaseName,
  parseAllowedDatabaseUrl,
} from "./catalog-visibility-forward-reversion-clone.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const ARCHIVE = join(
  ROOT,
  "deploy/migration-baseline/catalog-visibility-20260830",
);
const MAPPING = join(
  ROOT,
  "deploy/migration-baseline/CATALOG_VISIBILITY_FORWARD_REVERSION.md",
);

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
const OLD_VERSIONS = [
  "20260830120100",
  "20260830120200",
  "20260830120300",
  "20260830120400",
];
const NEW_VERSIONS = [
  "20260902120100",
  "20260902120200",
  "20260902120300",
  "20260902120400",
];
const PROD_LATEST = "20260831120000";
const MAX_LOCAL_BEFORE = "20260901120000";
const KEPT_TIMER = "20260830120000_personal_timer_promotion_copy.sql";
const KEPT_ENTITLEMENT =
  "20260715170000_practice_catalog_visibility_and_entitlement_access.sql";

function testOldVersionsLeftScanDirectory() {
  for (const name of OLD_FILES) {
    assert.equal(
      existsSync(join(MIGRATIONS, name)),
      false,
      `old file must not remain a live migration: ${name}`,
    );
    assert.equal(
      existsSync(join(ARCHIVE, name)),
      true,
      `archived original must exist: ${name}`,
    );
  }
  for (const name of NEW_FILES) {
    assert.equal(
      existsSync(join(MIGRATIONS, name)),
      true,
      `forward file missing: ${name}`,
    );
  }
  assert.equal(existsSync(join(MIGRATIONS, KEPT_TIMER)), true);
  assert.equal(existsSync(join(MIGRATIONS, KEPT_ENTITLEMENT)), true);
}

function testArchivedSqlMatchesLive() {
  for (let i = 0; i < OLD_FILES.length; i += 1) {
    const archived = readFileSync(join(ARCHIVE, OLD_FILES[i]), "utf8");
    const live = readFileSync(join(MIGRATIONS, NEW_FILES[i]), "utf8");
    assert.equal(
      live,
      archived,
      `${NEW_FILES[i]} must stay byte-identical to archived ${OLD_FILES[i]}`,
    );
  }
}

function testLiveSqlIdempotentMarkers() {
  const modes = readFileSync(join(MIGRATIONS, NEW_FILES[0]), "utf8");
  assert.match(modes, /ADD COLUMN IF NOT EXISTS catalog_visibility text/);
  assert.match(modes, /CREATE TABLE IF NOT EXISTS public\.practice_visibility_users/);
  assert.match(modes, /CREATE INDEX IF NOT EXISTS/);
  assert.match(modes, /CREATE OR REPLACE FUNCTION/);
  assert.match(modes, /DROP POLICY IF EXISTS/);
  assert.match(modes, /DROP TRIGGER IF EXISTS trg_sync_practice_catalog_visibility/);
  assert.doesNotMatch(modes, /DROP TABLE(?: IF EXISTS)? public\.practices/i);
  assert.doesNotMatch(modes, /DROP TABLE(?: IF EXISTS)? public\.practice_visibility_users/i);

  const order = readFileSync(join(MIGRATIONS, NEW_FILES[1]), "utf8");
  assert.match(order, /CREATE OR REPLACE FUNCTION public\.create_practice_order/);

  const playlist = readFileSync(join(MIGRATIONS, NEW_FILES[2]), "utf8");
  assert.match(playlist, /DROP POLICY IF EXISTS "Anyone can select public playlist items"/);
  assert.match(playlist, /CREATE POLICY "Anyone can select public playlist items"/);

  const author = readFileSync(join(MIGRATIONS, NEW_FILES[3]), "utf8");
  assert.match(
    author,
    /DROP POLICY IF EXISTS "Author members can view practice visibility rows"/,
  );
  assert.match(author, /public\.is_practice_author_member\(\s*practice_id,\s*auth\.uid\(\)\s*\)/);
}

function testPlannerALocalOlderThanMaxRemoteAborts() {
  const plan = planDatabaseMigrations({
    localVersions: [
      "20260830120000",
      "20260830120100",
      "20260831120000",
    ],
    remoteVersions: ["20260830120000", "20260831120000"],
  });
  assert.equal(plan.action, "abort");
  assert.equal(plan.code, "database_migration_history_drift");
  assert.deepEqual(plan.pending, ["20260830120100"]);
}

function testPlannerBExtraRemoteDoesNotAbort() {
  const plan = planDatabaseMigrations({
    localVersions: ["20260830120000", "20260831120000", "20260901120000"],
    remoteVersions: [
      "20260830120000",
      "20260830120100",
      "20260831120000",
    ],
  });
  assert.equal(plan.action, "apply");
  assert.equal(plan.code, "apply");
  assert.deepEqual(plan.pending, ["20260901120000"]);
  assert.equal(
    plan.pending.some((version) => version < "20260831120000"),
    false,
  );
}

function testPlannerCReversionOldGoneNewPresent() {
  const plan = planDatabaseMigrations({
    localVersions: [
      "20260830120000",
      "20260831120000",
      "20260901120000",
      ...NEW_VERSIONS,
    ],
    remoteVersions: ["20260830120000", "20260831120000"],
  });
  assert.equal(plan.action, "apply");
  assert.equal(plan.code, "apply");
  assert.deepEqual(plan.pending, ["20260901120000", ...NEW_VERSIONS]);
}

function testPlannerDNoAliasesStillApply() {
  const plan = planDatabaseMigrations({
    localVersions: [
      "20260830120000",
      "20260831120000",
      ...NEW_VERSIONS,
    ],
    remoteVersions: [
      "20260830120000",
      ...OLD_VERSIONS,
      "20260831120000",
    ],
  });
  assert.equal(plan.action, "apply", "planner has no aliases; new stamps still apply");
  assert.deepEqual(plan.pending, NEW_VERSIONS);
  assert.equal(plan.code, "apply");
}

function testIncidentBeforeRepairAborts() {
  const plan = planDatabaseMigrations({
    localVersions: [
      "20260830120000",
      ...OLD_VERSIONS,
      "20260831120000",
      "20260901120000",
    ],
    remoteVersions: ["20260830120000", "20260831120000"],
  });
  assert.equal(plan.action, "abort");
  assert.equal(plan.code, "database_migration_history_drift");
  assert.equal(
    plan.pending.some((version) => version < PROD_LATEST),
    true,
  );
  for (const version of OLD_VERSIONS) {
    assert.ok(plan.pending.includes(version), `pending must include ${version}`);
  }
}

function testIncidentAfterRepairProductionLike() {
  const listed = listLocalMigrationFiles(MIGRATIONS);
  for (const version of OLD_VERSIONS) {
    assert.equal(
      listed.versions.includes(version),
      false,
      `${version} must not be a pending local migration`,
    );
  }
  for (const version of NEW_VERSIONS) {
    assert.ok(listed.versions.includes(version), `missing forward ${version}`);
  }
  assert.ok(listed.versions.includes(MAX_LOCAL_BEFORE));
  assert.ok(listed.versions.includes(PROD_LATEST));

  const remoteVersions = listed.versions.filter((version) => version <= PROD_LATEST);
  assert.equal(remoteVersions.includes(PROD_LATEST), true);
  for (const version of OLD_VERSIONS) {
    assert.equal(remoteVersions.includes(version), false);
  }

  const plan = planDatabaseMigrations({
    localVersions: listed.versions,
    remoteVersions,
  });
  const holes = plan.pending.filter((version) => version < PROD_LATEST);
  assert.deepEqual(holes, [], `unexpected hole pending=${JSON.stringify(plan.pending)}`);
  assert.notEqual(plan.code, "database_migration_history_drift");
  assert.equal(plan.action, "apply");
  assert.deepEqual(plan.pending, [MAX_LOCAL_BEFORE, ...NEW_VERSIONS]);
}

function testCase2SchemaCreatedOnceInLiveRepo() {
  const names = readdirSync(MIGRATIONS).filter((name) =>
    name.toLowerCase().endsWith(".sql"),
  );
  const creators = [];
  for (const name of names) {
    const sql = readFileSync(join(MIGRATIONS, name), "utf8");
    if (/CREATE TABLE IF NOT EXISTS public\.practice_visibility_users/.test(sql)) {
      creators.push(name);
    }
  }
  assert.deepEqual(creators, [NEW_FILES[0]]);

  const columnAdders = names.filter((name) =>
    /ADD COLUMN IF NOT EXISTS catalog_visibility text/.test(
      readFileSync(join(MIGRATIONS, name), "utf8"),
    ),
  );
  assert.deepEqual(columnAdders, [NEW_FILES[0]]);
}

function testMappingDocListsLiveAndArchive() {
  assert.equal(existsSync(MAPPING), true);
  const text = readFileSync(MAPPING, "utf8");
  for (const name of [...OLD_FILES, ...NEW_FILES]) {
    assert.match(text, new RegExp(name.replace(/\./g, "\\.")));
  }
  assert.match(text, /database_migration_history_drift/);
  assert.match(text, /CASE 1/);
  assert.match(text, /CASE 2/);
  assert.match(text, /CASE 3/);
  assert.match(text, /planner has no aliases/i);
}

function testCloneRunnerFailClosed() {
  for (const unsafe of ["postgres", "template0", "template1"]) {
    assert.match(
      parseAllowedDatabaseName(unsafe).reason,
      new RegExp(`unsafe database name: ${unsafe}`),
    );
    assert.match(
      parseAllowedDatabaseUrl(`postgresql://host/${unsafe}`).reason,
      new RegExp(`unsafe database name: ${unsafe}`),
    );
  }
  assert.equal(parseAllowedDatabaseUrl(undefined).ok, false);
  assert.equal(
    parseAllowedDatabaseUrl(
      "postgresql://reader:secret@localhost:5432/audiolad_visibility_reversion_clone",
    ).ok,
    true,
  );
  assert.match(
    parseAllowedDatabaseUrl("postgresql://host/audiolad_production").reason,
    /not allowed/,
  );
}

function testNewVersionsForwardOfBothWatermarks() {
  for (const version of NEW_VERSIONS) {
    assert.ok(version > PROD_LATEST, `${version} must be > ${PROD_LATEST}`);
    assert.ok(
      version > MAX_LOCAL_BEFORE,
      `${version} must be > max local before repair ${MAX_LOCAL_BEFORE}`,
    );
  }
  for (let i = 1; i < NEW_VERSIONS.length; i += 1) {
    assert.ok(
      NEW_VERSIONS[i] > NEW_VERSIONS[i - 1],
      "forward versions must keep 201→202→203→204 order",
    );
  }
}

function main() {
  testOldVersionsLeftScanDirectory();
  testArchivedSqlMatchesLive();
  testLiveSqlIdempotentMarkers();
  testPlannerALocalOlderThanMaxRemoteAborts();
  testPlannerBExtraRemoteDoesNotAbort();
  testPlannerCReversionOldGoneNewPresent();
  testPlannerDNoAliasesStillApply();
  testIncidentBeforeRepairAborts();
  testIncidentAfterRepairProductionLike();
  testCase2SchemaCreatedOnceInLiveRepo();
  testMappingDocListsLiveAndArchive();
  testCloneRunnerFailClosed();
  testNewVersionsForwardOfBothWatermarks();
  console.log("catalog-visibility-forward-reversion-unit: all tests passed");
}

main();
