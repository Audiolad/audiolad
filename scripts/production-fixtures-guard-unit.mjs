#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIXTURES_ALLOW_ENV,
  TEST_DATABASE_ENV,
  FIXTURE_PUBLISH_ENV,
  buildFixtureContext,
  isProductionSupabaseTarget,
  isAllowlistedSupabaseTarget,
} from "./lib/fixture-context.mjs";
import {
  buildPracticeFixtureCoverImage,
  hasFixtureMarker,
} from "./lib/fixture-marker.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contextPath = path.join(__dirname, "lib/fixture-context.mjs");
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(
  isProductionSupabaseTarget("http://127.0.0.1:8000"),
  "127.0.0.1:8000 must be production target",
);
assert(
  isProductionSupabaseTarget("https://audiolad.ru"),
  "audiolad.ru must be production target",
);
assert(
  !isProductionSupabaseTarget("http://127.0.0.1:54321"),
  "isolated local port must not be production target",
);
assert(
  isAllowlistedSupabaseTarget("http://127.0.0.1:54321"),
  "127.0.0.1:54321 must be allowlisted target",
);

function runProbe(env, probeBody) {
  const probe =
    probeBody ??
    `
    import { assertFixtureWritesAllowed } from ${JSON.stringify(contextPath)};
    assertFixtureWritesAllowed({
      scriptName: "probe",
      supabaseUrl: process.env.PROBE_SUPABASE_URL,
      dockerExec: process.env.PROBE_DOCKER === "1",
      dockerContainer: process.env.PROBE_DOCKER_CONTAINER || "supabase-db",
    });
    console.log("ALLOWED");
  `;
  const dir = mkdtempSync(path.join(tmpdir(), "fixtures-guard-"));
  const file = path.join(dir, "probe.mjs");
  writeFileSync(file, probe);
  const result = spawnSync(process.execPath, [file], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

const blockedProdUrl = runProbe({
  AUDIOLAD_PRODUCTION_SERVER: "",
  AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
  AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
  PROBE_SUPABASE_URL: "https://audiolad.ru",
  [TEST_DATABASE_ENV]: "1",
});
assert(
  blockedProdUrl.status !== 0,
  "production audiolad.ru URL must block even with AUDIOLAD_TEST_DATABASE=1",
);

const blockedProdHost = runProbe({
  AUDIOLAD_PRODUCTION_SERVER: "",
  AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
  AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
  PROBE_SUPABASE_URL: "http://127.0.0.1:8000",
  [TEST_DATABASE_ENV]: "1",
});
assert(
  blockedProdHost.status !== 0,
  "production DB host 127.0.0.1:8000 must block writes",
);

const blockedDocker = runProbe({
  AUDIOLAD_PRODUCTION_SERVER: "",
  AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
  AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
  PROBE_SUPABASE_URL: "http://127.0.0.1:54321",
  PROBE_DOCKER: "1",
  PROBE_DOCKER_CONTAINER: "supabase-db",
  [TEST_DATABASE_ENV]: "1",
});
assert(
  blockedDocker.status !== 0,
  "docker exec supabase-db must block even on allowlisted URL",
);

const blockedOverride = runProbe({
  AUDIOLAD_PRODUCTION_SERVER: "1",
  PROBE_SUPABASE_URL: "http://127.0.0.1:8000",
  [FIXTURES_ALLOW_ENV]: "true",
  [TEST_DATABASE_ENV]: "1",
});
assert(
  blockedOverride.status !== 0,
  "ALLOW_PRODUCTION_TEST_FIXTURES=true must NOT bypass production hard fail",
);

const blockedTestFlagWithoutAllowlist = runProbe({
  AUDIOLAD_PRODUCTION_SERVER: "",
  AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
  AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
  PROBE_SUPABASE_URL: "http://example.com:9999",
  [TEST_DATABASE_ENV]: "1",
});
assert(
  blockedTestFlagWithoutAllowlist.status !== 0,
  "AUDIOLAD_TEST_DATABASE=1 without allowlisted target must block",
);

const allowedIsolated = runProbe({
  AUDIOLAD_PRODUCTION_SERVER: "",
  AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
  AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
  PROBE_SUPABASE_URL: "http://127.0.0.1:54321",
  [TEST_DATABASE_ENV]: "1",
});
assert(
  allowedIsolated.status === 0 && allowedIsolated.stdout.includes("ALLOWED"),
  "allowlisted local target with AUDIOLAD_TEST_DATABASE=1 must allow writes",
);

const allowedStagingDocker = runProbe({
  AUDIOLAD_PRODUCTION_SERVER: "",
  AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
  AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
  PROBE_SUPABASE_URL: "http://127.0.0.1:54321",
  PROBE_DOCKER: "1",
  PROBE_DOCKER_CONTAINER: "supabase-db-staging",
  AUDIOLAD_TEST_DOCKER_CONTAINER: "supabase-db-staging",
  [TEST_DATABASE_ENV]: "1",
});
assert(
  allowedStagingDocker.status === 0 && allowedStagingDocker.stdout.includes("ALLOWED"),
  "allowlisted staging docker container must allow writes",
);

const blockedPublishOnProduction = runProbe(
  {
    AUDIOLAD_PRODUCTION_SERVER: "1",
    PROBE_SUPABASE_URL: "http://127.0.0.1:8000",
    [TEST_DATABASE_ENV]: "1",
    [FIXTURE_PUBLISH_ENV]: "1",
  },
  `
    import { assertFixturePublishingAllowed } from ${JSON.stringify(contextPath)};
    assertFixturePublishingAllowed({
      scriptName: "probe",
      supabaseUrl: process.env.PROBE_SUPABASE_URL,
    });
    console.log("ALLOWED");
  `,
);
assert(
  blockedPublishOnProduction.status !== 0,
  "production + publish flag must hard fail",
);

const blockedAllowlistWithProductionMarker = runProbe({
  AUDIOLAD_PRODUCTION_SERVER: "1",
  AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
  AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
  PROBE_SUPABASE_URL: "http://127.0.0.1:54321",
  [TEST_DATABASE_ENV]: "1",
});
assert(
  blockedAllowlistWithProductionMarker.status !== 0,
  "allowlisted URL with production release marker must hard fail",
);

const blockedProdOverStagingDocker = runProbe({
  AUDIOLAD_PRODUCTION_SERVER: "",
  AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
  AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
  PROBE_SUPABASE_URL: "http://127.0.0.1:54321",
  PROBE_DOCKER: "1",
  PROBE_DOCKER_CONTAINER: "supabase-db",
  [TEST_DATABASE_ENV]: "1",
});
assert(
  blockedProdOverStagingDocker.status !== 0,
  "production docker signal must win over allowlisted Supabase URL",
);

const blockedTestDbPlusProdUrl = runProbe({
  AUDIOLAD_PRODUCTION_SERVER: "",
  AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
  AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
  PROBE_SUPABASE_URL: "https://audiolad.ru",
  [TEST_DATABASE_ENV]: "1",
  [FIXTURE_PUBLISH_ENV]: "1",
});
assert(
  blockedTestDbPlusProdUrl.status !== 0,
  "AUDIOLAD_TEST_DATABASE=1 + production URL + publish flag must block",
);

const blockedWithoutTestFlag = runProbe({
  AUDIOLAD_PRODUCTION_SERVER: "",
  AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
  AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
  PROBE_SUPABASE_URL: "http://127.0.0.1:54321",
});
assert(
  blockedWithoutTestFlag.status !== 0,
  "missing AUDIOLAD_TEST_DATABASE=1 must block before write",
);

const registryPath = path.join(__dirname, "lib/fixture-registry.mjs");
const blockedCreateSqlHelpers = runProbe(
  {
    AUDIOLAD_PRODUCTION_SERVER: "",
    AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
    AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
    PROBE_SUPABASE_URL: "http://127.0.0.1:54321",
  },
  `
    import { createSqlHelpers } from ${JSON.stringify(registryPath)};
    createSqlHelpers("supabase-db-staging");
    console.log("ALLOWED");
  `,
);
assert(
  blockedCreateSqlHelpers.status !== 0,
  "createSqlHelpers must refuse writes without AUDIOLAD_TEST_DATABASE=1",
);

const scriptEntryPath = path.join(__dirname, "lib/fixture-script-entry.mjs");
const blockedProdEnvLocal = runProbe(
  {
    AUDIOLAD_PRODUCTION_SERVER: "",
    AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
    AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
    [TEST_DATABASE_ENV]: "1",
    PROBE_ENV_LOCAL: "1",
  },
  `
    import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import { assertProjectEnvLocalSafeForFixtures } from ${JSON.stringify(scriptEntryPath)};
    const dir = mkdtempSync(path.join(tmpdir(), "envlocal-probe-"));
    const envPath = path.join(dir, ".env.local");
    writeFileSync(envPath, "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8000\\n");
    try {
      assertProjectEnvLocalSafeForFixtures({ envPath });
      console.log("ALLOWED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  `,
);
assert(
  blockedProdEnvLocal.status !== 0,
  "production .env.local must hard fail before writes",
);

const ctxProd = buildFixtureContext({
  supabaseUrl: "http://127.0.0.1:8000",
  dockerExec: true,
  dockerContainer: "supabase-db",
});
assert(ctxProd.isProduction, "buildFixtureContext must detect production docker target");

const marker = buildPracticeFixtureCoverImage("unit-test", "abc123");
assert(hasFixtureMarker(marker), "practice fixture marker must be machine-readable");

if (failures.length) {
  console.error("production-fixtures-guard-unit FAILURES:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("production-fixtures-guard-unit: all checks passed");
