#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  YANDEX_RECRAWL_OFFICIAL_SUCCESS_STATUS,
  getYandexWebmasterConfig,
  isYandexRecrawlAcceptedStatus,
} from "../src/lib/seo/yandex-webmaster/config.ts";
import { submitYandexRecrawl } from "../src/lib/seo/yandex-webmaster/client.ts";
import { notifyYandexRecrawlUrl } from "../src/lib/seo/yandex-webmaster/notify.ts";
import {
  planPracticeYandexRecrawl,
} from "../src/lib/seo/yandex-webmaster/planner.ts";
import { PRODUCTION_APP_ORIGIN } from "../src/lib/seo/app-origin.ts";
import { buildPracticeCanonicalUrl } from "../src/lib/products/paths.ts";

const TEST_TOKEN = "unit-test-yandex-oauth-token-never-log";
const TEST_URL = "https://audiolad.ru/practice/sergey/lavandovyy-son";

function withEnv(overrides, fn) {
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
    return fn();
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

async function withEnvAsync(overrides, fn) {
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

function productionGateEnv(extra = {}) {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: PRODUCTION_APP_ORIGIN,
    SEO_INDEXING: undefined,
    YANDEX_WEBMASTER_RECRAWL_ENABLED: "true",
    YANDEX_WEBMASTER_OAUTH_TOKEN: TEST_TOKEN,
    YANDEX_WEBMASTER_USER_ID: "123456",
    YANDEX_WEBMASTER_HOST_ID: "https:audiolad.ru:443",
    ...extra,
  };
}

function configOptions() {
  return {
    indexingEnabled: true,
    appOrigin: PRODUCTION_APP_ORIGIN,
  };
}

assert.equal(YANDEX_RECRAWL_OFFICIAL_SUCCESS_STATUS, 202);
assert.equal(isYandexRecrawlAcceptedStatus(202), true);
assert.equal(isYandexRecrawlAcceptedStatus(200), true);
assert.equal(isYandexRecrawlAcceptedStatus(201), true);
assert.equal(isYandexRecrawlAcceptedStatus(401), false);

withEnv(productionGateEnv({ YANDEX_WEBMASTER_RECRAWL_ENABLED: "false" }), () => {
  assert.equal(getYandexWebmasterConfig(process.env, configOptions()).canSubmit, false);
});

withEnv(productionGateEnv({ YANDEX_WEBMASTER_OAUTH_TOKEN: undefined }), () => {
  assert.equal(getYandexWebmasterConfig(process.env, configOptions()).canSubmit, false);
});

withEnv(productionGateEnv({ YANDEX_WEBMASTER_USER_ID: undefined }), () => {
  assert.equal(getYandexWebmasterConfig(process.env, configOptions()).canSubmit, false);
});

withEnv(productionGateEnv({ YANDEX_WEBMASTER_HOST_ID: undefined }), () => {
  assert.equal(getYandexWebmasterConfig(process.env, configOptions()).canSubmit, false);
});

withEnv(productionGateEnv(), () => {
  assert.equal(
    getYandexWebmasterConfig(process.env, {
      indexingEnabled: true,
      appOrigin: "http://localhost:3000",
    }).canSubmit,
    false,
  );
});

withEnv(productionGateEnv(), () => {
  assert.equal(
    getYandexWebmasterConfig(process.env, {
      indexingEnabled: false,
      appOrigin: PRODUCTION_APP_ORIGIN,
    }).canSubmit,
    false,
  );
});

withEnv(productionGateEnv(), () => {
  const config = getYandexWebmasterConfig(process.env, configOptions());
  assert.equal(config.canSubmit, true);
  assert.equal("token" in config, false);
});

const listedPublished = {
  previousStatus: "draft",
  nextStatus: "published",
  catalogVisibility: "listed",
  isCatalogListed: true,
  authorSlug: "sergey",
  practiceSlug: "lavandovyy-son",
};
assert.deepEqual(planPracticeYandexRecrawl(listedPublished), {
  reason: "practice_published",
  url: buildPracticeCanonicalUrl("sergey", "lavandovyy-son"),
});
assert.equal(
  planPracticeYandexRecrawl({
    ...listedPublished,
    catalogVisibility: "unlisted",
    isCatalogListed: false,
  }),
  null,
);
assert.equal(
  planPracticeYandexRecrawl({
    ...listedPublished,
    catalogVisibility: "selected_users",
    isCatalogListed: false,
  }),
  null,
);
assert.equal(
  planPracticeYandexRecrawl({
    ...listedPublished,
    nextStatus: "draft",
  }),
  null,
);
assert.deepEqual(
  planPracticeYandexRecrawl({
    previousStatus: "published",
    nextStatus: "published",
    catalogVisibility: "listed",
    isCatalogListed: true,
    changedFields: ["seo_title"],
    authorSlug: "sergey",
    practiceSlug: "lavandovyy-son",
  }),
  {
    reason: "practice_seo_updated",
    url: buildPracticeCanonicalUrl("sergey", "lavandovyy-son"),
  },
);
assert.deepEqual(
  planPracticeYandexRecrawl({
    previousStatus: "published",
    nextStatus: "published",
    catalogVisibility: "listed",
    isCatalogListed: true,
    changedFields: ["description"],
    authorSlug: "sergey",
    practiceSlug: "lavandovyy-son",
  }),
  {
    reason: "practice_content_updated",
    url: buildPracticeCanonicalUrl("sergey", "lavandovyy-son"),
  },
);
assert.equal(
  planPracticeYandexRecrawl({
    previousStatus: "published",
    nextStatus: "published",
    catalogVisibility: "listed",
    isCatalogListed: true,
    changedFields: ["price"],
    authorSlug: "sergey",
    practiceSlug: "lavandovyy-son",
  }),
  null,
);
assert.equal(
  planPracticeYandexRecrawl({
    previousStatus: "published",
    nextStatus: "published",
    catalogVisibility: "listed",
    isCatalogListed: true,
    changedFields: ["cover_url"],
    authorSlug: "sergey",
    practiceSlug: "lavandovyy-son",
  }),
  null,
);
assert.equal(
  planPracticeYandexRecrawl({
    previousStatus: "published",
    nextStatus: "unpublished",
    catalogVisibility: "listed",
    isCatalogListed: true,
    authorSlug: "sergey",
    practiceSlug: "lavandovyy-son",
  }),
  null,
);
assert.deepEqual(
  planPracticeYandexRecrawl({
    previousStatus: "unpublished",
    nextStatus: "published",
    catalogVisibility: "listed",
    isCatalogListed: true,
    authorSlug: "sergey",
    practiceSlug: "lavandovyy-son",
  }),
  {
    reason: "practice_republished",
    url: buildPracticeCanonicalUrl("sergey", "lavandovyy-son"),
  },
);

function mockFetch(handlers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const handler = handlers.shift();
    if (!handler) {
      throw new Error("unexpected fetch");
    }
    return handler(url, init);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

await withEnvAsync(productionGateEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(200, { daily_quota: 30, quota_remainder: 12 }),
    () => jsonResponse(202, { task_id: "task-202", quota_remainder: 11 }),
  ]);
  const result = await submitYandexRecrawl(TEST_URL, { fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.ok, true);
  assert.equal(result.status, 202);
  assert.equal(result.taskId, "task-202");
  assert.equal(fetchImpl.calls.length, 2);
  assert.match(fetchImpl.calls[1].url, /recrawl\/queue$/);
  assert.equal(JSON.stringify(result).includes(TEST_TOKEN), false);
});

await withEnvAsync(productionGateEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(200, { daily_quota: 30, quota_remainder: 0 }),
  ]);
  const result = await submitYandexRecrawl(TEST_URL, { fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "quota_exhausted");
  assert.equal(fetchImpl.calls.length, 1);
  assert.doesNotMatch(fetchImpl.calls[0].url, /recrawl\/queue$/);
});

for (const status of [200, 201, 202]) {
  await withEnvAsync(productionGateEnv(), async () => {
    const fetchImpl = mockFetch([
      () => jsonResponse(200, { daily_quota: 10, quota_remainder: 4 }),
      () => jsonResponse(status, { task_id: `task-${status}` }),
    ]);
    const result = await submitYandexRecrawl(TEST_URL, { fetchImpl, sleepImpl: async () => {} });
    assert.equal(result.ok, true, `${status} should be accepted`);
    assert.equal(result.status, status);
  });
}

await withEnvAsync(productionGateEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(200, { daily_quota: 10, quota_remainder: 4 }),
    () => jsonResponse(401, { error_code: "INVALID_USER_ID" }),
  ]);
  const result = await submitYandexRecrawl(TEST_URL, { fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "auth_failed");
  assert.equal(result.retried, false);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(JSON.stringify(result).includes(TEST_TOKEN), false);
});

await withEnvAsync(productionGateEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(200, { daily_quota: 10, quota_remainder: 4 }),
    () => jsonResponse(429, { error_code: "QUOTA_EXCEEDED" }),
    () => jsonResponse(202, { task_id: "after-429" }),
  ]);
  const result = await submitYandexRecrawl(TEST_URL, { fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.ok, true);
  assert.equal(result.retried, true);
  assert.equal(fetchImpl.calls.filter((call) => /recrawl\/queue$/.test(call.url)).length, 2);
});

await withEnvAsync(productionGateEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(200, { daily_quota: 10, quota_remainder: 4 }),
    () => jsonResponse(500, { error_code: "INTERNAL" }),
    () => jsonResponse(202, { task_id: "after-500" }),
  ]);
  const result = await submitYandexRecrawl(TEST_URL, { fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.ok, true);
  assert.equal(result.retried, true);
});

await withEnvAsync(productionGateEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(200, { daily_quota: 10, quota_remainder: 4 }),
    () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
    () => jsonResponse(202, { task_id: "after-timeout" }),
  ]);
  const result = await submitYandexRecrawl(TEST_URL, { fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.ok, true);
  assert.equal(result.retried, true);
});

await withEnvAsync(productionGateEnv(), async () => {
  const logs = [];
  const original = console.info;
  console.info = (...args) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const result = await notifyYandexRecrawlUrl(TEST_URL, "practice_published", {
      fetchImpl: mockFetch([
        () => jsonResponse(200, { daily_quota: 10, quota_remainder: 3 }),
        () => jsonResponse(202, { task_id: "logged" }),
      ]),
      sleepImpl: async () => {},
    });
    assert.equal(result.status, "submitted");
    assert.equal(JSON.stringify(result).includes(TEST_TOKEN), false);
    assert.equal(logs.join("\n").includes(TEST_TOKEN), false);
    assert.match(logs.join("\n"), /\[yandex-webmaster\] submitted/);
  } finally {
    console.info = original;
  }
});

console.log("yandex-webmaster-unit: ok");
