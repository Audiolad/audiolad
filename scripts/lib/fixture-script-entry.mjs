/**
 * Shared entry helpers for data-writing scripts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  TEST_DATABASE_ENV,
  assertFixtureWritesAllowed,
  assertFixturePublishingAllowed,
  buildFixtureContext,
  isProductionSupabaseTarget,
  isTestDatabaseFlagSet,
} from "./fixture-context.mjs";
import { createSqlHelpers } from "./fixture-registry.mjs";

export const ADMIN_INTERACTIVE_CONFIRM_ENV = "AUDIOLAD_ADMIN_INTERACTIVE_CONFIRM";

const DEFAULT_ENV_LOCAL = path.join(process.cwd(), ".env.local");

export function readProjectEnvLocal(envPath = DEFAULT_ENV_LOCAL) {
  try {
    const raw = readFileSync(envPath, "utf8");
    const values = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      values[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
    return values;
  } catch {
    return null;
  }
}

export function assertProjectEnvLocalSafeForFixtures(options = {}) {
  const envPath = options.envPath ?? DEFAULT_ENV_LOCAL;
  const parsed = readProjectEnvLocal(envPath);
  if (!parsed) {
    return null;
  }

  const supabaseUrl = parsed.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && isProductionSupabaseTarget(supabaseUrl)) {
    console.error(
      [
        "",
        "BLOCKED: .env.local points at production Supabase.",
        `Path: ${envPath}`,
        "Data-writing scripts must not silently use production credentials.",
        `Set ${TEST_DATABASE_ENV}=1 and use an allowlisted staging/local target.`,
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  return parsed;
}

export function skipUnlessTestDatabase(scriptName) {
  if (isTestDatabaseFlagSet()) {
    return false;
  }
  console.log(`${scriptName}: skipped (${TEST_DATABASE_ENV} is not set)`);
  return true;
}

export function assertAdminInteractiveConfirmed(scriptName) {
  if (process.env[ADMIN_INTERACTIVE_CONFIRM_ENV] === "1") {
    return;
  }
  console.error(
    [
      "",
      `BLOCKED: ${scriptName} is an admin interactive utility.`,
      `Set ${ADMIN_INTERACTIVE_CONFIRM_ENV}=1 only when intentionally running against the intended environment.`,
      "",
    ].join("\n"),
  );
  process.exit(1);
}

/**
 * Standard bootstrap for data-writing scripts.
 * Returns { skipped: true } when script should exit 0 before any write.
 */
export function bootstrapDataWriteScript(options) {
  const scriptName = options.scriptName ?? "unknown script";

  if (options.requireAdminInteractiveConfirm) {
    assertAdminInteractiveConfirmed(scriptName);
  } else if (skipUnlessTestDatabase(scriptName)) {
    return { skipped: true };
  }

  if (options.validateEnvLocal !== false) {
    assertProjectEnvLocalSafeForFixtures({ envPath: options.envPath });
  }

  if (options.requirePublish) {
    assertFixturePublishingAllowed(options);
  } else {
    assertFixtureWritesAllowed(options);
  }

  return { skipped: false, context: buildFixtureContext(options) };
}

export function createGuardedSqlHelpers(options = {}) {
  const ctx = buildFixtureContext({
    ...options,
    dockerExec: true,
  });

  if (ctx.isProduction) {
    console.error("BLOCKED: guarded SQL helpers refused on production target.");
    process.exit(1);
  }

  if (!isTestDatabaseFlagSet()) {
    console.error(`BLOCKED: ${TEST_DATABASE_ENV}=1 required for SQL writes.`);
    process.exit(1);
  }

  assertFixtureWritesAllowed({ ...options, dockerExec: true });

  return createSqlHelpers(
    options.dockerContainer ??
      process.env.AUDIOLAD_TEST_DOCKER_CONTAINER ??
      "supabase-db-staging",
  );
}
