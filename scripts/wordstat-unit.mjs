#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateWordstatOpportunity } from "../src/lib/seo/wordstat/opportunity.ts";
import { getWordstatConfig } from "../src/lib/seo/wordstat/config.ts";
import { fetchWordstatSuggestions } from "../src/lib/seo/wordstat/client.ts";
import { createWordstatMemoryCache } from "../src/lib/seo/wordstat/cache.ts";
import { createWordstatRateLimitStore } from "../src/lib/seo/wordstat/rate-limit.ts";
import { normalizeWordstatSuggestions } from "../src/lib/seo/wordstat/normalize.ts";
import { normalizeWordstatPhrase } from "../src/lib/seo/wordstat/phrase.ts";
import {
  canAddSecondaryQuery,
  getWordstatPrimaryCtaLabel,
  resolveWordstatSeed,
} from "../src/lib/seo/wordstat/ui.ts";
import {
  WORDSTAT_GET_TOP_URL,
  WORDSTAT_NUM_PHRASES,
} from "../src/lib/seo/wordstat/types.ts";
import { WORDSTAT_ERROR_MESSAGES } from "../src/lib/seo/wordstat/errors.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_KEY = "unit-test-wordstat-api-key-never-log";
const TEST_FOLDER = "b1g-unit-test-folder";

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
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

function enabledEnv(extra = {}) {
  return {
    YANDEX_WORDSTAT_ENABLED: "true",
    YANDEX_SEARCH_API_KEY: TEST_KEY,
    YANDEX_SEARCH_FOLDER_ID: TEST_FOLDER,
    YANDEX_WORDSTAT_REGION_ID: "225",
    ...extra,
  };
}

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

function sampleUpstream() {
  return {
    totalCount: "21500",
    results: [
      { phrase: "медитация для сна", count: "880" },
      { phrase: "медитация перед сном", count: "145" },
      { phrase: "bad-item", count: "not-a-number" },
    ],
    associations: [
      { phrase: "музыка для сна", count: "3200" },
      { phrase: "Медитация для сна", count: "12" },
    ],
  };
}

function assertOpportunity(count, level, label) {
  const result = evaluateWordstatOpportunity(count);
  assert.equal(result.level, level, `count ${count} level`);
  assert.equal(result.label, label, `count ${count} label`);
}

assertOpportunity(0, "red_low", "Очень мало запросов");
assertOpportunity(9, "red_low", "Очень мало запросов");
assertOpportunity(10, "yellow_low", "Очень узкий запрос");
assertOpportunity(49, "yellow_low", "Очень узкий запрос");
assertOpportunity(50, "green", "Хороший диапазон для старта");
assertOpportunity(1000, "green", "Хороший диапазон для старта");
assertOpportunity(1001, "yellow_high", "Высокий спрос");
assertOpportunity(5000, "yellow_high", "Высокий спрос");
assertOpportunity(5001, "red_high", "Очень широкий запрос");
assert.equal(
  evaluateWordstatOpportunity(50).description,
  "Есть поисковый спрос, а запрос достаточно конкретный.",
);
assert.equal(
  evaluateWordstatOpportunity(10).description,
  "Конкурировать может быть проще, но поискового спроса немного.",
);
assert.equal(
  evaluateWordstatOpportunity(1001).description,
  "Запрос интересный, но попасть высоко в поиске может быть сложнее.",
);
assert.equal(
  evaluateWordstatOpportunity(0).description,
  "Для основного запроса лучше поискать более востребованный вариант.",
);
assert.equal(
  evaluateWordstatOpportunity(5001).description,
  "Для нового продукта лучше поискать более конкретную формулировку.",
);

assert.equal(normalizeWordstatPhrase("  Медитация   для сна  "), "Медитация для сна");
assert.equal(normalizeWordstatPhrase("а".repeat(400))?.length, 400);
assert.equal(normalizeWordstatPhrase("а".repeat(401)), null);
assert.equal(normalizeWordstatPhrase("   "), null);

assert.equal(getWordstatPrimaryCtaLabel(""), "Помочь подобрать запрос");
assert.equal(getWordstatPrimaryCtaLabel("медитация для сна"), "Подобрать похожие");
assert.equal(
  resolveWordstatSeed({ seoPrimaryQuery: "сон", title: "Лавандовый сон" }),
  "сон",
);
assert.equal(
  resolveWordstatSeed({ seoPrimaryQuery: "", title: "Лавандовый сон" }),
  "Лавандовый сон",
);

const firstSecondary = canAddSecondaryQuery("сон", []);
assert.equal(firstSecondary.ok, true);
const duplicateSecondary = canAddSecondaryQuery("СОН", firstSecondary.next);
assert.equal(duplicateSecondary.ok, false);
assert.equal(duplicateSecondary.reason, "duplicate");
const ten = Array.from({ length: 10 }, (_, index) => `фраза ${index}`);
assert.equal(canAddSecondaryQuery("ещё", ten).ok, false);
assert.equal(canAddSecondaryQuery("ещё", ten).reason, "full");

const normalized = normalizeWordstatSuggestions({
  phrase: "медитация",
  regionId: "225",
  body: sampleUpstream(),
});
assert.equal(normalized.region.id, "225");
assert.equal(normalized.region.label, "Россия");
assert.equal(normalized.periodLabel, "последние 30 дней");
assert.equal(normalized.topicTotalCount, 21500);
assert.deepEqual(
  normalized.suggestions.map((item) => item.phrase),
  ["медитация для сна", "медитация перед сном", "музыка для сна"],
);
assert.deepEqual(
  normalized.suggestions.map((item) => item.source),
  ["result", "result", "association"],
);
assert.equal(normalized.suggestions[0].count, 880);
assert.equal(normalized.suggestions[0].opportunity.level, "green");
assert.equal(normalized.suggestions[2].opportunity.level, "yellow_high");

await withEnvAsync(enabledEnv({ YANDEX_WORDSTAT_ENABLED: "false" }), async () => {
  assert.equal(getWordstatConfig(process.env).canCall, false);
  assert.equal(getWordstatConfig(process.env).enabledFlag, false);
});

await withEnvAsync(enabledEnv({ YANDEX_WORDSTAT_ENABLED: "false" }), async () => {
  const fetchImpl = mockFetch([]);
  const result = await fetchWordstatSuggestions("медитация", {
    fetchImpl,
    cache: createWordstatMemoryCache(),
    rateLimit: createWordstatRateLimitStore(),
    userId: "user-1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "WORDSTAT_DISABLED");
  assert.equal(result.error.message, WORDSTAT_ERROR_MESSAGES.WORDSTAT_DISABLED);
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(JSON.stringify(result).includes(TEST_KEY), false);
});

await withEnvAsync(
  enabledEnv({ YANDEX_SEARCH_API_KEY: undefined }),
  async () => {
    const result = await fetchWordstatSuggestions("медитация", {
      fetchImpl: mockFetch([]),
      cache: createWordstatMemoryCache(),
      rateLimit: createWordstatRateLimitStore(),
      userId: "user-1",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "NOT_CONFIGURED");
    assert.equal(result.error.message, WORDSTAT_ERROR_MESSAGES.NOT_CONFIGURED);
  },
);

await withEnvAsync(
  enabledEnv({ YANDEX_SEARCH_FOLDER_ID: undefined }),
  async () => {
    const result = await fetchWordstatSuggestions("медитация", {
      fetchImpl: mockFetch([]),
      cache: createWordstatMemoryCache(),
      rateLimit: createWordstatRateLimitStore(),
      userId: "user-1",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "NOT_CONFIGURED");
  },
);

await withEnvAsync(enabledEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(200, sampleUpstream()),
  ]);
  const result = await fetchWordstatSuggestions("  Медитация   для сна  ", {
    fetchImpl,
    cache: createWordstatMemoryCache(),
    rateLimit: createWordstatRateLimitStore(),
    userId: "user-1",
    sleepImpl: async () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, WORDSTAT_GET_TOP_URL);
  assert.equal(
    fetchImpl.calls[0].init.headers.Authorization,
    `Api-Key ${TEST_KEY}`,
  );
  assert.equal(fetchImpl.calls[0].init.headers["Content-Type"], "application/json");
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(sent.phrase, "Медитация для сна");
  assert.equal(sent.folderId, TEST_FOLDER);
  assert.equal(sent.numPhrases, WORDSTAT_NUM_PHRASES);
  assert.deepEqual(sent.regions, ["225"]);
  assert.deepEqual(sent.devices, ["DEVICE_ALL"]);
  assert.equal(result.data.suggestions.length, 3);
  assert.equal(result.data.suggestions[0].source, "result");
  assert.equal(result.data.suggestions[2].source, "association");
  assert.equal(JSON.stringify(result).includes(TEST_KEY), false);
  assert.equal(JSON.stringify(result).includes(TEST_FOLDER), false);
});

await withEnvAsync(enabledEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(200, sampleUpstream()),
    () => {
      throw new Error("cache should prevent a second live call");
    },
  ]);
  const cache = createWordstatMemoryCache();
  const rateLimit = createWordstatRateLimitStore();
  const first = await fetchWordstatSuggestions("медитация для сна", {
    fetchImpl,
    cache,
    rateLimit,
    userId: "user-cache",
    sleepImpl: async () => {},
  });
  const second = await fetchWordstatSuggestions("медитация для сна", {
    fetchImpl,
    cache,
    rateLimit,
    userId: "user-cache",
    sleepImpl: async () => {},
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
});

await withEnvAsync(enabledEnv(), async () => {
  const fetchImpl = mockFetch([]);
  const result = await fetchWordstatSuggestions("", {
    fetchImpl,
    cache: createWordstatMemoryCache(),
    rateLimit: createWordstatRateLimitStore(),
    userId: "user-1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_PHRASE");
  assert.equal(fetchImpl.calls.length, 0);
});

await withEnvAsync(enabledEnv(), async () => {
  const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
  const fetchImpl = mockFetch([
    () => Promise.reject(abortError),
    () => Promise.reject(abortError),
  ]);
  const result = await fetchWordstatSuggestions("медитация", {
    fetchImpl,
    cache: createWordstatMemoryCache(),
    rateLimit: createWordstatRateLimitStore(),
    userId: "user-timeout",
    sleepImpl: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "TIMEOUT");
  assert.equal(result.error.message, WORDSTAT_ERROR_MESSAGES.TIMEOUT);
  assert.equal(fetchImpl.calls.length, 2);
});

await withEnvAsync(enabledEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(429, { message: "quota raw payload" }),
    () => jsonResponse(200, sampleUpstream()),
  ]);
  const result = await fetchWordstatSuggestions("медитация", {
    fetchImpl,
    cache: createWordstatMemoryCache(),
    rateLimit: createWordstatRateLimitStore(),
    userId: "user-429",
    sleepImpl: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "RATE_LIMITED");
  assert.equal(result.error.message, WORDSTAT_ERROR_MESSAGES.RATE_LIMITED);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(JSON.stringify(result).includes("quota raw payload"), false);
  assert.equal(JSON.stringify(result).includes(TEST_KEY), false);
});

await withEnvAsync(enabledEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(400, { message: "bad request raw" }),
    () => jsonResponse(200, sampleUpstream()),
  ]);
  const result = await fetchWordstatSuggestions("медитация", {
    fetchImpl,
    cache: createWordstatMemoryCache(),
    rateLimit: createWordstatRateLimitStore(),
    userId: "user-400",
    sleepImpl: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UPSTREAM_ERROR");
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(JSON.stringify(result).includes("bad request raw"), false);
});

await withEnvAsync(enabledEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(503, { message: "upstream 5xx" }),
    () => jsonResponse(200, sampleUpstream()),
  ]);
  const result = await fetchWordstatSuggestions("медитация", {
    fetchImpl,
    cache: createWordstatMemoryCache(),
    rateLimit: createWordstatRateLimitStore(),
    userId: "user-5xx",
    sleepImpl: async () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 2);
});

await withEnvAsync(enabledEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(503, { message: "still failing" }),
    () => jsonResponse(503, { message: "still failing" }),
  ]);
  const result = await fetchWordstatSuggestions("медитация", {
    fetchImpl,
    cache: createWordstatMemoryCache(),
    rateLimit: createWordstatRateLimitStore(),
    userId: "user-5xx-fail",
    sleepImpl: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UPSTREAM_ERROR");
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(JSON.stringify(result).includes("still failing"), false);
});

await withEnvAsync(enabledEnv(), async () => {
  const fetchImpl = mockFetch([
    () => jsonResponse(200, { not: "wordstat" }),
  ]);
  const result = await fetchWordstatSuggestions("медитация", {
    fetchImpl,
    cache: createWordstatMemoryCache(),
    rateLimit: createWordstatRateLimitStore(),
    userId: "user-malformed",
    sleepImpl: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_RESULTS");
  assert.equal(JSON.stringify(result).includes(TEST_KEY), false);
});

await withEnvAsync(enabledEnv(), async () => {
  const rateLimit = createWordstatRateLimitStore();
  const fetchImpl = mockFetch(
    Array.from({ length: 9 }, () => () =>
      jsonResponse(200, {
        totalCount: "10",
        results: [{ phrase: `уникальная ${Math.random()}`, count: "80" }],
        associations: [],
      }),
    ),
  );
  const results = [];
  for (let index = 0; index < 9; index += 1) {
    results.push(
      await fetchWordstatSuggestions(`фраза ${index}`, {
        fetchImpl,
        cache: createWordstatMemoryCache(),
        rateLimit,
        userId: "user-limit",
        sleepImpl: async () => {},
      }),
    );
  }
  assert.equal(results.filter((item) => item.ok).length, 8);
  assert.equal(results.at(-1).ok, false);
  assert.equal(results.at(-1).error.code, "RATE_LIMITED");
  assert.equal(results.at(-1).error.message, WORDSTAT_ERROR_MESSAGES.RATE_LIMITED);
  assert.equal(fetchImpl.calls.length, 8);
});

const route = read("src/app/api/author/seo/wordstat/suggestions/route.ts");
assert.match(route, /requireAuthenticatedUser/);
assert.match(route, /listAuthorWorkspacesForUser/);
assert.match(route, /admin_panel\.access/);
assert.match(route, /readClientPhrase/);
assert.doesNotMatch(route, /folderId.*body|body\.folderId|body\.regions|body\.devices/);
assert.doesNotMatch(route, /NEXT_PUBLIC_YANDEX/);
assert.doesNotMatch(route, /YANDEX_WEBMASTER_/);
assert.doesNotMatch(route, /wordstat\.yandex\.ru/);

const client = read("src/lib/seo/wordstat/client.ts");
assert.match(client, /WORDSTAT_GET_TOP_URL/);
assert.match(client, /Api-Key/);
assert.match(client, /numPhrases/);
assert.match(client, /sleepImpl\(400\)/);
assert.match(client, /import "server-only"/);
assert.doesNotMatch(client, /wordstat\.yandex\.ru/);
assert.doesNotMatch(client, /YANDEX_WEBMASTER_/);

const types = read("src/lib/seo/wordstat/types.ts");
assert.match(types, /searchapi\.api\.cloud\.yandex\.net/);
assert.match(types, /\/v2\/wordstat\/topRequests/);
assert.match(types, /DEVICE_ALL/);
assert.match(types, /WORDSTAT_NUM_PHRASES = 20/);

const config = read("src/lib/seo/wordstat/config.ts");
assert.match(config, /YANDEX_WORDSTAT_ENABLED/);
assert.match(config, /YANDEX_SEARCH_API_KEY/);
assert.match(config, /YANDEX_SEARCH_FOLDER_ID/);
assert.match(config, /YANDEX_WORDSTAT_REGION_ID/);
assert.doesNotMatch(config, /NEXT_PUBLIC_/);

console.log("wordstat-unit: ok");
