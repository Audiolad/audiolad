#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AURAFON_AUTHOR_ID,
  isAuthorSeoDiscoveryEnabled,
} from "../src/lib/seo-queries/discovery-beta.ts";
import {
  AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE,
  SEO_PROMPT_EMPTY_RELATED,
  SEO_PROMPT_SECONDARY_CANDIDATE_LIMIT,
  SEO_PROMPT_SECONDARY_SELECT_LIMIT,
  buildAuthorSeoProductPrompt,
  canBuildAuthorSeoProductPrompt,
  clampSecondarySeoSelection,
  formatProductSourceForPrompt,
  formatRelatedQueriesForPrompt,
  getAuthorSeoProductSourceGuidance,
  hasUnsafeSecondarySeoModifier,
  intentsIncompatible,
  isStrictSecondarySeoCandidate,
  listAuthorSeoPromptProductTypeOptions,
  suggestSecondarySeoQueriesForPrompt,
} from "../src/lib/seo-queries/author-seo-product-prompt.ts";
import { tokenizeSeoPhrase } from "../src/lib/seo-queries/discovery-ranking.ts";
import { SEO_DISCOVERY_IN_CHUNK_SIZE } from "../src/lib/seo-queries/author-discovery-repository.ts";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf8");

const builderUi = read("src/components/author-dashboard/AuthorSeoPromptBuilder.tsx");
const opportunitiesUi = read("src/components/author-dashboard/AuthorSeoOpportunitiesClient.tsx");
const discoveryPanel = read("src/components/author-dashboard/AuthorSeoDiscoveryPanel.tsx");
const dash = read("src/components/author-dashboard/AuthorDashboardClient.tsx");
const promptLib = read("src/lib/seo-queries/author-seo-product-prompt.ts");

assert.match(promptLib, /AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE/);
assert.equal(
  (promptLib.match(/Ты – SEO-редактор русскоязычной аудиоплатформы АудиоЛад/g) || []).length,
  1,
);
assert.doesNotMatch(builderUi, /Ты – SEO-редактор/);
assert.match(promptLib, /suggestSecondarySeoQueriesForPrompt/);
assert.match(promptLib, /isStrictSecondarySeoCandidate/);
assert.match(promptLib, /rankAnalyzedQueriesForSeed/);

const types = listAuthorSeoPromptProductTypeOptions();
assert.ok(types.includes("Аудиопрактика"));
assert.ok(types.includes("Медитация"));

assert.match(opportunitiesUi, /discoveryEnabled && own && item\.lifecycle === "in_progress"/);
assert.match(opportunitiesUi, /AuthorSeoPromptBuilder/);
assert.match(builderUi, /Сформировать SEO-промпт/);
assert.equal(isAuthorSeoDiscoveryEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorSeoDiscoveryEnabled("00000000-0000-4000-8000-000000000099"), false);

const jazzCandidates = [
  { id: "p", queryText: "лёгкий джаз", frequency: 800, intent: "listen", recommendedFormat: "Музыка", clusterName: "jazz" },
  { id: "1", queryText: "лёгкий джаз слушать", frequency: 400, intent: "listen", recommendedFormat: "Музыка", clusterName: "jazz" },
  { id: "2", queryText: "лёгкий джаз слушать онлайн", frequency: 350, intent: "listen", recommendedFormat: "Музыка", clusterName: "jazz" },
  { id: "3", queryText: "слушать лёгкий джаз", frequency: 300, intent: "listen", recommendedFormat: "Музыка", clusterName: "jazz" },
  { id: "4", queryText: "джаз для кафе", frequency: 500, intent: "ambient", recommendedFormat: "Музыка", clusterName: "cafe" },
  { id: "5", queryText: "джаз для отдыха", frequency: 700, intent: "relax", recommendedFormat: "Музыка", clusterName: "rest" },
  { id: "6", queryText: "музыка для йоги", frequency: 600, intent: "practice", recommendedFormat: "Медитация", clusterName: "yoga" },
  { id: "7", queryText: "лёгкая музыка для сна", frequency: 900, intent: "sleep", recommendedFormat: "Музыка", clusterName: "sleep" },
  { id: "8", queryText: "лёгкий джаз скачать бесплатно", frequency: 200, intent: "listen", recommendedFormat: "Музыка", clusterName: "jazz" },
];

const jazzSecondary = suggestSecondarySeoQueriesForPrompt({
  primaryQueryText: "лёгкий джаз",
  primaryQueryId: "p",
  primaryIntent: "music",
  primaryFormat: "Музыка",
  candidates: jazzCandidates,
});

// Compatibility gate: music ↔ listen_audio must NOT auto-reject
assert.equal(intentsIncompatible("music", "listen_audio"), false);
assert.equal(intentsIncompatible("music", "music"), false);

// A — music primary + listen_audio secondary with full lexical backbone
assert.equal(
  isStrictSecondarySeoCandidate({
    primaryTokens: tokenizeSeoPhrase("лёгкий джаз"),
    primaryIntent: "music",
    primaryFormat: "Музыка",
    candidateTokens: tokenizeSeoPhrase("лёгкий джаз слушать онлайн"),
    candidateIntent: "listen_audio",
    candidateFormat: "Музыка",
    score: 500,
    queryText: "лёгкий джаз слушать онлайн",
  }),
  true,
  "A: лёгкий джаз + listen_audio secondary must be eligible",
);
assert.ok(
  suggestSecondarySeoQueriesForPrompt({
    primaryQueryText: "лёгкий джаз",
    primaryQueryId: "p",
    primaryIntent: "music",
    primaryFormat: "Музыка",
    candidates: [
      { id: "p", queryText: "лёгкий джаз", frequency: 800, intent: "music", recommendedFormat: "Музыка" },
      {
        id: "a1",
        queryText: "лёгкий джаз слушать онлайн",
        frequency: 350,
        intent: "listen_audio",
        recommendedFormat: "Музыка",
      },
    ],
  }).some((item) => item.queryText === "лёгкий джаз слушать онлайн"),
  "A via suggest: listen_audio secondary eligible",
);

// B — compatible listen intent variant
assert.equal(
  isStrictSecondarySeoCandidate({
    primaryTokens: tokenizeSeoPhrase("лёгкий джаз"),
    primaryIntent: "music",
    candidateTokens: tokenizeSeoPhrase("слушать лёгкий джаз"),
    candidateIntent: "listen_audio",
    score: 400,
    queryText: "слушать лёгкий джаз",
  }),
  true,
  "B: слушать лёгкий джаз eligible with listen_audio",
);

// C — cafe scenario rejected by lexical backbone
assert.equal(
  isStrictSecondarySeoCandidate({
    primaryTokens: tokenizeSeoPhrase("лёгкий джаз"),
    primaryIntent: "music",
    candidateTokens: tokenizeSeoPhrase("джаз для кафе"),
    candidateIntent: "ambient",
    score: 200,
    queryText: "джаз для кафе",
  }),
  false,
  "C: джаз для кафе not eligible",
);

// D — yoga/meditation vs dances rejected by lexical backbone
assert.equal(
  isStrictSecondarySeoCandidate({
    primaryTokens: tokenizeSeoPhrase("музыка для танцев"),
    candidateTokens: tokenizeSeoPhrase("музыка для йоги и медитации"),
    score: 200,
    queryText: "музыка для йоги и медитации",
  }),
  false,
  "D: yoga/meditation not eligible for танцев",
);

// E — unsafe modifiers
assert.equal(hasUnsafeSecondarySeoModifier("лёгкий джаз скачать бесплатно"), true);
assert.equal(
  isStrictSecondarySeoCandidate({
    primaryTokens: tokenizeSeoPhrase("лёгкий джаз"),
    candidateTokens: tokenizeSeoPhrase("лёгкий джаз скачать бесплатно"),
    score: 500,
    queryText: "лёгкий джаз скачать бесплатно",
  }),
  false,
  "E: unsafe скачать/бесплатно not eligible",
);

// A (integration list)
assert.ok(
  jazzSecondary.some((item) => item.queryText === "лёгкий джаз слушать онлайн"),
  "лёгкий джаз слушать онлайн should be eligible",
);

// B
assert.ok(
  !jazzSecondary.some((item) => item.queryText === "джаз для кафе"),
  "джаз для кафе must not be eligible on one-token overlap",
);
assert.ok(!jazzSecondary.some((item) => item.queryText === "джаз для отдыха"));

// C
const danceSecondary = suggestSecondarySeoQueriesForPrompt({
  primaryQueryText: "музыка для танцев",
  primaryQueryId: "d0",
  candidates: [
    { id: "d0", queryText: "музыка для танцев", frequency: 1000 },
    { id: "d1", queryText: "музыка для йоги и медитации", frequency: 800 },
    { id: "d2", queryText: "музыка для танцев слушать", frequency: 400 },
  ],
});
assert.ok(!danceSecondary.some((item) => item.queryText === "музыка для йоги и медитации"));
assert.ok(danceSecondary.some((item) => item.queryText === "музыка для танцев слушать"));

// D — primary excluded
assert.ok(!jazzSecondary.some((item) => item.id === "p"));
assert.ok(!jazzSecondary.some((item) => item.queryText === "лёгкий джаз"));

// E — max 5 candidates
assert.ok(jazzSecondary.length <= SEO_PROMPT_SECONDARY_CANDIDATE_LIMIT);
assert.equal(SEO_PROMPT_SECONDARY_CANDIDATE_LIMIT, 5);

// F / G — select 0/1/2, not 3
assert.equal(SEO_PROMPT_SECONDARY_SELECT_LIMIT, 2);
assert.deepEqual(clampSecondarySeoSelection([]), []);
assert.deepEqual(clampSecondarySeoSelection(["a"]), ["a"]);
assert.deepEqual(clampSecondarySeoSelection(["a", "b"]), ["a", "b"]);
assert.deepEqual(clampSecondarySeoSelection(["a", "b", "c"]), ["a", "b"]);
assert.match(builderUi, /SEO_PROMPT_SECONDARY_SELECT_LIMIT/);
assert.match(builderUi, /selectionFull && !checked/);
assert.match(builderUi, /Выбрано:/);

// H / I — prompt only selected
const SAMPLE_SOURCE = [
  "Часть 1. Мягкий вступительный джазовый мотив на рояле.",
  "Часть 2. Лёгкий саксофон без ударных, спокойный темп.",
  "Часть 3. Завершение на тихих аккордах без слов.",
].join("\n");

const withTwo = buildAuthorSeoProductPrompt({
  seoQuery: "лёгкий джаз",
  productType: "Музыка",
  relatedQueries: ["лёгкий джаз слушать онлайн", "слушать лёгкий джаз"],
  productSource: SAMPLE_SOURCE,
});
assert.match(withTwo, /ДОПОЛНИТЕЛЬНЫЕ SEO-ЗАПРОСЫ:\nлёгкий джаз слушать онлайн\nслушать лёгкий джаз/);
assert.doesNotMatch(withTwo, /джаз для кафе/);
const withNone = buildAuthorSeoProductPrompt({
  seoQuery: "лёгкий джаз",
  productType: "Музыка",
  relatedQueries: [],
  productSource: SAMPLE_SOURCE,
});
assert.match(withNone, /ДОПОЛНИТЕЛЬНЫЕ SEO-ЗАПРОСЫ:\nне указаны/);
assert.equal(formatRelatedQueriesForPrompt([]), SEO_PROMPT_EMPTY_RELATED);

// J / K / L — secondary UI has no reservation / wordstat / discovery network
assert.doesNotMatch(builderUi, /\/api\/author\/seo-reservations/);
assert.doesNotMatch(builderUi, /\/api\/author\/seo\/discovery/);
assert.doesNotMatch(builderUi, /fetch\(/);
assert.doesNotMatch(builderUi, /fetchWordstatSuggestions/);
assert.match(builderUi, /selectedRelatedQueries/);

// M — unsafe modifiers excluded
assert.equal(hasUnsafeSecondarySeoModifier("лёгкий джаз скачать бесплатно"), true);
assert.equal(hasUnsafeSecondarySeoModifier("лёгкий джаз слушать онлайн"), false);
assert.ok(!jazzSecondary.some((item) => /скачать|бесплатно|без рекламы|офлайн/i.test(item.queryText)));

// N — reservation lifecycle untouched in this slice
assert.doesNotMatch(promptLib, /reserve_seo_query|release_seo_query|link_seo_reservation/);

assert.match(builderUi, /disabled=\{!canGenerate\}/);
assert.match(builderUi, /navigator\.clipboard\.writeText\(prompt\)/);
assert.match(builderUi, /Как работать с промптом/);
assert.doesNotMatch(builderUi, /iframe|VideoPlayer/i);
assert.match(discoveryPanel, /AuthorSeoPromptBuilder/);
assert.match(dash, /seoAnalyzedOpportunitiesByAuthorId/);
assert.equal(SEO_DISCOVERY_IN_CHUNK_SIZE, 8);
assert.ok(AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE.includes("{{RELATED_QUERIES}}"));
assert.ok(AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE.includes("{{PRODUCT_SOURCE}}"));

// --- PRODUCT_SOURCE single-field regressions ---
// A — UI no longer has «Краткие сведения»
assert.doesNotMatch(builderUi, /Краткие сведения о продукте/);
assert.doesNotMatch(builderUi, /Содержание продукта/);
assert.match(builderUi, /Материал продукта/);

// B — no productFacts state
assert.doesNotMatch(builderUi, /productFacts/);
assert.doesNotMatch(builderUi, /setProductFacts/);
assert.doesNotMatch(promptLib, /productFacts|PRODUCT_FACTS|formatProductFactsForPrompt|SEO_PROMPT_EMPTY_PRODUCT_FACTS/);

// C — template without PRODUCT_FACTS
assert.doesNotMatch(AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE, /PRODUCT_FACTS|\{\{PRODUCT_FACTS\}\}/);
assert.doesNotMatch(AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE, /КРАТКИЕ СВЕДЕНИЯ/);

// D / E — builder requires productSource; empty/whitespace throws
assert.equal(canBuildAuthorSeoProductPrompt({ productType: "", productSource: SAMPLE_SOURCE }), false);
assert.equal(canBuildAuthorSeoProductPrompt({ productType: "Музыка", productSource: "" }), false);
assert.equal(canBuildAuthorSeoProductPrompt({ productType: "Музыка", productSource: "   " }), false);
assert.equal(canBuildAuthorSeoProductPrompt({ productType: "Музыка", productSource: SAMPLE_SOURCE }), true);
assert.throws(
  () => formatProductSourceForPrompt(""),
  (err) => err instanceof Error && err.message === "seo_prompt_missing_product_source",
);
assert.throws(
  () =>
    buildAuthorSeoProductPrompt({
      seoQuery: "лёгкий джаз",
      productType: "Музыка",
      relatedQueries: [],
      productSource: "   ",
    }),
  (err) => err instanceof Error && err.message === "seo_prompt_missing_product_source",
);

// F — template PRODUCT_SOURCE block + critical grounding
assert.match(
  AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE,
  /ИСХОДНЫЙ МАТЕРИАЛ ПРОДУКТА:\n\{\{PRODUCT_SOURCE\}\}/,
);
assert.match(AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE, /Используй исходный материал как главный источник фактов/);
assert.match(AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE, /Не придумывай:/);
assert.match(AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE, /примерно 900–1000 символов, оптимально около 950/);

// G — verbatim, no truncation
const longSource = ("строка материала продукта. ".repeat(80)).trim();
assert.ok(longSource.length > 1200);
const grounded = buildAuthorSeoProductPrompt({
  seoQuery: "лёгкий джаз",
  productType: "Музыка",
  relatedQueries: ["лёгкий джаз слушать онлайн"],
  productSource: longSource,
});
assert.ok(grounded.includes(longSource));
assert.ok(grounded.indexOf(longSource) > grounded.indexOf("ИСХОДНЫЙ МАТЕРИАЛ ПРОДУКТА:"));
assert.equal(formatProductSourceForPrompt(`  ${SAMPLE_SOURCE}  `), SAMPLE_SOURCE);

// H — generate disabled without type or source
assert.match(builderUi, /canBuildAuthorSeoProductPrompt\(\{ productType, productSource \}\)/);
assert.match(builderUi, /disabled=\{!canGenerate\}/);

// I / J / K — dynamic guidance for real canonical labels
assert.ok(types.includes("Музыка"));
assert.ok(types.includes("Медитация"));
assert.ok(types.includes("Лекция") || types.includes("Авторский аудиоподкаст"));
assert.ok(types.includes("Аудиокурс"));

const musicGuide = getAuthorSeoProductSourceGuidance("Музыка");
assert.match(musicGuide.helper, /стиль/);
assert.match(musicGuide.helper, /настроение/);
assert.match(musicGuide.helper, /инструменты/);
assert.match(musicGuide.helper, /вокал/);

const practiceGuide = getAuthorSeoProductSourceGuidance("Медитация");
assert.match(practiceGuide.helper, /текст|сценарий/i);
assert.match(practiceGuide.helper, /структур/i);

const spokenLabel = types.includes("Лекция") ? "Лекция" : "Авторский аудиоподкаст";
const spokenGuide = getAuthorSeoProductSourceGuidance(spokenLabel);
assert.match(spokenGuide.helper, /тезис|расшифровк|текст/i);

const courseGuide = getAuthorSeoProductSourceGuidance("Аудиокурс");
assert.match(courseGuide.helper, /программ|модул/i);

const fallbackGuide = getAuthorSeoProductSourceGuidance("");
assert.match(fallbackGuide.helper, /текст, сценарий, структуру, основные тезисы/);
assert.notEqual(musicGuide.helper, practiceGuide.helper);
assert.notEqual(musicGuide.helper, courseGuide.helper);

assert.match(builderUi, /getAuthorSeoProductSourceGuidance/);
assert.match(builderUi, /sourceGuidance\.helper/);
assert.match(builderUi, /sourceGuidance\.placeholder/);
assert.match(builderUi, /data-testid="author-seo-product-source-guidance"/);

// L — large-material hint (attach full text/file separately to the LLM)
assert.match(builderUi, /Полный текст или файл при/);
assert.match(builderUi, /можно отдельно приложить к нейросети/);

// M — no file input/upload/storage
assert.doesNotMatch(builderUi, /type=["']file["']/);
assert.doesNotMatch(builderUi, /<input[^>]*type=\{?["']file["']\}?/);
assert.doesNotMatch(builderUi, /new FormData|multipart\/form-data|createObjectURL/);
assert.doesNotMatch(builderUi, /onUpload|fileUpload|FileReader/);

// N — builder still without fetch/API
assert.doesNotMatch(builderUi, /openai|anthropic|grok\.xai|fetchWordstat|\/api\/author\/seo/i);
assert.doesNotMatch(promptLib, /fetch\(|fetchWordstat|openai\.com|createCompletion/i);
assert.match(promptLib, /No AI API \/ Wordstat \/ network/);

// O — sample source lands; UI order type → source → secondary
assert.ok(withTwo.includes("Мягкий вступительный джазовый мотив на рояле"));
const typeIdx = builderUi.indexOf("Тип продукта");
const sourceIdx = builderUi.indexOf("Материал продукта");
const secondaryIdx = builderUi.indexOf('data-testid="author-seo-secondary-queries"');
assert.ok(typeIdx >= 0 && sourceIdx > typeIdx && secondaryIdx > sourceIdx, "UI order type → source → secondary");
assert.match(builderUi, /1\. Добавьте материал продукта/);
assert.doesNotMatch(builderUi, /productContent|PRODUCT_CONTENT/);

console.log("author-seo-prompt-builder-unit: ok");
