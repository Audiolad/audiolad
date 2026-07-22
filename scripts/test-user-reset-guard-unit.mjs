#!/usr/bin/env node
/**
 * Guard contract tests for test user reset integration entrypoint.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TEST_DATABASE_ENV,
  isProductionSupabaseTarget,
} from "./lib/fixture-context.mjs";
import { ALLOWED_TEST_DB_CONTAINER } from "./lib/test-user-reset-docker-db.mjs";
import {
  INTEGRATION_OPT_IN_ENV,
  TEST_SUPABASE_URL_ENV,
} from "./lib/test-user-reset-integration-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const integrationScript = path.join(__dirname, "test-user-reset-integration.mjs");
const mockScript = path.join(__dirname, "test-user-reset-service-mock-unit.mjs");
const unitScript = path.join(__dirname, "test-user-reset-unit.mjs");
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function runNode(scriptPath, env = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      AUDIOLAD_PRODUCTION_SERVER: "",
      AUDIOLAD_PRODUCTION_MARKER: "/tmp/audiolad-test-user-reset-guard-nonprod-marker",
      AUDIOLAD_DEPLOY_ROOT: "/tmp/audiolad-test-user-reset-guard-nonprod-deploy",
      ...env,
    },
    encoding: "utf8",
  });
}

assert(
  isProductionSupabaseTarget("https://audiolad.ru"),
  "audiolad.ru must be production target",
);

const blockedProdUrl = runNode(integrationScript, {
  [INTEGRATION_OPT_IN_ENV]: "1",
  [TEST_DATABASE_ENV]: "1",
  [TEST_SUPABASE_URL_ENV]: "https://audiolad.ru",
});
assert(
  blockedProdUrl.status !== 0,
  "production URL must block integration even with opt-in flags",
);

const blockedProdDockerOverride = runNode(integrationScript, {
  [INTEGRATION_OPT_IN_ENV]: "1",
  [TEST_DATABASE_ENV]: "1",
  AUDIOLAD_TEST_DOCKER_CONTAINER: "supabase-db",
});
assert(
  blockedProdDockerOverride.status !== 0,
  "supabase-db container override must block integration",
);

const blockedMissingOptIn = runNode(integrationScript, {
  [TEST_DATABASE_ENV]: "1",
});
assert(
  blockedMissingOptIn.status !== 0,
  "missing integration opt-in must block before mutations",
);

const blockedMissingTestDbFlag = runNode(integrationScript, {
  [INTEGRATION_OPT_IN_ENV]: "1",
});
assert(
  blockedMissingTestDbFlag.status !== 0,
  "missing AUDIOLAD_TEST_DATABASE=1 must block integration",
);

const integrationSource = readFileSync(integrationScript, "utf8");
assert(
  integrationSource.includes("audiolad-test-db"),
  "integration script must hardcode audiolad-test-db container constant",
);
assert(
  integrationSource.includes("bootstrapTestUserResetDockerIntegration"),
  "integration script must bootstrap docker guards before mutations",
);
assert(
  !integrationSource.includes("@supabase/supabase-js"),
  "integration script must not use Supabase JS client",
);
assert(
  !integrationSource.includes(".env.local"),
  "integration script must not reference production env.local",
);

const unitSource = readFileSync(unitScript, "utf8");
assert(
  !/^import .*@supabase\/supabase-js/m.test(unitSource),
  "unit script must not import Supabase client",
);
assert(
  !unitSource.includes("docker exec"),
  "unit script must not run docker SQL",
);

const mockSource = readFileSync(mockScript, "utf8");
assert(
  mockSource.includes("deleteUser"),
  "mock service tests must cover auth.admin.deleteUser contract",
);
assert(
  !mockSource.includes("docker exec"),
  "mock service tests must not run docker SQL",
);

if (failures.length) {
  console.error("test-user-reset-guard-unit FAILURES:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`test-user-reset-guard-unit: all checks passed (${ALLOWED_TEST_DB_CONTAINER})`);
