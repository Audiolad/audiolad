/**
 * Central fixture write context: production detection + staging/local allowlist.
 *
 * Data-creating scripts must call assertFixtureWritesAllowed() before any INSERT.
 * ALLOW_PRODUCTION_TEST_FIXTURES=true no longer bypasses production writes.
 */
import { existsSync } from "node:fs";
import { DEPLOY_ROOT, PRODUCTION_MARKER } from "./is-production-server.mjs";

export const TEST_DATABASE_ENV = "AUDIOLAD_TEST_DATABASE";
export const FIXTURE_PUBLISH_ENV = "AUDIOLAD_FIXTURE_PUBLISH";
/** @deprecated No longer bypasses production writes. Kept for audit/tests only. */
export const FIXTURES_ALLOW_ENV = "ALLOW_PRODUCTION_TEST_FIXTURES";

export const DOC = "docs/operations/production-fixture-policy.md";

export const PRODUCTION_SUPABASE_HOSTS = new Set([
  "127.0.0.1:8000",
  "localhost:8000",
  "audiolad.ru",
  "www.audiolad.ru",
]);

export const ALLOWLISTED_SUPABASE_HOSTS = new Set([
  "127.0.0.1:54321",
  "localhost:54321",
]);

export const ALLOWLISTED_DB_NAMES = new Set([
  "postgres_test",
  "audiolad_test",
  "audiolad_staging",
]);

export const PRODUCTION_DOCKER_CONTAINERS = new Set(["supabase-db"]);

export const ALLOWLISTED_DOCKER_CONTAINERS = new Set([
  "supabase-db-staging",
  "supabase-test-db",
  "audiolad-test-db",
]);

export const PRODUCTION_CONNECTION_DENYLIST_SUBSTRINGS = [
  "audiolad.ru",
  "/var/www/audiolad-deploy",
  "127.0.0.1:8000",
  "localhost:8000",
  "supabase-db",
];

export function normalizeSupabaseHost(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
    return url.host.toLowerCase();
  } catch {
    return String(raw).trim().toLowerCase();
  }
}

export function isProductionSupabaseTarget(target) {
  const host = normalizeSupabaseHost(target);
  if (!host) return false;
  if (PRODUCTION_SUPABASE_HOSTS.has(host)) return true;
  if (host.endsWith(".audiolad.ru") || host === "audiolad.ru") return true;
  return false;
}

export function isAllowlistedSupabaseTarget(target) {
  const host = normalizeSupabaseHost(target);
  if (!host) return false;
  return ALLOWLISTED_SUPABASE_HOSTS.has(host);
}

export function hasProductionServerMarker() {
  if (process.env.AUDIOLAD_PRODUCTION_SERVER === "1") return true;
  const marker = process.env.AUDIOLAD_PRODUCTION_MARKER ?? PRODUCTION_MARKER;
  if (existsSync(marker)) return true;
  const deployRoot = process.env.AUDIOLAD_DEPLOY_ROOT ?? DEPLOY_ROOT;
  if (existsSync(`${deployRoot}/current`)) return true;
  return false;
}

export function isProductionDeployEnvInUse() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(url && isProductionSupabaseTarget(url));
}

export function connectionStringLooksProduction(connectionString) {
  if (!connectionString || typeof connectionString !== "string") {
    return false;
  }
  const normalized = connectionString.toLowerCase();
  return PRODUCTION_CONNECTION_DENYLIST_SUBSTRINGS.some((part) =>
    normalized.includes(part),
  );
}

export function isProductionDockerTarget(containerName) {
  if (!containerName) return false;
  return PRODUCTION_DOCKER_CONTAINERS.has(String(containerName).trim());
}

export function isAllowlistedDockerTarget(containerName) {
  if (!containerName) return false;
  const name = String(containerName).trim();
  if (process.env.AUDIOLAD_TEST_DOCKER_CONTAINER === name) {
    return ALLOWLISTED_DOCKER_CONTAINERS.has(name);
  }
  return ALLOWLISTED_DOCKER_CONTAINERS.has(name);
}

export function isTestDatabaseFlagSet() {
  return process.env[TEST_DATABASE_ENV] === "1";
}

export function isFixturePublishFlagSet() {
  return process.env[FIXTURE_PUBLISH_ENV] === "1";
}

/** @deprecated Override is ignored for writes. */
export function isProductionFixturesExplicitlyAllowed() {
  return process.env[FIXTURES_ALLOW_ENV] === "true";
}

export function buildFixtureContext(options = {}) {
  const scriptName = options.scriptName ?? process.argv[1] ?? "unknown script";
  const supabaseUrl =
    options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const supabaseHost = supabaseUrl ? normalizeSupabaseHost(supabaseUrl) : null;
  const dockerExec = Boolean(options.dockerExec);
  const dockerContainer =
    options.dockerContainer ??
    process.env.AUDIOLAD_TEST_DOCKER_CONTAINER ??
    (dockerExec ? "supabase-db" : null);
  const databaseName = options.databaseName ?? process.env.AUDIOLAD_TEST_DB_NAME ?? null;
  const connectionString =
    options.connectionString ?? process.env.DATABASE_URL ?? null;

  const productionSignals = [];

  if (hasProductionServerMarker()) {
    productionSignals.push("production_server_marker");
  }
  if (supabaseUrl && isProductionSupabaseTarget(supabaseUrl)) {
    productionSignals.push(`production_supabase_host:${supabaseHost}`);
  }
  if (isProductionDeployEnvInUse() && !options.supabaseUrl) {
    productionSignals.push("production_env_supabase_url");
  }
  if (dockerExec && isProductionDockerTarget(dockerContainer)) {
    productionSignals.push(`production_docker:${dockerContainer}`);
  }
  if (connectionStringLooksProduction(connectionString)) {
    productionSignals.push("production_connection_string");
  }
  if (process.env.AUDIOLAD_ENV === "production") {
    productionSignals.push("AUDIOLAD_ENV=production");
  }

  const allowlistSignals = [];
  let isAllowlistedTarget = false;

  if (supabaseUrl && isAllowlistedSupabaseTarget(supabaseUrl)) {
    allowlistSignals.push(`allowlisted_supabase_host:${supabaseHost}`);
    isAllowlistedTarget = true;
  }
  if (dockerContainer && isAllowlistedDockerTarget(dockerContainer)) {
    allowlistSignals.push(`allowlisted_docker:${dockerContainer}`);
    isAllowlistedTarget = true;
  }
  if (databaseName && ALLOWLISTED_DB_NAMES.has(databaseName)) {
    allowlistSignals.push(`allowlisted_db_name:${databaseName}`);
    isAllowlistedTarget = true;
  }

  const ambiguous =
    !supabaseUrl &&
    !dockerExec &&
    !connectionString &&
    !databaseName &&
    productionSignals.length === 0;

  return {
    scriptName,
    supabaseUrl: supabaseUrl ?? "(not set)",
    supabaseHost,
    dockerExec,
    dockerContainer,
    databaseName,
    productionSignals,
    allowlistSignals,
    isProduction: productionSignals.length > 0,
    isAllowlistedTarget,
    isTestDatabaseFlagSet: isTestDatabaseFlagSet(),
    isFixturePublishFlagSet: isFixturePublishFlagSet(),
    ambiguous,
    deprecatedOverrideRequested: isProductionFixturesExplicitlyAllowed(),
  };
}

function formatBlockedMessage(ctx, reasonLines) {
  return [
    "",
    "╔══════════════════════════════════════════════════════════════════╗",
    "║  BLOCKED: fixture/test data writes are not allowed               ║",
    "╚══════════════════════════════════════════════════════════════════╝",
    `Script:  ${ctx.scriptName}`,
    `Target:  ${ctx.supabaseUrl}`,
    ctx.dockerExec ? `Docker:  ${ctx.dockerContainer ?? "supabase-db"}` : "",
    "",
    ...reasonLines,
    "",
    `Required for data-creating tests: ${TEST_DATABASE_ENV}=1 and allowlisted staging/local target.`,
    `See ${DOC}`,
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function assertFixtureWritesAllowed(options = {}) {
  const ctx = buildFixtureContext(options);

  if (ctx.isProduction) {
    console.error(
      formatBlockedMessage(ctx, [
        "Production infrastructure detected:",
        ...ctx.productionSignals.map((signal) => `  - ${signal}`),
        "",
        `${FIXTURES_ALLOW_ENV}=true does NOT bypass this guard.`,
      ]),
    );
    process.exit(1);
  }

  if (ctx.ambiguous) {
    console.error(
      formatBlockedMessage(ctx, [
        "Could not determine a safe non-production database target.",
        "Refusing to write fixture data.",
      ]),
    );
    process.exit(1);
  }

  if (!ctx.isTestDatabaseFlagSet) {
    console.error(
      formatBlockedMessage(ctx, [
        `${TEST_DATABASE_ENV}=1 is required before creating fixture data.`,
      ]),
    );
    process.exit(1);
  }

  if (!ctx.isAllowlistedTarget) {
    console.error(
      formatBlockedMessage(ctx, [
        "Target is not in the staging/local allowlist.",
        "Allowlisted Supabase hosts:",
        ...[...ALLOWLISTED_SUPABASE_HOSTS].map((host) => `  - ${host}`),
        "Allowlisted docker containers (with explicit env):",
        ...[...ALLOWLISTED_DOCKER_CONTAINERS].map((name) => `  - ${name}`),
      ]),
    );
    process.exit(1);
  }

  if (ctx.deprecatedOverrideRequested) {
    console.warn(
      `[fixture-guard] ${FIXTURES_ALLOW_ENV}=true is ignored; writes still require ${TEST_DATABASE_ENV}=1 on allowlisted target.`,
    );
  }
}

export function assertFixturePublishingAllowed(options = {}) {
  assertFixtureWritesAllowed(options);

  const ctx = buildFixtureContext(options);
  if (!ctx.isFixturePublishFlagSet) {
    console.error(
      formatBlockedMessage(ctx, [
        "Publishing/catalog-listing fixtures requires:",
        `  ${TEST_DATABASE_ENV}=1`,
        `  ${FIXTURE_PUBLISH_ENV}=1`,
        "  allowlisted staging/local target only",
        "",
        "Default fixture practices must stay draft and not catalog-listed.",
      ]),
    );
    process.exit(1);
  }
}

export function getDefaultFixturePracticeVisibility(options = {}) {
  const ctx = buildFixtureContext(options);
  const publishAllowed =
    ctx.isTestDatabaseFlagSet &&
    ctx.isAllowlistedTarget &&
    !ctx.isProduction &&
    ctx.isFixturePublishFlagSet;

  return {
    status: publishAllowed ? "published" : "draft",
    is_catalog_listed: publishAllowed,
    published_at: publishAllowed ? "now()" : null,
    guest_access_enabled: publishAllowed,
  };
}

/** Backward-compatible alias used by existing scripts. */
export function isProductionFixtureContext(options = {}) {
  return buildFixtureContext(options).isProduction;
}

export function assertProductionFixturesAllowed(options = {}) {
  assertFixtureWritesAllowed(options);
}

export function assertProductionDockerSqlAllowed(options = {}) {
  assertFixtureWritesAllowed({
    ...options,
    dockerExec: true,
  });
}
