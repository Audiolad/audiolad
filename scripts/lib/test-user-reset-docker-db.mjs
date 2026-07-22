/**
 * Docker SQL access for test user reset integration — audiolad-test-db only.
 */
import { execSync } from "node:child_process";

import {
  TEST_DATABASE_ENV,
  assertFixtureWritesAllowed,
  buildFixtureContext,
  isProductionSupabaseTarget,
} from "./fixture-context.mjs";
import { INTEGRATION_OPT_IN_ENV, isTestUserResetIntegrationOptIn } from "./test-user-reset-integration-env.mjs";

export const ALLOWED_TEST_DB_CONTAINER = "audiolad-test-db";
export const SCRIPT_NAME = "scripts/test-user-reset-integration.mjs";

function fail(message) {
  console.error(`BLOCKED: ${message}`);
  process.exit(1);
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function assertExactTestDbContainer() {
  const requested = process.env.AUDIOLAD_TEST_DOCKER_CONTAINER;
  if (requested && requested !== ALLOWED_TEST_DB_CONTAINER) {
    fail(
      `AUDIOLAD_TEST_DOCKER_CONTAINER=${requested} is not allowed; only ${ALLOWED_TEST_DB_CONTAINER}`,
    );
  }
}

export function assertDockerContainerReady() {
  let runningNames = [];
  try {
    runningNames = execSync('docker ps --format "{{.Names}}"', {
      encoding: "utf8",
    })
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean);
  } catch {
    fail("docker is unavailable; cannot run test user reset integration");
  }

  if (!runningNames.includes(ALLOWED_TEST_DB_CONTAINER)) {
    fail(`docker container ${ALLOWED_TEST_DB_CONTAINER} is not running`);
  }

  let actualName = "";
  try {
    actualName = execSync(
      `docker inspect -f '{{.Name}}' ${ALLOWED_TEST_DB_CONTAINER}`,
      { encoding: "utf8" },
    )
      .trim()
      .replace(/^\//, "");
  } catch {
    fail(`docker inspect failed for ${ALLOWED_TEST_DB_CONTAINER}`);
  }

  if (actualName !== ALLOWED_TEST_DB_CONTAINER) {
    fail(
      `docker container name mismatch: expected ${ALLOWED_TEST_DB_CONTAINER}, got ${actualName}`,
    );
  }
}

export function bootstrapTestUserResetDockerIntegration(options = {}) {
  const scriptName = options.scriptName ?? SCRIPT_NAME;

  if (!isTestUserResetIntegrationOptIn()) {
    fail(`${INTEGRATION_OPT_IN_ENV}=1 is required for mutating integration tests`);
  }

  if (process.env[TEST_DATABASE_ENV] !== "1") {
    fail(`${TEST_DATABASE_ENV}=1 is required`);
  }

  const configuredSupabaseUrl =
    process.env.AUDIOLAD_TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";

  if (isProductionSupabaseTarget(configuredSupabaseUrl)) {
    fail(`production Supabase URL blocked: ${configuredSupabaseUrl}`);
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && isProductionSupabaseTarget(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    fail("production NEXT_PUBLIC_SUPABASE_URL detected in environment");
  }

  assertExactTestDbContainer();

  const fixtureContext = buildFixtureContext({
    scriptName,
    supabaseUrl: configuredSupabaseUrl,
    dockerExec: true,
    dockerContainer: ALLOWED_TEST_DB_CONTAINER,
  });

  if (fixtureContext.isProduction) {
    fail(
      `production fixture markers detected: ${fixtureContext.productionSignals.join(", ")}`,
    );
  }

  assertFixtureWritesAllowed({
    scriptName,
    supabaseUrl: configuredSupabaseUrl,
    dockerExec: true,
    dockerContainer: ALLOWED_TEST_DB_CONTAINER,
  });

  assertDockerContainerReady();

  sqlFile(`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO public, extensions, auth;
`);

  const ping = sqlScalar("SELECT 1");
  if (ping !== "1") {
    fail(`${ALLOWED_TEST_DB_CONTAINER} database is not reachable`);
  }

  return { container: ALLOWED_TEST_DB_CONTAINER, supabaseUrl: configuredSupabaseUrl };
}

export function sqlFile(content) {
  return execSync(
    `docker exec -i ${ALLOWED_TEST_DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1`,
    { input: content, encoding: "utf8" },
  );
}

export function sqlScalar(query) {
  const oneLine = query.replace(/\s+/g, " ").trim();
  return execSync(
    `docker exec ${ALLOWED_TEST_DB_CONTAINER} psql -U postgres -d postgres -tAc ${JSON.stringify(oneLine)}`,
    { encoding: "utf8" },
  ).trim();
}

export function runInTransaction(label, fn) {
  const parts = ["BEGIN;", "SET search_path TO public, extensions, auth;"];
  const tx = {
    sql(content) {
      parts.push(content);
    },
    quoteLiteral,
  };

  fn(tx);
  parts.push("ROLLBACK;");

  try {
    sqlFile(parts.join("\n"));
  } catch (error) {
    throw new Error(`${label}: ${error.message ?? error}`);
  }
}

export { quoteLiteral };
