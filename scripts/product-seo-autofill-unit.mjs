#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateProductSeoDraft,
  normalizeManualSecondaryQueries,
  parseProductSeoAutofillRequest,
} from "../src/lib/seo/product-autofill/orchestrate.ts";
import {
  buildProductSeoRepairPrompt,
  buildProductSeoSystemPrompt,
  PRODUCT_SEO_AI_JSON_SCHEMA,
} from "../src/lib/seo/product-autofill/prompt.ts";
import { createProductSeoAiRateLimitStore } from "../src/lib/seo/product-autofill/rate-limit.ts";
import {
  faqAnswerIsQuestion,
  faqAnswerRepeatsQuestion,
  normalizeProductSeoValidationIssue,
  parseProductSeoAiRawDraft,
  validateProductSeoAiDraft,
} from "../src/lib/seo/product-autofill/validate.ts";
import {
  createDefaultProductSeoStyleProfile,
  sanitizeProductSeoStyleProfile,
} from "../src/lib/seo/product-autofill/style-profile.ts";

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
const config = { enabledFlag: true, provider: "openai", canCall: true, model: "test-model" };
const validDraft = (overrides = {}) => ({
  seoTitle: "Медитация для сна перед вечерним отдыхом",
  seoDescription: "Медитация для сна помогает мягко завершить день и настроиться на спокойный вечерний отдых.",
  usageItems: [{ content: "Перед сном" }, { content: "После напряжённого дня" }, { content: "Во время вечернего отдыха" }],
  faqItems: [
    { question: "Как слушать медитация для сна?", answer: "Выберите тихое место и удобное положение.", anchor: "kak-slushat" },
    { question: "Когда лучше включать практику?", answer: "Включите её в привычное время вечернего отдыха.", anchor: "kogda" },
    { question: "Нужен ли опыт?", answer: "Практика подходит для спокойного знакомства с форматом.", anchor: "opyt" },
  ],
  ...overrides,
});
const input = (overrides = {}) => ({
  primaryQuery: request.seoPrimaryQuery,
  title: request.title,
  subtitle: request.subtitle,
  description: request.description,
  productKind: request.productKind,
  usageItems: request.usageItems,
  manualSecondaryQueries: request.seoSecondaryQueries,
  ...overrides,
});

// Manual secondary phrases are author-owned: canonicalize them, never generate them.
assert.deepEqual(normalizeManualSecondaryQueries(["  практика перед сном  ", "ПРАКТИКА ПЕРЕД СНОМ", "медитация для сна", 4, ""], request.seoPrimaryQuery), ["практика перед сном"]);
const parsed = parseProductSeoAutofillRequest({ ...request, locked: false });
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.request.seoSecondaryQueries, ["практика перед сном", "Вечерняя медитация"]);
assert.equal("locked" in parsed.request, false);
assert.equal(parseProductSeoAutofillRequest({ title: "x" }).ok, false);
assert.equal(parseProductSeoAutofillRequest({ ...request, styleProfile: { preset: "invalid" } }).ok, false);
assert.equal(sanitizeProductSeoStyleProfile({ preset: "invalid" }).ok, false);
assert.equal(createDefaultProductSeoStyleProfile().preset, "balanced");

// AI schema and prompts have text-only output and never mention retired Wordstat mechanics.
assert.deepEqual(PRODUCT_SEO_AI_JSON_SCHEMA.required, ["seoTitle", "seoDescription", "usageItems", "faqItems"]);
assert.equal("secondaryQueries" in PRODUCT_SEO_AI_JSON_SCHEMA.properties, false);
const prompt = buildProductSeoSystemPrompt({ request: parsed.request });
assert.doesNotMatch(prompt, /Wordstat|Яндекса|secondaryQueries|кандидат/i);
assert.match(prompt, /usageItems: ровно 3/);
assert.match(prompt, /faqItems: ровно 3/);
assert.match(prompt, /не возвращай поле seoAbout/);
assert.match(buildProductSeoRepairPrompt({ request: parsed.request }, validDraft(), ["faq_answer_is_question"]), /измени только faqItems.answer/);

// Validator keeps all safety constraints, including FAQ-answer safety and grounded content.
const validated = validateProductSeoAiDraft(validDraft(), input());
assert.equal(validated.ok, true);
assert.deepEqual(validated.draft.seoSecondaryQueries, request.seoSecondaryQueries);
assert.equal("secondaryQueryStatus" in validated.draft, false);
assert.equal(validateProductSeoAiDraft(validDraft({ seoTitle: "Спокойный вечер" }), input()).issues.includes("primary_missing_from_title"), true);
assert.equal(validateProductSeoAiDraft(validDraft({ seoDescription: "Лечит бессонницу и гарантирует результат." }), input()).issues.some((issue) => issue.startsWith("banned_claim:")), true);
assert.equal(validateProductSeoAiDraft(validDraft({ seoDescription: "Медитация для сна за 30 минут подходит для вечера." }), input()).issues.some((issue) => issue.startsWith("ungrounded:duration:")), true);
assert.equal(validateProductSeoAiDraft(validDraft({ faqItems: validDraft().faqItems.map((item, index) => index ? item : { ...item, answer: item.question }) }), input()).issues.includes("faq_answer_repeats_question"), true);
assert.equal(validateProductSeoAiDraft(validDraft({ faqItems: validDraft().faqItems.map((item, index) => index ? item : { ...item, answer: "Когда лучше слушать?" }) }), input()).issues.includes("faq_answer_is_question"), true);
assert.equal(faqAnswerRepeatsQuestion("Когда лучше слушать эту практику?", "Когда лучше слушать эту практику?"), true);
assert.equal(faqAnswerIsQuestion("Можно ли слушать вечером?"), true);
assert.equal(normalizeProductSeoValidationIssue("invented_secondary:user phrase"), "invented_secondary");
assert.equal(normalizeProductSeoValidationIssue("ungrounded:price:99 рублей"), "ungrounded:price");
assert.equal(parseProductSeoAiRawDraft({ seoTitle: "x" }), null);

const calls = [];
const provider = {
  async generate(promptInput) { calls.push({ kind: "generate", promptInput }); return { ok: true, draft: validDraft(), raw: {} }; },
  async repair(promptInput, previous, issues) {
    calls.push({ kind: "repair", promptInput, previous, issues });
    return { ok: true, draft: validDraft({ faqItems: validDraft().faqItems.map((item, index) => index ? item : { ...item, answer: "Слушайте в спокойной обстановке." }) }), raw: {} };
  },
};
const generated = await generateProductSeoDraft(parsed.request, { userId: "author", config, provider, aiRateLimit: createProductSeoAiRateLimitStore() });
assert.equal(generated.ok, true);
assert.deepEqual(generated.data.seoSecondaryQueries, ["практика перед сном", "Вечерняя медитация"]);
assert.equal(calls.length, 1);
assert.equal("candidates" in calls[0].promptInput, false);

// A narrow FAQ repair may change only the invalid answer, preserving valid generated text.
const repaired = await generateProductSeoDraft(parsed.request, {
  userId: "author-repair", config,
  provider: { ...provider, async generate() { return { ok: true, draft: validDraft({ faqItems: validDraft().faqItems.map((item, index) => index ? item : { ...item, answer: item.question }) }), raw: {} }; } },
  aiRateLimit: createProductSeoAiRateLimitStore(),
});
assert.equal(repaired.ok, true);
assert.equal(repaired.data.faqItems[0].answer, "Слушайте в спокойной обстановке.");
assert.equal(repaired.data.faqItems[1].answer, validDraft().faqItems[1].answer);

const noPrimary = await generateProductSeoDraft({ ...parsed.request, seoPrimaryQuery: "", seoSecondaryQueries: [] }, { userId: "author-no-primary", config, provider, aiRateLimit: createProductSeoAiRateLimitStore() });
assert.equal(noPrimary.ok, true);
assert.deepEqual(noPrimary.data.seoSecondaryQueries, []);
const disabled = await generateProductSeoDraft(parsed.request, { userId: "disabled", config: { ...config, enabledFlag: false }, provider, aiRateLimit: createProductSeoAiRateLimitStore() });
assert.equal(disabled.error.code, "AI_DISABLED");

// UI/API architecture: no Product SEO Wordstat calls or UI; manual inputs go to AI text endpoint.
const section = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.match(section, /Основной поисковый запрос/);
assert.match(section, /Дополнительные поисковые фразы/);
assert.match(section, /Введите одну или несколько фраз/);
assert.match(section, /api\/author\/seo\/product-autofill/);
assert.doesNotMatch(section, /Wordstat|wordstat|Подобрать похожие|api\/author\/seo\/wordstat/);
assert.doesNotMatch(read("src/lib/seo/product-autofill/orchestrate.ts"), /wordstat|Wordstat|candidates/i);
assert.doesNotMatch(read("src/lib/seo/product-autofill/prompt.ts"), /secondaryQueries|кандидат|Wordstat|Яндекса/i);
assert.doesNotMatch(read("src/app/api/author/seo/product-autofill/route.ts"), /secondaryQueryStatus/);
console.log("product-seo-autofill-unit: ok");
