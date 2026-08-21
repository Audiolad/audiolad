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

function main() {
  testOlgaSpecialCase();
  testSchemaAndDataClassification();
  testApprovedBaselineRefusesReview();
  testAuditScriptFixtureNeverMutates();
  testRepoOlgaFileHasNoAuditWrite();
  console.log("migration-audit-unit: all tests passed");
}

main();
