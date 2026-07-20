/**
 * Isolated PostgreSQL helpers for personal materials P1 verification.
 *
 * Uses docker exec against supabase-db with an explicit non-production database name.
 * Never targets the production `postgres` database.
 */
import { execSync } from "node:child_process";

export const PERSONAL_MATERIALS_TEST_DB =
  process.env.AUDIOLAD_PERSONAL_MATERIALS_TEST_DB_NAME ??
  "audiolad_personal_materials_test";

export const PERSONAL_MATERIALS_TEST_OPT_IN_ENV =
  "AUDIOLAD_PERSONAL_MATERIALS_P1_TEST";

export const TEST_DATABASE_ENV = "AUDIOLAD_TEST_DATABASE";

export const PRODUCTION_DB_NAME = "postgres";

export const DOCKER_CONTAINER =
  process.env.AUDIOLAD_PERSONAL_MATERIALS_DOCKER_CONTAINER ?? "supabase-db";

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

  const currentDb = execSync(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${databaseName} -tAc "SELECT current_database();"`,
    { encoding: "utf8" },
  ).trim();

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
    return execSync(
      `docker exec -i ${DOCKER_CONTAINER} psql -U postgres -d ${databaseName} -v ON_ERROR_STOP=1`,
      { input: content, encoding: "utf8" },
    );
  }

  function sqlScalar(query) {
    const oneLine = query.replace(/\s+/g, " ").trim();
    return execSync(
      `docker exec ${DOCKER_CONTAINER} psql -U postgres -d ${databaseName} -tAc ${JSON.stringify(oneLine)}`,
      { encoding: "utf8" },
    ).trim();
  }

  function sqlJson(query) {
    const raw = sqlScalar(query);
    return raw ? JSON.parse(raw) : null;
  }

  return { sqlFile, sqlScalar, sqlJson, databaseName };
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
