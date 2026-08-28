#!/usr/bin/env node
/**
 * P0/P1 analytics RPC protection — no live PostgREST pool required.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyticsAuthPairKey,
  createAnalyticsAuthSyncController,
  isAnalyticsAuthLinkEvent,
  isAnalyticsAuthSignupEvent,
} from "../src/lib/analytics/auth-sync.ts";
import {
  ANALYTICS_CIRCUIT_FAILURE_THRESHOLD,
  buildAnalyticsHeavyRpcKey,
  classifyAnalyticsRpcError,
  getAnalyticsRpcProtectionMetrics,
  guardAnalyticsHeavyRpc,
  isAnalyticsCircuitOpen,
  isAnalyticsOverloadStatus,
  peekJwtSubject,
  recordAnalyticsRpcOverloadForTests,
  resetAnalyticsRpcProtectionForTests,
} from "../src/lib/analytics/rpc-protection.ts";
import { checkAnalyticsRateLimit } from "../src/lib/analytics/sanitize.ts";
import {
  computeAnalyticsRetryDelayMs,
  isAnalyticsRetryItemReady,
  shouldRetryAnalyticsFailure,
} from "../src/lib/analytics/retry-queue.ts";
import {
  STORM_CLIENT_IP_EXAMPLE,
  getTrustedClientIp,
} from "../src/lib/http/trusted-client-ip.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function makeRequest(ip, bearer) {
  const headers = {
    "x-real-ip": ip,
    "x-forwarded-for": ip,
  };
  if (bearer) {
    headers.authorization = `Bearer ${bearer}`;
  }
  return new Request("https://audiolad.ru/api/analytics/session/link", { headers });
}

function makeNginxRequest(clientIp, extra = {}) {
  return new Request("https://audiolad.ru/api/analytics/session/link", {
    headers: {
      "x-real-ip": clientIp,
      "x-forwarded-for": `${clientIp}`,
      ...extra,
    },
  });
}

function encodeJwt(sub) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return `${header}.${payload}.sig`;
}

function latestFunctionBody(sql, name) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = sql.lastIndexOf(marker);
  assert.notEqual(start, -1, `${name} missing`);
  const bodyStart = sql.indexOf("AS $$", start);
  const bodyEnd = sql.indexOf("$$;", bodyStart);
  return sql.slice(bodyStart, bodyEnd);
}

async function testTokenRefreshedDoesNotLink() {
  const controller = createAnalyticsAuthSyncController();
  let links = 0;
  let signups = 0;
  const handlers = {
    link: async () => {
      links += 1;
    },
    signup: async () => {
      signups += 1;
      return true;
    },
  };

  for (let i = 0; i < 50; i += 1) {
    const result = await controller.sync("TOKEN_REFRESHED", {
      userId: "user-a",
      analyticsSessionId: "session-a",
      handlers,
    });
    assert.equal(result.ran, false);
    assert.equal(result.reason, "skipped_event");
  }

  assert.equal(links, 0, "TOKEN_REFRESHED must not link");
  assert.equal(signups, 0, "TOKEN_REFRESHED must not signup");
  assert.equal(isAnalyticsAuthLinkEvent("TOKEN_REFRESHED"), false);
  assert.equal(isAnalyticsAuthSignupEvent("TOKEN_REFRESHED"), false);
}

async function testSignedInDedupe() {
  const controller = createAnalyticsAuthSyncController();
  let links = 0;
  let signups = 0;
  let signupInflight = 0;
  let signupRelease;
  const hang = new Promise((resolve) => {
    signupRelease = resolve;
  });

  const handlers = {
    link: async () => {
      links += 1;
    },
    signup: async () => {
      signups += 1;
      signupInflight += 1;
      await hang;
      return true;
    },
  };

  const input = {
    userId: "user-a",
    analyticsSessionId: "session-a",
    handlers,
  };

  const first = controller.sync("SIGNED_IN", input);
  const rest = [];
  for (let i = 0; i < 99; i += 1) {
    rest.push(controller.sync("SIGNED_IN", input));
  }

  await Promise.resolve();
  assert.equal(signupInflight, 1, "only one signup starts");
  signupRelease();

  const results = [await first, ...(await Promise.all(rest))];
  const ran = results.filter((result) => result.ran);
  assert.equal(ran.length, 1, "exactly one necessary SIGNED_IN flow");
  assert.equal(links, 0, "SIGNED_IN must not also call session/link");
  assert.equal(signups, 1);

  const after = await controller.sync("SIGNED_IN", input);
  assert.equal(after.reason, "completed");
  assert.equal(signups, 1);
}

async function testDifferentUsersStillWork() {
  const controller = createAnalyticsAuthSyncController();
  const signups = [];
  const handlersFor = (userId) => ({
    link: async () => {},
    signup: async () => {
      signups.push(userId);
      return true;
    },
  });

  await controller.sync("SIGNED_IN", {
    userId: "user-a",
    analyticsSessionId: "session-shared",
    handlers: handlersFor("user-a"),
  });
  await controller.sync("SIGNED_IN", {
    userId: "user-b",
    analyticsSessionId: "session-shared",
    handlers: handlersFor("user-b"),
  });

  assert.deepEqual(signups, ["user-a", "user-b"]);
  assert.notEqual(
    analyticsAuthPairKey("session-shared", "user-a"),
    analyticsAuthPairKey("session-shared", "user-b"),
  );
}

async function testServerGuardSamePair() {
  resetAnalyticsRpcProtectionForTests();
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const token = encodeJwt("user-a");
  const request = makeRequest("203.0.113.10", token);

  const first = guardAnalyticsHeavyRpc({
    route: "session_link",
    request,
    sessionId,
    userId: "user-a",
  });
  assert.equal(first.action, "rpc");

  const concurrent = [];
  for (let i = 0; i < 99; i += 1) {
    concurrent.push(
      guardAnalyticsHeavyRpc({
        route: "session_link",
        request: makeRequest("203.0.113.10", token),
        sessionId,
        userId: "user-a",
      }),
    );
  }

  assert.equal(
    concurrent.filter((decision) => decision.action === "rpc").length,
    0,
    "in-flight pair must not start a second RPC",
  );
  assert.ok(
    concurrent.every(
      (decision) => decision.action === "deduped" || decision.action === "rate_limited",
    ),
  );

  first.release("ok");

  const afterSuccess = [];
  for (let i = 0; i < 80; i += 1) {
    afterSuccess.push(
      guardAnalyticsHeavyRpc({
        route: "session_link",
        request: makeRequest("203.0.113.10", token),
        sessionId,
        userId: "user-a",
      }),
    );
  }

  assert.equal(
    afterSuccess.filter((decision) => decision.action === "rpc").length,
    0,
    "success cache must block repeat RPCs",
  );

  const otherUser = guardAnalyticsHeavyRpc({
    route: "session_link",
    request: makeRequest("203.0.113.11", encodeJwt("user-b")),
    sessionId: "22222222-2222-4222-8222-222222222222",
    userId: "user-b",
  });
  assert.equal(otherUser.action, "rpc", "a different legitimate user still proceeds");
  otherUser.release("ok");

  const metrics = getAnalyticsRpcProtectionMetrics();
  assert.ok(metrics.dedupedCount >= 99);
}

async function testDirectHundredsAreShed() {
  resetAnalyticsRpcProtectionForTests();
  let rpc = 0;
  let shed = 0;

  for (let i = 0; i < 250; i += 1) {
    const decision = guardAnalyticsHeavyRpc({
      route: "signup_complete",
      request: makeRequest("198.51.100.20"),
      sessionId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      userId: `crawler-${i}`,
    });

    if (decision.action === "rpc") {
      rpc += 1;
      decision.release("ok");
    } else {
      shed += 1;
    }
  }

  assert.ok(rpc <= ANALYTICS_CIRCUIT_FAILURE_THRESHOLD + 20, `rpc=${rpc} must stay bounded`);
  assert.ok(rpc <= 20, `IP cap must stop hundreds of heavy RPCs, got ${rpc}`);
  assert.equal(rpc + shed, 250);
  assert.ok(shed >= 230);
}

async function testCircuitBreaker() {
  resetAnalyticsRpcProtectionForTests();
  assert.equal(isAnalyticsCircuitOpen(), false);

  for (let i = 0; i < ANALYTICS_CIRCUIT_FAILURE_THRESHOLD; i += 1) {
    recordAnalyticsRpcOverloadForTests();
  }

  assert.equal(isAnalyticsCircuitOpen(), true);

  const decision = guardAnalyticsHeavyRpc({
    route: "session_link",
    request: makeRequest("203.0.113.40"),
    sessionId: "33333333-3333-4333-8333-333333333333",
    userId: "user-c",
  });
  assert.equal(decision.action, "circuit_open");

  const classified = classifyAnalyticsRpcError({
    message: "PGRST003: connection pool timed out",
    code: "PGRST003",
  });
  assert.equal(classified.kind, "overload");
  assert.equal(classified.code, "PGRST003");

  const lock = classifyAnalyticsRpcError({
    message: "55P03 lock_not_available",
    code: "55P03",
  });
  assert.equal(lock.kind, "overload");
  assert.equal(isAnalyticsOverloadStatus(503, "PGRST003"), true);
}

function testRetryBackoffNoAmplify() {
  assert.equal(shouldRetryAnalyticsFailure(500, null), true);
  assert.equal(shouldRetryAnalyticsFailure(503, "overloaded"), false);
  assert.equal(shouldRetryAnalyticsFailure(500, "PGRST003"), false);
  assert.equal(shouldRetryAnalyticsFailure(500, "55P03"), false);
  assert.equal(shouldRetryAnalyticsFailure(504, null), false);
  assert.equal(shouldRetryAnalyticsFailure(429, null), true);
  assert.equal(shouldRetryAnalyticsFailure(0, null), true);
  assert.equal(shouldRetryAnalyticsFailure(400, null), false);

  const d0 = computeAnalyticsRetryDelayMs(0, 0);
  const d2 = computeAnalyticsRetryDelayMs(2, 0);
  const d8 = computeAnalyticsRetryDelayMs(8, 0);
  assert.equal(d0, 1000);
  assert.equal(d2, 4000);
  assert.equal(d8, 30000);

  const notReady = isAnalyticsRetryItemReady(
    { attempts: 1, lastAttemptAt: Date.now() },
    Date.now(),
  );
  assert.equal(notReady, false);

  const ready = isAnalyticsRetryItemReady(
    { attempts: 1, lastAttemptAt: Date.now() - 3000 },
    Date.now(),
  );
  assert.equal(ready, true);
}

function testSqlIdempotentAndLockPlacement() {
  const sql = read("supabase/migrations/20260902120100_analytics_heavy_rpc_idempotent.sql");
  const link = latestFunctionBody(sql, "link_analytics_session_user");
  const signup = latestFunctionBody(sql, "record_platform_signup_completed");
  const anonFt = latestFunctionBody(sql, "ensure_anonymous_first_touch");
  const userFt = latestFunctionBody(sql, "ensure_user_first_touch");

  assert.match(link, /already owned — return immediately/);
  assert.match(link, /v_session_user IS NOT DISTINCT FROM v_user_id/);
  assert.equal(link.includes("pg_advisory_xact_lock"), false, "link itself has no lock");
  assert.match(link, /e\.user_id IS NULL/);
  assert.match(link, /link_analytics_identity/);
  assert.match(sql, /SET lock_timeout = '250ms'/);

  const cheapIdx = link.indexOf("already owned — return immediately");
  const updateEventsIdx = link.indexOf("UPDATE public.analytics_events");
  const identityIdx = link.indexOf("link_analytics_identity");
  assert.ok(cheapIdx < updateEventsIdx);
  assert.ok(cheapIdx < identityIdx);

  assert.match(signup, /signup_completed/);
  assert.match(signup, /already_recorded/);
  assert.match(signup, /link_analytics_session_user/);
  assert.match(signup, /not_new_registration/);
  assert.match(signup, /s\.user_id IS NOT DISTINCT FROM v_user_id/);

  const skipOwned = signup.indexOf("s.user_id IS NOT DISTINCT FROM v_user_id");
  const firstLink = signup.lastIndexOf("PERFORM public.link_analytics_session_user");
  assert.ok(skipOwned >= 0);
  assert.ok(firstLink > skipOwned, "first-touch path still links when needed");

  const anonSelectExisting = anonFt.indexOf("subject_type = 'anonymous'");
  const anonLock = anonFt.indexOf("pg_advisory_xact_lock");
  assert.ok(anonSelectExisting >= 0 && anonLock > anonSelectExisting);
  assert.match(anonFt, /advisory lock only when mutating first-touch/);

  const userSelectExisting = userFt.indexOf("subject_type = 'user'");
  const userLock = userFt.indexOf("pg_advisory_xact_lock");
  assert.ok(userSelectExisting >= 0 && userLock > userSelectExisting);
}

function testSourceContracts() {
  const linker = read("src/components/analytics/AnalyticsAuthLinker.tsx");
  const signupPage = read("src/app/(platform)/auth/sign-up/page.tsx");
  const client = read("src/lib/analytics/client.ts");
  const linkRoute = read("src/app/api/analytics/session/link/route.ts");
  const signupRoute = read("src/app/api/analytics/signup/complete/route.ts");
  const trackRoute = read("src/app/api/analytics/track/route.ts");
  const retry = read("src/lib/analytics/retry-queue.ts");
  const protection = read("src/lib/analytics/rpc-protection.ts");

  assert.match(linker, /TOKEN_REFRESHED|SIGNED_IN/);
  assert.match(linker, /analyticsAuthSync/);
  assert.equal(linker.includes("void linkAnalyticsSessionUser();"), false);
  assert.match(linker, /remember\("SIGNED_IN"/);
  assert.match(linker, /remember\("INITIAL_SESSION"/);

  assert.match(signupPage, /recordPlatformSignupCompleted/);
  assert.equal(signupPage.includes("linkAnalyticsSessionUser"), false);

  assert.match(client, /AbortController/);
  assert.match(client, /timeoutMs: ANALYTICS_RPC_TIMEOUT_MS/);
  assert.match(client, /shouldRetryAnalyticsFailure/);
  assert.match(client, /degraded/);

  assert.match(linkRoute, /guardAnalyticsHeavyRpc/);
  assert.match(linkRoute, /invokeAnalyticsRpc/);
  assert.ok(
    linkRoute.indexOf("guardAnalyticsHeavyRpc") <
      linkRoute.indexOf("link_analytics_session_user"),
  );
  assert.match(signupRoute, /guardAnalyticsHeavyRpc/);
  assert.ok(
    signupRoute.indexOf("guardAnalyticsHeavyRpc") <
      signupRoute.indexOf("record_platform_signup_completed"),
  );

  assert.match(trackRoute, /isAnalyticsCircuitOpen/);
  assert.match(trackRoute, /overloaded/);
  assert.match(retry, /computeAnalyticsRetryDelayMs/);
  assert.match(retry, /shouldRetryAnalyticsFailure/);
  assert.match(protection, /abortSignal/);
  assert.match(protection, /PGRST003/);
  assert.match(protection, /55P03/);
  assert.equal(protection.includes("Promise.race"), false);
  assert.match(protection, /getTrustedClientIp/);
  assert.match(protection, /Never used for authorization/);
  const helper = read("src/lib/http/trusted-client-ip.ts");
  assert.match(helper, /X-Real-IP/);
  assert.match(helper, /RIGHTMOST/);
  assert.equal(helper.includes('headers.get("cf-connecting-ip")'), false);
  assert.equal(helper.includes("isCloudflareIp"), false);
  assert.match(trackRoute, /getTrustedClientIp/);
  assert.equal(trackRoute.includes('split(",")[0]'), false);
  assert.match(read("src/app/api/analytics/session/route.ts"), /getTrustedClientIp/);
  assert.equal(
    read("src/app/api/analytics/session/route.ts").includes('split(",")[0]'),
    false,
  );
  assert.equal(
    read("src/lib/personal-materials/server/rate-limit.ts").includes("getTrustedClientIp"),
    false,
    "personal-materials rate-limit must stay untouched",
  );
  assert.match(read("src/app/api/analytics/signup/complete/route.ts"), /createClientFromRequest/);
  assert.match(read("src/app/api/analytics/signup/complete/route.ts"), /getUser/);
  assert.equal(
    read("src/app/api/analytics/signup/complete/route.ts").includes("peekJwtSubject"),
    false,
  );
  assert.equal(
    read("src/app/api/analytics/session/link/route.ts").includes("peekJwtSubject"),
    false,
  );

  const jwt = encodeJwt("user-z");
  assert.equal(peekJwtSubject(jwt), "user-z");
  assert.equal(peekJwtSubject("not-a-jwt"), null);

  assert.equal(
    buildAnalyticsHeavyRpcKey({
      route: "session_link",
      ip: "1.1.1.1",
      userId: "u1",
      sessionId: "s1",
    }) !==
      buildAnalyticsHeavyRpcKey({
        route: "session_link",
        ip: "1.1.1.1",
        userId: "u2",
        sessionId: "s1",
      }),
    true,
  );
}

function testTrustedClientIpExtraction() {
  const viaRealIp = makeNginxRequest(STORM_CLIENT_IP_EXAMPLE, {
    "x-forwarded-for": `8.8.8.8, ${STORM_CLIENT_IP_EXAMPLE}`,
  });
  assert.equal(
    getTrustedClientIp(viaRealIp),
    STORM_CLIENT_IP_EXAMPLE,
    "X-Real-IP is the nginx TCP peer and must be used as the client",
  );

  const rightmostOnly = new Request("https://audiolad.ru/api/analytics/session/link", {
    headers: {
      "x-forwarded-for": `8.8.8.8, ${STORM_CLIENT_IP_EXAMPLE}`,
    },
  });
  assert.equal(
    getTrustedClientIp(rightmostOnly),
    STORM_CLIENT_IP_EXAMPLE,
    "without X-Real-IP, rightmost XFF (nginx-appended hop) is the client",
  );

  const spoofed = new Request("https://audiolad.ru/api/analytics/session/link", {
    headers: {
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "8.8.8.8, 203.0.113.10",
    },
  });
  assert.equal(
    getTrustedClientIp(spoofed),
    "203.0.113.10",
    "untrusted leftmost XFF hop must be ignored",
  );

  const cfHeadersIgnored = new Request("https://audiolad.ru/api/analytics/session/link", {
    headers: {
      "x-real-ip": "203.0.113.10",
      "cf-connecting-ip": "198.51.100.1",
      "cf-ray": "8a1b2c3d4e5f6a7b-DME",
    },
  });
  assert.equal(
    getTrustedClientIp(cfHeadersIgnored),
    "203.0.113.10",
    "CF-Connecting-IP must not override nginx $remote_addr",
  );

  const empty = new Request("https://audiolad.ru/api/analytics/session/link", {
    headers: {},
  });
  assert.equal(getTrustedClientIp(empty), "unknown");
}

async function testDifferentRealClientsDoNotShareCap() {
  resetAnalyticsRpcProtectionForTests();
  const first = guardAnalyticsHeavyRpc({
    route: "session_link",
    request: makeNginxRequest("203.0.113.21"),
    sessionId: "44444444-4444-4444-8444-444444444444",
    userId: "user-d",
  });
  assert.equal(first.action, "rpc");
  first.release("ok");

  const second = guardAnalyticsHeavyRpc({
    route: "session_link",
    request: makeNginxRequest("203.0.113.22"),
    sessionId: "55555555-5555-4555-8555-555555555555",
    userId: "user-e",
  });
  assert.equal(second.action, "rpc", "different real client IPs must not share a cap");
  second.release("ok");
}

async function testSpoofedXffCannotStealAnotherClientCap() {
  resetAnalyticsRpcProtectionForTests();
  const victimIp = "203.0.113.21";
  const attackerIp = "198.51.100.9";
  const victimSession = "77777777-7777-4777-8777-777777777777";

  for (let i = 0; i < 20; i += 1) {
    const decision = guardAnalyticsHeavyRpc({
      route: "signup_complete",
      request: makeNginxRequest(victimIp),
      sessionId: `88888888-8888-4888-8888-${String(i).padStart(12, "0")}`,
      userId: `victim-${i}`,
    });
    assert.equal(decision.action, "rpc");
    decision.release("ok");
  }

  const victimBlocked = guardAnalyticsHeavyRpc({
    route: "signup_complete",
    request: makeNginxRequest(victimIp),
    sessionId: victimSession,
    userId: "victim-blocked",
  });
  assert.equal(victimBlocked.action, "rate_limited");

  const spoofAttempt = guardAnalyticsHeavyRpc({
    route: "signup_complete",
    request: makeNginxRequest(attackerIp, {
      "x-forwarded-for": `${victimIp}, ${attackerIp}`,
    }),
    sessionId: "99999999-9999-4999-8999-999999999999",
    userId: "attacker",
  });
  assert.equal(
    spoofAttempt.action,
    "rpc",
    "spoofed leftmost XFF must not consume or share the victim IP cap",
  );
  spoofAttempt.release("ok");
}

async function testNatSessionsKeepSeparatePairKeys() {
  resetAnalyticsRpcProtectionForTests();
  const natIp = STORM_CLIENT_IP_EXAMPLE;
  const sessionA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sessionB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const keyA = buildAnalyticsHeavyRpcKey({
    route: "session_link",
    ip: getTrustedClientIp(makeNginxRequest(natIp)),
    userId: null,
    sessionId: sessionA,
  });
  const keyB = buildAnalyticsHeavyRpcKey({
    route: "session_link",
    ip: getTrustedClientIp(makeNginxRequest(natIp)),
    userId: null,
    sessionId: sessionB,
  });
  assert.notEqual(keyA, keyB, "NAT peers must keep separate pair keys via session id");

  for (let i = 0; i < 3; i += 1) {
    const decision = guardAnalyticsHeavyRpc({
      route: "session_link",
      request: makeNginxRequest(natIp),
      sessionId: sessionA,
      userId: "nat-a",
    });
    if (i === 0) {
      assert.equal(decision.action, "rpc");
      decision.release("ok");
    } else {
      assert.equal(decision.action, "deduped");
    }
  }

  const otherSession = guardAnalyticsHeavyRpc({
    route: "session_link",
    request: makeNginxRequest(natIp),
    sessionId: sessionB,
    userId: "nat-b",
  });
  assert.equal(
    otherSession.action,
    "rpc",
    "another session behind the same NAT must not share the pair key",
  );
  otherSession.release("ok");
}

function testExistingRateLimiterStillUsed() {
  const key = `analytics-rpc-protection-unit:${Date.now()}`;
  assert.equal(checkAnalyticsRateLimit(key, 2, 60_000), true);
  assert.equal(checkAnalyticsRateLimit(key, 2, 60_000), true);
  assert.equal(checkAnalyticsRateLimit(key, 2, 60_000), false);

  const sanitize = read("src/lib/analytics/sanitize.ts");
  const protection = read("src/lib/analytics/rpc-protection.ts");
  assert.match(sanitize, /export function checkAnalyticsRateLimit/);
  assert.match(protection, /checkAnalyticsRateLimit/);
}

async function main() {
  await testTokenRefreshedDoesNotLink();
  await testSignedInDedupe();
  await testDifferentUsersStillWork();
  await testServerGuardSamePair();
  await testDirectHundredsAreShed();
  await testCircuitBreaker();
  testRetryBackoffNoAmplify();
  testSqlIdempotentAndLockPlacement();
  testSourceContracts();
  testTrustedClientIpExtraction();
  await testDifferentRealClientsDoNotShareCap();
  await testSpoofedXffCannotStealAnotherClientCap();
  await testNatSessionsKeepSeparatePairKeys();
  testExistingRateLimiterStillUsed();
  console.log("analytics-rpc-protection-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
