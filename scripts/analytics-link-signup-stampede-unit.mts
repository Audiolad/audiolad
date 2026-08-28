#!/usr/bin/env npx tsx
/**
 * Models the production PostgREST pool stampede from link/signup RPCs
 * and asserts the A/B/C/D guards. No live database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyLinkAnalyticsSessionUser,
  classifyRecordPlatformSignupCompleted,
} from "../src/lib/analytics/link-signup-idempotency.ts";
import {
  createKeyedSingleFlight,
  shouldSettleAnalyticsHttpAttempt,
} from "../src/lib/analytics/single-flight.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION =
  "supabase/migrations/20260901120000_analytics_link_signup_idempotent.sql";

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function testIdempotencyPolicy() {
  assert.equal(
    classifyLinkAnalyticsSessionUser({
      sessionFound: true,
      sessionUserId: "user-1",
      callerUserId: "user-1",
      hasActiveIdentityLink: true,
    }),
    "fast_noop",
    "already-linked session is a fast no-op",
  );
  assert.equal(
    classifyLinkAnalyticsSessionUser({
      sessionFound: true,
      sessionUserId: null,
      callerUserId: "user-1",
      hasActiveIdentityLink: false,
    }),
    "heavy",
    "first link is heavy",
  );
  assert.equal(
    classifyLinkAnalyticsSessionUser({
      sessionFound: false,
      sessionUserId: null,
      callerUserId: "user-1",
      hasActiveIdentityLink: false,
    }),
    "reject",
    "missing session rejects",
  );
  assert.equal(
    classifyRecordPlatformSignupCompleted({
      authenticated: true,
      alreadyRecordedSignup: true,
    }),
    "already_recorded",
    "repeat signup is already_recorded",
  );
  assert.equal(
    classifyRecordPlatformSignupCompleted({
      authenticated: true,
      alreadyRecordedSignup: false,
    }),
    "continue",
    "first signup continues",
  );
}

async function testSingleFlightCollapsesIdenticalKeys() {
  const flight = createKeyedSingleFlight<string>();
  let runs = 0;

  const task = async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "ok";
  };

  const settled: Array<string | null> = [];
  await Promise.all(
    Array.from({ length: 80 }, async () => {
      settled.push(await flight.run("session-a:anon-a", task));
    }),
  );

  assert.equal(runs, 1, "80 identical calls run the heavy task once");
  assert.equal(
    settled.filter((value) => value === "ok").length,
    80,
    "in-flight joiners share the one result",
  );

  const after = await flight.run("session-a:anon-a", task);
  assert.equal(after, null, "settled key is a no-op");
  assert.equal(runs, 1, "settled key does not run again");

  const other = await flight.run("session-b:anon-b", task);
  assert.equal(other, "ok", "different natural key is not a global mutex");
  assert.equal(runs, 2, "other session still runs once");
}

async function testSingleFlightDoesNotRetry5xxInLifecycle() {
  const flight = createKeyedSingleFlight<{ status: number }>();
  let runs = 0;
  const first = await flight.run(
    "s:a",
    async () => {
      runs += 1;
      return { status: 204 };
    },
    { settle: (value) => shouldSettleAnalyticsHttpAttempt(value.status) },
  );
  const second = await flight.run(
    "s:a",
    async () => {
      runs += 1;
      return { status: 204 };
    },
    { settle: (value) => shouldSettleAnalyticsHttpAttempt(value.status) },
  );
  assert.deepEqual(first, { status: 204 });
  assert.equal(second, null);
  assert.equal(runs, 1, "204 fail-soft settles; no retry this lifecycle");
  assert.equal(shouldSettleAnalyticsHttpAttempt(0), true);
  assert.equal(shouldSettleAnalyticsHttpAttempt(500), true);
  assert.equal(shouldSettleAnalyticsHttpAttempt(204), true);
  assert.equal(shouldSettleAnalyticsHttpAttempt(401), false);
}

type StampedeInput = {
  attemptsPerTab: number;
  tabs: number;
  poolSize: number;
  lockTimeoutMs: number;
  poolAcquireTimeoutMs: number;
  heavyWorkMs: number;
  cheapWorkMs: number;
  catalogWorkMs: number;
  catalogStartMs: number;
  singleFlightPerTab: boolean;
  sqlEarlyReturn: boolean;
  retryOnTransient: boolean;
};

type StampedeResult = {
  heavy: number;
  cheap: number;
  lockTimeout: number;
  poolTimeout: number;
  retries: number;
  catalogOk: boolean;
  catalogPoolTimeout: boolean;
  maxBusyConnections: number;
};

type PoolWaiter = {
  started: number;
  kind: "rpc" | "catalog";
  tab: number;
  attempt: number;
};

type LockWaiter = {
  conn: number;
  tab: number;
  attempt: number;
  started: number;
  timeoutAt: number;
};

type SimEvent =
  | { t: number; kind: "rpc_start"; tab: number; attempt: number }
  | { t: number; kind: "catalog_start" }
  | { t: number; kind: "work_done"; conn: number; mode: "heavy" | "cheap" }
  | { t: number; kind: "catalog_done"; conn: number }
  | { t: number; kind: "lock_timeout"; waiterId: number }
  | { t: number; kind: "pool_timeout_check" };

function simulateStampede(input: StampedeInput): StampedeResult {
  const result: StampedeResult = {
    heavy: 0,
    cheap: 0,
    lockTimeout: 0,
    poolTimeout: 0,
    retries: 0,
    catalogOk: false,
    catalogPoolTimeout: false,
    maxBusyConnections: 0,
  };

  const freeConns: number[] = Array.from({ length: input.poolSize }, (_, i) => i);
  const poolWaiters: PoolWaiter[] = [];
  const lockWaiters = new Map<number, LockWaiter>();
  let nextWaiterId = 1;
  let lockHeld = false;
  let linked = false;
  let nextAttempt = input.tabs * input.attemptsPerTab;
  const events: SimEvent[] = [];

  for (let tab = 0; tab < input.tabs; tab += 1) {
    const count = input.singleFlightPerTab ? 1 : input.attemptsPerTab;
    for (let attempt = 0; attempt < count; attempt += 1) {
      events.push({ t: 0, kind: "rpc_start", tab, attempt });
    }
  }
  events.push({ t: input.catalogStartMs, kind: "catalog_start" });
  events.push({
    t: input.poolAcquireTimeoutMs + 1,
    kind: "pool_timeout_check",
  });

  function push(event: SimEvent) {
    events.push(event);
    events.sort((a, b) => a.t - b.t || eventOrder(a.kind) - eventOrder(b.kind));
  }

  function eventOrder(kind: SimEvent["kind"]): number {
    if (kind === "lock_timeout" || kind === "pool_timeout_check") return 0;
    if (kind === "work_done" || kind === "catalog_done") return 1;
    return 2;
  }

  function noteBusy() {
    const busy = input.poolSize - freeConns.length;
    if (busy > result.maxBusyConnections) {
      result.maxBusyConnections = busy;
    }
  }

  function release(conn: number) {
    freeConns.push(conn);
  }

  function enqueueRetry(t: number, tab: number) {
    if (!input.retryOnTransient) {
      return;
    }
    result.retries += 1;
    nextAttempt += 1;
    push({ t, kind: "rpc_start", tab, attempt: nextAttempt });
  }

  function beginHeavy(t: number, conn: number) {
    lockHeld = true;
    result.heavy += 1;
    push({ t: t + input.heavyWorkMs, kind: "work_done", conn, mode: "heavy" });
  }

  function queueForLock(t: number, conn: number, tab: number, attempt: number) {
    const waiterId = nextWaiterId;
    nextWaiterId += 1;
    lockWaiters.set(waiterId, {
      conn,
      tab,
      attempt,
      started: t,
      timeoutAt: t + input.lockTimeoutMs,
    });
    push({ t: t + input.lockTimeoutMs, kind: "lock_timeout", waiterId });
  }

  function startRpc(t: number, conn: number, tab: number, attempt: number) {
    if (input.sqlEarlyReturn && linked) {
      result.cheap += 1;
      push({ t: t + input.cheapWorkMs, kind: "work_done", conn, mode: "cheap" });
      return;
    }

    if (lockHeld) {
      queueForLock(t, conn, tab, attempt);
      return;
    }

    beginHeavy(t, conn);
  }

  function promoteLockWaiter(t: number) {
    if (lockHeld) {
      return;
    }
    const next = [...lockWaiters.entries()].sort((a, b) => a[0] - b[0])[0];
    if (!next) {
      return;
    }
    lockWaiters.delete(next[0]);
    beginHeavy(t, next[1].conn);
  }

  function expirePoolWaiters(t: number) {
    const remaining: PoolWaiter[] = [];
    for (const waiter of poolWaiters) {
      if (t - waiter.started <= input.poolAcquireTimeoutMs) {
        remaining.push(waiter);
        continue;
      }
      if (waiter.kind === "catalog") {
        result.catalogPoolTimeout = true;
      } else {
        result.poolTimeout += 1;
        enqueueRetry(t, waiter.tab);
      }
    }
    poolWaiters.length = 0;
    poolWaiters.push(...remaining);
  }

  function drainPool(t: number) {
    expirePoolWaiters(t);
    while (freeConns.length > 0 && poolWaiters.length > 0) {
      const waiter = poolWaiters.shift();
      if (!waiter) {
        break;
      }
      const conn = freeConns.pop();
      if (conn == null) {
        break;
      }
      noteBusy();
      if (waiter.kind === "catalog") {
        push({ t: t + input.catalogWorkMs, kind: "catalog_done", conn });
      } else {
        startRpc(t, conn, waiter.tab, waiter.attempt);
      }
    }
  }

  while (events.length > 0) {
    const event = events.shift();
    if (!event) {
      break;
    }
    const t = event.t;
    drainPool(t);

    if (event.kind === "rpc_start") {
      if (freeConns.length === 0) {
        poolWaiters.push({
          started: t,
          kind: "rpc",
          tab: event.tab,
          attempt: event.attempt,
        });
        continue;
      }
      const conn = freeConns.pop();
      if (conn == null) {
        continue;
      }
      noteBusy();
      startRpc(t, conn, event.tab, event.attempt);
    } else if (event.kind === "catalog_start") {
      if (freeConns.length === 0) {
        poolWaiters.push({
          started: t,
          kind: "catalog",
          tab: -1,
          attempt: -1,
        });
        continue;
      }
      const conn = freeConns.pop();
      if (conn == null) {
        continue;
      }
      noteBusy();
      push({ t: t + input.catalogWorkMs, kind: "catalog_done", conn });
    } else if (event.kind === "work_done") {
      if (event.mode === "heavy") {
        linked = true;
        lockHeld = false;
        if (input.sqlEarlyReturn) {
          // Remaining lock waiters can now cheap-scan without the convoy.
          for (const [id, waiter] of lockWaiters) {
            lockWaiters.delete(id);
            result.cheap += 1;
            push({
              t: t + input.cheapWorkMs,
              kind: "work_done",
              conn: waiter.conn,
              mode: "cheap",
            });
          }
        } else {
          promoteLockWaiter(t);
        }
      }
      release(event.conn);
      drainPool(t);
    } else if (event.kind === "catalog_done") {
      result.catalogOk = true;
      release(event.conn);
      drainPool(t);
    } else if (event.kind === "lock_timeout") {
      const waiter = lockWaiters.get(event.waiterId);
      if (!waiter) {
        continue;
      }
      lockWaiters.delete(event.waiterId);
      result.lockTimeout += 1;
      release(waiter.conn);
      enqueueRetry(t, waiter.tab);
      drainPool(t);
    } else if (event.kind === "pool_timeout_check") {
      expirePoolWaiters(t);
    }
  }

  expirePoolWaiters(1_000_000);
  return result;
}

const STORM = {
  attemptsPerTab: 10,
  tabs: 8,
  poolSize: 10,
  lockTimeoutMs: 8_000,
  poolAcquireTimeoutMs: 10_000,
  heavyWorkMs: 2_000,
  cheapWorkMs: 5,
  catalogWorkMs: 20,
  catalogStartMs: 50,
} as const;

function testLegacyStampedeSaturatesPool() {
  const legacy = simulateStampede({
    ...STORM,
    singleFlightPerTab: false,
    sqlEarlyReturn: false,
    retryOnTransient: true,
  });

  assert.ok(legacy.heavy > 1, `legacy heavy=${legacy.heavy}`);
  assert.equal(legacy.cheap, 0, "legacy has no fast no-op");
  assert.ok(
    legacy.lockTimeout > 0 || legacy.poolTimeout > 0,
    `legacy must 55P03/PGRST003 lock=${legacy.lockTimeout} pool=${legacy.poolTimeout}`,
  );
  assert.ok(legacy.retries > 0, "legacy retries amplify the storm");
  assert.equal(legacy.catalogOk, false, "catalog cannot proceed during legacy burst");
  assert.equal(legacy.catalogPoolTimeout, true, "catalog sees PGRST003 in the model");
}

function testFixedStampedeIsCheapAndLetsCatalogThrough() {
  const fixed = simulateStampede({
    ...STORM,
    singleFlightPerTab: true,
    sqlEarlyReturn: true,
    retryOnTransient: false,
  });

  assert.equal(fixed.heavy, 1, `fixed heavy must be 1 per logical session, got ${fixed.heavy}`);
  assert.equal(
    fixed.cheap,
    STORM.tabs - 1,
    `remaining tab RPCs are fast no-ops, got ${fixed.cheap}`,
  );
  assert.equal(fixed.lockTimeout, 0, "no 55P03 avalanche");
  assert.equal(fixed.poolTimeout, 0, "no PGRST003");
  assert.equal(fixed.retries, 0, "no retry amplification");
  assert.equal(fixed.catalogOk, true, "ordinary catalog query proceeds");
  assert.equal(fixed.catalogPoolTimeout, false, "catalog is not pool-starved");
  assert.ok(
    fixed.maxBusyConnections < STORM.poolSize,
    `pool must have spare capacity, busy=${fixed.maxBusyConnections}`,
  );
}

function testSourceContracts() {
  const sql = read(MIGRATION);
  const client = read("src/lib/analytics/client.ts");
  const linker = read("src/components/analytics/AnalyticsAuthLinker.tsx");
  const linkRoute = read("src/app/api/analytics/session/link/route.ts");
  const signupRoute = read("src/app/api/analytics/signup/complete/route.ts");
  const p1 = read("supabase/migrations/20260725160000_platform_analytics_p1_identity.sql");
  const p322 = read("supabase/migrations/20260725210000_analytics_p322_first_touch.sql");
  const signupSql = read(
    "supabase/migrations/20260717130000_platform_analytics_signup_completion.sql",
  );

  assert(sql.includes("IF v_session_user IS NOT DISTINCT FROM v_user_id THEN"), "link early-return");
  assert(sql.includes("analytics_identity_links"), "identity check before heavy path");
  assert(sql.includes("already_recorded"), "signup already_recorded");
  assert(
    sql.indexOf("event_name = 'signup_completed'") <
      sql.indexOf("IF NOT EXISTS") ||
      sql.includes("Repeats must not enter the heavy link path first"),
    "signup already_recorded is checked before session mismatch work",
  );
  assert(sql.includes("GRANT EXECUTE ON FUNCTION public.link_analytics_session_user"), "link grant");
  assert(
    sql.includes("GRANT EXECUTE ON FUNCTION public.record_platform_signup_completed"),
    "signup grant",
  );
  assert(!sql.includes("pg_try_advisory"), "do not replace advisory locks with try-lock");
  assert(!sql.includes("PGRST_DB_POOL"), "do not touch pool settings");
  assert(!/\bSET\s+lock_timeout\b/i.test(sql), "do not change lock_timeout in SQL body");

  assert(p1.includes("UPDATE public.analytics_events AS e"), "link updates session events");
  assert(p1.includes("WHERE e.session_id = p_session_id"), "events filtered by session");
  assert(p1.includes("AND e.user_id IS NULL"), "only unlinked events");
  assert(p322.includes("pg_advisory_xact_lock(hashtext('ft:user:'"), "user first-touch advisory");
  assert(p322.includes("pg_advisory_xact_lock(hashtext('ft:anon:'"), "anon first-touch advisory");
  assert(p322.includes("PERFORM public.ensure_user_first_touch(v_user_id)"), "identity wires FT");
  assert(signupSql.includes("PERFORM public.link_analytics_session_user"), "signup called link");

  assert(client.includes("linkSessionFlight"), "link single-flight");
  assert(client.includes("signupCompleteFlight"), "signup single-flight");
  assert(client.includes("shouldSettleAnalyticsHttpAttempt"), "no retry after terminal HTTP");
  assert(
    !client.includes('enqueueAnalyticsRetry') ||
      !/enqueueAnalyticsRetry\(\{\s*id:[\s\S]*session\/link/.test(client),
    "link/signup must not use the track retry queue",
  );
  assert(linker.includes('event === "INITIAL_SESSION"'), "link on initial session only");
  assert(linker.includes('event === "SIGNED_IN"'), "signup only on SIGNED_IN");
  assert(linker.includes("TOKEN_REFRESHED"), "documents skip of token refresh");
  assert(!linker.includes("getSession()"), "no getSession + onAuthStateChange double fire");
  assert(linkRoute.includes("status: 204"), "link fail-soft 204");
  assert(signupRoute.includes("status: 204"), "signup fail-soft 204");
  assert(!linkRoute.includes("status: 500"), "link must not 500");
  assert(!signupRoute.includes("status: 500"), "signup must not 500 on RPC error");
}

function testEventsPerSessionEvidence() {
  const p1 = read("supabase/migrations/20260725160000_platform_analytics_p1_identity.sql");
  const p1Test = read("scripts/platform-analytics-p1-identity-sql-unit.mjs");
  const listening = read("src/lib/analytics/constants.ts");

  assert(
    p1.includes("WHERE e.session_id = p_session_id\n    AND e.user_id IS NULL"),
    "first-time link UPDATEs every unlinked event for the session",
  );
  assert(
    p1Test.includes("generate_series(1,1200)"),
    "repo harness can attach 1200 events to one session",
  );
  assert(listening.includes("audio_progress_90"), "one listen can add 4 milestone rows");
  assert(listening.includes("PAGE_VIEW_DEDUP_MS = 5_000"), "page_view can repeat every 5s");
}

async function main() {
  testIdempotencyPolicy();
  await testSingleFlightCollapsesIdenticalKeys();
  await testSingleFlightDoesNotRetry5xxInLifecycle();
  testLegacyStampedeSaturatesPool();
  testFixedStampedeIsCheapAndLetsCatalogThrough();
  testSourceContracts();
  testEventsPerSessionEvidence();
  console.log("analytics-link-signup-stampede-unit: ok");
}

await main();
