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
  reviewProductTextQualityForRequest,
} from "../src/lib/seo/product-quality-review/orchestrate.ts";
import {
  DESCRIPTION_STUFFING_ISSUE_MESSAGE,
  reconcileProductQualityReviewResult,
} from "../src/lib/seo/product-quality-review/reconcile.ts";
import {
  PRODUCT_QUALITY_REVIEW_BLOCK_TITLE,
  PRODUCT_QUALITY_REVIEW_CTA,
  PRODUCT_QUALITY_REVIEW_CTA_AGAIN,
  PRODUCT_QUALITY_REVIEW_HELPER,
  PRODUCT_QUALITY_REVIEW_HELPER_WHY,
  PRODUCT_QUALITY_REVIEW_LOADING,
  PRODUCT_QUALITY_REVIEW_STATUS_COPY,
  PRODUCT_QUALITY_REVIEW_STALE_MESSAGE,
  getProductQualityReviewFieldLabel,
  humanizeProductQualityReviewText,
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

// A — YELLOW weak SEO (underoptimization)
const weakSeo = basePackage({
  title: "Музыка для спа",
  description: "Спокойные звуки для отдыха.",
  seoTitle: "Спокойная музыка",
  seoDescription: "Мягкий фон для отдыха.",
  seoSecondaryQueries: ["спокойная музыка для массажа"],
  usageItems: ["Вечером", "В паузе", "После работы"],
  faqItems: [
    { question: "Сколько длится трек?", answer: "Около часа спокойного фона." },
    { question: "Нужны наушники?", answer: "Можно слушать как удобно." },
  ],
});
const weakSignals = buildProductQualityReviewSignals(weakSeo);
assert.equal(weakSignals.titleEqualsPrimary, true);
assert.equal(weakSignals.primaryPresentIn.title, true);
assert.equal(weakSignals.primaryPresentIn.seoTitle, false);
assert.equal(weakSignals.primaryPresentIn.seoDescription, false);
assert.equal(weakSignals.primaryPresentIn.description, false);
assert.equal(weakSignals.primaryPresentIn.usage, false);
assert.equal(weakSignals.primaryPresentIn.faq, false);
assert.equal(weakSignals.secondaryCoverage.secondary1UsageCovered, false);
const yellowWeak = parseProductQualityReviewResult({
  status: "yellow",
  summary: "Поисковая тема выражена недостаточно.",
  issues: [
    {
      severity: "warning",
      field: "seoDescription",
      message: "Основной запрос есть только в заголовке продукта.",
      recommendation:
        "Основной запрос есть только в заголовке. Добавьте его естественно в описание продукта или SEO-описание.",
    },
    {
      severity: "warning",
      field: "usage",
      message: "Дополнительный запрос не отражён в тексте.",
      recommendation:
        "Дополнительный запрос «спокойная музыка для массажа» выбран, но не отражён в тексте. Его можно естественно использовать в одном из пунктов «Когда слушать».",
    },
  ],
  positiveNotes: [],
});
assert.equal(yellowWeak?.status, "yellow");
assert.equal(PRODUCT_QUALITY_REVIEW_STATUS_COPY.yellow.title, "SEO слишком слабое");
for (const issue of yellowWeak.issues) {
  assert.doesNotMatch(issue.recommendation, /добавьте\s+\d+\s+раз/i);
  assert.doesNotMatch(issue.recommendation, /плотност/i);
  assert.doesNotMatch(issue.recommendation, /\d+[.,]\d+\s*%/);
}

// B — GREEN balanced
const balanced = basePackage({
  usageItems: [
    "Во время спокойного массажа",
    "Перед сном для мягкого вечера",
    "В паузе между делами",
  ],
  faqItems: [
    {
      question: "Для чего подходит эта музыка?",
      answer: "Для спокойного фона во время массажа или отдыха в спа.",
    },
    {
      question: "Нужно ли наушники?",
      answer: "Можно слушать и в колонках, и в наушниках.",
    },
  ],
});
const balancedSignals = buildProductQualityReviewSignals(balanced);
assert.equal(balancedSignals.titleEqualsPrimary, true);
assert.equal(balancedSignals.primaryPresentIn.seoTitle, true);
assert.equal(balancedSignals.primaryPresentIn.seoDescription, true);
assert.equal(balancedSignals.primaryOveruseSoft, false);
const greenBalanced = parseProductQualityReviewResult({
  status: "green",
  summary: "SEO в норме: тема понятна, без переспама.",
  issues: [],
  positiveNotes: ["Основной запрос встроен естественно в SEO-поля."],
});
assert.equal(greenBalanced?.status, "green");
assert.equal(PRODUCT_QUALITY_REVIEW_STATUS_COPY.green.title, "SEO в норме");

// C — RED stuffing
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
assert.equal(PRODUCT_QUALITY_REVIEW_STATUS_COPY.red.title, "Слишком много SEO-повторов");

// D — title=primary alone does not auto-green
assert.equal(weakSignals.titleEqualsPrimary, true);
assert.notEqual(yellowWeak.status, "green");

// E — primary need not be exact in every field for a green-capable package
const sparseExact = basePackage({
  seoTitle: "Спокойный фон для спа-салона",
  seoDescription: "Мягкие треки, чтобы отдохнуть после массажа в спа.",
  description: "Спокойные звуки поддерживают расслабление тела и дыхания.",
});
const sparseSignals = buildProductQualityReviewSignals(sparseExact);
assert.equal(sparseSignals.primaryPresentIn.title, true);
assert.equal(
  parseProductQualityReviewResult({
    status: "green",
    summary: "Тема передана естественно без exact primary в каждом поле.",
    issues: [],
    positiveNotes: [],
  })?.status,
  "green",
);

// F — thematic semantic wording can support green without many exact repeats
const thematicPkg = basePackage({
  description: "Спокойный спа-фон для массажа и мягкого отдыха тела.",
  seoTitle: "Спокойный фон для спа",
  seoDescription: "Мягкий фон для отдыха и массажа в спа-атмосфере.",
  usageItems: ["Во время массажа", "Для вечернего отдыха", "В паузе"],
  faqItems: [
    {
      question: "Это подходит для спа?",
      answer: "Да, как спокойный фон во время массажа и отдыха.",
    },
  ],
});
const thematicSignals = buildProductQualityReviewSignals(thematicPkg);
assert.ok(thematicSignals.primaryExactByField.total < stuffingSignals.primaryExactByField.total);
assert.equal(
  parseProductQualityReviewResult({
    status: "green",
    summary: "Тема выражена естественно через смысловые формулировки.",
    issues: [],
    positiveNotes: ["Тематические формулировки поддерживают intent."],
  })?.status,
  "green",
);

// G — no density / score / quota
assert.equal("density" in PRODUCT_QUALITY_REVIEW_JSON_SCHEMA.properties, false);
assert.equal("score" in PRODUCT_QUALITY_REVIEW_JSON_SCHEMA.properties, false);
assert.equal("quota" in PRODUCT_QUALITY_REVIEW_JSON_SCHEMA.properties, false);
assert.equal("density" in weakSignals, false);
assert.equal("score" in weakSignals, false);

// H — yellow recommendations are concrete placements, not N-times rules
assert.match(yellowWeak.issues[0].recommendation, /естественно/i);
assert.doesNotMatch(
  yellowWeak.issues.map((i) => i.recommendation).join("\n"),
  /добавьте ключ \d+/i,
);

const near = parseProductQualityReviewRequest({
  authorId: AURAFON_AUTHOR_ID,
  ...basePackage({
    description:
      "музыка для спа, музыка для засыпания, музыка чтобы уснуть, треки для спокойного сна",
  }),
});
assert.equal(near.ok, true);

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

const tooMany = parseProductQualityReviewResult({
  status: "yellow",
  summary: "Поисковая тема выражена слабо.",
  issues: Array.from({ length: 8 }, (_, i) => ({
    severity: "warning",
    field: "whole_package",
    message: `msg ${i}`,
    recommendation: `Добавьте тему естественно в поле ${i}.`,
  })),
  positiveNotes: [],
});
assert.equal(tooMany?.issues.length, 5);

assert.equal(
  parseProductQualityReviewResult({
    status: "green",
    summary: "SEO score 82/100",
    issues: [],
    positiveNotes: [],
  }),
  null,
);

const natural = balanced;

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

// Prompt contract — balance scale
const prompt = buildProductQualityReviewSystemPrompt();
assert.match(prompt, /весь пакет|TEXT PACKAGE|весь пакет вместе|Оценивай весь пакет/i);
assert.match(prompt, /НЕ используй произвольные пороги keyword density/i);
assert.match(prompt, /fixed occurrence quotas/i);
assert.match(prompt, /Exact-match repetition alone is not enough/i);
assert.match(prompt, /near-synonym stuffing|Near-synonym stuffing/i);
assert.match(prompt, /underoptimization|YELLOW = SEO СЛИШКОМ СЛАБОЕ/i);
assert.match(prompt, /YELLOW НЕ означает borderline overoptimization/);
assert.match(prompt, /GREEN = SEO СБАЛАНСИРОВАНО/);
assert.match(prompt, /RED = SEO ПЕРЕОПТИМИЗИРОВАНО/);
assert.match(prompt, /exact phrase everywhere/i);
assert.match(prompt, /не суди ранжирование|Не суди ранжирование/i);

// UI copy for traffic light (balance semantics)
assert.equal(PRODUCT_QUALITY_REVIEW_STATUS_COPY.green.title, "SEO в норме");
assert.equal(PRODUCT_QUALITY_REVIEW_STATUS_COPY.yellow.title, "SEO слишком слабое");
assert.equal(PRODUCT_QUALITY_REVIEW_STATUS_COPY.red.title, "Слишком много SEO-повторов");
assert.equal(
  PRODUCT_QUALITY_REVIEW_STATUS_COPY.green.subtitle,
  "Поисковые запросы используются естественно. Текст хорошо передаёт тему продукта без лишних повторов.",
);
assert.equal(
  PRODUCT_QUALITY_REVIEW_STATUS_COPY.yellow.subtitle,
  "Поисковая тема выражена недостаточно. Добавьте основной или дополнительный запрос в подходящие места текста естественным языком.",
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

// UX follow-up — final Step 3 position + copy (A–J)
assert.equal(PRODUCT_QUALITY_REVIEW_BLOCK_TITLE, "Финальная проверка SEO");
assert.equal(
  PRODUCT_QUALITY_REVIEW_HELPER,
  "Проверьте оформление продукта перед сохранением. Система покажет, достаточно ли поисковых запросов и нет ли переспама.",
);
assert.equal(
  PRODUCT_QUALITY_REVIEW_HELPER_WHY,
  "Это важно, чтобы Яндексу было проще правильно определить тему страницы и чтобы переоптимизация не ухудшала её видимость в поиске.",
);
assert.match(PRODUCT_QUALITY_REVIEW_HELPER, /Проверьте оформление продукта перед сохранением/);
assert.match(PRODUCT_QUALITY_REVIEW_HELPER_WHY, /Яндексу было проще правильно определить тему страницы/);
assert.match(PRODUCT_QUALITY_REVIEW_HELPER_WHY, /переоптимизация не ухудшала её видимость/);
assert.doesNotMatch(PRODUCT_QUALITY_REVIEW_HELPER + PRODUCT_QUALITY_REVIEW_HELPER_WHY, /заблокирует|гарант/i);
assert.equal(PRODUCT_QUALITY_REVIEW_CTA, "Проверить SEO");
assert.equal(PRODUCT_QUALITY_REVIEW_LOADING, "Проверяем…");
assert.equal(PRODUCT_QUALITY_REVIEW_CTA_AGAIN, "Проверить снова");
assert.match(section, /PRODUCT_QUALITY_REVIEW_BLOCK_TITLE/);
assert.match(section, /PRODUCT_QUALITY_REVIEW_HELPER_WHY/);
assert.match(section, /PRODUCT_QUALITY_REVIEW_CTA/);
// A/B — review block after FAQ + recommendations/related; not immediately after generator
const generateIdx = section.indexOf("PRODUCT_SEO_GENERATE_CTA");
const faqIdx = section.indexOf("Вопросы и ответы");
const recommendationsIdx = section.indexOf("Рекомендации автора");
const relatedSearchIdx = section.indexOf('id="related-product-search"');
const reviewBlockIdx = section.indexOf("{qualityReviewEnabled ? (");
assert.ok(generateIdx > 0);
assert.ok(faqIdx > generateIdx);
assert.ok(recommendationsIdx > faqIdx);
assert.ok(relatedSearchIdx > recommendationsIdx);
assert.ok(reviewBlockIdx > relatedSearchIdx);
assert.ok(reviewBlockIdx > recommendationsIdx);
assert.ok(reviewBlockIdx > faqIdx);
const betweenGenAndReview = section.slice(generateIdx, reviewBlockIdx);
assert.match(betweenGenAndReview, /Заголовок для поиска/);
assert.match(betweenGenAndReview, /Описание для поиска/);
assert.match(betweenGenAndReview, /Вопросы и ответы/);
assert.match(betweenGenAndReview, /Рекомендации автора/);
assert.match(betweenGenAndReview, /id="related-product-search"/);
// H — stale semantics preserved
assert.match(section, /reviewIsStale/);
assert.match(section, /PRODUCT_QUALITY_REVIEW_STALE_MESSAGE/);
assert.match(section, /!reviewIsStale && reviewStatus/);
// I — traffic-light titles unchanged (already asserted above)
// J — review does not block save/publish in SEO section or form
assert.doesNotMatch(section, /reviewStatus === "red".*disabled|disabled.*reviewStatus === "red"/);
assert.doesNotMatch(read("src/components/author-dashboard/AuthorProductForm.tsx"), /reviewStatus|qualityReviewEnabled|product-quality-review/);

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



// --- Description stuffing + terminology (live bug follow-up) ---

function buildLiveLikeStuffedDescription() {
  const chunks = [
    "Музыка для крепкого сна помогает мягко перейти ко сну после долгого дня.",
    "Слушайте музыка для крепкого сна в тихой комнате без яркого света.",
    "Релакс музыка для крепкого сна создаёт спокойный фон для вечера.",
    "Музыка для крепкого и глубокого сна поддерживает медленное дыхание.",
    "Музыка для крепкого сна слушать онлайн удобно дома и в дороге.",
    "Эта музыка для крепкого сна подходит, когда хочется тишины и покоя.",
    "Музыка для крепкого сна, музыка для крепкого и глубокого сна, релакс музыка для крепкого сна.",
    "Ещё раз: музыка для крепкого сна звучит мягко и ровно всю ночь.",
    "Музыка для крепкого сна помогает телу замедлиться перед отдыхом.",
    "Выбирайте музыка для крепкого сна, если нужен спокойный ночной фон.",
  ];
  // Stretch toward live-like length without inventing density % rules.
  return Array.from({ length: 3 }, () => chunks.join(" ")).join(" ");
}

const liveLikePkg = basePackage({
  title: "Музыка для крепкого сна",
  seoPrimaryQuery: "музыка для крепкого сна",
  seoSecondaryQueries: ["спокойная музыка для сна"],
  description: buildLiveLikeStuffedDescription(),
  seoTitle: "Музыка для крепкого сна – мягкий фон на ночь",
  seoDescription:
    "Спокойная музыка для крепкого сна: мягкий фон, чтобы отдохнуть вечером.",
  usageItems: [
    "Перед сном в тихой комнате",
    "После долгого рабочего дня",
    "В спокойном вечернем ритуале",
  ],
  faqItems: [
    {
      question: "Когда лучше включать трек?",
      answer: "Вечером, когда хочется спокойно отдохнуть без спешки.",
    },
    {
      question: "Нужны ли наушники?",
      answer: "Можно слушать в колонках или в наушниках — как удобнее.",
    },
  ],
});
assert.ok(liveLikePkg.description.length >= 1200);
const liveLikeSignals = buildProductQualityReviewSignals(liveLikePkg);
assert.equal(liveLikeSignals.structuralStuffing.material, true);
assert.equal(liveLikeSignals.structuralStuffing.description.material, true);
assert.equal(liveLikeSignals.primaryPresentIn.seoTitle, true);
assert.equal(liveLikeSignals.primaryPresentIn.seoDescription, true);
// A — live-like RED description; good other fields cannot mask stuffing
{
  const reconciled = reconcileProductQualityReviewResult(
    {
      status: "green",
      summary: "SEO в норме",
      issues: [
        {
          severity: "warning",
          field: "usage",
          message: "Добавьте основной запрос в usage.",
          recommendation:
            "Основной запрос можно упомянуть в пунктах списка usage.",
        },
      ],
      positiveNotes: ["Добавьте ещё ключ в текст"],
    },
    liveLikeSignals,
  );
  assert.equal(reconciled.status, "red");
  assert.equal(
    reconciled.issues.some((issue) => issue.field === "description"),
    true,
  );
  assert.equal(
    reconciled.issues[0]?.message,
    DESCRIPTION_STUFFING_ISSUE_MESSAGE,
  );
  const joined = [
    reconciled.summary,
    ...reconciled.issues.map((i) => `${i.message}\n${i.recommendation}`),
    ...reconciled.positiveNotes,
  ].join("\n");
  assert.doesNotMatch(joined, /\busage\b/);
  assert.doesNotMatch(joined, /\bFAQ\b/);
  assert.doesNotMatch(joined, /\bfaq\b/);
  assert.doesNotMatch(joined, /добавьте\s+(ещё\s+)?(основной\s+|дополнительн\w*\s+)?(поисков\w*\s+)?(запрос|ключ)/i);
}

// B — model GREEN + material stuffing → server RED
{
  const reconciled = reconcileProductQualityReviewResult(
    {
      status: "green",
      summary: "Всё хорошо.",
      issues: [],
      positiveNotes: [],
    },
    liveLikeSignals,
  );
  assert.equal(reconciled.status, "red");
}

// C — model YELLOW + material stuffing → RED
{
  const reconciled = reconcileProductQualityReviewResult(
    {
      status: "yellow",
      summary: "Тема слабая.",
      issues: [],
      positiveNotes: [],
    },
    liveLikeSignals,
  );
  assert.equal(reconciled.status, "red");
}

// D — primary once + natural thematic words → NOT force red
{
  const once = basePackage({
    seoPrimaryQuery: "музыка для крепкого сна",
    description:
      "Спокойный фон помогает вечером расслабить тело. Мягкие звуки поддерживают отдых. Один раз естественно: музыка для крепкого сна звучит мягко.",
    seoTitle: "Музыка для крепкого сна – мягкий фон",
    seoDescription: "Спокойная музыка для крепкого сна на вечер.",
  });
  const signals = buildProductQualityReviewSignals(once);
  assert.equal(signals.structuralStuffing.description.material, false);
  assert.equal(signals.structuralStuffing.material, false);
  const reconciled = reconcileProductQualityReviewResult(
    {
      status: "green",
      summary: "SEO в норме.",
      issues: [],
      positiveNotes: [],
    },
    signals,
  );
  assert.equal(reconciled.status, "green");
}

// E — several natural synonyms without query-chain → NOT force red
{
  const synonyms = basePackage({
    seoPrimaryQuery: "музыка для крепкого сна",
    description:
      "Спокойный фон помогает вечером расслабить тело и дыхание. Мягкие звуки поддерживают отдых после долгого дня. Тихая атмосфера подходит для домашнего вечера без спешки и лишней спешки.",
  });
  const signals = buildProductQualityReviewSignals(synonyms);
  assert.equal(signals.structuralStuffing.material, false);
}

// F — comma-separated keyword list → RED
{
  const listed = basePackage({
    seoPrimaryQuery: "музыка для крепкого сна",
    description:
      "музыка для крепкого сна, музыка для крепкого и глубокого сна, релакс музыка для крепкого сна, музыка для крепкого сна слушать онлайн, спокойная музыка для сна",
  });
  const signals = buildProductQualityReviewSignals(listed);
  assert.equal(signals.structuralStuffing.description.keywordListPattern, true);
  assert.equal(signals.structuralStuffing.description.material, true);
  assert.equal(
    reconcileProductQualityReviewResult(
      { status: "green", summary: "ok", issues: [], positiveNotes: [] },
      signals,
    ).status,
    "red",
  );
}

// G — near-duplicate query chain → RED
{
  const chain = basePackage({
    seoPrimaryQuery: "музыка для крепкого сна",
    description: [
      "Музыка для крепкого сна для вечера.",
      "Музыка для крепкого и глубокого сна дома.",
      "Релакс музыка для крепкого сна онлайн.",
      "Музыка для крепкого сна слушать онлайн.",
    ].join(" "),
  });
  const signals = buildProductQualityReviewSignals(chain);
  assert.equal(
    signals.structuralStuffing.description.nearDuplicateChain ||
      signals.structuralStuffing.description.neighboringSentenceRepeats ||
      signals.structuralStuffing.description.material,
    true,
  );
  assert.equal(signals.structuralStuffing.material, true);
}

// H — RED issue field=description but user-facing says «Описание продукта»
{
  const reconciled = reconcileProductQualityReviewResult(
    {
      status: "green",
      summary: "ok",
      issues: [],
      positiveNotes: [],
    },
    liveLikeSignals,
  );
  const descIssue = reconciled.issues.find((issue) => issue.field === "description");
  assert.ok(descIssue);
  assert.match(descIssue.message, /Описание продукта/i);
  assert.doesNotMatch(descIssue.message, /`description`/);
  assert.doesNotMatch(descIssue.message, /\bfield\s*=\s*description\b/);
}

// I–R terminology
{
  const dirty = humanizeProductQualityReviewText(
    "Добавьте primary query в usage и FAQ. Смотрите seoDescription и seoTitle. Проблема в description.",
  );
  assert.doesNotMatch(dirty, /\busage\b/);
  assert.doesNotMatch(dirty, /\bFAQ\b/);
  assert.doesNotMatch(dirty, /\bfaq\b/);
  assert.doesNotMatch(dirty, /\bseoDescription\b/);
  assert.doesNotMatch(dirty, /\bseoTitle\b/);
  assert.doesNotMatch(dirty, /\bdescription\b/);
  assert.doesNotMatch(dirty, /\bprimary\b/i);
  assert.match(dirty, /Когда слушать/);
  assert.match(dirty, /Вопросы и ответы/);
  assert.match(dirty, /описание для поиска/i);
  assert.match(dirty, /заголовок для поиска/i);
  assert.match(dirty, /описание продукта/i);

  assert.equal(getProductQualityReviewFieldLabel("usage"), "Когда слушать");
  assert.equal(getProductQualityReviewFieldLabel("faq"), "Вопросы и ответы");
  assert.equal(getProductQualityReviewFieldLabel("description"), "Описание продукта");
  assert.equal(
    getProductQualityReviewFieldLabel("seoDescription"),
    "Описание для поиска",
  );
  assert.equal(getProductQualityReviewFieldLabel("seoTitle"), "Заголовок для поиска");
}

// S — at RED no primary «добавьте ещё ключи» advice
{
  const reconciled = reconcileProductQualityReviewResult(
    {
      status: "red",
      summary: "Переспам",
      issues: [
        {
          severity: "critical",
          field: "description",
          message: "Слишком много повторов.",
          recommendation: "Добавьте ещё поисковый запрос в текст.",
        },
      ],
      positiveNotes: [],
    },
    liveLikeSignals,
  );
  assert.equal(reconciled.status, "red");
  assert.equal(
    reconciled.issues.every(
      (issue) =>
        !/добавьте\s+(ещё\s+)?(основной\s+|дополнительн\w*\s+)?(поисков\w*\s+)?(запрос|ключ)/i.test(
          issue.recommendation,
        ),
    ),
    true,
  );
}

// T — green/yellow semantics otherwise preserved (no false stuffing)
{
  assert.equal(
    reconcileProductQualityReviewResult(
      {
        status: "yellow",
        summary: "Тема слабая.",
        issues: [
          {
            severity: "warning",
            field: "seoDescription",
            message: "Основной запрос почти не отражён.",
            recommendation:
              "Добавьте основной поисковый запрос естественно в описание для поиска.",
          },
        ],
        positiveNotes: [],
      },
      buildProductQualityReviewSignals(weakSeo),
    ).status,
    "yellow",
  );
  assert.equal(PRODUCT_QUALITY_REVIEW_STATUS_COPY.green.title, "SEO в норме");
  assert.equal(PRODUCT_QUALITY_REVIEW_STATUS_COPY.yellow.title, "SEO слишком слабое");
  assert.equal(
    PRODUCT_QUALITY_REVIEW_STATUS_COPY.red.title,
    "Слишком много SEO-повторов",
  );
}

// Prompt forbids internal names + prioritizes description
{
  const systemPrompt = buildProductQualityReviewSystemPrompt();
  assert.match(systemPrompt, /основное описание продукта/i);
  assert.match(systemPrompt, /не компенсируй переспам/i);
  assert.match(systemPrompt, /НИКОГДА не используй внутренние имена/i);
  assert.match(systemPrompt, /Когда слушать/);
  assert.match(systemPrompt, /Вопросы и ответы/);
  assert.doesNotMatch(systemPrompt, /\d+\s*%\s*=\s*red/i);
  assert.match(systemPrompt, /НЕ используй произвольные пороги keyword density/i);
}

// No density threshold constants in structural module
{
  const structuralSrc = read(
    "src/lib/seo/product-quality-review/structural-stuffing.ts",
  );
  assert.doesNotMatch(structuralSrc, /\b3%\b/);
  assert.doesNotMatch(structuralSrc, /\b5%\b/);
  assert.doesNotMatch(structuralSrc, /keywordDensity/);
  assert.doesNotMatch(structuralSrc, /seoScore|SEO score/i);
}

// Orchestrate path applies reconcile (mock GREEN on stuffed package → RED)
{
  const fetchImpl = mockFetch([
    () => jsonResponse(200, yandexAlt(validReviewJson)),
  ]);
  const result = await reviewProductTextQualityForRequest(
    { authorId: AURAFON_AUTHOR_ID, ...liveLikePkg },
    { fetchImpl, env: yandexEnv },
  );
  assert.equal(result.ok, true);
  assert.equal(result.result.status, "red");
  assert.equal(
    result.result.issues.some((issue) => issue.field === "description"),
    true,
  );
}


console.log("product-seo-quality-review-unit: ok");
