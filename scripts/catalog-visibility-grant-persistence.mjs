#!/usr/bin/env node
/**
 * Runs the grant-persistence fixture only against an explicitly named,
 * isolated copy database. It never supplies a default database URL.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ALLOWED_DATABASE = "audiolad_pr138_visibility_test";
const databaseUrl = process.env.AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_DATABASE_URL;
const requestedAllowedDatabase =
  process.env.AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_ALLOW_DB;
const transport = process.env.AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_TRANSPORT;
const dockerContainerOverride =
  process.env.AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_DOCKER_CONTAINER;
const dockerPsqlUser =
  process.env.AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_PSQL_USER ?? "supabase_admin";
const dockerDatabaseName =
  process.env.AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_DB;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const transactionSql = join(
  root,
  "supabase/tests/catalog_visibility_grant_persistence_copy.sql",
);
const postcheckSql = join(
  root,
  "supabase/tests/catalog_visibility_grant_persistence_postcheck.sql",
);

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

export function parseAllowedDatabaseName(databaseName, allowDatabase) {
  if (typeof databaseName !== "string" || !databaseName) {
    return { ok: false, reason: "database name is required" };
  }

  const normalized = databaseName.toLowerCase();
  if (["postgres", "template0", "template1"].includes(normalized)) {
    return { ok: false, reason: `refusing unsafe database name: ${databaseName}` };
  }

  const allowed =
    allowDatabase === databaseName || databaseName === DEFAULT_ALLOWED_DATABASE;
  if (!allowed) {
    return {
      ok: false,
      reason:
        `database ${databaseName} is not allowed; use ${DEFAULT_ALLOWED_DATABASE} ` +
        "or set AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_ALLOW_DB to its exact name",
    };
  }

  return { ok: true, databaseName };
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
    "AUDIOLAD_VISIBILITY_GRANT_PERSISTENCE_DOCKER_CONTAINER",
  );
  if (!container) {
    return { ok: false, reason: "Docker container name is required" };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(container)) {
    return { ok: false, reason: "Docker container name is not a safe identifier" };
  }
  if (container !== "supabase-db" && !overridden) {
    return { ok: false, reason: "Docker container must be supabase-db unless explicitly overridden" };
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
      throw new Error(target.reason);
    }
    const container = dockerContainerOverride ?? "supabase-db";
    const containerValidation = validateDockerContainer(container);
    if (!containerValidation.ok) {
      throw new Error(containerValidation.reason);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(dockerPsqlUser)) {
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
      "catalog-visibility-grant-persistence: skipped (set DATABASE_URL or TRANSPORT=docker for an isolated copy DB)",
    );
    return;
  } else {
    throw new Error("unsupported grant persistence transport");
  }

  if (!target.ok) {
    throw new Error(target.reason);
  }

  if (!existsSync(transactionSql) || !existsSync(postcheckSql)) {
    throw new Error("grant persistence SQL fixture or postcheck is missing");
  }

  console.log(`catalog-visibility-grant-persistence: target=${target.databaseName}`);
  const transaction = runPsql(transactionSql);

  // psql disconnect rolls back an open transaction on an assertion error.
  // This separate read-only connection proves rollback also after a failure.
  const postcheck = runPsql(postcheckSql);

  if (transaction.error) throw transaction.error;
  if (postcheck.error) throw postcheck.error;
  if (transaction.status !== 0) process.exitCode = transaction.status ?? 1;
  if (postcheck.status !== 0) process.exitCode = postcheck.status ?? 1;

  if (process.exitCode == null) {
    console.log("catalog-visibility-grant-persistence: ok");
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
