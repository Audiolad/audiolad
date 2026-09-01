#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateProductSeoDraft,
  normalizeLockedSecondaryQueries,
  parseProductSeoAutofillRequest,
} from "../src/lib/seo/product-autofill/orchestrate.ts";
import {
  buildProductSeoSystemPrompt,
  PRODUCT_SEO_AI_JSON_SCHEMA,
} from "../src/lib/seo/product-autofill/prompt.ts";
import { createProductSeoAiRateLimitStore } from "../src/lib/seo/product-autofill/rate-limit.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const request = {
  title: "Вечерняя практика",
  subtitle: "Для спокойного завершения дня",
  description: "Аудиопрактика помогает мягко переключиться на отдых.",
  productKind: "practice",
  seoPrimaryQuery: "медитация для сна",
  seoSecondaryQueries: ["  практика перед сном  ", "Вечерняя медитация"],
  usageItems: [],
};
const validDraft = (overrides = {}) => ({
  seoTitle: "Медитация для сна перед вечерним отдыхом",
  seoDescription: "Медитация для сна помогает мягко завершить день и настроиться на спокойный вечерний отдых.",
  usageItems: [
    { content: "Перед сном" },
    { content: "После напряжённого дня" },
    { content: "Во время вечернего отдыха" },
  ],
  faqItems: [
    {
      question: "Как слушать медитация для сна?",
      answer: "Выберите тихое место и удобное положение.",
      anchor: "kak-slushat",
    },
    {
      question: "Когда лучше включать практику?",
      answer: "Включите её в привычное время вечернего отдыха.",
      anchor: "kogda",
    },
    {
      question: "Нужен ли опыт?",
      answer: "Практика подходит для спокойного знакомства с форматом.",
      anchor: "opyt",
    },
  ],
  ...overrides,
});
const config = {
  enabledFlag: true,
  provider: "openai",
  canCall: true,
  model: "test-model",
};

const parsed = parseProductSeoAutofillRequest({ ...request, locked: false });
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.request.seoSecondaryQueries, [
  "практика перед сном",
  "Вечерняя медитация",
]);
assert.equal("locked" in parsed.request, false);
assert.deepEqual(
  normalizeLockedSecondaryQueries(
    ["  практика перед сном  ", "ПРАКТИКА ПЕРЕД СНОМ", "медитация для сна"],
    "медитация для сна",
  ),
  ["практика перед сном"],
);

const schema = PRODUCT_SEO_AI_JSON_SCHEMA;
assert.deepEqual(schema.required, ["seoTitle", "seoDescription", "usageItems", "faqItems"]);
assert.equal("secondaryQueries" in schema.properties, false);

const prompt = buildProductSeoSystemPrompt({ request: parsed.request });
assert.doesNotMatch(prompt, /Wordstat|Яндекса|secondaryQueries|кандидат/i);
assert.match(prompt, /usageItems: ровно 3/);
assert.match(prompt, /faqItems: ровно 3/);

const calls = [];
const provider = {
  async generate(input) {
    calls.push({ kind: "generate", input });
    return { ok: true, draft: validDraft(), raw: {} };
  },
  async repair(input, previous, issues) {
    calls.push({ kind: "repair", input, previous, issues });
    return {
      ok: true,
      draft: validDraft({
        faqItems: validDraft().faqItems.map((item, index) =>
          index === 0 ? { ...item, answer: "Слушайте в спокойной обстановке." } : item,
        ),
      }),
      raw: {},
    };
  },
};

const result = await generateProductSeoDraft(parsed.request, {
  userId: "author",
  config,
  provider,
  aiRateLimit: createProductSeoAiRateLimitStore(),
});
assert.equal(result.ok, true);
assert.deepEqual(result.data.seoSecondaryQueries, [
  "практика перед сном",
  "Вечерняя медитация",
]);
assert.equal(calls.length, 1);
assert.equal("candidates" in calls[0].input, false);

const repairProvider = {
  ...provider,
  async generate() {
    return {
      ok: true,
      draft: validDraft({
        faqItems: validDraft().faqItems.map((item, index) =>
          index === 0 ? { ...item, answer: item.question } : item,
        ),
      }),
      raw: {},
    };
  },
};
const repaired = await generateProductSeoDraft(parsed.request, {
  userId: "author-repair",
  config,
  provider: repairProvider,
  aiRateLimit: createProductSeoAiRateLimitStore(),
});
assert.equal(repaired.ok, true);
assert.equal(repaired.data.faqItems[0].answer, "Слушайте в спокойной обстановке.");

const section = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.doesNotMatch(section, /Wordstat|wordstat|Яндекс|Подобрать похожие/);
assert.doesNotMatch(section, /api\/author\/seo\/wordstat/);
assert.match(section, /Основной поисковый запрос/);
assert.match(section, /Дополнительные поисковые фразы/);
assert.match(section, /api\/author\/seo\/product-autofill/);
assert.doesNotMatch(read("src/lib/seo/product-autofill/orchestrate.ts"), /wordstat|Wordstat|candidates/i);
assert.doesNotMatch(read("src/lib/seo/product-autofill/prompt.ts"), /secondaryQueries|кандидат|Wordstat|Яндекса/i);
assert.doesNotMatch(read("src/app/api/author/seo/product-autofill/route.ts"), /secondaryQueryStatus/);

console.log("product-seo-autofill-unit: ok");
