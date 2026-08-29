#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateWordstatOpportunity } from "../src/lib/seo/wordstat/opportunity.ts";
import { createWordstatMemoryCache } from "../src/lib/seo/wordstat/cache.ts";
import { createWordstatRateLimitStore } from "../src/lib/seo/wordstat/rate-limit.ts";
import {
  generateProductSeoDraft,
  parseProductSeoAutofillRequest,
} from "../src/lib/seo/product-autofill/orchestrate.ts";
import { getProductSeoAiConfig } from "../src/lib/seo/product-autofill/config.ts";
import { createProductSeoAiProvider } from "../src/lib/seo/product-autofill/provider.ts";
import {
  createProductSeoAiRateLimitStore,
  PRODUCT_SEO_AI_USER_LIMIT,
} from "../src/lib/seo/product-autofill/rate-limit.ts";
import { eligibleSecondaryCandidates } from "../src/lib/seo/product-autofill/select-secondaries.ts";
import {
  parseProductSeoAiRawDraft,
  validateProductSeoAiDraft,
} from "../src/lib/seo/product-autofill/validate.ts";
import {
  hasFilledGeneratedSeoFields,
  resolveProductSeoAccordionBadgeFromInput,
  suggestPrimaryQuerySeeds,
} from "../src/lib/seo/product-autofill/ui.ts";
import { PRODUCT_SEO_AI_ERROR_MESSAGE } from "../src/lib/seo/product-autofill/errors.ts";
import { PRODUCT_SEO_AI_RESPONSES_URL } from "../src/lib/seo/product-autofill/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_KEY = "unit-test-openai-key-never-log";

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
    PRODUCT_SEO_AI_ENABLED: "true",
    OPENAI_API_KEY: TEST_KEY,
    PRODUCT_SEO_AI_MODEL: "gpt-test-seo",
    ...extra,
  };
}

function suggestion(phrase, count, source = "result") {
  return {
    phrase,
    count,
    source,
    opportunity: evaluateWordstatOpportunity(count),
  };
}

function sampleCandidates() {
  return [
    suggestion("медитация перед сном", 320),
    suggestion("вечерняя медитация", 180),
    suggestion("медитация для расслабления", 90),
    suggestion("практика перед сном", 70),
    suggestion("медитация ночью", 40),
    suggestion("медитация", 12000),
  ];
}

function validDraft(overrides = {}) {
  return {
    secondaryQueries: [
      "медитация перед сном",
      "вечерняя медитация",
      "медитация для расслабления",
    ],
    seoTitle: "Медитация для сна – расслабление перед сном",
    seoDescription:
      "Медитация для сна мягко помогает замедлиться вечером и подготовиться ко сну в спокойном темпе.",
    seoAbout: [
      "Эта медитация для сна создана для спокойного вечера, когда хочется замедлиться и отойти от дневных дел.",
      "Во время прослушивания вы следуете спокойному голосу и замечаете дыхание, без сложных техник и обещаний чуда.",
      "Практика подойдёт тем, кто ищет вечернюю медитацию или медитацию перед сном как понятный ритуал завершения дня.",
    ].join("\n\n"),
    usageItems: [
      { content: "Перед сном, когда мысли ещё крутятся" },
      { content: "После напряжённого дня" },
      { content: "Во время вечернего отдыха" },
    ],
    faqItems: [
      {
        question: "Когда лучше слушать медитацию для сна?",
        answer: "Обычно вечером, когда вы уже готовитесь ко сну и можете лечь удобно.",
        anchor: "kogda-slushat",
      },
      {
        question: "Нужен ли опыт медитации?",
        answer: "Нет. Достаточно слушать и замечать дыхание в своём темпе.",
        anchor: "nuzhen-li-opyt",
      },
      {
        question: "Кому подойдёт эта практика?",
        answer: "Тем, кто ищет спокойный вечерний ритуал и мягкое завершение дня.",
        anchor: "komu-podoydyot",
      },
    ],
    ...overrides,
  };
}

function requestInput() {
  return {
    title: "Лавандовый сон",
    subtitle: "Вечерняя практика",
    description: "Мягкая медитация для сна.",
    productKind: "practice",
    seoPrimaryQuery: "медитация для сна",
    usageItems: [],
  };
}

function validationInput(candidates = sampleCandidates()) {
  const request = requestInput();
  return {
    primaryQuery: request.seoPrimaryQuery,
    title: request.title,
    subtitle: request.subtitle,
    description: request.description,
    productKind: request.productKind,
    usageItems: request.usageItems,
    candidates: eligibleSecondaryCandidates(candidates, request.seoPrimaryQuery),
  };
}

function mockProvider(sequence) {
  const calls = [];
  return {
    calls,
    generate: async (input) => {
      calls.push({ kind: "generate", input });
      const next = sequence.shift();
      return typeof next === "function" ? next("generate") : next;
    },
    repair: async (input, previous, issues) => {
      calls.push({ kind: "repair", input, previous, issues });
      const next = sequence.shift();
      return typeof next === "function" ? next("repair") : next;
    },
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
    json: async () => body,
  };
}

const valid = validateProductSeoAiDraft(validDraft(), validationInput());
assert.equal(valid.ok, true);
assert.equal(valid.draft.faqItems.length, 3);
assert.equal(valid.draft.seoSecondaryQueries.length, 3);

const invented = validateProductSeoAiDraft(
  validDraft({ secondaryQueries: ["выдуманная фраза для сна"] }),
  validationInput(),
);
assert.equal(invented.ok, false);
assert.ok(invented.issues.some((issue) => issue.startsWith("invented_secondary:")));

const greenYellow = eligibleSecondaryCandidates(sampleCandidates(), "медитация для сна");
assert.ok(greenYellow.every((item) => item.color === "green" || item.color === "yellow"));
assert.ok(greenYellow.some((item) => item.color === "green"));
assert.ok(!greenYellow.some((item) => item.phrase === "медитация"));

const onlyRed = eligibleSecondaryCandidates(
  [suggestion("медитация", 20000), suggestion("сон", 8)],
  "медитация для сна",
);
assert.equal(onlyRed.some((item) => item.color === "red"), true);

const missingPrimaryTitle = validateProductSeoAiDraft(
  validDraft({ seoTitle: "Спокойный вечер без ключа" }),
  validationInput(),
);
assert.equal(missingPrimaryTitle.ok, false);
assert.ok(missingPrimaryTitle.issues.includes("primary_missing_from_title"));

const missingFaqPrimary = validateProductSeoAiDraft(
  validDraft({
    faqItems: [
      {
        question: "Когда лучше слушать?",
        answer: "Вечером, когда вы уже в кровати.",
        anchor: "kogda",
      },
      {
        question: "Нужен ли опыт?",
        answer: "Нет, опыт не нужен.",
        anchor: "opyt",
      },
      {
        question: "Кому подойдёт?",
        answer: "Тем, кто хочет спокойный вечер.",
        anchor: "komu",
      },
    ],
  }),
  validationInput(),
);
assert.equal(missingFaqPrimary.ok, false);
assert.ok(missingFaqPrimary.issues.includes("primary_missing_from_faq"));

const faqCount = validateProductSeoAiDraft(
  validDraft({
    faqItems: validDraft().faqItems.slice(0, 2),
  }),
  validationInput(),
);
assert.equal(faqCount.ok, false);
assert.ok(faqCount.issues.includes("faq_count"));

const duplicateSecondary = validateProductSeoAiDraft(
  validDraft({
    secondaryQueries: ["медитация перед сном", "Медитация перед сном", "вечерняя медитация"],
  }),
  validationInput(),
);
assert.equal(duplicateSecondary.ok, false);
assert.ok(duplicateSecondary.issues.includes("duplicate_secondary"));

const tooLongTitle = validateProductSeoAiDraft(
  validDraft({ seoTitle: `${"Медитация для сна ".repeat(20)}` }),
  validationInput(),
);
assert.equal(tooLongTitle.ok, false);
assert.ok(tooLongTitle.issues.includes("title_too_long"));

assert.equal(parseProductSeoAiRawDraft(null), null);
assert.equal(parseProductSeoAiRawDraft({ seoTitle: "x" }), null);
assert.equal(parseProductSeoAiRawDraft("not-json"), null);
assert.equal(validateProductSeoAiDraft("broken", validationInput()).ok, false);
assert.ok(validateProductSeoAiDraft("broken", validationInput()).issues.includes("malformed"));

const banned = validateProductSeoAiDraft(
  validDraft({
    seoDescription:
      "Медитация для сна лечит бессонницу и гарантирует глубокий сон каждому слушателю вечером.",
  }),
  validationInput(),
);
assert.equal(banned.ok, false);
assert.ok(banned.issues.some((issue) => issue.startsWith("banned_claim:")));

await withEnvAsync(enabledEnv(), async () => {
  const provider = mockProvider([
    { ok: true, draft: validDraft(), raw: { output_text: "{}" } },
  ]);
  const result = await generateProductSeoDraft(requestInput(), {
    userId: "author-1",
    provider,
    wordstatSuggestions: sampleCandidates(),
    aiRateLimit: createProductSeoAiRateLimitStore(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.seoTitle.includes("Медитация для сна"), true);
  assert.equal(result.data.faqItems.length, 3);
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].kind, "generate");
});

await withEnvAsync(enabledEnv(), async () => {
  const provider = mockProvider([
    { ok: true, draft: validDraft({ secondaryQueries: ["изобретённая фраза"] }), raw: {} },
    { ok: true, draft: validDraft(), raw: {} },
  ]);
  const result = await generateProductSeoDraft(requestInput(), {
    userId: "author-repair",
    provider,
    wordstatSuggestions: sampleCandidates(),
    aiRateLimit: createProductSeoAiRateLimitStore(),
  });
  assert.equal(result.ok, true);
  assert.equal(provider.calls.map((item) => item.kind).join(","), "generate,repair");
  assert.ok(provider.calls[1].issues.some((issue) => issue.startsWith("invented_secondary:")));
});

await withEnvAsync(enabledEnv(), async () => {
  const provider = mockProvider([
    { ok: true, draft: validDraft({ secondaryQueries: ["изобретённая фраза"] }), raw: {} },
    { ok: true, draft: validDraft({ secondaryQueries: ["другая выдумка"] }), raw: {} },
    { ok: true, draft: validDraft(), raw: {} },
  ]);
  const result = await generateProductSeoDraft(requestInput(), {
    userId: "author-repair-once",
    provider,
    wordstatSuggestions: sampleCandidates(),
    aiRateLimit: createProductSeoAiRateLimitStore(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_OUTPUT");
  assert.equal(provider.calls.length, 2);
});

await withEnvAsync(enabledEnv(), async () => {
  const provider = mockProvider([
    { ok: false, error: { code: "PROVIDER_ERROR", message: PRODUCT_SEO_AI_ERROR_MESSAGE } },
  ]);
  const result = await generateProductSeoDraft(requestInput(), {
    userId: "author-provider-fail",
    provider,
    wordstatSuggestions: sampleCandidates(),
    aiRateLimit: createProductSeoAiRateLimitStore(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PROVIDER_ERROR");
  assert.equal(result.error.message, PRODUCT_SEO_AI_ERROR_MESSAGE);
});

await withEnvAsync(enabledEnv(), async () => {
  const provider = mockProvider([
    { ok: false, error: { code: "TIMEOUT", message: PRODUCT_SEO_AI_ERROR_MESSAGE } },
  ]);
  const result = await generateProductSeoDraft(requestInput(), {
    userId: "author-timeout",
    provider,
    wordstatSuggestions: sampleCandidates(),
    aiRateLimit: createProductSeoAiRateLimitStore(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "TIMEOUT");
});

await withEnvAsync(
  { PRODUCT_SEO_AI_ENABLED: "false", OPENAI_API_KEY: TEST_KEY },
  async () => {
    const provider = mockProvider([]);
    const result = await generateProductSeoDraft(requestInput(), {
      userId: "author-disabled",
      provider,
      wordstatSuggestions: sampleCandidates(),
      aiRateLimit: createProductSeoAiRateLimitStore(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "AI_DISABLED");
    assert.equal(provider.calls.length, 0);
  },
);

await withEnvAsync(
  { PRODUCT_SEO_AI_ENABLED: "true", OPENAI_API_KEY: undefined },
  async () => {
    const result = await generateProductSeoDraft(requestInput(), {
      userId: "author-missing-key",
      wordstatSuggestions: sampleCandidates(),
      aiRateLimit: createProductSeoAiRateLimitStore(),
      provider: mockProvider([]),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "NOT_CONFIGURED");
  },
);

await withEnvAsync(enabledEnv(), async () => {
  const missing = await generateProductSeoDraft(
    { ...requestInput(), seoPrimaryQuery: "   " },
    {
      userId: "author-empty-primary",
      provider: mockProvider([]),
      wordstatSuggestions: sampleCandidates(),
      aiRateLimit: createProductSeoAiRateLimitStore(),
    },
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_PRIMARY");
});

await withEnvAsync(enabledEnv(), async () => {
  const store = createProductSeoAiRateLimitStore();
  const provider = mockProvider(
    Array.from({ length: PRODUCT_SEO_AI_USER_LIMIT + 1 }, () => ({
      ok: true,
      draft: validDraft(),
      raw: {},
    })),
  );
  const results = [];
  for (let index = 0; index < PRODUCT_SEO_AI_USER_LIMIT + 1; index += 1) {
    results.push(
      await generateProductSeoDraft(requestInput(), {
        userId: "author-rate",
        provider,
        wordstatSuggestions: sampleCandidates(),
        aiRateLimit: store,
      }),
    );
  }
  assert.equal(results.filter((item) => item.ok).length, PRODUCT_SEO_AI_USER_LIMIT);
  assert.equal(results.at(-1).ok, false);
  assert.equal(results.at(-1).error.code, "RATE_LIMITED");
});

await withEnvAsync(enabledEnv(), async () => {
  const fetchImpl = mockFetch([
    () =>
      jsonResponse(200, {
        output_text: JSON.stringify(validDraft()),
      }),
  ]);
  const provider = createProductSeoAiProvider({
    fetchImpl,
    env: process.env,
    rateLimit: createProductSeoAiRateLimitStore(),
  });
  const generated = await provider.generate({
    request: requestInput(),
    candidates: eligibleSecondaryCandidates(sampleCandidates(), "медитация для сна"),
  });
  assert.equal(generated.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, PRODUCT_SEO_AI_RESPONSES_URL);
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(sent.model, "gpt-test-seo");
  assert.equal(sent.text.format.type, "json_schema");
  assert.doesNotMatch(JSON.stringify(sent), new RegExp(TEST_KEY));
});

await withEnvAsync(enabledEnv(), async () => {
  const fetchImpl = mockFetch([
    () =>
      jsonResponse(200, {
        output_text: JSON.stringify(validDraft({ seoAbout: `секрет ${TEST_KEY}` })),
      }),
  ]);
  const provider = createProductSeoAiProvider({
    fetchImpl,
    env: process.env,
    rateLimit: createProductSeoAiRateLimitStore(),
  });
  const generated = await provider.generate({
    request: requestInput(),
    candidates: eligibleSecondaryCandidates(sampleCandidates(), "медитация для сна"),
  });
  assert.equal(generated.ok, false);
  assert.equal(generated.error.code, "PROVIDER_ERROR");
  assert.doesNotMatch(JSON.stringify(generated), new RegExp(TEST_KEY));
});

await withEnvAsync(enabledEnv(), async () => {
  const cache = createWordstatMemoryCache();
  const wordstatRate = createWordstatRateLimitStore();
  let wordstatCalls = 0;
  const fetchImpl = async () => {
    wordstatCalls += 1;
    return {
      status: 200,
      json: async () => ({
        results: sampleCandidates().map((item) => ({
          phrase: item.phrase,
          count: String(item.count),
        })),
        associations: [],
      }),
    };
  };
  const provider = mockProvider([
    { ok: true, draft: validDraft(), raw: {} },
  ]);
  const result = await generateProductSeoDraft(requestInput(), {
    userId: "author-wordstat-reuse",
    provider,
    wordstat: {
      fetchImpl,
      cache,
      rateLimit: wordstatRate,
      env: {
        YANDEX_WORDSTAT_ENABLED: "true",
        YANDEX_SEARCH_API_KEY: "wordstat-test-key",
        YANDEX_SEARCH_FOLDER_ID: "folder",
      },
    },
    aiRateLimit: createProductSeoAiRateLimitStore(),
  });
  assert.equal(result.ok, true);
  assert.equal(wordstatCalls, 1);
});

assert.equal(
  parseProductSeoAutofillRequest({
    title: "A",
    subtitle: "",
    description: "",
    productKind: "practice",
    seoPrimaryQuery: "медитация для сна",
  })?.seoPrimaryQuery,
  "медитация для сна",
);
assert.equal(parseProductSeoAutofillRequest({ title: "A" }), null);

const emptyBadge = resolveProductSeoAccordionBadgeFromInput({
  title: "Лавандовый сон",
  description: "Коротко",
  seoPrimaryQuery: "",
  seoTitle: "",
  seoDescription: "",
  seoAbout: "",
});
assert.equal(emptyBadge, "recommend");

const readyBadge = resolveProductSeoAccordionBadgeFromInput({
  title: "Лавандовый сон",
  description: "Мягкая вечерняя практика для спокойного завершения дня и подготовки ко сну без суеты и спешки.".repeat(2),
  seoPrimaryQuery: "медитация для сна",
  seoTitle: "Медитация для сна – расслабление перед сном",
  seoDescription: "Медитация для сна помогает мягко замедлиться вечером.",
  seoAbout: "Эта медитация для сна создана для вечера.",
  seoUsageItems: ["Перед сном"],
  seoFaqCount: 3,
});
assert.equal(readyBadge, "ready");

const partialBadge = resolveProductSeoAccordionBadgeFromInput({
  title: "Лавандовый сон",
  seoPrimaryQuery: "медитация для сна",
  seoTitle: "",
  seoDescription: "",
  seoAbout: "",
});
assert.equal(partialBadge, "partial");

assert.equal(
  hasFilledGeneratedSeoFields({
    seoSecondaryQueries: [],
    seoTitle: "",
    seoDescription: "",
    seoAbout: "",
    seoContent: { usageItems: [], faqItems: [], relatedPracticeIds: [], relatedListenSlugs: [] },
  }),
  false,
);
assert.equal(
  hasFilledGeneratedSeoFields({
    seoSecondaryQueries: [],
    seoTitle: "Есть заголовок",
    seoDescription: "",
    seoAbout: "",
    seoContent: { usageItems: [], faqItems: [], relatedPracticeIds: [], relatedListenSlugs: [] },
  }),
  true,
);

const seeds = suggestPrimaryQuerySeeds({
  title: "Лавандовый сон",
  subtitle: "Вечерняя практика",
  description: "Мягкая медитация для сна. Подходит для вечера.",
  productKind: "practice",
});
assert.ok(seeds.includes("Лавандовый сон"));
assert.ok(seeds.length >= 3 && seeds.length <= 5);

await withEnvAsync(enabledEnv(), async () => {
  const config = getProductSeoAiConfig();
  assert.equal(config.enabledFlag, true);
  assert.equal(config.apiKeyPresent, true);
  assert.equal(config.canCall, true);
  assert.equal(config.model, "gpt-test-seo");
  assert.equal("apiKey" in config, false);
});

const section = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
const ui = read("src/lib/seo/product-autofill/ui.ts");
const orchestrate = read("src/lib/seo/product-autofill/orchestrate.ts");
const provider = read("src/lib/seo/product-autofill/provider.ts");
const config = read("src/lib/seo/product-autofill/config.ts");
const route = read("src/app/api/author/seo/product-autofill/route.ts");
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");

assert.match(orchestrate, /fetchWordstatSuggestions/);
assert.match(orchestrate, /eligibleSecondaryCandidates/);
assert.match(orchestrate, /provider\.repair/);
assert.match(orchestrate, /import "server-only"/);
assert.doesNotMatch(orchestrate, /wordstat\.yandex\.ru/);
assert.match(provider, /PRODUCT_SEO_AI_RESPONSES_URL/);
assert.match(provider, /json_schema/);
assert.match(provider, /import "server-only"/);
assert.match(config, /PRODUCT_SEO_AI_ENABLED/);
assert.match(config, /OPENAI_API_KEY/);
assert.match(config, /PRODUCT_SEO_AI_MODEL/);
assert.doesNotMatch(config, /NEXT_PUBLIC_/);
assert.match(route, /requireAuthenticatedUser/);
assert.match(route, /generateProductSeoDraft/);
assert.doesNotMatch(route, /seo_primary_query/);
assert.doesNotMatch(route, /replacePracticeSeoContent/);
assert.doesNotMatch(route, /indexnow|webmaster/i);
assert.match(section, /useState\(false\)/);
assert.match(section, /PRODUCT_SEO_PICK_PRIMARY_CTA/);
assert.match(section, /PRODUCT_SEO_GENERATE_CTA/);
assert.match(section, /generateLoading/);
assert.match(section, /Готовим SEO|PRODUCT_SEO_GENERATE_LOADING/);
assert.match(section, /hasFilledGeneratedSeoFields/);
assert.doesNotMatch(section, /необязательно/);
assert.doesNotMatch(ui, /необязательно/);
assert.doesNotMatch(section, /OpenAI|ChatGPT/);
assert.doesNotMatch(ui, /OpenAI|ChatGPT/);
assert.doesNotMatch(form, /product-autofill|OpenAI/);
assert.doesNotMatch(section, /TOP-5|SERP|domain authority|SEO score/i);
assert.match(read("src/lib/seo/wordstat/client.ts"), /fetchWordstatSuggestions/);
assert.doesNotMatch(orchestrate, /WORDSTAT_GET_TOP_URL/);

const packageJson = read("package.json");
assert.match(packageJson, /test:product-seo-autofill/);
assert.match(packageJson, /test:wordstat/);
assert.match(packageJson, /test:indexnow/);
assert.match(packageJson, /test:yandex-webmaster/);

console.log("product-seo-autofill-unit: ok");
