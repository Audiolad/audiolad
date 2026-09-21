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
import { buildProductQualityReviewSignals } from "../src/lib/seo/product-quality-review/signals.ts";
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

// K — generation path clears review: SeoSection must reset fingerprint (source contract)
const section = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.match(section, /setReviewedFingerprint\(null\)/);
assert.match(section, /applyGeneratedDraft/);
assert.match(section, /PRODUCT_QUALITY_REVIEW_STALE_MESSAGE/);

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

console.log("product-seo-quality-review-unit: ok");
