/**
 * Explicit test-only credentials for test user reset integration.
 * Production .env.local is never read or used as fallback.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isProductionSupabaseTarget,
  connectionStringLooksProduction,
} from "./fixture-context.mjs";

export const INTEGRATION_OPT_IN_ENV = "AUDIOLAD_TEST_USER_RESET_INTEGRATION";
export const TEST_SUPABASE_URL_ENV = "AUDIOLAD_TEST_SUPABASE_URL";
export const TEST_SERVICE_ROLE_KEY_ENV = "AUDIOLAD_TEST_SUPABASE_SERVICE_ROLE_KEY";
export const TEST_ENV_FILE = ".env.test.local";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function isTestUserResetIntegrationOptIn() {
  return process.env[INTEGRATION_OPT_IN_ENV] === "1";
}

function parseEnvFile(filePath) {
  const values = {};
  const raw = readFileSync(filePath, "utf8");

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    values[trimmed.slice(0, eq)] = trimmed
      .slice(eq + 1)
      .replace(/^["']|["']$/g, "");
  }

  return values;
}

function loadOptionalTestEnvFile() {
  const envPath = path.join(ROOT, TEST_ENV_FILE);
  if (!existsSync(envPath)) {
    return {};
  }

  const parsed = parseEnvFile(envPath);
  const supabaseUrl =
    parsed[TEST_SUPABASE_URL_ENV] ?? parsed.NEXT_PUBLIC_SUPABASE_URL ?? null;

  if (supabaseUrl && isProductionSupabaseTarget(supabaseUrl)) {
    console.error(
      [
        "",
        `BLOCKED: ${TEST_ENV_FILE} points at production Supabase.`,
        `Path: ${envPath}`,
        "Integration tests must use an allowlisted test target only.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  return parsed;
}

function block(message) {
  const error = new Error(message);
  error.code = "TEST_USER_RESET_INTEGRATION_BLOCKED";
  throw error;
}

export function loadTestUserResetIntegrationCredentials() {
  try {
    return resolveTestUserResetIntegrationCredentials();
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(1);
  }
}

export function resolveTestUserResetIntegrationCredentials() {
  const fileEnv = loadOptionalTestEnvFile();

  const supabaseUrl =
    process.env[TEST_SUPABASE_URL_ENV] ??
    fileEnv[TEST_SUPABASE_URL_ENV] ??
    fileEnv.NEXT_PUBLIC_SUPABASE_URL ??
    "http://127.0.0.1:54321";

  const serviceRoleKey =
    process.env[TEST_SERVICE_ROLE_KEY_ENV] ??
    fileEnv[TEST_SERVICE_ROLE_KEY_ENV] ??
    fileEnv.SUPABASE_SERVICE_ROLE_KEY ??
    null;

  if (isProductionSupabaseTarget(supabaseUrl)) {
    block(
      [
        "",
        "BLOCKED: test user reset integration refused production Supabase URL.",
        `Target: ${supabaseUrl}`,
        "",
      ].join("\n"),
    );
  }

  const databaseUrl =
    process.env.AUDIOLAD_TEST_DATABASE_URL ?? fileEnv.DATABASE_URL ?? null;

  if (databaseUrl && connectionStringLooksProduction(databaseUrl)) {
    block(
      [
        "",
        "BLOCKED: test user reset integration refused production database URL.",
        "",
      ].join("\n"),
    );
  }

  if (!serviceRoleKey) {
    block(
      [
        "",
        "BLOCKED: missing test Supabase service role key for integration.",
        `Set ${TEST_SERVICE_ROLE_KEY_ENV} or provide ${TEST_ENV_FILE} (never production .env.local).`,
        "",
      ].join("\n"),
    );
  }

  return { supabaseUrl, serviceRoleKey };
}
