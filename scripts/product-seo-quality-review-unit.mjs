#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AURAFON_AUTHOR_ID } from "../src/lib/authors/aurafon.ts";
import { isAuthorProductQualityReviewEnabled } from "../src/lib/seo/product-quality-review/beta.ts";
import {
  buildProductQualityReviewFingerprint,
  isProductQualityReviewFingerprintCurrent,
} from "../src/lib/seo/product-quality-review/fingerprint.ts";
import {
  buildProductQualityReviewSystemPrompt,
  PRODUCT_QUALITY_REVIEW_JSON_SCHEMA,
} from "../src/lib/seo/product-quality-review/prompt.ts";
import { runProductQualityReviewModel } from "../src/lib/seo/product-quality-review/provider.ts";
import { buildProductQualityReviewSignals } from "../src/lib/seo/product-quality-review/signals.ts";
import {
  PRODUCT_SEO_AI_MAX_OUTPUT_TOKENS,
  PRODUCT_SEO_AI_RESPONSES_URL,
  PRODUCT_SEO_YANDEX_AI_COMPLETION_URL,
} from "../src/lib/seo/product-autofill/types.ts";
import {
  YANDEX_AI_ACCEPTED_ALTERNATIVE_STATUS,
  YANDEX_AI_CONTENT_FILTER_STATUS,
  buildYandexAiModelUri,
} from "../src/lib/seo/product-autofill/yandex-provider.ts";
import {
  parseProductQualityReviewRequest,
  parseProductQualityReviewResult,
} from "../src/lib/seo/product-quality-review/validate.ts";
import {
  PRODUCT_QUALITY_REVIEW_STATUS_COPY,
  PRODUCT_QUALITY_REVIEW_STALE_MESSAGE,
} from "../src/lib/seo/product-quality-review/ui.ts";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

function basePackage(overrides = {}) {
  return {
    title: "Музыка для спа",
    subtitle: "",
    description:
      "Спокойный фон для массажа и отдыха. Мягкие звуки помогают расслабить тело.",
    productKind: "music",
    seoPrimaryQuery: "музыка для спа",
    seoSecondaryQueries: ["спокойная музыка для массажа"],
    seoTitle: "Музыка для спа – спокойный фон для отдыха",
    seoDescription:
      "Спокойная музыка для спа и массажа: мягкий фон, чтобы отдохнуть.",
    usageItems: [
      "Во время массажа",
      "Перед сном для спокойного вечера",
      "В паузе между делами",
    ],
    faqItems: [
      {
        question: "Для чего подходит эта музыка?",
        answer: "Для спокойного фона во время массажа или отдыха.",
      },
      {
        question: "Нужно ли наушники?",
        answer: "Можно слушать и в колонках, и в наушниках.",
      },
    ],
    ...overrides,
  };
}

// A — green fixture parses
const green = parseProductQualityReviewResult({
  status: "green",
  summary: "Тексты выглядят естественно.",
  issues: [],
  positiveNotes: ["Основной запрос использован естественно."],
});
assert.equal(green?.status, "green");
assert.equal(green?.issues.length, 0);

// B — yellow fixture
const yellow = parseProductQualityReviewResult({
  status: "yellow",
  summary: "Есть риск переоптимизации.",
  issues: [
    {
      severity: "warning",
      field: "seoDescription",
      message: "SEO-описание повторяет основной запрос слишком близко к заголовку.",
      recommendation: "Оставьте точный запрос в SEO-заголовке, а в описании переформулируйте.",
    },
  ],
  positiveNotes: [],
});
assert.equal(yellow?.status, "yellow");
assert.equal(yellow?.issues[0]?.severity, "warning");

// C — red exact stuffing package still needs model, but signals show high exact counts
const stuffing = basePackage({
  description:
    "музыка для спа, музыка для спа салонов, музыка для спа процедур, музыка для спа расслабляющая",
  seoDescription:
    "музыка для спа, музыка для спа салонов, музыка для спа процедур",
  usageItems: [
    "музыка для спа каждый день",
    "музыка для спа вечером",
    "музыка для спа утром",
  ],
});
const stuffingSignals = buildProductQualityReviewSignals(stuffing);
assert.ok(stuffingSignals.primaryExactByField.total >= 3);
const red = parseProductQualityReviewResult({
  status: "red",
  summary: "Слишком много SEO-повторов.",
  issues: [
    {
      severity: "critical",
      field: "description",
      message: "Описание перечисляет несколько очень похожих поисковых фраз.",
      recommendation: "Оставьте одну естественную формулировку для слушателя.",
    },
  ],
  positiveNotes: [],
});
assert.equal(red?.status, "red");

// D — near-synonym package shape accepted by request parser
const near = parseProductQualityReviewRequest({
  authorId: AURAFON_AUTHOR_ID,
  ...basePackage({
    description:
      "музыка для спа, музыка для засыпания, музыка чтобы уснуть, треки для спокойного сна",
  }),
});
assert.equal(near.ok, true);

// E — title equals primary + one seoTitle + one seoDescription is not auto-red by signals alone
const natural = basePackage();
const naturalSignals = buildProductQualityReviewSignals(natural);
assert.equal(naturalSignals.titleEqualsPrimary, true);
assert.equal(naturalSignals.primaryExactByField.seoTitle, 1);
assert.ok(naturalSignals.primaryExactByField.seoDescription >= 1);
// No density threshold fields in schema
assert.equal("density" in PRODUCT_QUALITY_REVIEW_JSON_SCHEMA.properties, false);
assert.equal("score" in PRODUCT_QUALITY_REVIEW_JSON_SCHEMA.properties, false);

// F — thematic words alone do not invent soft overuse on empty primary fields
const thematic = buildProductQualityReviewSignals(
  basePackage({
    description: "спа массаж отдых тело дыхание",
    seoTitle: "Спокойный фон",
    seoDescription: "Мягкий фон для отдыха",
    usageItems: ["массаж", "отдых", "вечер"],
    faqItems: [{ question: "Это для спа?", answer: "Да, для спокойного отдыха." }],
  }),
);
assert.equal(thematic.primaryExactByField.description, 0);

// G — empty optional fields listed, not treated as spam automatically
const emptyOpts = buildProductQualityReviewSignals(
  basePackage({
    subtitle: "",
    seoTitle: "",
    seoDescription: "",
    seoSecondaryQueries: [],
    usageItems: [],
    faqItems: [],
  }),
);
assert.ok(emptyOpts.emptyOptionalFields.includes("seoTitle"));
assert.ok(emptyOpts.emptyOptionalFields.includes("faqItems"));

// H — issues max 5
const tooMany = parseProductQualityReviewResult({
  status: "yellow",
  summary: "Есть замечания.",
  issues: Array.from({ length: 8 }, (_, i) => ({
    severity: "warning",
    field: "whole_package",
    message: `msg ${i}`,
    recommendation: `rec ${i}`,
  })),
  positiveNotes: [],
});
assert.equal(tooMany?.issues.length, 5);

// I — no numeric score in accepted summary
assert.equal(
  parseProductQualityReviewResult({
    status: "green",
    summary: "SEO score 82/100",
    issues: [],
    positiveNotes: [],
  }),
  null,
);

// J — fingerprint stale after seoDescription edit
const fp1 = buildProductQualityReviewFingerprint(natural);
const edited = { ...natural, seoDescription: "Полностью новый текст мета-описания." };
assert.equal(isProductQualityReviewFingerprintCurrent(edited, fp1), false);
assert.match(PRODUCT_QUALITY_REVIEW_STALE_MESSAGE, /изменены/);

// K — generation keeps prior review → fingerprint mismatch → stale (source + fingerprint semantics)
const section = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.match(section, /function applyGeneratedDraft/);
assert.match(section, /PRODUCT_QUALITY_REVIEW_STALE_MESSAGE/);
const applyBlock = section.slice(
  section.indexOf("function applyGeneratedDraft"),
  section.indexOf("async function runProductQualityReview"),
);
assert.doesNotMatch(applyBlock, /setReviewedFingerprint\(null\)/);
assert.doesNotMatch(applyBlock, /setReviewStatus\(null\)/);
assert.doesNotMatch(applyBlock, /setReviewSummary\(null\)/);
assert.doesNotMatch(applyBlock, /setReviewIssues\(\[\]\)/);
assert.doesNotMatch(applyBlock, /setReviewPositiveNotes\(\[\]\)/);
assert.match(section, /reviewIsStale/);
assert.match(section, /PRODUCT_QUALITY_REVIEW_CTA_AGAIN/);
// Fingerprint semantics: keeping reviewedFingerprint after package change → stale
const beforeGen = basePackage();
const reviewedFp = buildProductQualityReviewFingerprint(beforeGen);
const afterGen = {
  ...beforeGen,
  seoTitle: "Новый SEO-заголовок после генерации",
  seoDescription: "Новое SEO-описание после генерации текстов.",
};
assert.equal(
  isProductQualityReviewFingerprintCurrent(afterGen, reviewedFp),
  false,
);
assert.equal(Boolean(reviewedFp) && !isProductQualityReviewFingerprintCurrent(afterGen, reviewedFp), true);

// L — RED does not gate publish/save (no disabled publish from reviewStatus)
assert.doesNotMatch(section, /reviewStatus === "red".*disabled|disabled.*reviewStatus === "red"/);
assert.doesNotMatch(section, /reviewStatus[\s\S]{0,80}publish/i);

// M — beta gate
assert.equal(isAuthorProductQualityReviewEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorProductQualityReviewEnabled("00000000-0000-4000-8000-000000000000"), false);
const route = read("src/app/api/author/seo/product-quality-review/route.ts");
assert.match(route, /isAuthorProductQualityReviewEnabled/);
assert.match(route, /product_quality_review_beta_disabled/);
assert.doesNotMatch(route, /\.from\(|\.update\(|\.insert\(/);
assert.match(route, /Analysis only/);

// Prompt contract
const prompt = buildProductQualityReviewSystemPrompt();
assert.match(prompt, /весь пакет|TEXT PACKAGE|весь пакет вместе|Оценивай весь пакет/i);
assert.match(prompt, /не.*density|НЕ используй произвольные пороги keyword density/i);
assert.match(prompt, /Exact-match repetition alone is not enough/i);
assert.match(prompt, /Near-synonym stuffing/i);
assert.match(prompt, /YELLOW/);
assert.match(prompt, /не суди ранжирование|Не суди ранжирование/i);

// UI copy for traffic light
assert.equal(PRODUCT_QUALITY_REVIEW_STATUS_COPY.green.title, "Тексты выглядят естественно");
assert.equal(PRODUCT_QUALITY_REVIEW_STATUS_COPY.yellow.title, "Есть риск переоптимизации");
assert.equal(PRODUCT_QUALITY_REVIEW_STATUS_COPY.red.title, "Слишком много SEO-повторов");
assert.equal(
  PRODUCT_QUALITY_REVIEW_STATUS_COPY.green.subtitle,
  "Явного SEO-переспама не найдено. Тексты можно оставить как есть.",
);
assert.equal(
  PRODUCT_QUALITY_REVIEW_STATUS_COPY.yellow.subtitle,
  "Текст в целом можно оставить, но некоторые повторы или формулировки стоит проверить.",
);
assert.equal(
  PRODUCT_QUALITY_REVIEW_STATUS_COPY.red.subtitle,
  "Текст выглядит переоптимизированным. Уберите лишние повторения поисковых запросов и сделайте формулировки естественнее.",
);
// Fixed subtitle always rendered; model summary must not replace it
assert.match(
  section,
  /PRODUCT_QUALITY_REVIEW_STATUS_COPY\[reviewStatus\]\.subtitle/,
);
assert.doesNotMatch(
  section,
  /reviewSummary\s*\|\|\s*PRODUCT_QUALITY_REVIEW_STATUS_COPY\[reviewStatus\]\.subtitle/,
);

// missing primary request
assert.equal(
  parseProductQualityReviewRequest({
    authorId: AURAFON_AUTHOR_ID,
    ...basePackage({ seoPrimaryQuery: "" }),
  }).ok,
  false,
);

// form passes authorId
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /authorId=\{form\.authorId\}/);

// no migration files in this feature module
assert.doesNotMatch(read("src/lib/seo/product-quality-review/orchestrate.ts"), /supabase\/migrations/);


// Yandex quality-review provider must follow canonical autofill contract
const reviewProvider = read("src/lib/seo/product-quality-review/provider.ts");
assert.match(reviewProvider, /buildYandexAiModelUri/);
assert.match(reviewProvider, /YANDEX_AI_ACCEPTED_ALTERNATIVE_STATUS/);
assert.match(reviewProvider, /YANDEX_AI_CONTENT_FILTER_STATUS/);
assert.match(reviewProvider, /readYandexFirstAlternative/);
assert.match(reviewProvider, /jsonSchema:\s*\{\s*schema:\s*PRODUCT_QUALITY_REVIEW_JSON_SCHEMA/);
assert.match(reviewProvider, /maxTokens:\s*String\(PRODUCT_SEO_AI_MAX_OUTPUT_TOKENS\)/);
assert.doesNotMatch(reviewProvider, /gpt:\/\/\$\{folderId\}\/\$\{config\.model\}`/);
assert.doesNotMatch(reviewProvider, /temperature:\s*0\.2/);
assert.doesNotMatch(reviewProvider, /x-folder-id/);
assert.match(reviewProvider, /productSeoAiContentFilteredError/);

const yandexCanonical = read("src/lib/seo/product-autofill/yandex-provider.ts");
assert.match(yandexCanonical, /export function buildYandexAiModelUri/);
assert.match(yandexCanonical, /export function readYandexFirstAlternative/);
assert.match(yandexCanonical, /gpt:\/\/\$\{folderId\}\/\$\{modelId\}\/latest/);


// --- Mocked provider behavior (no network, no real secrets) ---
function mockFetch(handlers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const handler = handlers.shift();
    if (!handler) throw new Error("unexpected fetch");
    return handler(url, init);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function jsonResponse(status, body) {
  return { status, json: async () => body };
}

function yandexAlt(text, status = YANDEX_AI_ACCEPTED_ALTERNATIVE_STATUS) {
  const alternative = { message: { role: "assistant", text } };
  if (status !== undefined && status !== null) {
    alternative.status = status;
  }
  return { result: { alternatives: [alternative] } };
}

const validReviewJson = JSON.stringify({
  status: "green",
  summary: "Тексты выглядят естественно.",
  issues: [],
  positiveNotes: ["Основной запрос использован естественно."],
});

const reviewPkg = basePackage();
const reviewSignals = buildProductQualityReviewSignals(reviewPkg);

const TEST_YANDEX_KEY = "test-yandex-quality-key";
const TEST_YANDEX_FOLDER = "b1gtestfolder";
const TEST_OPENAI_KEY = "test-openai-quality-key";

const yandexEnv = {
  PRODUCT_SEO_AI_ENABLED: "true",
  PRODUCT_SEO_AI_PROVIDER: "yandex",
  YANDEX_AI_API_KEY: TEST_YANDEX_KEY,
  YANDEX_AI_FOLDER_ID: TEST_YANDEX_FOLDER,
  YANDEX_AI_MODEL: "yandexgpt-lite",
};

const openaiEnv = {
  PRODUCT_SEO_AI_ENABLED: "true",
  PRODUCT_SEO_AI_PROVIDER: "openai",
  OPENAI_API_KEY: TEST_OPENAI_KEY,
  PRODUCT_SEO_AI_MODEL: "gpt-test-seo",
};

// A — Yandex request shape
{
  const fetchImpl = mockFetch([
    () => jsonResponse(200, yandexAlt(validReviewJson)),
  ]);
  const result = await runProductQualityReviewModel({
    package: reviewPkg,
    signals: reviewSignals,
    options: { fetchImpl, env: yandexEnv },
  });
  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, PRODUCT_SEO_YANDEX_AI_COMPLETION_URL);
  assert.equal(
    fetchImpl.calls[0].init.headers.Authorization,
    `Api-Key ${TEST_YANDEX_KEY}`,
  );
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(
    sent.modelUri,
    buildYandexAiModelUri(TEST_YANDEX_FOLDER, "yandexgpt-lite"),
  );
  assert.match(sent.modelUri, /\/latest$/);
  assert.equal(sent.completionOptions.stream, false);
  assert.equal(
    sent.completionOptions.maxTokens,
    String(PRODUCT_SEO_AI_MAX_OUTPUT_TOKENS),
  );
  assert.deepEqual(sent.jsonSchema, {
    schema: PRODUCT_QUALITY_REVIEW_JSON_SCHEMA,
  });
}

// B — Yandex FINAL → ok
{
  const fetchImpl = mockFetch([
    () => jsonResponse(200, yandexAlt(validReviewJson, YANDEX_AI_ACCEPTED_ALTERNATIVE_STATUS)),
  ]);
  const result = await runProductQualityReviewModel({
    package: reviewPkg,
    signals: reviewSignals,
    options: { fetchImpl, env: yandexEnv },
  });
  assert.equal(result.ok, true);
  assert.equal(result.result.status, "green");
}

// C — Yandex CONTENT_FILTER → fail-open content-filter path
{
  const fetchImpl = mockFetch([
    () =>
      jsonResponse(
        200,
        yandexAlt("blocked", YANDEX_AI_CONTENT_FILTER_STATUS),
      ),
  ]);
  const result = await runProductQualityReviewModel({
    package: reviewPkg,
    signals: reviewSignals,
    options: { fetchImpl, env: yandexEnv },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "CONTENT_FILTERED");
  assert.equal(result.error.providerStatus, YANDEX_AI_CONTENT_FILTER_STATUS);
}

// D — Yandex unknown/missing status → ok=false
{
  const fetchImplMissing = mockFetch([
    () => jsonResponse(200, yandexAlt(validReviewJson, null)),
  ]);
  const missing = await runProductQualityReviewModel({
    package: reviewPkg,
    signals: reviewSignals,
    options: { fetchImpl: fetchImplMissing, env: yandexEnv },
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "PROVIDER_ERROR");

  const fetchImplUnknown = mockFetch([
    () =>
      jsonResponse(
        200,
        yandexAlt(validReviewJson, "ALTERNATIVE_STATUS_TRUNCATED_FINAL"),
      ),
  ]);
  const unknown = await runProductQualityReviewModel({
    package: reviewPkg,
    signals: reviewSignals,
    options: { fetchImpl: fetchImplUnknown, env: yandexEnv },
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, "PROVIDER_ERROR");
}

// E — Yandex malformed JSON in FINAL text → ok=false
{
  const fetchImpl = mockFetch([
    () =>
      jsonResponse(
        200,
        yandexAlt("{not-json", YANDEX_AI_ACCEPTED_ALTERNATIVE_STATUS),
      ),
  ]);
  const result = await runProductQualityReviewModel({
    package: reviewPkg,
    signals: reviewSignals,
    options: { fetchImpl, env: yandexEnv },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PROVIDER_ERROR");
}

// F — OpenAI structured output request + valid response
{
  const fetchImpl = mockFetch([
    () =>
      jsonResponse(200, {
        output_text: validReviewJson,
      }),
  ]);
  const result = await runProductQualityReviewModel({
    package: reviewPkg,
    signals: reviewSignals,
    options: { fetchImpl, env: openaiEnv },
  });
  assert.equal(result.ok, true);
  assert.equal(result.result.status, "green");
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, PRODUCT_SEO_AI_RESPONSES_URL);
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(sent.text.format.type, "json_schema");
  assert.equal(sent.text.format.strict, true);
  assert.deepEqual(sent.text.format.schema, PRODUCT_QUALITY_REVIEW_JSON_SCHEMA);
}


console.log("product-seo-quality-review-unit: ok");
