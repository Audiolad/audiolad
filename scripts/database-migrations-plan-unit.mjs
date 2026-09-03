#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeVersion,
  versionsFromMigrationFilenames,
  parseMigrationListOutput,
  parsePsqlVersionList,
  listLocalMigrationFiles,
  classifyRemoteHistory,
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


function testPsqlVersionListAndHistory() {
  const parsed = parsePsqlVersionList("20260819183000\n20260821140000\n");
  assert.deepEqual(parsed, ["20260819183000", "20260821140000"]);
  assert.equal(classifyRemoteHistory({ tableExists: false }).code, "database_migration_history_uninitialized");
  assert.equal(classifyRemoteHistory({ tableExists: true, versions: [] }).code, "database_migration_history_uninitialized");
  assert.equal(classifyRemoteHistory({ tableExists: true, versions: ["20260819183000"] }).status, "ready");
}

function testRepoOneFileOneVersion() {
  const listed = listLocalMigrationFiles(join(dirname(fileURLToPath(import.meta.url)), "../supabase/migrations"));
  assert.equal(listed.duplicates.length, 0, JSON.stringify(listed.duplicates));
  assert.equal(listed.files.length, listed.versions.length);
  assert.ok(listed.files.some((row) => row.filename === "20260716181000_per_track_covers.sql"));
  assert.ok(listed.files.some((row) => row.filename === "20260716182000_promotion_campaigns.sql"));
  assert.ok(listed.files.some((row) => row.filename === "20260716191000_claim_promo_practice_by_id.sql"));
  assert.ok(listed.files.some((row) => row.filename === "20260728121000_practice_content_sale_lock.sql"));
  assert.equal(
    listed.files.some((row) => row.filename === "20260823140000_quick_offers.sql"),
    false,
    "unapplied 140000 stamp must leave the active migrations directory",
  );
  assert.ok(listed.files.some((row) => row.filename === "20260823191000_quick_offers.sql"));
  assert.ok(
    listed.files.some(
      (row) => row.filename === "20260823200000_library_saves_and_preview_window.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) => row.filename === "20260825120000_topics_career_business_learning.sql",
    ),
  );
  assert.equal(
    listed.files.some((row) => row.filename === "20260825140000_playlist_catalog_foundation.sql"),
    false,
    "unapplied playlist foundation 140000 stamp must leave the active migrations directory",
  );
  assert.equal(
    listed.files.some((row) => row.filename === "20260825141000_playlist_topics.sql"),
    false,
    "unapplied playlist topics 141000 stamp must leave the active migrations directory",
  );
  assert.equal(
    listed.files.some((row) => row.filename === "20260825142000_playlist_catalog_popular_index.sql"),
    false,
    "unapplied playlist popular index 142000 stamp must leave the active migrations directory",
  );
  assert.equal(
    listed.files.some((row) => row.filename === "20260825160000_playlist_catalog_foundation.sql"),
    false,
    "unapplied playlist foundation 160000 stamp must leave the active migrations directory",
  );
  assert.equal(
    listed.files.some((row) => row.filename === "20260825161000_playlist_topics.sql"),
    false,
    "unapplied playlist topics 161000 stamp must leave the active migrations directory",
  );
  assert.equal(
    listed.files.some((row) => row.filename === "20260825162000_playlist_catalog_popular_index.sql"),
    false,
    "unapplied playlist popular index 162000 stamp must leave the active migrations directory",
  );
  assert.ok(
    listed.files.some(
      (row) => row.filename === "20260825163000_playlist_catalog_foundation.sql",
    ),
  );
  assert.ok(
    listed.files.some((row) => row.filename === "20260825164000_playlist_topics.sql"),
  );
  assert.ok(
    listed.files.some(
      (row) => row.filename === "20260825165000_playlist_catalog_popular_index.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename === "20260825166000_editorial_playlist_listed_at_backfill.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) => row.filename === "20260826120000_topics_spirituality.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) => row.filename === "20260827120000_course_content_foundation.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260828120000_seed_25_meditation_solutions_practice.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260829120000_seed_25_meditation_solutions_gallery.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) => row.filename === "20260829130000_author_contacts.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260830120000_personal_timer_promotion_copy.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260831120000_personal_start_sale_price_snapshot.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260901120000_analytics_link_signup_idempotent.sql",
    ),
  );
  assert.equal(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260830120100_practice_catalog_visibility_modes.sql",
    ),
    false,
    "unapplied visibility modes 120100 stamp must leave the active migrations directory",
  );
  assert.equal(
    listed.files.some(
      (row) =>
        row.filename === "20260830120200_create_practice_order_visibility.sql",
    ),
    false,
    "unapplied order visibility 120200 stamp must leave the active migrations directory",
  );
  assert.equal(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260830120300_public_playlist_selected_visibility.sql",
    ),
    false,
    "unapplied playlist selected visibility 120300 stamp must leave the active migrations directory",
  );
  assert.equal(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260830120400_fix_visibility_allowlist_author_policy.sql",
    ),
    false,
    "unapplied allowlist author policy 120400 stamp must leave the active migrations directory",
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260901120100_practice_catalog_visibility_modes.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename === "20260901120200_create_practice_order_visibility.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260901120300_public_playlist_selected_visibility.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260901120400_fix_visibility_allowlist_author_policy.sql",
    ),
  );
  assert.equal(
    listed.files.some(
      (row) => row.filename === "20260901130000_author_support_mode.sql",
    ),
    false,
    "unapplied author_support_mode 130000 stamp must leave the active migrations directory",
  );
  assert.ok(
    listed.files.some(
      (row) => row.filename === "20260902120200_author_support_mode.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename === "20260902120000_course_moderation_readiness.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename === "20260902120100_analytics_heavy_rpc_idempotent.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260903120000_search_practice_visibility_users.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename === "20260905120000_author_onboarding_ui_state.sql",
    ),
  );
  assert.ok(
    listed.files.some(
      (row) =>
        row.filename ===
        "20260907120000_commercial_onboarding_legacy_complete.sql",
    ),
  );
}

function testUnappliedOlderStampStillHoles() {
  const plan = planDatabaseMigrations({
    localVersions: [
      "20260823120000",
      "20260823140000",
      "20260823183000",
      "20260823190000",
    ],
    remoteVersions: ["20260823120000", "20260823183000"],
  });
  assert.equal(plan.action, "abort");
  assert.equal(plan.code, "database_migration_history_drift");
  assert.equal(plan.pending.some((version) => version < "20260823183000"), true);
}

function testProductionLikePendingAfterQuickOffersRestamp() {
  const listed = listLocalMigrationFiles(
    join(dirname(fileURLToPath(import.meta.url)), "../supabase/migrations"),
  );
  const maxRemote = "20260823183000";
  const remoteVersions = listed.versions.filter((version) => version <= maxRemote);
  const plan = planDatabaseMigrations({
    localVersions: listed.versions,
    remoteVersions,
  });
  const hasHole = plan.pending.some((version) => version < maxRemote);
  assert.equal(hasHole, false, `unexpected hole in pending=${JSON.stringify(plan.pending)}`);
  assert.equal(plan.action, "apply");
  assert.equal(plan.code, "apply");
  assert.deepEqual(plan.pending, [
    "20260823190000",
    "20260823191000",
    "20260823200000",
    "20260825120000",
    "20260825133000",
    "20260825150000",
    "20260825163000",
    "20260825164000",
    "20260825165000",
    "20260825166000",
    "20260826120000",
    "20260826180000",
    "20260827120000",
    "20260828120000",
    "20260829120000",
    "20260829130000",
    "20260830120000",
    "20260831120000",
    "20260901120000",
    "20260901120100",
    "20260901120200",
    "20260901120300",
    "20260901120400",
    "20260902120000",
    "20260902120100",
    "20260902120200",
    "20260903120000",
    "20260904120000",
    "20260905120000",
    "20260905120100",
    "20260906120000",
    "20260907120000",
    "20260908120000",
    "20260909090000",
    "20260910120000",
    "20260910130000",
    "20260911120000",
    "20260911130000",
    "20260911140000",
    "20260912120000",
    "20260913120000",
    "20260914120000",
    "20260914130000",
    "20260915120000",
    "20260915130000",
    "20260916120000",
  ]);
  assert.equal(plan.database_migrations_pending, 46);
}

function testProductionLikePendingAfterPlaylistRestamp() {
  const listed = listLocalMigrationFiles(
    join(dirname(fileURLToPath(import.meta.url)), "../supabase/migrations"),
  );
  const maxRemote = "20260825162000";
  const remoteVersions = listed.versions.filter((version) => version <= maxRemote);
  const plan = planDatabaseMigrations({
    localVersions: listed.versions,
    remoteVersions,
  });
  const hasHole = plan.pending.some((version) => version < maxRemote);
  assert.equal(hasHole, false, `unexpected hole in pending=${JSON.stringify(plan.pending)}`);
  assert.equal(plan.action, "apply");
  assert.equal(plan.code, "apply");
  assert.deepEqual(plan.pending, [
    "20260825163000",
    "20260825164000",
    "20260825165000",
    "20260825166000",
    "20260826120000",
    "20260826180000",
    "20260827120000",
    "20260828120000",
    "20260829120000",
    "20260829130000",
    "20260830120000",
    "20260831120000",
    "20260901120000",
    "20260901120100",
    "20260901120200",
    "20260901120300",
    "20260901120400",
    "20260902120000",
    "20260902120100",
    "20260902120200",
    "20260903120000",
    "20260904120000",
    "20260905120000",
    "20260905120100",
    "20260906120000",
    "20260907120000",
    "20260908120000",
    "20260909090000",
    "20260910120000",
    "20260910130000",
    "20260911120000",
    "20260911130000",
    "20260911140000",
    "20260912120000",
    "20260913120000",
    "20260914120000",
    "20260914130000",
    "20260915120000",
    "20260915130000",
    "20260916120000",
  ]);
  assert.equal(plan.database_migrations_pending, 40);
}

function testOrdinaryDeployAfterLatestMainHasNoHole() {
  const listed = listLocalMigrationFiles(
    join(dirname(fileURLToPath(import.meta.url)), "../supabase/migrations"),
  );
  const latestMain = "20260829120000";
  assert.ok(
    listed.versions.includes(latestMain),
    "latest origin/main migration stamp must still exist locally",
  );
  assert.ok(
    listed.files.some(
      (row) => row.filename === "20260829130000_author_contacts.sql",
    ),
    "author_contacts must be the ordinary next migration after latest main",
  );
  assert.equal(
    listed.versions.includes("20260827180000"),
    false,
    "old author_contacts stamp must not remain as a history hole",
  );
  const remoteVersions = listed.versions.filter((version) => version <= latestMain);
  assert.equal(remoteVersions.includes("20260829130000"), false);
  const plan = planDatabaseMigrations({
    localVersions: listed.versions,
    remoteVersions,
  });
  const hasHole = plan.pending.some((version) => version < latestMain);
  assert.equal(hasHole, false, `unexpected hole in pending=${JSON.stringify(plan.pending)}`);
  assert.equal(plan.action, "apply");
  assert.equal(plan.code, "apply");
  assert.deepEqual(plan.pending, [
    "20260829130000",
    "20260830120000",
    "20260831120000",
    "20260901120000",
    "20260901120100",
    "20260901120200",
    "20260901120300",
    "20260901120400",
    "20260902120000",
    "20260902120100",
    "20260902120200",
    "20260903120000",
    "20260904120000",
    "20260905120000",
    "20260905120100",
    "20260906120000",
    "20260907120000",
    "20260908120000",
    "20260909090000",
    "20260910120000",
    "20260910130000",
    "20260911120000",
    "20260911130000",
    "20260911140000",
    "20260912120000",
    "20260913120000",
    "20260914120000",
    "20260914130000",
    "20260915120000",
    "20260915130000",
    "20260916120000",
  ]);
  assert.equal(plan.database_migrations_pending, 31);
}

function testReissuedVisibilityAfterProductionMaxHasNoHole() {
  const maxRemote = "20260831120000";
  const newVisibility = [
    "20260901120100",
    "20260901120200",
    "20260901120300",
    "20260901120400",
  ];
  const oldHoles = [
    "20260830120100",
    "20260830120200",
    "20260830120300",
    "20260830120400",
  ];
  const fixturePlan = planDatabaseMigrations({
    localVersions: [maxRemote, ...newVisibility],
    remoteVersions: [maxRemote],
  });
  assert.equal(fixturePlan.action, "apply");
  assert.deepEqual(fixturePlan.pending, newVisibility);
  assert.notEqual(fixturePlan.code, "database_migration_history_drift");
  assert.equal(fixturePlan.code, "apply");
  assert.equal(fixturePlan.pending.some((version) => version < maxRemote), false);
  assert.equal(
    oldHoles.some((version) => fixturePlan.pending.includes(version)),
    false,
  );

  const listed = listLocalMigrationFiles(
    join(dirname(fileURLToPath(import.meta.url)), "../supabase/migrations"),
  );
  for (const hole of oldHoles) {
    assert.equal(
      listed.versions.includes(hole),
      false,
      `old hole version must leave the local set: ${hole}`,
    );
  }
  for (const version of newVisibility) {
    assert.ok(
      listed.versions.includes(version),
      `reissued visibility version must exist locally: ${version}`,
    );
  }
  assert.equal(listed.versions.includes("20260901130000"), false);
  assert.ok(listed.versions.includes("20260902120200"));
  assert.ok(listed.versions.includes("20260902120000"));
  const remoteVersions = listed.versions.filter((version) => version <= maxRemote);
  assert.equal(remoteVersions.includes("20260830120100"), false);
  assert.equal(remoteVersions.includes("20260830120200"), false);
  assert.equal(remoteVersions.includes("20260830120300"), false);
  assert.equal(remoteVersions.includes("20260830120400"), false);
  const livePlan = planDatabaseMigrations({
    localVersions: listed.versions,
    remoteVersions,
  });
  assert.equal(livePlan.action, "apply");
  assert.notEqual(livePlan.code, "database_migration_history_drift");
  assert.equal(livePlan.code, "apply");
  assert.equal(livePlan.pending.some((version) => version < maxRemote), false);
  assert.ok(livePlan.pending.every((version) => version > maxRemote));
  for (const version of newVisibility) {
    assert.ok(livePlan.pending.includes(version));
  }
  for (const hole of oldHoles) {
    assert.equal(livePlan.pending.includes(hole), false);
  }
  const lastVisibility = "20260901120400";
  const supportStamp = "20260902120200";
  const courseStamp = "20260902120000";
  const searchStamp = "20260903120000";
  assert.ok(livePlan.pending.includes(supportStamp));
  assert.ok(livePlan.pending.includes(courseStamp));
  assert.ok(listed.versions.includes(searchStamp));
  assert.ok(livePlan.pending.includes(searchStamp));
  assert.ok(
    livePlan.pending.indexOf(supportStamp) > livePlan.pending.indexOf(lastVisibility),
    "support-mode stamp must follow restamped visibility migrations",
  );
  assert.ok(
    livePlan.pending.indexOf(courseStamp) > livePlan.pending.indexOf(lastVisibility),
    "course readiness stamp must follow last visibility",
  );
  assert.ok(
    livePlan.pending.indexOf(supportStamp) > livePlan.pending.indexOf("20260902120100"),
    "support-mode stamp must follow analytics RPC protection",
  );
  assert.ok(listed.versions.includes("20260902120100"));
  assert.ok(livePlan.pending.includes("20260902120100"));
  assert.ok(
    livePlan.pending.indexOf("20260902120100") > livePlan.pending.indexOf(courseStamp),
    "analytics RPC protection stamp must follow course readiness",
  );
  assert.ok(
    livePlan.pending.indexOf(searchStamp) > livePlan.pending.indexOf("20260902120100"),
    "visibility user search stamp must follow analytics RPC protection",
  );
  const productionMax = "20260902120000";
  const productionRemote = listed.versions.filter((version) => version <= productionMax);
  const productionPlan = planDatabaseMigrations({
    localVersions: listed.versions,
    remoteVersions: productionRemote,
  });
  assert.equal(productionPlan.pending.includes("20260901130000"), false);
  assert.ok(productionPlan.pending.includes(supportStamp));
  assert.ok(productionPlan.pending.every((version) => version > productionMax));
  assert.equal(productionPlan.action, "apply");
  assert.notEqual(productionPlan.code, "database_migration_history_drift");
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
  testPsqlVersionListAndHistory();
  testRepoOneFileOneVersion();
  testUnappliedOlderStampStillHoles();
  testProductionLikePendingAfterQuickOffersRestamp();
  testProductionLikePendingAfterPlaylistRestamp();
  testOrdinaryDeployAfterLatestMainHasNoHole();
  testReissuedVisibilityAfterProductionMaxHasNoHole();
  console.log("database-migrations-plan-unit: all tests passed");
}

main();
