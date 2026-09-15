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
  SEO_PROMPT_EMPTY_PRODUCT_FACTS,
  SEO_PROMPT_EMPTY_RELATED,
  SEO_PROMPT_SECONDARY_CANDIDATE_LIMIT,
  SEO_PROMPT_SECONDARY_SELECT_LIMIT,
  buildAuthorSeoProductPrompt,
  clampSecondarySeoSelection,
  formatProductFactsForPrompt,
  formatRelatedQueriesForPrompt,
  hasUnsafeSecondarySeoModifier,
  listAuthorSeoPromptProductTypeOptions,
  suggestSecondarySeoQueriesForPrompt,
} from "../src/lib/seo-queries/author-seo-product-prompt.ts";
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
  candidates: jazzCandidates,
});

// A
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
const withTwo = buildAuthorSeoProductPrompt({
  seoQuery: "лёгкий джаз",
  productType: "Музыка",
  relatedQueries: ["лёгкий джаз слушать онлайн", "слушать лёгкий джаз"],
});
assert.match(withTwo, /ДОПОЛНИТЕЛЬНЫЕ SEO-ЗАПРОСЫ:\nлёгкий джаз слушать онлайн\nслушать лёгкий джаз/);
assert.doesNotMatch(withTwo, /джаз для кафе/);
const withNone = buildAuthorSeoProductPrompt({
  seoQuery: "лёгкий джаз",
  productType: "Музыка",
  relatedQueries: [],
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

// PRODUCT_FACTS + generate disabled
assert.match(
  buildAuthorSeoProductPrompt({
    seoQuery: "x",
    productType: "Музыка",
    relatedQueries: [],
    productFacts: "10 треков",
  }),
  /10 треков/,
);
assert.equal(formatProductFactsForPrompt(""), SEO_PROMPT_EMPTY_PRODUCT_FACTS);
assert.match(builderUi, /disabled=\{!productType\.trim\(\)\}/);
assert.match(builderUi, /navigator\.clipboard\.writeText\(prompt\)/);
assert.match(builderUi, /Как работать с промптом/);
assert.doesNotMatch(builderUi, /iframe|VideoPlayer/i);
assert.match(discoveryPanel, /AuthorSeoPromptBuilder/);
assert.match(dash, /seoAnalyzedOpportunitiesByAuthorId/);
assert.equal(SEO_DISCOVERY_IN_CHUNK_SIZE, 8);
assert.ok(AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE.includes("{{RELATED_QUERIES}}"));

console.log("author-seo-prompt-builder-unit: ok");
