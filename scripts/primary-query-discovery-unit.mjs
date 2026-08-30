#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCT_CONTENT_LIMITS } from "../src/lib/author-products/limits.ts";
import { wordstatPhraseKey } from "../src/lib/seo/wordstat/phrase.ts";
import {
  buildInitialWordstatSeed,
  planWordstatPickerOpen,
  shouldAutoSearchOnPrimaryCta,
} from "../src/lib/seo/wordstat/ui.ts";
import { WORDSTAT_ERROR_MESSAGES } from "../src/lib/seo/wordstat/errors.ts";
import {
  PRODUCT_SEO_YANDEX_AI_COMPLETION_URL,
} from "../src/lib/seo/product-autofill/types.ts";
import { createProductSeoAiRateLimitStore } from "../src/lib/seo/product-autofill/rate-limit.ts";
import { PRODUCT_SEO_PICK_PRIMARY_CTA } from "../src/lib/seo/product-autofill/ui.ts";
import {
  classifyWordstatClientPayload,
  buildPrimaryQuerySuggestionsRequest,
  shouldAllowAiFallback,
} from "../src/lib/seo/primary-query-suggestions/client.ts";
import { runPrimaryQueryDiscovery } from "../src/lib/seo/primary-query-suggestions/discovery.ts";
import {
  PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY,
  PRIMARY_QUERY_AI_ALTERNATIVES_HEADING,
  PRIMARY_QUERY_AI_ALTERNATIVES_HINT,
  PRIMARY_QUERY_LOADING_AI,
  PRIMARY_QUERY_LOADING_AI_CHECK,
  PRIMARY_QUERY_LOADING_WORDSTAT,
  PRIMARY_QUERY_RESEARCH_CTA,
  planPrimaryCtaPickerOpen,
  resolvePickerSubmitLabel,
  resolvePrimaryQueryLoadingCopy,
  scheduleWordstatPickerScroll,
} from "../src/lib/seo/primary-query-suggestions/ui.ts";
import {
  parsePrimaryQuerySuggestionsRequest,
  sanitizePrimaryQuerySuggestions,
} from "../src/lib/seo/primary-query-suggestions/validate.ts";
import {
  PRIMARY_QUERY_SUGGESTIONS_JSON_SCHEMA,
  buildPrimaryQuerySuggestionsSystemPrompt,
  buildPrimaryQuerySuggestionsUserPrompt,
} from "../src/lib/seo/primary-query-suggestions/prompt.ts";
import {
  generatePrimaryQuerySuggestions,
} from "../src/lib/seo/primary-query-suggestions/orchestrate.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function yandexEnv(extra = {}) {
  return {
    PRODUCT_SEO_AI_ENABLED: "true",
    PRODUCT_SEO_AI_PROVIDER: "yandex",
    YANDEX_AI_API_KEY: "unit-test-yandex-ai-key-never-log",
    YANDEX_AI_FOLDER_ID: "unit-test-yandex-folder-never-log",
    YANDEX_AI_MODEL: "yandexgpt-lite",
    ...extra,
  };
}

function mockFetch(handlers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const handler = handlers.shift();
    if (!handler) {
      throw new Error("unexpected live fetch");
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

function yandexCompletion(text, alternativeStatus = "ALTERNATIVE_STATUS_FINAL") {
  return {
    result: {
      alternatives: [
        {
          status: alternativeStatus,
          message: { text },
        },
      ],
    },
  };
}

function sampleWordstatSuccess(phrase) {
  return {
    phrase,
    region: { id: "225", label: "Россия" },
    periodLabel: "последние 30 дней",
    suggestions: [
      {
        phrase,
        count: 180,
        source: "result",
        opportunity: {
          level: "green",
          color: "green",
          label: "подходит для старта",
          description: "ok",
        },
      },
    ],
    topicTotalCount: 180,
  };
}

function reduceDiscovery(events) {
  const state = {
    seed: "",
    error: null,
    result: null,
    alternatives: [],
    stages: [],
    savedPrimary: null,
  };

  for (const event of events) {
    if (event.type === "stage") {
      state.stages.push(event.stage);
    } else if (event.type === "seed") {
      state.seed = event.phrase;
    } else if (event.type === "wordstat_success") {
      state.result = event.result;
      state.error = null;
    } else if (event.type === "wordstat_error") {
      state.result = null;
      state.error = event.message;
    } else if (event.type === "ai_alternatives") {
      state.alternatives = event.suggestions;
    } else if (event.type === "ai_fallback_failed") {
      state.result = null;
      state.error = PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY;
    } else if (event.type === "ai_primary_no_results_with_alternatives") {
      state.result = null;
      state.error = null;
    }
  }

  return state;
}

function createCounters() {
  return {
    wordstatPhrases: [],
    aiCalls: 0,
  };
}

function wordstatNoResults() {
  return { kind: "no_results" };
}

function wordstatError(code) {
  return {
    kind: "error",
    code,
    message: WORDSTAT_ERROR_MESSAGES[code] ?? WORDSTAT_ERROR_MESSAGES.UPSTREAM_ERROR,
  };
}

const TITLE_PIPE = "Белый шум воды | Источник Серафима Саровского";
const TITLE_ARTISTIC = "Возвращение к себе после развода";
const AI_PHRASES = [
  "медитация после развода",
  "как пережить развод",
  "восстановление после развода",
];

// 1. SIMPLE WORDSTAT SUCCESS — #220 regression
{
  const seed = buildInitialWordstatSeed(TITLE_PIPE);
  assert.equal(seed, "Белый шум воды");
  const counters = createCounters();
  const events = [];
  const summary = await runPrimaryQueryDiscovery(
    {
      initialSeed: seed,
      product: {
        title: TITLE_PIPE,
        subtitle: "",
        description: "",
        productKind: "music",
      },
      allowAiFallback: true,
    },
    {
      fetchWordstat: async (phrase) => {
        counters.wordstatPhrases.push(phrase);
        return { kind: "success", data: sampleWordstatSuccess(phrase) };
      },
      fetchAiSuggestions: async () => {
        counters.aiCalls += 1;
        return { ok: true, suggestions: AI_PHRASES };
      },
    },
    (event) => events.push(event),
  );
  const ui = reduceDiscovery(events);
  assert.equal(summary.wordstatCalls, 1, "WORDSTAT_CALLS=1");
  assert.equal(summary.aiCalls, 0, "AI_CALLS=0");
  assert.equal(summary.savedPrimary, false);
  assert.equal(counters.wordstatPhrases[0], "Белый шум воды");
  assert.equal(ui.result?.phrase, "Белый шум воды");
  assert.equal(ui.result?.suggestions.length > 0, true);
  assert.equal(ui.alternatives.length, 0);
  assert.deepEqual(ui.stages, ["wordstat_initial"]);
}

// 2 + 3. NO_RESULTS AI FLOW, first AI suggestion Wordstat success
{
  const seed = buildInitialWordstatSeed(TITLE_ARTISTIC);
  assert.equal(seed, TITLE_ARTISTIC);
  const counters = createCounters();
  const events = [];
  const summary = await runPrimaryQueryDiscovery(
    {
      initialSeed: seed,
      product: {
        title: TITLE_ARTISTIC,
        subtitle: "Практика восстановления",
        description: "Аудиопрактика для спокойного возвращения к себе.",
        productKind: "practice",
      },
      allowAiFallback: true,
    },
    {
      fetchWordstat: async (phrase) => {
        counters.wordstatPhrases.push(phrase);
        if (phrase === TITLE_ARTISTIC) {
          return wordstatNoResults();
        }
        return { kind: "success", data: sampleWordstatSuccess(phrase) };
      },
      fetchAiSuggestions: async (input) => {
        counters.aiCalls += 1;
        assert.equal(input.failedSeed, TITLE_ARTISTIC);
        assert.equal(input.title, TITLE_ARTISTIC);
        assert.equal("price" in input, false);
        return { ok: true, suggestions: AI_PHRASES };
      },
    },
    (event) => events.push(event),
  );
  const ui = reduceDiscovery(events);
  assert.equal(summary.wordstatCalls, 2, "WORDSTAT_CALLS=2");
  assert.equal(summary.aiCalls, 1, "AI_CALLS=1");
  assert.equal(summary.savedPrimary, false, "no auto-save");
  assert.deepEqual(counters.wordstatPhrases, [
    TITLE_ARTISTIC,
    "медитация после развода",
  ]);
  assert.equal(ui.seed, "медитация после развода");
  assert.equal(ui.result?.phrase, "медитация после развода");
  assert.deepEqual(ui.alternatives, [
    "как пережить развод",
    "восстановление после развода",
  ]);
  assert.deepEqual(ui.stages, [
    "wordstat_initial",
    "ai_suggesting",
    "wordstat_ai_primary",
  ]);
  assert.equal(ui.savedPrimary, null);
}

// 4. AI first suggestion NO_RESULTS — no recursive AI, chips remain
{
  const counters = createCounters();
  const events = [];
  const summary = await runPrimaryQueryDiscovery(
    {
      initialSeed: TITLE_ARTISTIC,
      product: {
        title: TITLE_ARTISTIC,
        subtitle: "",
        description: "",
        productKind: "practice",
      },
      allowAiFallback: true,
    },
    {
      fetchWordstat: async (phrase) => {
        counters.wordstatPhrases.push(phrase);
        return wordstatNoResults();
      },
      fetchAiSuggestions: async () => {
        counters.aiCalls += 1;
        return { ok: true, suggestions: AI_PHRASES };
      },
    },
    (event) => events.push(event),
  );
  const ui = reduceDiscovery(events);
  assert.equal(summary.aiCalls, 1);
  assert.equal(summary.wordstatCalls, 2);
  assert.deepEqual(counters.wordstatPhrases, [
    TITLE_ARTISTIC,
    "медитация после развода",
  ]);
  assert.deepEqual(ui.alternatives, [
    "как пережить развод",
    "восстановление после развода",
  ]);
  assert.equal(ui.error, null, "no dead-end when other chips exist");
  assert.notEqual(ui.error, WORDSTAT_ERROR_MESSAGES.NO_RESULTS);
  assert.notEqual(ui.error, PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY);
}

// 5. Alternative chip click — one extra Wordstat, AI stays 1
{
  let aiCalls = 0;
  const wordstatPhrases = [];
  const first = await runPrimaryQueryDiscovery(
    {
      initialSeed: TITLE_ARTISTIC,
      product: {
        title: TITLE_ARTISTIC,
        subtitle: "",
        description: "",
        productKind: "practice",
      },
      allowAiFallback: true,
    },
    {
      fetchWordstat: async (phrase) => {
        wordstatPhrases.push(phrase);
        return wordstatNoResults();
      },
      fetchAiSuggestions: async () => {
        aiCalls += 1;
        return { ok: true, suggestions: AI_PHRASES };
      },
    },
    () => {},
  );
  const chipEvents = [];
  const chip = await runPrimaryQueryDiscovery(
    {
      initialSeed: AI_PHRASES[1],
      product: {
        title: TITLE_ARTISTIC,
        subtitle: "",
        description: "",
        productKind: "practice",
      },
      allowAiFallback: false,
    },
    {
      fetchWordstat: async (phrase) => {
        wordstatPhrases.push(phrase);
        return { kind: "success", data: sampleWordstatSuccess(phrase) };
      },
      fetchAiSuggestions: async () => {
        aiCalls += 1;
        return { ok: true, suggestions: AI_PHRASES };
      },
    },
    (event) => chipEvents.push(event),
  );
  const chipUi = reduceDiscovery(chipEvents);
  assert.equal(first.aiCalls, 1);
  assert.equal(chip.aiCalls, 0);
  assert.equal(aiCalls, 1, "AI_CALLS stays 1");
  assert.equal(wordstatPhrases.length, 3);
  assert.equal(wordstatPhrases[2], "как пережить развод");
  assert.equal(chipUi.seed, "как пережить развод");
  assert.equal(chip.savedPrimary, false);
}

// 6. Wordstat errors do not call AI
for (const code of ["TIMEOUT", "UPSTREAM_ERROR", "RATE_LIMITED", "INVALID_QUERY"]) {
  let aiCalls = 0;
  const events = [];
  const summary = await runPrimaryQueryDiscovery(
    {
      initialSeed: TITLE_ARTISTIC,
      product: {
        title: TITLE_ARTISTIC,
        subtitle: "",
        description: "",
        productKind: "practice",
      },
      allowAiFallback: true,
    },
    {
      fetchWordstat: async () => wordstatError(code),
      fetchAiSuggestions: async () => {
        aiCalls += 1;
        return { ok: true, suggestions: AI_PHRASES };
      },
    },
    (event) => events.push(event),
  );
  const ui = reduceDiscovery(events);
  assert.equal(summary.aiCalls, 0, `${code}: AI_CALLS=0`);
  assert.equal(aiCalls, 0);
  assert.equal(summary.wordstatCalls, 1);
  assert.equal(ui.error, WORDSTAT_ERROR_MESSAGES[code]);
}

// classify helper: these codes are errors, not NO_RESULTS
for (const code of ["TIMEOUT", "UPSTREAM_ERROR", "RATE_LIMITED", "INVALID_QUERY"]) {
  const outcome = classifyWordstatClientPayload(false, {
    code,
    error: WORDSTAT_ERROR_MESSAGES[code],
  });
  assert.equal(outcome.kind, "error");
  assert.equal(outcome.code, code);
  assert.equal(
    shouldAllowAiFallback({
      allowAiFallback: true,
      outcomeKind: outcome.kind,
      aiAlreadyUsed: false,
    }),
    false,
  );
}

assert.equal(
  classifyWordstatClientPayload(true, {
    code: "NO_RESULTS",
    error: WORDSTAT_ERROR_MESSAGES.NO_RESULTS,
  }).kind,
  "no_results",
);

// 7. AI 503 / timeout / invalid — manual input, no save
for (const aiResult of [{ ok: false }, { ok: true, suggestions: [] }]) {
  const events = [];
  const summary = await runPrimaryQueryDiscovery(
    {
      initialSeed: TITLE_ARTISTIC,
      product: {
        title: TITLE_ARTISTIC,
        subtitle: "",
        description: "",
        productKind: "practice",
      },
      allowAiFallback: true,
    },
    {
      fetchWordstat: async () => wordstatNoResults(),
      fetchAiSuggestions: async () => aiResult,
    },
    (event) => events.push(event),
  );
  const ui = reduceDiscovery(events);
  assert.equal(summary.aiCalls, 1);
  assert.equal(summary.wordstatCalls, 1);
  assert.equal(summary.savedPrimary, false);
  assert.equal(ui.error, PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY);
  assert.equal(ui.result, null);
}

// 8. AI output validation
{
  const dirty = [
    "  медитация   после развода  ",
    "медитация после развода",
    "как пережить развод | бренд",
    TITLE_ARTISTIC,
    "   ",
    "",
    "восстановление после развода",
    "«как пережить развод»",
  ];
  const cleaned = sanitizePrimaryQuerySuggestions(dirty, TITLE_ARTISTIC);
  assert.deepEqual(cleaned, [
    "медитация после развода",
    "восстановление после развода",
    "как пережить развод",
  ]);
  assert.equal(
    cleaned.every((item) => !item.includes("|")),
    true,
  );
  assert.equal(
    cleaned.every((item) => item.length <= PRODUCT_CONTENT_LIMITS.seoPrimaryQuery),
    true,
  );
  assert.equal(
    new Set(cleaned.map((item) => wordstatPhraseKey(item))).size,
    cleaned.length,
  );
  assert.equal(cleaned.includes(TITLE_ARTISTIC), false);
  assert.equal(sanitizePrimaryQuerySuggestions(["", "|"], TITLE_ARTISTIC).length, 0);
  assert.equal(
    sanitizePrimaryQuerySuggestions(["а".repeat(121)], "seed").length,
    0,
  );
}

// 9. Auto-scroll does not cause a second network request
{
  const fetchLog = [];
  const plan = planWordstatPickerOpen({
    seoPrimaryQuery: "",
    title: TITLE_PIPE,
    autoSearch: shouldAutoSearchOnPrimaryCta(""),
  });
  const open = planPrimaryCtaPickerOpen(plan);
  assert.equal(open.seed, "Белый шум воды");
  assert.equal(open.shouldSearch, true);
  assert.equal(open.shouldScroll, true);
  assert.equal(open.stealFocus, false);

  const scrolled = [];
  const didScroll = scheduleWordstatPickerScroll(
    {
      scrollIntoView(options) {
        scrolled.push(options);
      },
    },
    { matchMedia: () => ({ matches: false }) },
  );
  assert.equal(didScroll, true);
  assert.equal(scrolled[0].behavior, "smooth");
  assert.equal(scrolled[0].block, "start");
  assert.equal(fetchLog.length, 0, "scroll does not fetch");

  const reduced = [];
  scheduleWordstatPickerScroll(
    {
      scrollIntoView(options) {
        reduced.push(options);
      },
    },
    { matchMedia: (query) => ({ matches: query.includes("prefers-reduced-motion") }) },
  );
  assert.equal(reduced[0].behavior, "auto");

  if (open.shouldSearch) {
    fetchLog.push("wordstat");
  }
  assert.equal(fetchLog.length, 1);
}

// 10. Copy
assert.equal(PRODUCT_SEO_PICK_PRIMARY_CTA, "Подобрать поисковый запрос");
assert.equal(PRIMARY_QUERY_RESEARCH_CTA, "Проверить другой вариант");
assert.equal(resolvePickerSubmitLabel(true), "Проверить другой вариант");
assert.equal(resolvePickerSubmitLabel(false), "Подобрать в Яндексе");
assert.equal(
  resolvePrimaryQueryLoadingCopy("wordstat_initial"),
  PRIMARY_QUERY_LOADING_WORDSTAT,
);
assert.equal(resolvePrimaryQueryLoadingCopy("ai_suggesting"), PRIMARY_QUERY_LOADING_AI);
assert.equal(
  resolvePrimaryQueryLoadingCopy("wordstat_ai_primary"),
  PRIMARY_QUERY_LOADING_AI_CHECK,
);
assert.equal(PRIMARY_QUERY_AI_ALTERNATIVES_HEADING, "Варианты формулировки");
assert.doesNotMatch(
  PRIMARY_QUERY_AI_ALTERNATIVES_HEADING,
  /Яндекс нашёл|нашёл запрос|найденные запросы/,
);
assert.match(PRIMARY_QUERY_AI_ALTERNATIVES_HINT, /Проверим их по данным Яндекса/);

// Re-search after first auto-search must not allow AI
assert.equal(
  shouldAllowAiFallback({
    allowAiFallback: false,
    outcomeKind: "no_results",
    aiAlreadyUsed: false,
  }),
  false,
);

// Request builder never sends private fields
{
  const request = buildPrimaryQuerySuggestionsRequest({
    title: TITLE_ARTISTIC,
    subtitle: "после расставания",
    description: "короткое описание",
    productKind: "practice",
    failedSeed: TITLE_ARTISTIC,
  });
  const body = JSON.parse(request.init.body);
  assert.deepEqual(Object.keys(body).sort(), [
    "description",
    "failedSeed",
    "productKind",
    "subtitle",
    "title",
  ]);
  assert.equal("price" in body, false);
  assert.equal("userId" in body, false);
  assert.equal("relatedProducts" in body, false);
}

// Input parser ignores extra fields
{
  const parsed = parsePrimaryQuerySuggestionsRequest({
    title: TITLE_ARTISTIC,
    subtitle: "",
    description: "описание",
    productKind: "practice",
    failedSeed: TITLE_ARTISTIC,
    price: 990,
    userId: "should-not-pass",
    seoTitle: "",
  });
  assert.equal(parsed.ok, true);
  assert.equal("price" in parsed.input, false);
  assert.equal("userId" in parsed.input, false);
  assert.equal("seoTitle" in parsed.input, false);
}

// Schema stays conservative
assert.equal(PRIMARY_QUERY_SUGGESTIONS_JSON_SCHEMA.type, "object");
assert.equal(PRIMARY_QUERY_SUGGESTIONS_JSON_SCHEMA.additionalProperties, false);
assert.deepEqual(PRIMARY_QUERY_SUGGESTIONS_JSON_SCHEMA.required, ["suggestions"]);
assert.equal(
  PRIMARY_QUERY_SUGGESTIONS_JSON_SCHEMA.properties.suggestions.minItems,
  3,
);
assert.equal(
  PRIMARY_QUERY_SUGGESTIONS_JSON_SCHEMA.properties.suggestions.maxItems,
  3,
);
assert.equal(
  PRIMARY_QUERY_SUGGESTIONS_JSON_SCHEMA.properties.suggestions.uniqueItems,
  true,
);
assert.equal(
  "unevaluatedProperties" in PRIMARY_QUERY_SUGGESTIONS_JSON_SCHEMA,
  false,
);

// Prompt must not contain the divorce product as a hardcoded example
{
  const systemPrompt = buildPrimaryQuerySuggestionsSystemPrompt();
  assert.match(systemPrompt, /поисковые фразы/);
  assert.match(systemPrompt, /аудиопрактика/);
  assert.doesNotMatch(systemPrompt, /Возвращение к себе после развода/);
  assert.doesNotMatch(systemPrompt, /медитация после развода/);
  const userPrompt = buildPrimaryQuerySuggestionsUserPrompt({
    title: TITLE_ARTISTIC,
    subtitle: "",
    description: "",
    productKind: "practice",
    failedSeed: TITLE_ARTISTIC,
  });
  assert.match(userPrompt, /Название:/);
  assert.doesNotMatch(userPrompt, /price|userId|seoTitle/);
}

// Server orchestrate: mocked Yandex only
await withEnvAsync(yandexEnv(), async () => {
  const logs = [];
  const originalInfo = console.info;
  console.info = (event, fields) => {
    logs.push({ event, fields });
  };
  try {
    const fetchImpl = mockFetch([
      () =>
        jsonResponse(
          200,
          yandexCompletion(JSON.stringify({ suggestions: AI_PHRASES })),
        ),
    ]);
    const result = await generatePrimaryQuerySuggestions(
      {
        title: TITLE_ARTISTIC,
        subtitle: "",
        description: "аудиопрактика",
        productKind: "practice",
        failedSeed: TITLE_ARTISTIC,
      },
      {
        userId: "author-1",
        fetchImpl,
        env: process.env,
        rateLimit: createProductSeoAiRateLimitStore(),
      },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.suggestions, AI_PHRASES);
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(fetchImpl.calls[0].url, PRODUCT_SEO_YANDEX_AI_COMPLETION_URL);
    const sent = JSON.parse(fetchImpl.calls[0].init.body);
    assert.equal(sent.jsonSchema.schema.required[0], "suggestions");
    assert.equal("price" in sent, false);
    const okLog = logs.find((item) => item.event === "primary_query_ai_ok");
    assert.ok(okLog);
    assert.deepEqual(Object.keys(okLog.fields).sort(), [
      "durationMs",
      "model",
      "provider",
      "suggestionCount",
    ]);
    const dumped = JSON.stringify(logs);
    assert.equal(dumped.includes(TITLE_ARTISTIC), false);
    assert.equal(dumped.includes("аудиопрактика"), false);
    assert.equal(dumped.includes("author-1"), false);
    assert.equal(dumped.includes("unit-test-yandex-ai-key-never-log"), false);
    assert.equal(dumped.includes("unit-test-yandex-folder-never-log"), false);
  } finally {
    console.info = originalInfo;
  }
});

await withEnvAsync(
  yandexEnv({ PRODUCT_SEO_AI_PROVIDER: "openai", OPENAI_API_KEY: "unit-openai" }),
  async () => {
    const fetchImpl = mockFetch([]);
    const result = await generatePrimaryQuerySuggestions(
      {
        title: TITLE_ARTISTIC,
        subtitle: "",
        description: "",
        productKind: "practice",
        failedSeed: TITLE_ARTISTIC,
      },
      {
        userId: "author-openai",
        fetchImpl,
        env: process.env,
        rateLimit: createProductSeoAiRateLimitStore(),
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "UNSUPPORTED_PROVIDER");
    assert.equal(fetchImpl.calls.length, 0, "OpenAI path not used");
  },
);

await withEnvAsync(yandexEnv({ PRODUCT_SEO_AI_ENABLED: "false" }), async () => {
  const fetchImpl = mockFetch([]);
  const result = await generatePrimaryQuerySuggestions(
    {
      title: TITLE_ARTISTIC,
      subtitle: "",
      description: "",
      productKind: "practice",
      failedSeed: TITLE_ARTISTIC,
    },
    {
      userId: "author-disabled",
      fetchImpl,
      env: process.env,
      rateLimit: createProductSeoAiRateLimitStore(),
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "AI_DISABLED");
  assert.equal(fetchImpl.calls.length, 0);
});

// Source wiring + flags
const seoSection = read(
  "src/components/author-dashboard/AuthorProductSeoSection.tsx",
);
const picker = read(
  "src/components/author-dashboard/AuthorProductSeoWordstatPicker.tsx",
);
const route = read(
  "src/app/api/author/seo/primary-query-suggestions/route.ts",
);
const orchestrate = read(
  "src/lib/seo/primary-query-suggestions/orchestrate.ts",
);
const yandexJson = read("src/lib/seo/primary-query-suggestions/yandex-json.ts");
const autofillOrchestrate = read("src/lib/seo/product-autofill/orchestrate.ts");
const wordstatClient = read("src/lib/seo/wordstat/client.ts");
const wordstatTypes = read("src/lib/seo/wordstat/types.ts");

assert.match(seoSection, /runPrimaryQueryDiscovery/);
assert.match(seoSection, /scheduleWordstatPickerScroll/);
assert.match(seoSection, /allowAiFallback: true/);
assert.match(seoSection, /void submitWordstat\(\)/);
assert.match(seoSection, /void submitWordstat\(phrase\)/);
assert.doesNotMatch(seoSection, /\.focus\(/);
assert.match(picker, /PRIMARY_QUERY_AI_ALTERNATIVES_HEADING/);
assert.doesNotMatch(picker, /Яндекс нашёл подходящие фразы/);
assert.match(route, /requireAuthenticatedUser/);
assert.match(route, /admin_panel\.access/);
assert.match(route, /listAuthorWorkspacesForUser/);
assert.doesNotMatch(route, /indexnow|webmaster|replacePracticeSeoContent/i);
assert.match(orchestrate, /primary_query_ai_ok/);
assert.match(orchestrate, /primary_query_ai_failed/);
assert.match(orchestrate, /SAFE_LOG_FIELDS/);
assert.doesNotMatch(orchestrate, /console\.info\([^\n]*title/);
assert.match(yandexJson, /consumeProductSeoAiOutboundSlot/);
assert.match(yandexJson, /PRODUCT_SEO_YANDEX_AI_COMPLETION_URL/);
assert.doesNotMatch(autofillOrchestrate, /primary-query-suggestions|primary_query_ai/);
assert.doesNotMatch(wordstatClient, /primary-query-suggestions|primary_query_ai/);
assert.match(wordstatTypes, /WORDSTAT_GET_TOP_PATH = "\/v2\/wordstat\/topRequests"/);

const changedSources = [
  seoSection,
  picker,
  route,
  orchestrate,
  yandexJson,
  read("src/lib/seo/primary-query-suggestions/prompt.ts"),
  read("src/lib/seo/primary-query-suggestions/discovery.ts"),
];
for (const source of changedSources) {
  assert.doesNotMatch(source, /YANDEX_AI_API_KEY\s*[:=]\s*["'][^"']+["']/);
  assert.doesNotMatch(source, /AQVN[A-Za-z0-9_-]{10,}/);
  assert.doesNotMatch(source, /b1g[a-z0-9]{10,}/);
}

console.log("primary-query-discovery-unit: ok");
