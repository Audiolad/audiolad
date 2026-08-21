#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  AUDIT_FORMAT,
  OLGA_VERSION,
  buildProbesFromSql,
  classifyMigration,
  buildAuditReport,
  approvedBaselineVersions,
  isDataOrBackfillMigration,
} from "../deploy/scripts/lib/migration-audit.mjs";
import { AUDIT_LINEAGE } from "../deploy/scripts/lib/migration-audit-lineage.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_SH = join(ROOT, "deploy/scripts/audit-production-migrations.sh");
const FAKE_DOCKER = join(ROOT, "deploy/scripts/test-support/fake-docker.mjs");

function testOlgaSpecialCase() {
  const sql = "UPDATE public.profiles SET author_project_limit_override = 5;";
  const built = buildProbesFromSql(
    `${OLGA_VERSION}_olga_nevskaya_author_project_limit_override.sql`,
    sql,
  );
  assert.equal(built.probes.length, 1);
  assert.match(built.probes[0].sql, /SELECT /i);
  assert.doesNotMatch(built.probes[0].sql, /\bUPDATE\b/i);
  assert.match(built.probes[0].sql, /olganevska@yandex\.ru/);
  assert.match(built.probes[0].sql, /author_project_limit_override = 5/);

  const applied = classifyMigration({
    filename: `${OLGA_VERSION}_olga.sql`,
    sql,
    probeResults: { olga_author_project_limit_override: "t" },
  });
  assert.equal(applied.status, "PROVEN_APPLIED");

  const notApplied = classifyMigration({
    filename: `${OLGA_VERSION}_olga.sql`,
    sql,
    probeResults: { olga_author_project_limit_override: "f" },
  });
  assert.equal(notApplied.status, "PROVEN_NOT_APPLIED");
}

function testSchemaAndDataClassification() {
  const tableSql = "CREATE TABLE IF NOT EXISTS public.promotion_campaigns (id uuid);";
  const tableApplied = classifyMigration({
    filename: "20260716182000_promotion_campaigns.sql",
    sql: tableSql,
    probeResults: { "table:public.promotion_campaigns": "t" },
  });
  assert.equal(tableApplied.status, "PROVEN_APPLIED");

  const tableMissing = classifyMigration({
    filename: "20260716182000_promotion_campaigns.sql",
    sql: tableSql,
    probeResults: { "table:public.promotion_campaigns": "f" },
  });
  assert.equal(tableMissing.status, "PROVEN_NOT_APPLIED");

  const colSql =
    "ALTER TABLE public.author_applications ADD COLUMN IF NOT EXISTS wants_training boolean;";
  const col = classifyMigration({
    filename: "20260716180000_author_applications_wants_training.sql",
    sql: colSql,
    probeResults: { "column:public.author_applications.wants_training": true },
  });
  assert.equal(col.status, "PROVEN_APPLIED");

  const backfill = "INSERT INTO public.user_practices (user_id) SELECT id FROM auth.users;";
  assert.equal(isDataOrBackfillMigration("20260710123015_backfill_starter_practices.sql", backfill), true);
  const review = classifyMigration({
    filename: "20260710123015_backfill_starter_practices.sql",
    sql: backfill,
    probeResults: {},
  });
  assert.equal(review.status, "REQUIRES_MANUAL_REVIEW");
}

function testApprovedBaselineRefusesReview() {
  const report = {
    format: AUDIT_FORMAT,
    versions: [
      { version: "20260819183000", file: "20260819183000_ok.sql", status: "PROVEN_APPLIED" },
      { version: "20260821140000", file: "20260821140000_olga.sql", status: "REQUIRES_MANUAL_REVIEW" },
    ],
  };
  assert.throws(() => approvedBaselineVersions(report), /REQUIRES_MANUAL_REVIEW/);

  const mixed = {
    format: AUDIT_FORMAT,
    versions: [
      { version: "20260819183000", file: "20260819183000_ok.sql", status: "PROVEN_APPLIED" },
      { version: "20260821140000", file: "20260821140000_olga.sql", status: "PROVEN_NOT_APPLIED" },
    ],
  };
  const approved = approvedBaselineVersions(mixed);
  assert.deepEqual(approved.map((row) => row.version), ["20260819183000"]);
}

function testAuditScriptFixtureNeverMutates() {
  const dir = mkdtempSync(join(tmpdir(), "audiolad-audit-mig-"));
  const state = mkdtempSync(join(tmpdir(), "audiolad-audit-docker-"));
  const fakeBin = mkdtempSync(join(tmpdir(), "audiolad-audit-bin-"));
  writeFileSync(
    join(dir, "20260819183000_ok.sql"),
    "CREATE TABLE public.ok (id int);\n",
  );
  writeFileSync(
    join(dir, "20260821140000_olga_nevskaya_author_project_limit_override.sql"),
    "UPDATE public.profiles SET author_project_limit_override = 5;\n",
  );
  const fixture = {
    "20260819183000": { "table:public.ok": "t" },
    "20260821140000": { olga_author_project_limit_override: "t" },
  };
  const fixturePath = join(dir, "fixture.json");
  const outPath = join(dir, "report.json");
  writeFileSync(fixturePath, JSON.stringify(fixture));
  writeFileSync(join(state, "readonly"), "1\n");
  writeFileSync(join(state, "container_status"), "running\n");
  writeFileSync(join(state, "container_name"), "supabase-db\n");
  writeFileSync(join(fakeBin, "docker"), `#!/usr/bin/env bash\nexec node "${FAKE_DOCKER}" "$@"\n`, { mode: 0o755 });

  const result = spawnSync("bash", [AUDIT_SH, "--migrations-dir", dir, "--fixture", fixturePath, "--out", outPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      FAKE_DOCKER_STATE: state,
      AUDIOLAD_DOCKER_BIN: join(fakeBin, "docker"),
    },
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const report = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(report.format, AUDIT_FORMAT);
  assert.equal(report.exec, false);
  const olga = report.versions.find((row) => row.version === OLGA_VERSION);
  assert.equal(olga.status, "PROVEN_APPLIED");
  const mutationBlocks = existsSync(join(state, "mutation_blocks"))
    ? readFileSync(join(state, "mutation_blocks"), "utf8").trim()
    : "0";
  assert.equal(mutationBlocks || "0", "0");

  const execResult = spawnSync("bash", [AUDIT_SH, "--migrations-dir", dir, "--out", join(dir, "exec.json")], {
    encoding: "utf8",
    env: {
      ...process.env,
      FAKE_DOCKER_STATE: state,
      AUDIOLAD_DOCKER_BIN: join(fakeBin, "docker"),
      AUDIOLAD_MIGRATION_AUDIT_EXEC: "1",
    },
  });
  assert.equal(execResult.status, 0, execResult.stderr + execResult.stdout);
  const sqlLog = readFileSync(join(state, "sql_log"), "utf8");
  assert.doesNotMatch(sqlLog, /\bUPDATE\b/i);
  assert.doesNotMatch(sqlLog, /\bINSERT\b/i);
  assert.match(sqlLog, /\bSELECT\b/i);
  rmSync(dir, { recursive: true, force: true });
  rmSync(state, { recursive: true, force: true });
  rmSync(fakeBin, { recursive: true, force: true });
}

function testRepoOlgaFileHasNoAuditWrite() {
  const sql = readFileSync(
    join(ROOT, "supabase/migrations/20260821140000_olga_nevskaya_author_project_limit_override.sql"),
    "utf8",
  );
  const built = buildProbesFromSql(
    "20260821140000_olga_nevskaya_author_project_limit_override.sql",
    sql,
  );
  assert.equal(built.probes.every((probe) => /^SELECT\b/i.test(probe.sql.trim())), true);
}

const THIRTEEN = [
  "20260710122053_configure_starter_practices.sql",
  "20260710123015_backfill_starter_practices.sql",
  "20260713150000_seed_first_audio_course_practice.sql",
  "20260714190000_assign_platform_owner_memberships.sql",
  "20260714201600_rename_sergey_and_zoya_author.sql",
  "20260715240000_repair_published_practice_audio_status.sql",
  "20260719140000_clear_legacy_author_seed_description.sql",
  "20260719150000_promo_pages_foundation.sql",
  "20260728190000_admin_analytics_p2_privileges_harden.sql",
  "20260801120000_aurafon_bypass_product_moderation.sql",
  "20260810160000_studio_recording_webm_assets.sql",
  "20260816120000_playlist_description_max_300.sql",
];

function readMigration(name) {
  return readFileSync(join(ROOT, "supabase/migrations", name), "utf8");
}

function resultsFor(built, overrides = {}) {
  const results = {};
  for (const probe of built.probes) {
    results[probe.id] = "t";
  }
  return { ...results, ...overrides };
}

function testThirteenHaveSelectProbes() {
  for (const name of THIRTEEN) {
    const version = name.slice(0, 14);
    assert.ok(AUDIT_LINEAGE[version], `lineage missing for ${version}`);
    const built = buildProbesFromSql(name, readMigration(name));
    assert.ok(built.probes.length > 0, `${name} must have probes`);
    assert.equal(
      built.probes.every((probe) => /^SELECT\b/i.test(probe.sql.trim())),
      true,
      `${name} probes must be SELECT`,
    );
    assert.doesNotMatch(built.probes.map((probe) => probe.sql).join("\n"), /\b(UPDATE|INSERT|DELETE)\b/i);
  }
}

function testDataLineageAppliedAndNotApplied() {
  const cases = {
    "20260710122053_configure_starter_practices.sql": "data:starter_practices.configured_bundle",
    "20260710123015_backfill_starter_practices.sql": "data:user_practices.starter_backfill_footprint",
    "20260713150000_seed_first_audio_course_practice.sql": "data:practices.first_audio_course_seed",
    "20260714190000_assign_platform_owner_memberships.sql": "data:author_members.platform_owner_three_workspaces",
    "20260714201600_rename_sergey_and_zoya_author.sql": "data:authors.sergey_and_zoya_final_name",
    "20260715240000_repair_published_practice_audio_status.sql": "data:audio_items.no_draft_audio_on_published",
    "20260719140000_clear_legacy_author_seed_description.sql": "data:authors.legacy_seed_description_cleared",
    "20260801120000_aurafon_bypass_product_moderation.sql": "data:authors.aurafon_bypass_product_moderation",
    "20260810160000_studio_recording_webm_assets.sql": "data:storage.studio_draft_assets_allows_webm",
  };
  for (const [name, probeId] of Object.entries(cases)) {
    const sql = readMigration(name);
    const built = buildProbesFromSql(name, sql);
    assert.ok(built.probes.some((probe) => probe.id === probeId), `${name} missing ${probeId}`);
    const applied = classifyMigration({
      filename: name,
      sql,
      probeResults: resultsFor(built),
    });
    assert.equal(applied.status, "PROVEN_APPLIED", name);
    const missing = classifyMigration({
      filename: name,
      sql,
      probeResults: resultsFor(built, { [probeId]: "f" }),
    });
    assert.equal(missing.status, "PROVEN_NOT_APPLIED", `${name} false probe`);
  }
}

function testPromoFoundationSuperseded() {
  const name = "20260719150000_promo_pages_foundation.sql";
  const sql = readMigration(name);
  const built = buildProbesFromSql(name, sql);
  const superseded = [
    "trigger:promo_pages_status_change_guard",
    "policy:promo_pages.promo_pages_insert",
    "policy:promo_pages.promo_pages_update",
    "policy:promo_page_products.promo_page_products_insert",
    "policy:promo_page_products.promo_page_products_update",
    "policy:promo_page_products.promo_page_products_delete",
  ];
  for (const id of superseded) {
    const probe = built.probes.find((item) => item.id === id);
    assert.ok(probe, `missing auto probe ${id}`);
    assert.ok(probe.supersededBy, `${id} must be marked superseded`);
  }
  const overrides = Object.fromEntries(superseded.map((id) => [id, "f"]));
  const applied = classifyMigration({
    filename: name,
    sql,
    probeResults: resultsFor(built, overrides),
  });
  assert.equal(applied.status, "PROVEN_APPLIED");
  const guard = applied.evidence.find((row) => row.id === "trigger:promo_pages_status_change_guard");
  assert.equal(guard.ok, false);
  assert.equal(guard.satisfied, true);
  assert.equal(guard.evidenceType, "superseded_by:20260719154000");
  const insert = applied.evidence.find((row) => row.id === "policy:promo_pages.promo_pages_insert");
  assert.equal(insert.evidenceType, "superseded_by:20260719155000");

  const blocked = classifyMigration({
    filename: name,
    sql,
    probeResults: resultsFor(built, {
      ...overrides,
      "trigger:promo_pages_mutation_guard": "f",
      "function:public.create_promo_page_draft": "f",
      "function:public.update_promo_page_draft": "f",
      "function:public.promo_page_replace_products_core": "f",
    }),
  });
  assert.equal(blocked.status, "REQUIRES_MANUAL_REVIEW");
}

function testArchiveStatusSupersededByUnpublished() {
  const name = "20260715160000_archive_demo_catalog_practices.sql";
  const sql = readMigration(name);
  const built = buildProbesFromSql(name, sql);
  const archived = built.probes.find((probe) => probe.id === "data:practices.demo_catalog_archived");
  assert.equal(archived.supersededBy, "20260731180000");
  const applied = classifyMigration({
    filename: name,
    sql,
    probeResults: resultsFor(built, { "data:practices.demo_catalog_archived": "f" }),
  });
  assert.equal(applied.status, "PROVEN_APPLIED");
  const ev = applied.evidence.find((row) => row.id === "data:practices.demo_catalog_archived");
  assert.equal(ev.ok, false);
  assert.equal(ev.satisfied, true);
  assert.equal(ev.evidenceType, "superseded_by:20260731180000");
  const missing = classifyMigration({
    filename: name,
    sql,
    probeResults: resultsFor(built, {
      "data:practices.demo_catalog_archived": "f",
      "data:practices.demo_catalog_unpublished": "f",
    }),
  });
  assert.equal(missing.status, "PROVEN_NOT_APPLIED");
}

function testSchemaHardenAndPlaylistFinalState() {
  const harden = "20260728190000_admin_analytics_p2_privileges_harden.sql";
  const hardenSql = readMigration(harden);
  const hardenBuilt = buildProbesFromSql(harden, hardenSql);
  assert.ok(hardenBuilt.probes.some((probe) => probe.id === "privilege:admin_analytics_p2.locked"));
  assert.equal(
    classifyMigration({
      filename: harden,
      sql: hardenSql,
      probeResults: resultsFor(hardenBuilt),
    }).status,
    "PROVEN_APPLIED",
  );
  assert.equal(
    classifyMigration({
      filename: harden,
      sql: hardenSql,
      probeResults: resultsFor(hardenBuilt, { "privilege:admin_analytics_p2.locked": "f" }),
    }).status,
    "PROVEN_NOT_APPLIED",
  );

  const playlist = "20260816120000_playlist_description_max_300.sql";
  const playlistSql = readMigration(playlist);
  const playlistBuilt = buildProbesFromSql(playlist, playlistSql);
  const constraint = playlistBuilt.probes.find(
    (probe) => probe.id === "constraint:public.playlists.playlists_description_length_check_300",
  );
  assert.ok(constraint);
  assert.match(constraint.sql, /<= 300/);
  assert.doesNotMatch(constraint.sql, /<= 1000/);
  assert.equal(
    classifyMigration({
      filename: playlist,
      sql: playlistSql,
      probeResults: resultsFor(playlistBuilt),
    }).status,
    "PROVEN_APPLIED",
  );
}

function main() {
  testOlgaSpecialCase();
  testSchemaAndDataClassification();
  testApprovedBaselineRefusesReview();
  testAuditScriptFixtureNeverMutates();
  testRepoOlgaFileHasNoAuditWrite();
  testThirteenHaveSelectProbes();
  testDataLineageAppliedAndNotApplied();
  testPromoFoundationSuperseded();
  testArchiveStatusSupersededByUnpublished();
  testSchemaHardenAndPlaylistFinalState();
  console.log("migration-audit-unit: all tests passed");
}

main();
