/**
 * Blocks fixture/e2e/visual-check scripts from writing to production Supabase.
 *
 * Override (explicit, logged): ALLOW_PRODUCTION_TEST_FIXTURES=true
 */
import { existsSync } from "node:fs";
import { DEPLOY_ROOT, PRODUCTION_MARKER } from "./is-production-server.mjs";

export const FIXTURES_ALLOW_ENV = "ALLOW_PRODUCTION_TEST_FIXTURES";
const DOC = "docs/operations/production-process-policy.md";

const PRODUCTION_SUPABASE_HOSTS = new Set([
  "127.0.0.1:8000",
  "localhost:8000",
  "audiolad.ru",
]);

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

export function isProductionFixtureContext(options = {}) {
  if (hasProductionServerMarker()) return true;
  if (options.dockerExec) return true;
  if (options.supabaseUrl && isProductionSupabaseTarget(options.supabaseUrl)) return true;
  if (isProductionDeployEnvInUse()) return true;
  return false;
}

export function isProductionFixturesExplicitlyAllowed() {
  return process.env[FIXTURES_ALLOW_ENV] === "true";
}

export function assertProductionFixturesAllowed(options = {}) {
  const scriptName = options.scriptName ?? process.argv[1] ?? "unknown script";
  const supabaseUrl =
    options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(not set)";
  const dockerExec = Boolean(options.dockerExec);

  if (!isProductionFixtureContext({ supabaseUrl, dockerExec })) {
    return;
  }

  if (isProductionFixturesExplicitlyAllowed()) {
    console.warn(
      [
        "",
        "╔══════════════════════════════════════════════════════════════════╗",
        "║  WARNING: ALLOW_PRODUCTION_TEST_FIXTURES=true                    ║",
        "║  Fixture script is running against production infrastructure.    ║",
        "╚══════════════════════════════════════════════════════════════════╝",
        `Script:  ${scriptName}`,
        `Target:  ${supabaseUrl}`,
        dockerExec ? "Docker:  docker exec supabase-db (production postgres)" : "",
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }

  console.error(
    [
      "",
      "╔══════════════════════════════════════════════════════════════════╗",
      "║  BLOCKED: production fixture/test script                       ║",
      "╚══════════════════════════════════════════════════════════════════╝",
      `Script:  ${scriptName}`,
      `Target:  ${supabaseUrl}`,
      dockerExec ? "Docker:  docker exec supabase-db is blocked on production server" : "",
      "",
      "Self-hosted Supabase on 127.0.0.1:8000 is the same database as https://audiolad.ru.",
      "Fixture scripts must run on an isolated staging machine/database.",
      "",
      `To override intentionally: ${FIXTURES_ALLOW_ENV}=true`,
      `See ${DOC}`,
      "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  process.exit(1);
}

export function assertProductionDockerSqlAllowed(options = {}) {
  assertProductionFixturesAllowed({
    ...options,
    dockerExec: true,
  });
}
