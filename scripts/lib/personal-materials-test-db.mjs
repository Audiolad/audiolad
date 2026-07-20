/**
 * Isolated PostgreSQL helpers for personal materials P1 verification.
 *
 * Uses docker exec against supabase-db with an explicit non-production database name.
 * Never targets the production `postgres` database for writes.
 * All docker invocations use execFileSync (no shell interpolation).
 */
import { execFileSync } from "node:child_process";

export const PERSONAL_MATERIALS_TEST_DB =
  process.env.AUDIOLAD_PERSONAL_MATERIALS_TEST_DB_NAME ??
  "audiolad_personal_materials_test";

export const PERSONAL_MATERIALS_TEST_OPT_IN_ENV =
  "AUDIOLAD_PERSONAL_MATERIALS_P1_TEST";

export const TEST_DATABASE_ENV = "AUDIOLAD_TEST_DATABASE";

export const PRODUCTION_DB_NAME = "postgres";

export const DOCKER_CONTAINER =
  process.env.AUDIOLAD_PERSONAL_MATERIALS_DOCKER_CONTAINER ?? "supabase-db";

const SAFE_DOCKER_ARG = /^[A-Za-z0-9._:-]+$/;

function assertSafeDockerArg(value, label) {
  if (typeof value !== "string" || !SAFE_DOCKER_ARG.test(value)) {
    throw new Error(`BLOCKED: unsafe docker ${label}: ${String(value)}`);
  }
}

function assertContainerSafe() {
  assertSafeDockerArg(DOCKER_CONTAINER, "container");
}

/**
 * Run `docker exec <container> ...args` without a shell.
 */
export function dockerExec(args, options = {}) {
  assertContainerSafe();
  return execFileSync("docker", ["exec", DOCKER_CONTAINER, ...args], {
    encoding: "utf8",
    ...options,
  });
}

/**
 * Run `docker exec -i <container> ...args` without a shell (stdin via options.input).
 */
export function dockerExecInteractive(args, options = {}) {
  assertContainerSafe();
  return execFileSync("docker", ["exec", "-i", DOCKER_CONTAINER, ...args], {
    encoding: "utf8",
    ...options,
  });
}

export function dockerPsql(databaseName, extraArgs, options = {}) {
  assertSafeDockerArg(databaseName, "database");
  return dockerExec(
    ["psql", "-U", "postgres", "-d", databaseName, ...extraArgs],
    options,
  );
}

export function dockerPsqlInteractive(databaseName, extraArgs = [], options = {}) {
  assertSafeDockerArg(databaseName, "database");
  return dockerExecInteractive(
    ["psql", "-U", "postgres", "-d", databaseName, ...extraArgs],
    options,
  );
}

export function assertPersonalMaterialsTestDbAllowed(options = {}) {
  const scriptName = options.scriptName ?? process.argv[1] ?? "unknown script";
  const databaseName = options.databaseName ?? PERSONAL_MATERIALS_TEST_DB;

  if (process.env[TEST_DATABASE_ENV] !== "1") {
    console.error(
      `BLOCKED: ${scriptName} requires ${TEST_DATABASE_ENV}=1 before any writes.`,
    );
    process.exit(1);
  }

  if (process.env[PERSONAL_MATERIALS_TEST_OPT_IN_ENV] !== "1") {
    console.error(
      [
        `BLOCKED: ${scriptName} requires explicit opt-in ${PERSONAL_MATERIALS_TEST_OPT_IN_ENV}=1.`,
        `Allowed database: ${PERSONAL_MATERIALS_TEST_DB}`,
      ].join("\n"),
    );
    process.exit(1);
  }

  if (!databaseName || databaseName === PRODUCTION_DB_NAME) {
    console.error(
      `BLOCKED: ${scriptName} refused production database "${databaseName ?? "(missing)"}".`,
    );
    process.exit(1);
  }

  if (databaseName !== PERSONAL_MATERIALS_TEST_DB) {
    console.error(
      `BLOCKED: ${scriptName} database "${databaseName}" is not allowlisted.`,
    );
    process.exit(1);
  }

  assertSafeDockerArg(databaseName, "database");

  const currentDb = dockerPsql(databaseName, [
    "-tAc",
    "SELECT current_database();",
  ]).trim();

  if (currentDb !== databaseName) {
    console.error(
      `BLOCKED: connected database "${currentDb}" does not match expected "${databaseName}".`,
    );
    process.exit(1);
  }
}

export function createPersonalMaterialsSqlHelpers(options = {}) {
  const databaseName = options.databaseName ?? PERSONAL_MATERIALS_TEST_DB;
  assertPersonalMaterialsTestDbAllowed({
    ...options,
    databaseName,
  });

  function sqlFile(content) {
    return dockerPsqlInteractive(
      databaseName,
      ["-v", "ON_ERROR_STOP=1"],
      { input: content },
    );
  }

  function sqlScalar(query) {
    const oneLine = query.replace(/\s+/g, " ").trim();
    return dockerPsql(databaseName, ["-tAc", oneLine]).trim();
  }

  function sqlJson(query) {
    const raw = sqlScalar(query);
    return raw ? JSON.parse(raw) : null;
  }

  function runScript(content) {
    return dockerPsqlInteractive(
      databaseName,
      ["-q", "-v", "ON_ERROR_STOP=1", "-tA"],
      { input: content },
    ).trim();
  }

  return { sqlFile, sqlScalar, sqlJson, runScript, databaseName };
}

export function describePersonalMaterialsTestTarget() {
  return {
    host: "127.0.0.1 (docker: supabase-db)",
    port: "5432 (internal)",
    database: PERSONAL_MATERIALS_TEST_DB,
    currentUser: "postgres",
    isProduction: false,
  };
}
