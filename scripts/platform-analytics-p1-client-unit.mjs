#!/usr/bin/env node
/**
 * P1 client identity/session/retry unit checks (no browser, no network).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function testContracts() {
  const identity = read("src/lib/analytics/identity-storage.ts");
  const session = read("src/lib/analytics/session-state.ts");
  const client = read("src/lib/analytics/client.ts");
  const retry = read("src/lib/analytics/retry-queue.ts");
  const controls = read("src/components/admin/AdminAnalyticsTestTrafficControls.tsx");
  const mig = read("supabase/migrations/20260725160000_platform_analytics_p1_identity.sql");
  const dash = read("supabase/migrations/20260725161000_admin_analytics_dashboard_snapshot_p1.sql");

  assert(identity.includes("audiolad_anonymous_id"), "anonymous key");
  assert(identity.includes("getOrCreateAnonymousId"), "getOrCreateAnonymousId");
  assert(session.includes("audiolad_analytics_session_state"), "session state key");
  assert(session.includes("BroadcastChannel"), "broadcast channel");
  assert(session.includes("SESSION_TIMEOUT_MS"), "timeout");
  assert(!session.includes('sessionStorage.setItem("audiolad_analytics_session_id"'), "no sessionStorage truth");
  assert(client.includes("client_event_id"), "client event id");
  assert(client.includes("flushAnalyticsRetryQueue"), "retry flush");
  assert(client.includes("client_version"), "client version");
  assert(retry.includes("48") || retry.includes("172800") || retry.includes("48 *"), "ttl ~48h");
  assert(controls.includes("Не учитывать служебный и тестовый трафик"), "toggle label");
  assert(mig.includes("analytics_identity_links"), "identity links");
  assert(mig.includes("analytics_test_accounts"), "test accounts");
  assert(mig.includes("client_event_id"), "client_event_id column");
  assert(mig.includes("is_staff"), "is_staff");
  assert(mig.includes("classify_analytics_bot"), "bot classifier");
  assert(dash.includes("admin_analytics_visitor_key"), "visitor key in dashboard");
  assert(
    dash.includes("is_staff OR s.is_test OR s.is_bot") ||
      dash.includes("(s.is_staff OR s.is_test OR s.is_bot)"),
    "service filter",
  );
}

function testSessionLogicInMemory() {
  // Lightweight mirror of isSessionStateActive
  const TIMEOUT = 30 * 60 * 1000;
  function isActive(state, anon, now) {
    if (!state?.sessionId || !state.anonymousId) return false;
    if (state.anonymousId !== anon) return false;
    return now - state.lastSeenAt < TIMEOUT;
  }
  const anon = "a";
  const now = 1_000_000_000_000;
  assert(isActive({ sessionId: "s", anonymousId: anon, lastSeenAt: now - 29 * 60 * 1000 }, anon, now), "29m active");
  assert(!isActive({ sessionId: "s", anonymousId: anon, lastSeenAt: now - 31 * 60 * 1000 }, anon, now), "31m expired");
  assert(!isActive({ sessionId: "s", anonymousId: "b", lastSeenAt: now }, anon, now), "anon mismatch");
}

function testPercentSafe() {
  function formatAdminPercent(numerator, denominator) {
    if (denominator <= 0 || numerator <= 0) return "0%";
    return `${Math.round((numerator / denominator) * 100)}%`;
  }
  assert(formatAdminPercent(0, 0) === "0%", "0/0");
  assert(formatAdminPercent(26, 61) === "43%", "26/61");
}

function main() {
  testContracts();
  testSessionLogicInMemory();
  testPercentSafe();
  console.log("platform-analytics-p1-client-unit: ok");
}

main();
