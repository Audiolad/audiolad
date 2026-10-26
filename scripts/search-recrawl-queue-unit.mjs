#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCTION_APP_ORIGIN } from "../src/lib/seo/app-origin.ts";
import { deliverIndexNowNotification } from "../src/lib/seo/indexnow/hooks.ts";
import { INDEXNOW_REASONS } from "../src/lib/seo/indexnow/reasons.ts";
import { createMemorySearchRecrawlQueue } from "../src/lib/seo/search-recrawl/memory.ts";
import { isAudioladRecrawlUrl } from "../src/lib/seo/search-recrawl/origin.ts";
import { recordIndexNowFailures } from "../src/lib/seo/search-recrawl/indexnow-failures.ts";
import { runSearchRecrawlCycle } from "../src/lib/seo/search-recrawl/cycle.ts";
import {
  classifyYandexQuotaRead,
  disposeIndexNowAttempt,
  disposeYandexAttempt,
  recrawlBackoffMs,
  SEARCH_RECRAWL_BACKOFF_BASE_MS,
  SEARCH_RECRAWL_BACKOFF_CAP_MS,
  SEARCH_RECRAWL_BATCH_LIMIT,
  SEARCH_RECRAWL_MAX_ATTEMPTS,
  SEARCH_RECRAWL_QUOTA_DELAY_MS,
  shouldAlertYandexStale,
  yandexSendBudget,
} from "../src/lib/seo/search-recrawl/policy.ts";
import { compareSearchRecrawlRelease } from "../src/lib/seo/search-recrawl/worker-release.ts";
import {
  clearAudioladWebmasterHostCache,
  submitYandexRecrawl,
} from "../src/lib/seo/yandex-webmaster/client.ts";
import { scheduleYandexRecrawlNotification } from "../src/lib/seo/yandex-webmaster/hooks.ts";
import {
  hostUrlMatchesAudiolad,
  resolveAudioladHostId,
} from "../src/lib/seo/yandex-webmaster/host.ts";
import { planPracticeYandexRecrawl } from "../src/lib/seo/yandex-webmaster/planner.ts";
import { buildPracticeCanonicalUrl } from "../src/lib/products/paths.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRACTICE_URL = "https://audiolad.ru/practice/sergey/lavandovyy-son";
const AUDIOLAD_HOST_ID = "https:audiolad.ru:443";
const OTHER_HOST_ID = "https:sergey-zoya.ru:443";

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function audioladHost(hostId = AUDIOLAD_HOST_ID, url = "https://audiolad.ru/") {
  return {
    hostId,
    asciiHostUrl: url,
    unicodeHostUrl: url,
    verified: true,
  };
}

function otherHost() {
  return {
    hostId: OTHER_HOST_ID,
    asciiHostUrl: "https://sergey-zoya.ru/",
    unicodeHostUrl: "https://sergey-zoya.ru/",
    verified: true,
  };
}

assert.equal(isAudioladRecrawlUrl(PRACTICE_URL), true);
assert.equal(isAudioladRecrawlUrl("https://audiolad.ru/"), true);
assert.equal(isAudioladRecrawlUrl("https://www.audiolad.ru/practice/a/b"), false);
assert.equal(isAudioladRecrawlUrl("https://sergey-zoya.ru/practice/a/b"), false);
assert.equal(isAudioladRecrawlUrl("http://audiolad.ru/practice/a/b"), false);
assert.equal(isAudioladRecrawlUrl("https://audiolad.ru/practice/a/b?x=1"), false);
assert.equal(hostUrlMatchesAudiolad("https://audiolad.ru/"), true);
assert.equal(hostUrlMatchesAudiolad("https://www.audiolad.ru/"), false);
assert.equal(hostUrlMatchesAudiolad("https://sergey-zoya.ru/"), false);
assert.equal(hostUrlMatchesAudiolad("http://audiolad.ru/"), false);

assert.deepEqual(
  resolveAudioladHostId([otherHost(), audioladHost()], AUDIOLAD_HOST_ID),
  { ok: true, hostId: AUDIOLAD_HOST_ID },
);
assert.equal(resolveAudioladHostId([], AUDIOLAD_HOST_ID).reason, "host_empty");
assert.equal(
  resolveAudioladHostId([otherHost()], OTHER_HOST_ID).reason,
  "host_not_found",
);
assert.equal(
  resolveAudioladHostId([audioladHost()], OTHER_HOST_ID).reason,
  "host_mismatch",
);
assert.equal(
  resolveAudioladHostId(
    [audioladHost(AUDIOLAD_HOST_ID, "https://www.audiolad.ru/")],
    AUDIOLAD_HOST_ID,
  ).reason,
  "host_not_found",
);
assert.equal(
  resolveAudioladHostId(
    [{ ...audioladHost(), verified: false }],
    AUDIOLAD_HOST_ID,
  ).reason,
  "host_unverified",
);

assert.equal(recrawlBackoffMs(1), SEARCH_RECRAWL_BACKOFF_BASE_MS);
assert.equal(recrawlBackoffMs(2), 10 * 60 * 1000);
assert.equal(recrawlBackoffMs(3), 20 * 60 * 1000);
assert.equal(recrawlBackoffMs(20), SEARCH_RECRAWL_BACKOFF_CAP_MS);
assert.equal(
  disposeYandexAttempt({
    status: "already_queued",
    errorCode: "already_queued",
    httpStatus: 409,
    attemptsAfter: 1,
  }).action,
  "delivered",
);
assert.equal(
  disposeYandexAttempt({
    status: "quota_exhausted",
    errorCode: "quota_exhausted",
    httpStatus: 429,
    attemptsAfter: 1,
  }).delayMs,
  SEARCH_RECRAWL_QUOTA_DELAY_MS,
);
const gateway = disposeYandexAttempt({
  status: "failed",
  errorCode: "http_error",
  httpStatus: 504,
  attemptsAfter: 2,
});
assert.equal(gateway.action, "retry");
assert.equal(gateway.delayMs, 10 * 60 * 1000);
assert.equal(
  disposeYandexAttempt({
    status: "failed",
    errorCode: "http_error",
    httpStatus: 504,
    attemptsAfter: SEARCH_RECRAWL_MAX_ATTEMPTS,
  }).action,
  "dead",
);
const hostMismatch = disposeYandexAttempt({
  status: "host_mismatch",
  errorCode: "host_mismatch",
  httpStatus: null,
  attemptsAfter: 1,
});
assert.equal(hostMismatch.action, "retry");
assert.equal(hostMismatch.pauseQueue, true);
assert.equal(hostMismatch.countAttempt, false);
const disabledSend = disposeYandexAttempt({
  status: "disabled",
  errorCode: "disabled",
  httpStatus: null,
  attemptsAfter: 1,
});
assert.equal(disabledSend.action, "retry");
assert.equal(disabledSend.pauseQueue, true);
assert.notEqual(disabledSend.action, "delivered");
assert.equal(
  disposeYandexAttempt({
    status: "auth_failed",
    errorCode: "auth_failed",
    httpStatus: 401,
    attemptsAfter: SEARCH_RECRAWL_MAX_ATTEMPTS,
  }).action,
  "retry",
);
assert.equal(
  disposeYandexAttempt({
    status: "failed",
    errorCode: "invalid_url",
    httpStatus: 400,
    attemptsAfter: 1,
  }).action,
  "dead",
);
const indexNowDisabled = disposeIndexNowAttempt({
  status: "disabled",
  attemptsAfter: 1,
});
assert.equal(indexNowDisabled.action, "retry");
assert.equal(indexNowDisabled.pauseQueue, true);
assert.equal(
  yandexSendBudget({
    quotaState: "unknown",
    quotaRemainder: null,
    batchLimit: SEARCH_RECRAWL_BATCH_LIMIT,
  }),
  0,
);
assert.equal(
  yandexSendBudget({
    quotaState: "blocked",
    quotaRemainder: null,
  }),
  0,
);
assert.equal(
  yandexSendBudget({
    quotaState: "transient",
    quotaRemainder: null,
    batchLimit: 20,
  }),
  20,
);
assert.equal(classifyYandexQuotaRead({ ok: false, remainder: null }).state, "unknown");
assert.equal(
  classifyYandexQuotaRead({ ok: false, remainder: null, errorCode: "timeout" }).state,
  "transient",
);
assert.equal(
  classifyYandexQuotaRead({ ok: false, remainder: null, errorCode: "disabled" }).state,
  "blocked",
);
assert.equal(
  disposeYandexAttempt({
    status: "foreign_origin",
    errorCode: "foreign_origin",
    httpStatus: null,
    attemptsAfter: 1,
  }).action,
  "rejected",
);

const hour = 60 * 60 * 1000;
assert.equal(
  shouldAlertYandexStale({
    pendingCount: 1,
    oldestPendingAt: Date.now() - hour,
    lastDeliveredAt: null,
    now: Date.now(),
  }),
  false,
);
assert.equal(
  shouldAlertYandexStale({
    pendingCount: 1,
    oldestPendingAt: Date.now() - 25 * hour,
    lastDeliveredAt: null,
    now: Date.now(),
  }),
  true,
);
assert.equal(
  shouldAlertYandexStale({
    pendingCount: 2,
    oldestPendingAt: Date.now(),
    lastDeliveredAt: Date.now() - 25 * hour,
    now: Date.now(),
  }),
  true,
);
assert.equal(
  shouldAlertYandexStale({
    pendingCount: 0,
    oldestPendingAt: null,
    lastDeliveredAt: Date.now() - 48 * hour,
    now: Date.now(),
  }),
  false,
);

const listed = planPracticeYandexRecrawl({
  previousStatus: "published",
  nextStatus: "published",
  previousCatalogVisibility: "unlisted",
  previousIsCatalogListed: false,
  catalogVisibility: "listed",
  isCatalogListed: true,
  changedFields: ["catalog_visibility"],
  authorSlug: "sergey",
  practiceSlug: "lavandovyy-son",
});
assert.equal(listed?.reason, "practice_became_listed");
assert.equal(listed?.url, buildPracticeCanonicalUrl("sergey", "lavandovyy-son"));
assert.equal(
  planPracticeYandexRecrawl({
    previousStatus: "published",
    nextStatus: "published",
    previousCatalogVisibility: "listed",
    previousIsCatalogListed: true,
    catalogVisibility: "unlisted",
    isCatalogListed: false,
    changedFields: ["catalog_visibility"],
    authorSlug: "sergey",
    practiceSlug: "lavandovyy-son",
  }),
  null,
);

const queue = createMemorySearchRecrawlQueue(() => 1_000);
const first = queue.enqueue({
  url: PRACTICE_URL,
  engine: "yandex",
  reason: "practice_published",
  entityType: "practice",
  entityId: "product-1",
});
assert.equal(first.outcome, "inserted");
const taken = queue.take(5);
assert.equal(taken.length, 1);
queue.retry(taken[0].id, taken[0].leaseToken, 3, "http_error", 504, 5_000);
const again = queue.enqueue({
  url: PRACTICE_URL,
  engine: "yandex",
  reason: "practice_seo_updated",
  entityType: "practice",
  entityId: "product-1",
});
assert.equal(again.outcome, "deduped");
assert.equal(again.id, first.id);
assert.equal(queue.rows()[0].attempts, 3);
assert.equal(queue.rows()[0].reason, "practice_seo_updated");
const indexNow = queue.enqueue({
  url: PRACTICE_URL,
  engine: "indexnow",
  reason: "practice_published",
});
assert.equal(indexNow.outcome, "inserted");
assert.equal(
  queue.enqueue({
    url: "https://sergey-zoya.ru/practice/a/b",
    engine: "yandex",
    reason: "practice_published",
  }).outcome,
  "rejected",
);
assert.equal(queue.rows().filter((row) => row.engine === "yandex").length, 1);

const enqueued = [];
scheduleYandexRecrawlNotification(PRACTICE_URL, "practice_published", {
  syncForTests: true,
  entityType: "practice",
  entityId: "product-1",
  enqueueImpl: async (input) => {
    enqueued.push(input);
    return { outcome: "inserted", id: "row-1" };
  },
});
assert.equal(enqueued.length, 1);
assert.equal(enqueued[0].engine, "yandex");
assert.equal(enqueued[0].url, PRACTICE_URL);
assert.equal(enqueued[0].entityId, "product-1");

const foreign = [];
scheduleYandexRecrawlNotification("https://sergey-zoya.ru/page", "practice_published", {
  syncForTests: true,
  enqueueImpl: async (input) => {
    foreign.push(input);
    return { outcome: "rejected", reason: "foreign_origin" };
  },
});
assert.equal(foreign.length, 1);
assert.equal(foreign[0].url, "https://sergey-zoya.ru/page");

const failedIndexNow = [];
await recordIndexNowFailures({
  urls: [PRACTICE_URL],
  reason: "practice_published",
  result: {
    status: "failed",
    reason: "practice_published",
    canSubmit: true,
    acceptedUrls: [PRACTICE_URL],
    rejected: [],
    batchResults: [
      {
        urlCount: 1,
        urls: [PRACTICE_URL],
        http: { ok: false, status: 504, accepted: false, retried: true, errorCode: "http_error" },
      },
    ],
    redactedPayloads: [],
  },
  entityType: "practice",
  entityId: "product-1",
  enqueue: async (input) => {
    failedIndexNow.push(input);
    return { outcome: "inserted", id: "index-1" };
  },
});
assert.equal(failedIndexNow.length, 1);
assert.equal(failedIndexNow[0].engine, "indexnow");

const skipped = [];
await recordIndexNowFailures({
  urls: [PRACTICE_URL],
  reason: "practice_published",
  result: {
    status: "submitted",
    reason: "practice_published",
    canSubmit: true,
    acceptedUrls: [PRACTICE_URL],
    rejected: [],
    batchResults: [],
    redactedPayloads: [],
  },
  enqueue: async (input) => {
    skipped.push(input);
    return { outcome: "inserted", id: "nope" };
  },
});
assert.equal(skipped.length, 0);

const now = 1_700_000_000_000;
const cycleQueue = createMemorySearchRecrawlQueue(() => now);
cycleQueue.enqueue({
  url: PRACTICE_URL,
  engine: "yandex",
  reason: "practice_published",
  entityType: "practice",
  entityId: "product-1",
});
const sends = [];
const logs = [];
const cycle = await runSearchRecrawlCycle({
  now: () => now,
  claimDueScheduled: async () => {},
  handoffScheduled: async () => {},
  takeDue: async () => cycleQueue.take(20),
  complete: async (row, attempts, httpStatus) => {
    cycleQueue.complete(row.id, row.leaseToken, attempts, httpStatus);
  },
  retry: async (row, attempts, error, httpStatus, nextAttemptAt) => {
    cycleQueue.retry(row.id, row.leaseToken, attempts, error, httpStatus, nextAttemptAt);
  },
  dead: async (row, attempts, error, httpStatus) => {
    cycleQueue.dead(row.id, row.leaseToken, attempts, error, httpStatus);
  },
  reject: async (row, error) => {
    cycleQueue.reject(row.id, row.leaseToken, error);
  },
  health: async () => cycleQueue.health(),
  readQuota: async () => ({
    state: "transient",
    remainder: null,
    reason: "quota_check_failed",
  }),
  sendYandex: async (url) => {
    sends.push(url);
    return { status: "failed", errorCode: "http_error", httpStatus: 504 };
  },
  sendIndexNow: async () => ({ status: "submitted" }),
  log: (level, event, fields) => {
    logs.push({ level, event, fields });
  },
});
assert.equal(sends.length, 1);
assert.equal(sends[0], PRACTICE_URL);
assert.equal(cycle.retried, 1);
assert.equal(cycleQueue.rows()[0].status, "pending");
assert.equal(cycleQueue.rows()[0].lastHttpStatus, 504);
assert.equal(cycleQueue.rows()[0].attempts, 1);
assert.equal(
  cycleQueue.rows()[0].nextAttemptAt,
  now + SEARCH_RECRAWL_BACKOFF_BASE_MS,
);
assert.equal(cycleQueue.rows()[0].deliveredAt, null);

function cycleDeps(queue, clock, overrides) {
  return {
    now: () => clock,
    claimDueScheduled: async () => {},
    handoffScheduled: async () => {},
    takeDue: async () => queue.take(20),
    complete: async (row, attempts, httpStatus) => {
      queue.complete(row.id, row.leaseToken, attempts, httpStatus);
    },
    retry: async (row, attempts, error, httpStatus, nextAttemptAt) => {
      queue.retry(row.id, row.leaseToken, attempts, error, httpStatus, nextAttemptAt);
    },
    dead: async (row, attempts, error, httpStatus) => {
      queue.dead(row.id, row.leaseToken, attempts, error, httpStatus);
    },
    reject: async (row, error) => {
      queue.reject(row.id, row.leaseToken, error);
    },
    health: async () => queue.health(),
    readQuota: async () => ({ state: "known", remainder: 10, reason: null }),
    sendYandex: async () => ({ status: "submitted", httpStatus: 202 }),
    sendIndexNow: async () => ({ status: "submitted" }),
    log: () => {},
    ...overrides,
  };
}

const disabledClock = now;
const disabledCreated = disabledClock - 25 * 60 * 60 * 1000;
const disabledQueue = createMemorySearchRecrawlQueue(() => disabledCreated);
disabledQueue.enqueue({
  url: PRACTICE_URL,
  engine: "yandex",
  reason: "practice_published",
});
disabledQueue.enqueue({
  url: "https://audiolad.ru/practice/sergey/second",
  engine: "yandex",
  reason: "practice_published",
});
disabledQueue.enqueue({
  url: PRACTICE_URL,
  engine: "indexnow",
  reason: "practice_published",
});
const disabledSends = [];
const disabledCycle = await runSearchRecrawlCycle(
  cycleDeps(disabledQueue, disabledClock, {
    readQuota: async () => ({ state: "blocked", remainder: null, reason: "disabled" }),
    sendYandex: async (url) => {
      disabledSends.push(url);
      return { status: "disabled", errorCode: "disabled", httpStatus: null };
    },
    sendIndexNow: async () => ({ status: "disabled" }),
  }),
);
assert.equal(disabledSends.length, 0);
assert.equal(disabledCycle.delivered, 0);
assert.equal(disabledCycle.dead, 0);
assert.equal(disabledCycle.alerted, true);
for (const row of disabledQueue.rows()) {
  assert.equal(row.status, "pending");
  assert.equal(row.deliveredAt, null);
  assert.equal(row.attempts, 0);
}

const unknownQueue = createMemorySearchRecrawlQueue(() => now);
unknownQueue.enqueue({ url: PRACTICE_URL, engine: "yandex", reason: "practice_published" });
unknownQueue.enqueue({
  url: "https://audiolad.ru/practice/sergey/second",
  engine: "yandex",
  reason: "practice_published",
});
const unknownSends = [];
await runSearchRecrawlCycle(
  cycleDeps(unknownQueue, now, {
    readQuota: async () => ({ state: "unknown", remainder: null, reason: null }),
    sendYandex: async (url) => {
      unknownSends.push(url);
      return { status: "submitted", httpStatus: 202 };
    },
  }),
);
assert.equal(unknownSends.length, 0);
assert.equal(unknownQueue.rows().every((row) => row.status === "pending" && row.deliveredAt == null), true);

const authQueue = createMemorySearchRecrawlQueue(() => now);
authQueue.enqueue({ url: PRACTICE_URL, engine: "yandex", reason: "practice_published" });
authQueue.enqueue({
  url: "https://audiolad.ru/practice/sergey/second",
  engine: "yandex",
  reason: "practice_published",
});
const authSends = [];
await runSearchRecrawlCycle(
  cycleDeps(authQueue, now, {
    sendYandex: async (url) => {
      authSends.push(url);
      return { status: "auth_failed", errorCode: "auth_failed", httpStatus: 401 };
    },
  }),
);
assert.equal(authSends.length, 1);
assert.equal(authQueue.rows().every((row) => row.status === "pending" && row.deliveredAt == null), true);
assert.equal(authQueue.rows().some((row) => row.status === "dead"), false);

const badUrlQueue = createMemorySearchRecrawlQueue(() => now);
badUrlQueue.enqueue({ url: PRACTICE_URL, engine: "yandex", reason: "practice_published" });
badUrlQueue.enqueue({
  url: "https://audiolad.ru/practice/sergey/second",
  engine: "yandex",
  reason: "practice_published",
});
const badUrlSends = [];
await runSearchRecrawlCycle(
  cycleDeps(badUrlQueue, now, {
    sendYandex: async (url) => {
      badUrlSends.push(url);
      if (badUrlSends.length === 1) {
        return { status: "failed", errorCode: "invalid_url", httpStatus: 400 };
      }
      return { status: "submitted", httpStatus: 202 };
    },
  }),
);
assert.equal(badUrlSends.length, 2);
assert.equal(badUrlQueue.rows().filter((row) => row.status === "dead").length, 1);
assert.equal(badUrlQueue.rows().filter((row) => row.status === "delivered").length, 1);

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function productionEnv() {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: PRODUCTION_APP_ORIGIN,
    YANDEX_WEBMASTER_RECRAWL_ENABLED: "true",
    YANDEX_WEBMASTER_OAUTH_TOKEN: "unit-test-yandex-oauth-token-never-log",
    YANDEX_WEBMASTER_USER_ID: "123456",
    YANDEX_WEBMASTER_HOST_ID: AUDIOLAD_HOST_ID,
  };
}

async function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

await withEnv(productionEnv(), async () => {
  clearAudioladWebmasterHostCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/hosts")) {
      return jsonResponse(200, {
        hosts: [
          {
            host_id: OTHER_HOST_ID,
            ascii_host_url: "https://sergey-zoya.ru/",
            unicode_host_url: "https://sergey-zoya.ru/",
            verified: true,
          },
          {
            host_id: AUDIOLAD_HOST_ID,
            ascii_host_url: "https://audiolad.ru/",
            unicode_host_url: "https://audiolad.ru/",
            verified: true,
          },
        ],
      });
    }
    if (String(url).endsWith("/recrawl/quota")) {
      return jsonResponse(200, { daily_quota: 470, quota_remainder: 12 });
    }
    return jsonResponse(202, { task_id: "audiolad-only" });
  };

  const result = await submitYandexRecrawl(PRACTICE_URL, {
    fetchImpl,
    sleepImpl: async () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 202);
  assert.equal(calls.filter((url) => url.endsWith("/recrawl/queue")).length, 1);
  assert.match(calls.find((url) => url.endsWith("/recrawl/queue")), /https%3Aaudiolad.ru%3A443/);
  assert.equal(calls.some((url) => url.includes("sergey-zoya")), false);
  const queueCall = calls.find((url) => url.endsWith("/recrawl/queue"));
  assert.ok(queueCall);
  assert.doesNotMatch(queueCall, /sergey-zoya/);
});

await withEnv(productionEnv(), async () => {
  clearAudioladWebmasterHostCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return jsonResponse(200, {
      hosts: [
        {
          host_id: OTHER_HOST_ID,
          ascii_host_url: "https://sergey-zoya.ru/",
          unicode_host_url: "https://sergey-zoya.ru/",
          verified: true,
        },
      ],
    });
  };
  const result = await submitYandexRecrawl(PRACTICE_URL, {
    fetchImpl,
    sleepImpl: async () => {},
    env: { ...process.env, YANDEX_WEBMASTER_HOST_ID: OTHER_HOST_ID },
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "host_not_found");
  assert.equal(calls.some((url) => url.includes("recrawl/queue")), false);
  assert.equal(calls.some((url) => url.includes("recrawl/quota")), false);
});

async function expectHostRefusal(body, hostId, errorCode) {
  await withEnv(productionEnv(), async () => {
    clearAudioladWebmasterHostCache();
    const calls = [];
    const result = await submitYandexRecrawl(PRACTICE_URL, {
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonResponse(body.status ?? 200, body.json);
      },
      sleepImpl: async () => {},
      env: { ...process.env, YANDEX_WEBMASTER_HOST_ID: hostId },
    });
    assert.equal(result.errorCode, errorCode);
    assert.equal(calls.some((url) => url.includes("recrawl/queue")), false);
  });
}

await expectHostRefusal({ json: { hosts: [] } }, AUDIOLAD_HOST_ID, "host_empty");
await expectHostRefusal(
  {
    json: {
      hosts: [
        {
          host_id: AUDIOLAD_HOST_ID,
          ascii_host_url: "https://audiolad.ru/",
          unicode_host_url: "https://audiolad.ru/",
          verified: false,
        },
      ],
    },
  },
  AUDIOLAD_HOST_ID,
  "host_unverified",
);
await expectHostRefusal(
  {
    json: {
      hosts: [
        {
          host_id: AUDIOLAD_HOST_ID,
          ascii_host_url: "https://audiolad.ru/",
          unicode_host_url: "https://audiolad.ru/",
          verified: true,
        },
        {
          host_id: "https:audiolad.ru:443-dup",
          ascii_host_url: "https://audiolad.ru/",
          unicode_host_url: "https://audiolad.ru/",
          verified: true,
        },
      ],
    },
  },
  AUDIOLAD_HOST_ID,
  "host_ambiguous",
);
await expectHostRefusal(
  {
    json: {
      hosts: [
        {
          host_id: AUDIOLAD_HOST_ID,
          ascii_host_url: "https://audiolad.ru/",
          unicode_host_url: "https://audiolad.ru/",
          verified: true,
        },
      ],
    },
  },
  OTHER_HOST_ID,
  "host_mismatch",
);
await expectHostRefusal(
  { status: 401, json: { error_code: "INVALID_OAUTH_TOKEN" } },
  AUDIOLAD_HOST_ID,
  "auth_failed",
);

await withEnv(productionEnv(), async () => {
  clearAudioladWebmasterHostCache();
  let called = false;
  const result = await submitYandexRecrawl("https://sergey-zoya.ru/practice/a/b", {
    fetchImpl: async () => {
      called = true;
      return jsonResponse(202, {});
    },
    sleepImpl: async () => {},
    verifiedHostId: AUDIOLAD_HOST_ID,
  });
  assert.equal(result.errorCode, "foreign_origin");
  assert.equal(called, false);
});

await withEnv(productionEnv(), async () => {
  clearAudioladWebmasterHostCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/quota")) {
      throw new Error("quota timeout");
    }
    return jsonResponse(504, { error_code: "GATEWAY" });
  };
  const result = await submitYandexRecrawl(PRACTICE_URL, {
    fetchImpl,
    sleepImpl: async () => {},
    verifiedHostId: AUDIOLAD_HOST_ID,
  });
  assert.equal(calls.filter((url) => url.endsWith("/recrawl/queue")).length, 2);
  assert.equal(result.ok, false);
  assert.equal(result.status, 504);
  assert.match(calls.find((url) => url.endsWith("/recrawl/queue")), /https%3Aaudiolad.ru%3A443/);
});

const publishFiles = {
  "src/app/api/author/products/[id]/publish/route.ts": /schedulePracticePublishedSearchNotifications/,
  "src/app/(platform)/admin/product-moderation/actions.ts": /schedulePracticePublishedSearchNotifications/,
  "src/app/api/author/products/[id]/route.ts": /previousCatalogVisibility/,
  "src/lib/seo/search-recrawl/scheduled-handoff.ts": /engine: "yandex"/,
  "src/app/api/playlists/route.ts": /scheduleYandexRecrawlNotification/,
  "src/app/api/playlists/[id]/route.ts": /playlist_unpublished/,
  "src/app/api/author/profile/route.ts": /scheduleYandexRecrawlNotification/,
  "src/app/api/author/profile/[kind]/route.ts": /scheduleYandexRecrawlNotification/,
  "src/app/api/author/profile/banner-position/route.ts": /scheduleYandexRecrawlNotification/,
  "src/app/api/author/profile/contact-icon/route.ts": /scheduleYandexRecrawlNotification/,
  "src/app/api/author/space/route.ts": /scheduleYandexRecrawlNotification/,
  "src/app/(platform)/admin/authors/slug/actions.ts": /scheduleYandexRecrawlNotification/,
  "src/app/(platform)/admin/page.tsx": /YandexRecrawlAdminAlert/,
  "scripts/run-search-recrawl-worker.mts": /SEARCH_RECRAWL_INTERVAL_MS/,
  "deploy/search-recrawl-worker.ecosystem.config.cjs": /audiolad-search-recrawl-worker/,
};

for (const [file, pattern] of Object.entries(publishFiles)) {
  assert.match(read(file), pattern, file);
}

assert.doesNotMatch(
  read("src/app/api/author/products/[id]/unpublish/route.ts"),
  /scheduleYandexRecrawlNotification/,
);
assert.doesNotMatch(
  read("src/app/api/author/products/[id]/cover/route.ts"),
  /scheduleYandexRecrawlNotification/,
);
assert.doesNotMatch(
  read("src/lib/products/release-due-scheduled-publications.ts"),
  /notifyYandexRecrawlUrl/,
);
assert.match(read("src/lib/seo/indexnow/hooks.ts"), /recordIndexNowFailures/);
assert.match(read("src/lib/seo/indexnow/notify.ts"), /new Date\(\)\.toISOString\(\)/);
assert.match(read("src/lib/seo/yandex-webmaster/notify.ts"), /new Date\(\)\.toISOString\(\)/);
assert.match(read("deploy/scripts/deploy.sh"), /ensure-search-recrawl-worker\.sh/);
assert.match(read("deploy/scripts/ensure-search-recrawl-worker.sh"), /search_recrawl_worker_cutover_restart/);
assert.doesNotMatch(read("deploy/scripts/ensure-search-recrawl-worker.sh"), /pm2 restart audiolad$/m);
assert.match(read("deploy/scripts/lib/release-retention.sh"), /audiolad-search-recrawl-worker/);
assert.match(read("deploy/search-recrawl-worker.ecosystem.config.cjs"), /max_restarts: 1000000/);
assert.doesNotMatch(read("deploy/search-recrawl-worker.ecosystem.config.cjs"), /max_restarts:\s*10\b/);
const workerScript = read("scripts/run-search-recrawl-worker.mts");
const releaseCheck = workerScript.indexOf("await compareSearchRecrawlRelease");
const cycleCall = workerScript.lastIndexOf("runSupabaseSearchRecrawlCycle");
assert.ok(releaseCheck > 0 && releaseCheck < cycleCall);
assert.match(read("docs/RUNBOOK.md"), /audiolad-search-recrawl-worker/);

const releaseRoot = mkdtempSync(path.join(tmpdir(), "audiolad-recrawl-release-"));
const oldRelease = path.join(releaseRoot, "old");
const newRelease = path.join(releaseRoot, "new");
mkdirSync(oldRelease);
mkdirSync(newRelease);
writeFileSync(path.join(oldRelease, ".deploy-commit"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
writeFileSync(path.join(newRelease, ".deploy-commit"), "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n");
const currentLink = path.join(releaseRoot, "current");
symlinkSync(newRelease, currentLink);
assert.equal(
  (
    await compareSearchRecrawlRelease({
      boot: { path: oldRelease, sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      currentLinkPath: currentLink,
    })
  ).state,
  "STALE",
);
assert.equal(
  (
    await compareSearchRecrawlRelease({
      boot: { path: newRelease, sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      currentLinkPath: currentLink,
    })
  ).state,
  "CURRENT",
);
assert.equal(
  (
    await compareSearchRecrawlRelease({
      boot: { path: newRelease, sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      currentLinkPath: path.join(releaseRoot, "missing"),
    })
  ).state,
  "UNKNOWN",
);

const migration = read("supabase/migrations/20270125120000_search_recrawl_queue.sql");
assert.doesNotMatch(migration, /sergey-zoya/);
const insertAt = migration.indexOf("INSERT INTO public.search_recrawl_queue");
const insertStatement = migration.slice(insertAt, migration.indexOf("RETURNING", insertAt));
assert.ok(insertAt > 0);
assert.match(insertStatement, /VALUES \(/);
assert.doesNotMatch(insertStatement, /\bSELECT\b/);
assert.doesNotMatch(migration, /YANDEX_WEBMASTER_OAUTH_TOKEN/);

await deliverIndexNowNotification(
  [PRACTICE_URL],
  INDEXNOW_REASONS.practice_updated,
  {
    syncForTests: true,
    config: {
      enabledFlag: true,
      keyPresent: true,
      keyValid: true,
      indexingEnabled: true,
      originIsProduction: true,
      canSubmit: false,
      host: "audiolad.ru",
      key: null,
      keyLocation: null,
    },
    enqueueImpl: async () => {
      throw new Error("disabled must not enqueue");
    },
  },
);

console.log("search-recrawl-queue-unit: ok");
