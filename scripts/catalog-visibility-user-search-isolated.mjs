#!/usr/bin/env node
/**
 * Isolated integration for selected_users allowlist search RPC.
 * Never defaults to a production database. Skip unless an isolated target
 * is supplied via URL or docker exec transport.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ALLOWED_DATABASE = "audiolad_visibility_search_isolated";
const UNSAFE_DATABASE_NAMES = ["postgres", "template0", "template1", "supabase"];

const databaseUrl = process.env.AUDIOLAD_VISIBILITY_USER_SEARCH_DATABASE_URL;
const requestedAllowedDatabase =
  process.env.AUDIOLAD_VISIBILITY_USER_SEARCH_ALLOW_DB;
const transport = process.env.AUDIOLAD_VISIBILITY_USER_SEARCH_TRANSPORT;
const dockerContainerOverride =
  process.env.AUDIOLAD_VISIBILITY_USER_SEARCH_DOCKER_CONTAINER;
const dockerPsqlUser =
  process.env.AUDIOLAD_VISIBILITY_USER_SEARCH_PSQL_USER ?? "supabase_admin";
const dockerDatabaseName = process.env.AUDIOLAD_VISIBILITY_USER_SEARCH_DB;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationSql = join(
  root,
  "supabase/migrations/20260903120000_search_practice_visibility_users.sql",
);
const fixtureSql = join(
  root,
  "supabase/tests/catalog_visibility_user_search_isolated.sql",
);

export function hasIsolatedOrTestToken(databaseName) {
  return /(^|_)(isolated|test)(_|$)/i.test(databaseName ?? "");
}

export function parseAllowedDatabaseName(databaseName, allowDatabase) {
  if (typeof databaseName !== "string" || !databaseName) {
    return { ok: false, reason: "database name is required" };
  }

  const normalized = databaseName.toLowerCase();
  if (UNSAFE_DATABASE_NAMES.includes(normalized)) {
    return { ok: false, reason: `refusing unsafe database name: ${databaseName}` };
  }

  if (/(^|_)(production|prod)(_|$)/i.test(normalized)) {
    return { ok: false, reason: `refusing production-looking database: ${databaseName}` };
  }

  if (normalized === "audiolad" || !hasIsolatedOrTestToken(normalized)) {
    return {
      ok: false,
      reason:
        `database ${databaseName} is not allowed; name must include an isolated or test token`,
    };
  }

  const allowed =
    allowDatabase === databaseName || databaseName === DEFAULT_ALLOWED_DATABASE;
  if (!allowed) {
    return {
      ok: false,
      reason:
        `database ${databaseName} is not allowed; use ${DEFAULT_ALLOWED_DATABASE} ` +
        "or set AUDIOLAD_VISIBILITY_USER_SEARCH_ALLOW_DB to its exact name",
    };
  }

  return { ok: true, databaseName };
}

export function parseAllowedDatabaseUrl(url, allowDatabase) {
  if (!url) {
    return { ok: false, reason: "database URL is required" };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "database URL is invalid" };
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    return { ok: false, reason: "database URL must use postgres protocol" };
  }

  const databaseName = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, "");
  if (!databaseName || databaseName.includes("/")) {
    return { ok: false, reason: "database URL must name exactly one database" };
  }

  return parseAllowedDatabaseName(databaseName, allowDatabase);
}

export function buildDockerPsqlArgs({ container, user, databaseName }) {
  return [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    user,
    "-d",
    databaseName,
    "-v",
    "ON_ERROR_STOP=1",
  ];
}

function validateDockerContainer(container) {
  const overridden = Object.hasOwn(
    process.env,
    "AUDIOLAD_VISIBILITY_USER_SEARCH_DOCKER_CONTAINER",
  );
  if (!container) {
    return { ok: false, reason: "Docker container name is required" };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(container)) {
    return { ok: false, reason: "Docker container name is not a safe identifier" };
  }
  if (container !== "supabase-db" && !overridden) {
    return {
      ok: false,
      reason: "Docker container must be supabase-db unless explicitly overridden",
    };
  }
  return { ok: true };
}

function runUrlPsql(url, sqlPath) {
  return spawnSync(
    "psql",
    ["--dbname", url, "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
    { stdio: "inherit" },
  );
}

function runDockerPsql(args, sqlPath) {
  return spawnSync("docker", args, {
    input: readFileSync(sqlPath, "utf8"),
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function main() {
  let target;
  let runPsql;

  if (databaseUrl) {
    target = parseAllowedDatabaseUrl(databaseUrl, requestedAllowedDatabase);
    runPsql = (sqlPath) => runUrlPsql(databaseUrl, sqlPath);
  } else if (transport === "docker") {
    target = parseAllowedDatabaseName(dockerDatabaseName, requestedAllowedDatabase);
    if (!target.ok) {
      console.log("catalog-visibility-user-search-isolated: FAIL");
      throw new Error(target.reason);
    }
    const container = dockerContainerOverride ?? "supabase-db";
    const containerValidation = validateDockerContainer(container);
    if (!containerValidation.ok) {
      console.log("catalog-visibility-user-search-isolated: FAIL");
      throw new Error(containerValidation.reason);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(dockerPsqlUser)) {
      console.log("catalog-visibility-user-search-isolated: FAIL");
      throw new Error("psql user is not a safe identifier");
    }
    const dockerArgs = buildDockerPsqlArgs({
      container,
      user: dockerPsqlUser,
      databaseName: target.databaseName,
    });
    runPsql = (sqlPath) => runDockerPsql(dockerArgs, sqlPath);
  } else if (!transport) {
    console.log(
      "catalog-visibility-user-search-isolated: skipped (set AUDIOLAD_VISIBILITY_USER_SEARCH_DATABASE_URL or TRANSPORT=docker for an isolated DB)",
    );
    return;
  } else {
    console.log("catalog-visibility-user-search-isolated: FAIL");
    throw new Error("unsupported visibility user-search transport");
  }

  if (!target.ok) {
    console.log("catalog-visibility-user-search-isolated: FAIL");
    throw new Error(target.reason);
  }

  if (!existsSync(migrationSql) || !existsSync(fixtureSql)) {
    console.log("catalog-visibility-user-search-isolated: FAIL");
    throw new Error("visibility user-search migration or isolated SQL is missing");
  }

  console.log(`catalog-visibility-user-search-isolated: target=${target.databaseName}`);

  const applied = runPsql(migrationSql);
  if (applied.error) {
    console.log("catalog-visibility-user-search-isolated: FAIL");
    throw applied.error;
  }
  if (applied.status !== 0) {
    console.log("catalog-visibility-user-search-isolated: FAIL");
    process.exit(applied.status ?? 1);
  }

  const fixture = runPsql(fixtureSql);
  if (fixture.error) {
    console.log("catalog-visibility-user-search-isolated: FAIL");
    throw fixture.error;
  }
  if (fixture.status !== 0) {
    console.log("catalog-visibility-user-search-isolated: FAIL");
    process.exit(fixture.status ?? 1);
  }

  console.log("catalog-visibility-user-search-isolated: PASS");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
