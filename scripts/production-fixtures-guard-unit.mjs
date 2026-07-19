#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXTURES_ALLOW_ENV,
  isProductionFixtureContext,
  isProductionSupabaseTarget,
} from "./lib/guard-production-fixtures.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const guardPath = path.join(__dirname, "lib/guard-production-fixtures.mjs");
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

function runGuardProbe(env) {
  const probe = `
    import { assertProductionFixturesAllowed } from ${JSON.stringify(guardPath)};
    assertProductionFixturesAllowed({
      scriptName: "probe",
      supabaseUrl: process.env.PROBE_SUPABASE_URL,
      dockerExec: process.env.PROBE_DOCKER === "1",
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

const blockedKong = runGuardProbe({
  AUDIOLAD_PRODUCTION_SERVER: "1",
  PROBE_SUPABASE_URL: "http://127.0.0.1:8000",
  PROBE_DOCKER: "0",
});
assert(blockedKong.status !== 0, "production marker + 127.0.0.1:8000 must block without flag");

const blockedProdUrl = runGuardProbe({
  AUDIOLAD_PRODUCTION_SERVER: "1",
  PROBE_SUPABASE_URL: "https://audiolad.ru",
  PROBE_DOCKER: "0",
});
assert(blockedProdUrl.status !== 0, "production marker + audiolad.ru must block without flag");

const allowedExplicit = runGuardProbe({
  AUDIOLAD_PRODUCTION_SERVER: "1",
  PROBE_SUPABASE_URL: "http://127.0.0.1:8000",
  [FIXTURES_ALLOW_ENV]: "true",
});
assert(
  allowedExplicit.status === 0 && allowedExplicit.stdout.includes("ALLOWED"),
  "explicit ALLOW_PRODUCTION_TEST_FIXTURES=true must allow on production marker",
);

const allowedIsolated = runGuardProbe({
  AUDIOLAD_PRODUCTION_SERVER: "",
  AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-fixtures-guard-nonprod-marker",
  AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-fixtures-guard-nonprod-deploy",
  PROBE_SUPABASE_URL: "http://127.0.0.1:54321",
  PROBE_DOCKER: "0",
});
assert(
  allowedIsolated.status === 0 && allowedIsolated.stdout.includes("ALLOWED"),
  "non-production isolated staging target must allow without flag",
);

assert(
  !isProductionFixtureContext({
    supabaseUrl: "http://127.0.0.1:54321",
    dockerExec: false,
  }) ||
    !isProductionSupabaseTarget("http://127.0.0.1:54321"),
  "isolated target must not match production Supabase host",
);

if (failures.length) {
  console.error("production-fixtures-guard-unit FAILURES:");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log("production-fixtures-guard-unit: all checks passed");
