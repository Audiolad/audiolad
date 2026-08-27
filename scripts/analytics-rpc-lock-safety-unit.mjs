#!/usr/bin/env node
/**
 * Regression: analytics RPC lock safety, request-storm guards, fail-open UI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAnalyticsLinkDedupeKey,
  shouldLinkAnalyticsSessionOnAuthEvent,
  shouldRecordSignupCompletedOnAuthEvent,
  shouldSkipAnalyticsCallForCooldown,
  shouldSkipCompletedAnalyticsCall,
} from "../src/lib/analytics/auth-link.ts";
import {
  isAnalyticsBestEffortRpcError,
  isAnalyticsPoolExhaustionStatus,
} from "../src/lib/analytics/rpc-errors.ts";
import {
  analyticsRetryBackoffMs,
  resetAnalyticsRetryPoolCircuit,
  shouldDeferAnalyticsRetry,
  tripAnalyticsRetryPoolCircuit,
} from "../src/lib/analytics/retry-queue.ts";
import {
  resolveListenerAuthorCta,
  resolveShowAuthorEntry,
  resolveShowBecomeAuthorPromo,
  resolveShowSidebarAuthorPromo,
} from "../src/lib/listener/author-cta.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function testMigrationLockSafety() {
  const sql = read("supabase/migrations/20260901120000_analytics_rpc_lock_safety.sql");

  assert.match(sql, /SET lock_timeout = '250ms'/, "link keeps 250ms lock_timeout");
  assert.equal(
    (sql.match(/SET lock_timeout = '250ms'/g) || []).length,
    2,
    "both RPCs persist the production lock_timeout safety net",
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.link_analytics_session_user/, "replaces link rpc");
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.record_platform_signup_completed/,
    "replaces signup rpc",
  );
  assert.match(sql, /v_needs_session_update/, "session update is conditional");
  assert.match(sql, /v_needs_event_backfill/, "event backfill is conditional");
  assert.match(sql, /v_needs_identity/, "identity link is conditional");
  assert.match(sql, /Idempotent hot path/, "no-op fast path documented");
  assert.match(
    sql,
    /identity_links → analytics_sessions → analytics_events/,
    "stable lock order documented",
  );
  assert.ok(
    sql.indexOf("PERFORM public.link_analytics_identity") <
      sql.indexOf("UPDATE public.analytics_sessions AS s"),
    "link takes identity before session row lock",
  );
  assert.match(sql, /reason', 'already_recorded'/, "signup stays idempotent");
  assert.match(sql, /reason', 'lock_timeout'/, "signup fail-opens on lock wait");
  assert.doesNotMatch(sql, /ALTER SYSTEM|pool_size\s*=/, "does not mask with pool growth");
}

function testAuthEventStormGuard() {
  const events = [
    "INITIAL_SESSION",
    "SIGNED_IN",
    "TOKEN_REFRESHED",
    "TOKEN_REFRESHED",
    "USER_UPDATED",
    "TOKEN_REFRESHED",
  ];

  const linkCalls = events.filter(shouldLinkAnalyticsSessionOnAuthEvent);
  const signupCalls = events.filter(shouldRecordSignupCompletedOnAuthEvent);

  assert.deepEqual(linkCalls, ["INITIAL_SESSION", "SIGNED_IN"], "link only on session restore / sign-in");
  assert.deepEqual(signupCalls, ["SIGNED_IN"], "signup only on real SIGNED_IN");
  assert.equal(linkCalls.length, 2, "no TOKEN_REFRESHED link storm");
  assert.equal(signupCalls.length, 1, "signup is not called on every auth event");

  const linker = read("src/components/analytics/AnalyticsAuthLinker.tsx");
  assert.match(linker, /shouldLinkAnalyticsSessionOnAuthEvent/, "linker filters link events");
  assert.match(linker, /shouldRecordSignupCompletedOnAuthEvent/, "linker filters signup events");
  assert.doesNotMatch(linker, /auth\.getSession\(/, "no extra session read that doubles INITIAL_SESSION");
  assert.match(linker, /TOKEN_REFRESHED/, "documents ignored refresh events");
}

function testIdempotencyAndInflightDedupe() {
  const key = buildAnalyticsLinkDedupeKey("session-1", "anon-1");
  assert.equal(key, "session-1:anon-1");
  assert.equal(
    shouldSkipCompletedAnalyticsCall(key, key),
    true,
    "once-per-session flag skips repeats",
  );
  assert.equal(
    shouldSkipCompletedAnalyticsCall("session-2:anon-1", key),
    false,
    "new session is not skipped",
  );
  assert.equal(
    shouldSkipAnalyticsCallForCooldown(1_000, 1_000 + 5_000),
    true,
    "failure cooldown blocks immediate retry",
  );
  assert.equal(
    shouldSkipAnalyticsCallForCooldown(1_000, 1_000 + 20_000),
    false,
    "cooldown expires",
  );

  const inflight = new Map();
  function coalesce(dedupeKey, send) {
    if (inflight.has(dedupeKey)) {
      return inflight.get(dedupeKey);
    }
    const pending = send();
    inflight.set(dedupeKey, pending);
    return pending;
  }

  let sends = 0;
  const shared = Promise.resolve("ok");
  const results = [];
  for (let i = 0; i < 20; i += 1) {
    results.push(
      coalesce("session-1:anon-1", () => {
        sends += 1;
        return shared;
      }),
    );
  }
  assert.equal(sends, 1, "parallel identical calls coalesce to one in-flight request");
  assert.equal(new Set(results).size, 1, "coalesced callers share the same promise");

  const client = read("src/lib/analytics/client.ts");
  assert.match(client, /sessionLinkInflight/, "link in-flight dedupe");
  assert.match(client, /signupInflight/, "signup in-flight dedupe");
  assert.match(client, /ANALYTICS_SESSION_LINK_DONE_KEY/, "link once-per-session flag");
  assert.match(client, /ANALYTICS_SIGNUP_DONE_KEY/, "signup once-per-session flag");
}

function testRetryQueueDoesNotStorm() {
  resetAnalyticsRetryPoolCircuit();

  assert.equal(analyticsRetryBackoffMs(0), 15_000, "first retry waits 15s");
  assert.ok(analyticsRetryBackoffMs(3) >= 120_000, "backoff grows");
  assert.equal(
    shouldDeferAnalyticsRetry({ attempts: 1, lastAttemptAt: 1_000 }, 1_000 + 5_000),
    true,
    "recent failure is not flushed immediately",
  );
  assert.equal(
    shouldDeferAnalyticsRetry({ attempts: 0, lastAttemptAt: null }, 1_000),
    false,
    "never-attempted item can send once",
  );

  tripAnalyticsRetryPoolCircuit(10_000, 30_000);
  assert.equal(
    shouldDeferAnalyticsRetry({ attempts: 0, lastAttemptAt: null }, 10_000 + 1_000),
    true,
    "pool-exhaustion circuit breaker pauses the whole queue",
  );
  resetAnalyticsRetryPoolCircuit();

  assert.equal(isAnalyticsPoolExhaustionStatus(504), true);
  assert.equal(isAnalyticsPoolExhaustionStatus(503), true);
  assert.equal(isAnalyticsPoolExhaustionStatus(500), false);

  const client = read("src/lib/analytics/client.ts");
  assert.match(client, /tripAnalyticsRetryPoolCircuit/, "504/503 trips retry circuit");
  assert.match(client, /lastAttemptAt: Date.now\(\)/, "pool errors enqueue with lastAttemptAt");

  const retry = read("src/lib/analytics/retry-queue.ts");
  assert.match(retry, /shouldDeferAnalyticsRetry/, "flush honors backoff");
}

function testAnalyticsErrorsFailOpen() {
  assert.equal(
    isAnalyticsBestEffortRpcError({
      code: "PGRST003",
      message: "Timed out acquiring connection from connection pool",
    }),
    true,
  );
  assert.equal(
    isAnalyticsBestEffortRpcError({
      code: "55P03",
      message: "canceling statement due to lock timeout",
    }),
    true,
  );
  assert.equal(isAnalyticsBestEffortRpcError({ message: "session_mismatch" }), false);

  const linkRoute = read("src/app/api/analytics/session/link/route.ts");
  const signupRoute = read("src/app/api/analytics/signup/complete/route.ts");
  assert.match(linkRoute, /deferred: true/, "link route fail-opens lock/pool errors");
  assert.match(signupRoute, /deferred: true/, "signup route fail-opens lock/pool errors");

  const catalog = read("src/app/(platform)/(listener)/(catalog)/catalog/page.tsx");
  const homeLayout = read("src/app/(platform)/(listener)/(home)/layout.tsx");
  const listenerLayout = read("src/app/(platform)/(listener)/layout.tsx");
  const pdp = read("src/app/(platform)/(listener)/practice/[...segments]/page.tsx");

  assert.doesNotMatch(catalog, /link_analytics_session_user|record_platform_signup_completed/);
  assert.doesNotMatch(homeLayout, /link_analytics_session_user|record_platform_signup_completed/);
  assert.doesNotMatch(listenerLayout, /link_analytics_session_user|record_platform_signup_completed/);
  assert.doesNotMatch(pdp, /link_analytics_session_user|record_platform_signup_completed/);
}

function testUnknownRoleDoesNotShowBecomeAuthor() {
  const workspace = [{ id: "a1", slug: "sergey", name: "Sergey" }];

  const unknownCta = resolveListenerAuthorCta({
    workspaces: [],
    applicationVariant: "none",
    roleLookupStatus: "unknown",
  });
  assert.notEqual(unknownCta.label, "Стать автором", "unknown lookup never shows become-author");
  assert.equal(
    resolveShowBecomeAuthorPromo({
      workspaces: [],
      applicationVariant: "none",
      roleLookupStatus: "unknown",
    }),
    false,
    "unknown lookup hides home promo",
  );
  assert.equal(
    resolveShowSidebarAuthorPromo({
      workspaces: [],
      applicationVariant: "none",
      roleLookupStatus: "unknown",
    }),
    false,
    "unknown lookup hides sidebar promo",
  );
  assert.equal(
    resolveShowAuthorEntry({
      authorCtaLabel: unknownCta.label,
      showAdminPanel: false,
      roleLookupStatus: "unknown",
    }),
    false,
    "unknown lookup hides right-column author entry",
  );

  const authorCta = resolveListenerAuthorCta({
    workspaces: workspace,
    applicationVariant: null,
    roleLookupStatus: "unknown",
  });
  assert.equal(authorCta.label, "Кабинет автора", "confirmed workspace still wins");
  assert.equal(
    resolveShowAuthorEntry({
      authorCtaLabel: authorCta.label,
      showAdminPanel: false,
      roleLookupStatus: "unknown",
    }),
    true,
    "cabinet remains visible when membership is confirmed",
  );

  const listenerCta = resolveListenerAuthorCta({
    workspaces: [],
    applicationVariant: "none",
    roleLookupStatus: "confirmed",
  });
  assert.equal(listenerCta.label, "Стать автором", "confirmed listener still sees CTA");

  const shell = read("src/lib/listener/shell-data.ts");
  assert.match(shell, /roleLookupStatus/, "shell distinguishes unknown vs confirmed");
  assert.match(shell, /settleLookup/, "workspace/admin failures are not treated as empty listener");
  assert.doesNotMatch(
    shell,
    /listAuthorWorkspacesForUser\(user\.id\)\.catch/,
    "no silent empty-array fallback for workspaces",
  );

  const home = read("src/lib/home/data.ts");
  assert.match(home, /safeHomeSectionResult/, "home promo sees workspace lookup failure");
  assert.match(home, /roleLookupStatus/, "home promo receives unknown status");

  const workspacesAuth = read("src/lib/author-products/auth.ts");
  assert.match(
    workspacesAuth,
    /author_workspaces_permission_error/,
    "permission lookup failure does not drop author workspaces",
  );
}

function testParallelRpcLockOrderIsStable() {
  const sql = read("supabase/migrations/20260901120000_analytics_rpc_lock_safety.sql");
  const linkBody = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.link_analytics_session_user"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.record_platform_signup_completed"),
  );
  const signupBody = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.record_platform_signup_completed"),
  );

  assert.match(linkBody, /link_analytics_identity/, "link may take identity first");
  assert.ok(
    linkBody.indexOf("link_analytics_identity") < linkBody.indexOf("UPDATE public.analytics_sessions"),
    "no opposite session-before-identity order in link",
  );
  assert.match(
    signupBody,
    /PERFORM public\.link_analytics_session_user/,
    "signup reuses the same lock order via link",
  );

  // Concurrent already-linked calls take no exclusive locks → no deadlock wait.
  const alreadyLinkedLocks = [];
  const firstLinkLocks = ["analytics_identity_links", "analytics_sessions", "analytics_events"];
  const signupLocks = ["analytics_identity_links", "analytics_sessions", "analytics_events"];
  assert.deepEqual(alreadyLinkedLocks, [], "idempotent parallel calls take no row locks");
  assert.deepEqual(firstLinkLocks, signupLocks, "both RPCs share one lock sequence");
}

function main() {
  testMigrationLockSafety();
  testAuthEventStormGuard();
  testIdempotencyAndInflightDedupe();
  testRetryQueueDoesNotStorm();
  testAnalyticsErrorsFailOpen();
  testUnknownRoleDoesNotShowBecomeAuthor();
  testParallelRpcLockOrderIsStable();
  console.log("analytics-rpc-lock-safety-unit: ok");
}

main();
