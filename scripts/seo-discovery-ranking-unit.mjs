#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SEO_DISCOVERY_DATABASE_CANDIDATE_LIMIT,
  SEO_DISCOVERY_DATABASE_LIMIT,
  rankAnalyzedQueriesForSeed,
  scoreAnalyzedQueryAgainstSeed,
  tokenizeSeoPhrase,
} from "../src/lib/seo-queries/discovery-ranking.ts";
import { reconcileAuthorDiscoverySuggestion } from "../src/lib/seo-queries/author-discovery.ts";
import {
  AURAFON_AUTHOR_ID,
  isAuthorSeoDiscoveryEnabled,
} from "../src/lib/seo-queries/discovery-beta.ts";
import { classifySeoQuery } from "../src/lib/seo-queries/classifier.ts";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf8");

const authorId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const otherAuthor = "ffffffff-1111-4222-8333-444444444444";

function q(partial) {
  return {
    id: partial.id,
    queryText: partial.queryText,
    normalizedQuery: partial.normalizedQuery ?? partial.queryText,
    frequency: partial.frequency ?? 100,
    intent: partial.intent ?? "music",
    recommendedFormat: partial.recommendedFormat ?? "Музыка",
    audioFit: partial.audioFit ?? "high",
    clusterName: partial.clusterName ?? null,
    analysisStatus: partial.analysisStatus ?? "analyzed",
  };
}

const seed = "джаз для отдыха";
const pool = [
  q({ id: "1", queryText: "джаз для отдыха", normalizedQuery: "джаз для отдыха", frequency: 715 }),
  q({ id: "2", queryText: "джаз музыка для отдыха", frequency: 410 }),
  q({ id: "3", queryText: "легкий джаз для отдыха", frequency: 105 }),
  q({ id: "4", queryText: "фоновая музыка для кафе", frequency: 900, intent: "music" }),
  q({ id: "5", queryText: "медитация для сна", frequency: 2000, intent: "practice", recommendedFormat: "Медитация" }),
  q({ id: "6", queryText: "классическая музыка", frequency: 5000 }),
  q({ id: "7", queryText: "вечерний джаз", frequency: 80 }),
  q({ id: "8", queryText: "джаз для работы", frequency: 120 }),
  q({ id: "9", queryText: "музыка для отдыха", frequency: 300 }),
  q({ id: "10", queryText: "не должно попасть", normalizedQuery: "не должно попасть", analysisStatus: "not_analyzed" }),
  q({ id: "11", queryText: "тоже нет", normalizedQuery: "тоже нет", analysisStatus: "not_applicable" }),
];

const ranked = rankAnalyzedQueriesForSeed({
  seedPhrase: seed,
  seedNormalized: "джаз для отдыха",
  queries: pool,
});

assert.equal(ranked[0].normalizedQuery, "джаз для отдыха");
assert.equal(SEO_DISCOVERY_DATABASE_LIMIT, 7);
assert.equal(SEO_DISCOVERY_DATABASE_CANDIDATE_LIMIT, 250);
assert.ok(ranked.length <= SEO_DISCOVERY_DATABASE_LIMIT);
assert.ok(ranked.length >= 3, "jazz seed should find jazz matches");
const rankedWide = rankAnalyzedQueriesForSeed({
  seedPhrase: seed,
  seedNormalized: "джаз для отдыха",
  queries: [
    ...pool,
    q({ id: "12", queryText: "джаз лаунж", frequency: 50 }),
    q({ id: "13", queryText: "ночной джаз", frequency: 40 }),
    q({ id: "14", queryText: "джаз кафе", frequency: 30 }),
  ],
  limit: SEO_DISCOVERY_DATABASE_CANDIDATE_LIMIT,
});
assert.ok(rankedWide.length > SEO_DISCOVERY_DATABASE_LIMIT);
assert.ok(ranked.every((item) => item.analysisStatus === "analyzed"));
assert.doesNotMatch(ranked.map((i) => i.id).join(","), /10|11/);
assert.ok(ranked.every((item) => /джаз|отдых/.test(item.normalizedQuery)));

const ranked2 = rankAnalyzedQueriesForSeed({
  seedPhrase: seed,
  seedNormalized: "джаз для отдыха",
  queries: [...pool].reverse(),
});
assert.deepEqual(
  ranked.map((i) => i.id),
  ranked2.map((i) => i.id),
);

assert.ok(tokenizeSeoPhrase("джаз для отдыха").includes("джаз"));
assert.ok(!tokenizeSeoPhrase("джаз для отдыха").includes("для"));

// Exact always #1
assert.equal(ranked[0].id, "1");

// No-match seed: no shared meaningful tokens with pool → empty
const noMatch = rankAnalyzedQueriesForSeed({
  seedPhrase: "квантовая физика лекции",
  seedNormalized: "квантовая физика лекции",
  queries: pool,
});
assert.equal(noMatch.length, 0, "no lexical overlap must yield empty DB matches");

// Unrelated high-frequency analyzed must NOT appear via intent/format/freq alone
const highUnrelated = [
  q({
    id: "hf1",
    queryText: "аудио рассказы",
    normalizedQuery: "аудио рассказы",
    frequency: 311770,
    intent: "music",
    recommendedFormat: "Музыка",
    audioFit: "high",
  }),
  q({
    id: "hf2",
    queryText: "медитация для сна",
    normalizedQuery: "медитация для сна",
    frequency: 41408,
    intent: "practice",
    recommendedFormat: "Медитация",
    audioFit: "high",
  }),
];
const noFallback = rankAnalyzedQueriesForSeed({
  seedPhrase: "квантовая физика лекции",
  seedNormalized: "квантовая физика лекции",
  queries: highUnrelated,
});
assert.equal(noFallback.length, 0);

// Same intent/format without lexical overlap → score 0
const sameIntentNoLex = scoreAnalyzedQueryAgainstSeed({
  seedNormalized: "джаз для отдыха",
  seedTokens: tokenizeSeoPhrase("джаз для отдыха"),
  seedIntentHint: "music",
  seedFormatHint: "Музыка",
  query: q({
    id: "x",
    queryText: "фоновая музыка для видео",
    normalizedQuery: "фоновая музыка для видео",
    frequency: 9000,
    intent: "music",
    recommendedFormat: "Музыка",
    audioFit: "high",
  }),
});
assert.equal(sameIntentNoLex.score, 0);
assert.ok(sameIntentNoLex.reasons.includes("no_lexical_overlap"));

const free = reconcileAuthorDiscoverySuggestion({
  suggestion: { phrase: "джаз для отдыха", count: 715 },
  authorId,
  query: { id: "1", analysisStatus: "analyzed" },
  reservation: null,
  alreadyProposedByAuthor: false,
});
assert.equal(free.status, "available");
assert.equal(free.statusLabel, "Свободен");
assert.equal(free.canReserve, true);

const occupied = reconcileAuthorDiscoverySuggestion({
  suggestion: { phrase: "джаз для отдыха", count: 715 },
  authorId,
  query: { id: "1", analysisStatus: "analyzed" },
  reservation: {
    id: "r1",
    queryId: "1",
    authorId: otherAuthor,
    status: "active",
    productId: null,
    expiresAt: null,
    productTitle: null,
  },
  alreadyProposedByAuthor: false,
});
assert.equal(occupied.status, "occupied");

const own = reconcileAuthorDiscoverySuggestion({
  suggestion: { phrase: "джаз для отдыха", count: 715 },
  authorId,
  query: { id: "1", analysisStatus: "analyzed" },
  reservation: {
    id: "r2",
    queryId: "1",
    authorId,
    status: "active",
    productId: null,
    expiresAt: null,
    productTitle: null,
  },
  alreadyProposedByAuthor: false,
});
assert.equal(own.status, "own");

const pending = reconcileAuthorDiscoverySuggestion({
  suggestion: { phrase: "новый джаз", count: 10 },
  authorId,
  query: { id: "p1", analysisStatus: "not_analyzed" },
  reservation: null,
  alreadyProposedByAuthor: false,
});
assert.equal(pending.status, "pending_review");
assert.equal(pending.canPropose, false);

const missing = reconcileAuthorDiscoverySuggestion({
  suggestion: { phrase: "совсем новый", count: 10 },
  authorId,
  query: null,
  reservation: null,
  alreadyProposedByAuthor: false,
});
assert.equal(missing.status, "new");
assert.equal(missing.statusLabel, "Нет в базе АудиоЛада");
assert.equal(missing.canPropose, true);

assert.equal(isAuthorSeoDiscoveryEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorSeoDiscoveryEnabled(otherAuthor), false);

const repo = read("src/lib/seo-queries/author-discovery-repository.ts");
assert.match(repo, /export const SEO_DISCOVERY_IN_CHUNK_SIZE = 8/);
assert.match(repo, /loadRankedAnalyzedQueriesForSeed/);
assert.match(repo, /SEO_DISCOVERY_DATABASE_CANDIDATE_LIMIT/);
assert.match(repo, /takeRankedDiscoveryItemsUntilVisible/);
assert.doesNotMatch(repo, /seo_discovery_analyzed_fallback_load_failed/);
assert.doesNotMatch(
  repo,
  /order\("frequency",\s*\{\s*ascending:\s*false\s*\}\)/,
);

const seedPath = "data/seo-initial-opportunities-seed.json";
const seedJson = JSON.parse(read(seedPath));
assert.ok(seedJson.queries.length >= 100, `seed size ${seedJson.queries.length}`);
const norms = new Set(
  seedJson.queries.map((row) => row.query_text.toLocaleLowerCase("ru-RU").trim()),
);
assert.equal(norms.size, seedJson.queries.length, "duplicate normalized");
assert.ok(seedJson.queries.every((row) => Number.isInteger(row.frequency)));
assert.ok(seedJson.queries.every((row) => row.frequency >= 50 && row.frequency <= 1500));
assert.ok(seedJson.queries.every((row) => row.analysis_status === "analyzed"));
assert.ok(seedJson.queries.every((row) => row.source === "wordstat"));

const truncatedEnding =
  /(?:^|\s)(без|для|и|на|в|во|с|со|под|от|по|или|как|что)$/i;
let truncated = 0;
let specific = 0;
for (const row of seedJson.queries) {
  const cls = classifySeoQuery({ queryText: row.query_text });
  assert.equal(cls.recommendedDisposition, "analyzed");
  assert.notEqual(cls.audioFit, "low");
  assert.notEqual(cls.audioFit, "none");
  if (cls.intent === "specific_content") specific += 1;
  if (truncatedEnding.test(row.query_text.trim())) truncated += 1;
}
assert.equal(specific, 0, "zero specific_content");
assert.equal(truncated, 0, "zero truncated endings");

const discoveryRoute = read("src/app/api/author/seo/discovery/route.ts");
assert.match(discoveryRoute, /databaseMatches/);
assert.match(discoveryRoute, /loadRankedAnalyzedQueriesForSeed/);
assert.match(discoveryRoute, /visibleLimit: SEO_DISCOVERY_DATABASE_LIMIT/);
assert.match(discoveryRoute, /fetchWordstatSuggestions/);
// Wordstat block still returned even when DB empty — route always calls Wordstat
assert.match(discoveryRoute, /const wordstat = await fetchWordstatSuggestions/);

const ui = read("src/components/author-dashboard/AuthorSeoDiscoveryPanel.tsx");
assert.match(ui, /Подходящие запросы из базы АудиоЛада/);
assert.match(ui, /Дополнительные варианты из Яндекса/);
assert.match(ui, /Отправить на проверку/);
assert.doesNotMatch(ui, /Предложить запрос/);
assert.match(ui, /Найти запросы/);
assert.match(ui, /В базе АудиоЛада пока нет подходящих проверенных запросов/);

const migration = read(
  "supabase/migrations/20261007190000_seo_initial_opportunities_seed.sql",
);
assert.match(migration, /seo_queries/);
assert.match(migration, /ON CONFLICT \(normalized_query\) DO NOTHING/);
assert.match(migration, /analysis_status/);

// Dry-run ranking over seed artifact
const seedAsQueries = seedJson.queries.map((row, idx) =>
  q({
    id: String(idx + 1),
    queryText: row.query_text,
    normalizedQuery: row.query_text.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim(),
    frequency: row.frequency,
    intent: row.intent,
    recommendedFormat: row.recommended_format,
    audioFit: row.audio_fit,
  }),
);
const dry = rankAnalyzedQueriesForSeed({
  seedPhrase: "джаз для отдыха",
  seedNormalized: "джаз для отдыха",
  queries: seedAsQueries,
});
assert.ok(dry.length >= 1);
assert.equal(dry[0].normalizedQuery, "джаз для отдыха");
assert.ok(dry.every((item) => /джаз|отдых|jazz/i.test(item.queryText)));

const dryFar = rankAnalyzedQueriesForSeed({
  seedPhrase: "квантовая физика лекции",
  seedNormalized: "квантовая физика лекции",
  queries: seedAsQueries,
});
assert.equal(dryFar.length, 0);

console.log(
  "dry_run_jazz_top",
  dry.map((item) => ({
    phrase: item.queryText,
    score: item.score,
    frequency: item.frequency,
  })),
);
console.log("dry_run_no_match_count", dryFar.length);
console.log("seo-discovery-ranking-unit: ok");
