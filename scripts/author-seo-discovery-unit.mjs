#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  matchWordstatSuggestionCount,
  proposeAuthorSeoQuery,
  reconcileAuthorDiscoverySuggestion,
} from "../src/lib/seo-queries/author-discovery.ts";
import { isEffectiveSeoReservation } from "../src/lib/seo-queries/reservation-effective.ts";
import {
  AURAFON_AUTHOR_ID,
  isAuthorSeoDiscoveryEnabled,
} from "../src/lib/seo-queries/discovery-beta.ts";
import {
  SEO_DISCOVERY_IN_CHUNK_SIZE,
  chunkList,
} from "../src/lib/seo-queries/author-discovery-repository.ts";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf8");

const discoveryRoute = read("src/app/api/author/seo/discovery/route.ts");
const proposalsRoute = read("src/app/api/author/seo/proposals/route.ts");
const ui = read("src/components/author-dashboard/AuthorSeoOpportunitiesClient.tsx");
const migration = read(
  "supabase/migrations/20261007170000_seo_query_author_proposals.sql",
);
const reserveMigration = read(
  "supabase/migrations/20261007160000_seo_query_analysis_review_gate.sql",
);
const queriesLib = read("src/lib/seo-queries/queries.ts");
const discoveryRepo = read("src/lib/seo-queries/author-discovery-repository.ts");
const effectiveHelper = read("src/lib/seo-queries/reservation-effective.ts");

assert.match(discoveryRoute, /requireAuthorMembership\(authorId\)/);
assert.match(discoveryRoute, /fetchWordstatSuggestions\(phrase, \{ userId: user\.id \}\)/);
assert.match(discoveryRoute, /suggestion\.count/);
assert.doesNotMatch(discoveryRoute, /topicTotalCount/);
assert.doesNotMatch(discoveryRoute, /YANDEX_SEARCH_API_KEY|NEXT_PUBLIC_YANDEX/);

// A — proposals API no longer takes client count as source of truth
assert.match(proposalsRoute, /seed_phrase/);
assert.match(proposalsRoute, /fetchWordstatSuggestions\(seedPhrase/);
assert.match(proposalsRoute, /matchWordstatSuggestionCount/);
assert.doesNotMatch(proposalsRoute, /readCount|body\.count/);
assert.match(proposalsRoute, /wordstat_selection_stale/);
assert.match(ui, /seed_phrase: discoverySeedPhrase/);
assert.match(ui, /discoverySeedPhrase/);
assert.match(ui, /payload\.phrase/);
assert.doesNotMatch(ui, /count:\s*item\.frequency/);

assert.match(migration, /submitted_by_user_id uuid NULL REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
assert.doesNotMatch(migration, /submitted_by_user_id uuid NOT NULL/);
assert.doesNotMatch(migration, /submitted_by_user_id[^\n]*ON DELETE CASCADE/);

assert.match(effectiveHelper, /isEffectiveSeoReservation/);
assert.match(discoveryRepo, /isEffectiveSeoReservation/);
assert.match(discoveryRepo, /expires_at/);
assert.match(queriesLib, /isEffectiveSeoReservation/);

assert.match(ui, /Найти SEO-тему/);
assert.match(ui, /Запросов в месяц/);
assert.doesNotMatch(ui, /normalized:/);
assert.match(ui, /\/api\/author\/seo\/discovery/);
assert.match(ui, /\/api\/author\/seo\/proposals/);
assert.match(ui, /\/api\/author\/seo-reservations/);
assert.match(ui, /Предложить запрос/);
assert.match(ui, /Взять в работу/);
assert.match(ui, /Данные изменились\. Выполните поиск ещё раз\./);

const authorA = "author-a";
const authorB = "author-b";
const past = "2020-01-01T00:00:00.000Z";
const future = "2099-01-01T00:00:00.000Z";
const now = new Date("2026-09-14T12:00:00.000Z");

function reservation(partial) {
  return {
    id: "r1",
    queryId: "q1",
    authorId: authorB,
    status: "active",
    productId: null,
    expiresAt: future,
    productTitle: null,
    ...partial,
  };
}

// 1–6 reconcile basics
assert.equal(
  reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "музыка для сна", count: 320 },
    authorId: authorA,
    query: { id: "q1", analysisStatus: "analyzed" },
    reservation: null,
    alreadyProposedByAuthor: false,
  }).status,
  "available",
);

assert.equal(
  reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "музыка для сна", count: 320 },
    authorId: authorA,
    query: { id: "q1", analysisStatus: "analyzed" },
    reservation: reservation({ authorId: authorB, status: "active", expiresAt: future }),
    alreadyProposedByAuthor: false,
  }).status,
  "occupied",
);

assert.equal(
  reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "музыка для сна", count: 320 },
    authorId: authorA,
    query: { id: "q1", analysisStatus: "analyzed" },
    reservation: reservation({
      authorId: authorA,
      status: "active",
      productTitle: "Мой трек",
    }),
    alreadyProposedByAuthor: false,
  }).status,
  "own",
);

assert.equal(
  reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "новая тема", count: 10 },
    authorId: authorA,
    query: { id: "q2", analysisStatus: "not_analyzed" },
    reservation: null,
    alreadyProposedByAuthor: false,
  }).status,
  "pending_review",
);

assert.equal(
  reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "мусор", count: 1 },
    authorId: authorA,
    query: { id: "q3", analysisStatus: "not_applicable" },
    reservation: null,
    alreadyProposedByAuthor: false,
  }).status,
  "not_applicable",
);

assert.equal(
  reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "бренд новая", count: 55 },
    authorId: authorA,
    query: null,
    reservation: null,
    alreadyProposedByAuthor: false,
  }).status,
  "new",
);

// E — topicTotalCount never used as frequency
{
  const topicTotalCount = 999999;
  const row = reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "тест", count: 42 },
    authorId: authorA,
    query: null,
    reservation: null,
    alreadyProposedByAuthor: false,
  });
  assert.equal(row.frequency, 42);
  assert.notEqual(row.frequency, topicTotalCount);
}

// F–I effective reservation helper
assert.equal(
  isEffectiveSeoReservation(
    { status: "active", productId: null, expiresAt: past },
    now,
  ),
  false,
);
assert.equal(
  isEffectiveSeoReservation(
    { status: "active", productId: null, expiresAt: future },
    now,
  ),
  true,
);
assert.equal(
  isEffectiveSeoReservation(
    { status: "used", productId: null, expiresAt: past },
    now,
  ),
  true,
);
assert.equal(
  isEffectiveSeoReservation(
    { status: "active", productId: "prod-1", expiresAt: past },
    now,
  ),
  true,
);

// F discovery: expired foreign → available (after filtering, reservation null)
assert.equal(
  reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "музыка", count: 10 },
    authorId: authorA,
    query: { id: "q1", analysisStatus: "analyzed" },
    reservation: isEffectiveSeoReservation(
      { status: "active", productId: null, expiresAt: past },
      now,
    )
      ? reservation({ expiresAt: past })
      : null,
    alreadyProposedByAuthor: false,
  }).status,
  "available",
);

// G future active → occupied
assert.equal(
  reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "музыка", count: 10 },
    authorId: authorA,
    query: { id: "q1", analysisStatus: "analyzed" },
    reservation: reservation({ expiresAt: future }),
    alreadyProposedByAuthor: false,
  }).status,
  "occupied",
);

// H used → occupied
assert.equal(
  reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "музыка", count: 10 },
    authorId: authorA,
    query: { id: "q1", analysisStatus: "analyzed" },
    reservation: reservation({ status: "used", expiresAt: null }),
    alreadyProposedByAuthor: false,
  }).status,
  "occupied",
);

// I linked active → occupied even if expires_at past
assert.equal(
  reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "музыка", count: 10 },
    authorId: authorA,
    query: { id: "q1", analysisStatus: "analyzed" },
    reservation: reservation({
      productId: "prod-1",
      expiresAt: past,
      productTitle: "Чужой",
    }),
    alreadyProposedByAuthor: false,
  }).status,
  "occupied",
);

// J catalog uses same helper — expired not effective (available in catalog terms)
{
  const expired = { status: "active", productId: null, expiresAt: past };
  assert.equal(isEffectiveSeoReservation(expired, now), false);
  // queries.ts filters with the same helper before lifecycle mapping
  assert.match(queriesLib, /isEffectiveSeoReservation/);
  assert.match(discoveryRepo, /isEffectiveSeoReservation/);
}

function createProposalRepository({
  rows = [],
  proposals = [],
  conflictOnCreate = false,
} = {}) {
  const records = rows.map((row) => ({ ...row }));
  const proposalRows = proposals.map((row) => ({ ...row }));
  let nextId = records.length + 1;
  let nextProposal = proposalRows.length + 1;
  let shouldConflict = conflictOnCreate;
  const normalize = (phrase) => phrase.trim().toLowerCase().replace(/\s+/g, " ");

  return {
    records,
    proposalRows,
    async normalize(phrase) {
      return normalize(phrase);
    },
    async findByNormalized(normalizedQuery) {
      const row = records.find((item) => item.normalized_query === normalizedQuery);
      return row
        ? {
            id: row.id,
            analysisStatus: row.analysis_status,
            frequency: row.frequency,
            frequencyCheckedAt: row.frequency_checked_at,
            source: row.source,
          }
        : null;
    },
    async createQuery(input) {
      if (shouldConflict) {
        shouldConflict = false;
        records.push({
          id: `q-race-${nextId++}`,
          query_text: input.queryText,
          normalized_query: normalize(input.queryText),
          source: "wordstat",
          frequency: 7,
          frequency_checked_at: "2026-09-01T00:00:00.000Z",
          analysis_status: "not_analyzed",
        });
        return { status: "conflict" };
      }
      const row = {
        id: `q-${nextId++}`,
        query_text: input.queryText,
        normalized_query: normalize(input.queryText),
        source: input.source,
        frequency: input.frequency,
        frequency_checked_at: input.frequencyCheckedAt,
        analysis_status: input.analysisStatus,
      };
      records.push(row);
      return {
        status: "created",
        query: {
          id: row.id,
          analysisStatus: row.analysis_status,
          frequency: row.frequency,
          frequencyCheckedAt: row.frequency_checked_at,
          source: row.source,
        },
      };
    },
    async findProposal(queryId, authorId) {
      const row = proposalRows.find(
        (item) => item.query_id === queryId && item.author_id === authorId,
      );
      return row ? { id: row.id } : null;
    },
    async createProposal(input) {
      const existing = proposalRows.find(
        (item) =>
          item.query_id === input.queryId && item.author_id === input.authorId,
      );
      if (existing) return { status: "conflict" };
      const row = {
        id: `p-${nextProposal++}`,
        query_id: input.queryId,
        author_id: input.authorId,
        submitted_by_user_id: input.submittedByUserId,
      };
      proposalRows.push(row);
      return { status: "created", id: row.id };
    },
  };
}

const checkedAt = "2026-09-14T12:00:00.000Z";
const normalize = async (phrase) =>
  phrase.trim().toLowerCase().replace(/\s+/g, " ");

// B + D — forged client count ignored: match uses server suggestion.count
{
  const matched = await matchWordstatSuggestionCount({
    selectedPhrase: "Музыка для сна",
    suggestions: [
      { phrase: "музыка для сна", count: 320 },
      { phrase: "другая", count: 1 },
    ],
    normalize,
  });
  assert.equal(matched.ok, true);
  assert.equal(matched.count, 320);

  const forgedClientCount = 1;
  const repo = createProposalRepository();
  const result = await proposeAuthorSeoQuery(
    {
      phrase: matched.phrase,
      count: matched.count, // server count, not forgedClientCount
      authorId: authorA,
      submittedByUserId: "user-a",
    },
    repo,
    () => checkedAt,
  );
  assert.equal(result.ok, true);
  assert.equal(result.frequency, 320);
  assert.notEqual(result.frequency, forgedClientCount);
  assert.equal(repo.records[0].frequency, 320);
}

// C — selected phrase missing from confirmed Wordstat response
{
  const matched = await matchWordstatSuggestionCount({
    selectedPhrase: "пропавшая фраза",
    suggestions: [{ phrase: "другая", count: 11 }],
    normalize,
  });
  assert.equal(matched.ok, false);
  assert.equal(matched.error, "wordstat_selection_stale");

  const repo = createProposalRepository();
  // Route would stop before propose — prove repo stays empty when stale
  assert.equal(repo.records.length, 0);
  assert.equal(repo.proposalRows.length, 0);
}

// D again via full propose path with server count
{
  const repo = createProposalRepository();
  const result = await proposeAuthorSeoQuery(
    {
      phrase: "Музыка для йоги",
      count: 880,
      authorId: authorA,
      submittedByUserId: "user-a",
    },
    repo,
    () => checkedAt,
  );
  assert.equal(result.ok, true);
  assert.equal(result.analysisStatus, "not_analyzed");
  assert.equal(result.source, "wordstat");
  assert.equal(result.frequency, 880);
  assert.equal(result.frequencyCheckedAt, checkedAt);
}

// duplicate / race reuse
{
  const repo = createProposalRepository({ conflictOnCreate: true });
  const result = await proposeAuthorSeoQuery(
    {
      phrase: "Музыка для сна",
      count: 100,
      authorId: authorA,
      submittedByUserId: "user-a",
    },
    repo,
    () => checkedAt,
  );
  assert.equal(result.ok, true);
  assert.equal(repo.records.length, 1);
}

// same author no duplicate proposal
{
  const repo = createProposalRepository({
    rows: [
      {
        id: "q-existing",
        query_text: "тема",
        normalized_query: "тема",
        source: "wordstat",
        frequency: 12,
        frequency_checked_at: checkedAt,
        analysis_status: "not_analyzed",
      },
    ],
    proposals: [
      {
        id: "p1",
        query_id: "q-existing",
        author_id: authorA,
        submitted_by_user_id: "user-a",
      },
    ],
  });
  const result = await proposeAuthorSeoQuery(
    {
      phrase: "тема",
      count: 12,
      authorId: authorA,
      submittedByUserId: "user-a",
    },
    repo,
    () => checkedAt,
  );
  assert.equal(result.status, "already_proposed");
  assert.equal(repo.proposalRows.length, 1);
}

// other author can propose pending without duplicate query
{
  const repo = createProposalRepository({
    rows: [
      {
        id: "q-pending",
        query_text: "общая тема",
        normalized_query: "общая тема",
        source: "wordstat",
        frequency: 44,
        frequency_checked_at: checkedAt,
        analysis_status: "not_analyzed",
      },
    ],
    proposals: [
      {
        id: "p1",
        query_id: "q-pending",
        author_id: authorA,
        submitted_by_user_id: "user-a",
      },
    ],
  });
  const result = await proposeAuthorSeoQuery(
    {
      phrase: "общая тема",
      count: 44,
      authorId: authorB,
      submittedByUserId: "user-b",
    },
    repo,
    () => checkedAt,
  );
  assert.equal(result.ok, true);
  assert.equal(repo.records.length, 1);
  assert.equal(repo.proposalRows.length, 2);
}

assert.match(proposalsRoute, /requireAuthorMutationMembership\(authorId\)/);
assert.match(reserveMigration, /seo_query_not_analyzed/);
assert.match(reserveMigration, /v_active_count >= 5/);

// K migration invariant
assert.match(migration, /submitted_by_user_id uuid NULL REFERENCES auth\.users\(id\) ON DELETE SET NULL/);


// --- Closed beta gate (Aurafon only) ---
const otherAuthorId = "00000000-0000-4000-8000-000000000099";
assert.equal(isAuthorSeoDiscoveryEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorSeoDiscoveryEnabled(otherAuthorId), false);
assert.equal(isAuthorSeoDiscoveryEnabled(""), false);
assert.equal(isAuthorSeoDiscoveryEnabled(null), false);

const discoveryBeta = read("src/lib/seo-queries/discovery-beta.ts");
assert.match(discoveryBeta, /59c7e5b8-eae4-4394-82fb-b815a10be6c2/);
assert.match(discoveryRoute, /isAuthorSeoDiscoveryEnabled/);
assert.match(discoveryRoute, /seo_discovery_beta_disabled/);
assert.match(discoveryRoute, /seo_discovery_context_failed/);
assert.match(proposalsRoute, /isAuthorSeoDiscoveryEnabled/);
assert.match(proposalsRoute, /seo_discovery_beta_disabled/);

const page = read("src/app/(platform)/author-dashboard/seo-opportunities/page.tsx");
assert.match(page, /isAuthorSeoDiscoveryEnabled/);
assert.match(page, /discoveryEnabled/);
assert.match(page, /Что ищут слушатели/);

assert.match(ui, /discoveryEnabled/);
assert.match(ui, /Найти SEO-тему/);

const dash = read("src/components/author-dashboard/AuthorDashboardClient.tsx");
assert.match(dash, /isAuthorSeoDiscoveryEnabled/);
assert.match(dash, /Что ищут слушатели/);
assert.match(dash, /Бета/);

const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
assert.match(nav, /isAuthorSeoDiscoveryEnabled/);
assert.match(nav, /Что ищут слушатели/);

// products not required for discovery UI
assert.doesNotMatch(ui, /products\.length === 0[\s\S]{0,80}discoveryEnabled/);
assert.match(ui, /discoveryEnabled \? \(/);

// Chunked PostgREST .in() to avoid edge nginx 502 on long Cyrillic filters
assert.match(discoveryRepo, /SEO_DISCOVERY_IN_CHUNK_SIZE/);
assert.match(discoveryRepo, /chunkList\(/);
assert.match(discoveryRepo, /for \(const batch of chunkList\(uniqueNormalized\)\)/);
assert.match(discoveryRepo, /for \(const batch of chunkList\(queryIds\)\)/);

// AUTH_FAILED taxonomy present
const wordstatErrors = read("src/lib/seo/wordstat/errors.ts");
assert.match(wordstatErrors, /AUTH_FAILED/);
assert.doesNotMatch(discoveryRoute, /YANDEX_SEARCH_API_KEY/);
assert.doesNotMatch(proposalsRoute, /YANDEX_SEARCH_API_KEY/);

assert.equal(SEO_DISCOVERY_IN_CHUNK_SIZE, 8);
const seventeen = Array.from({ length: 17 }, (_, i) => `фраза номер ${i} для теста чанков`);
assert.equal(chunkList(seventeen).length, 3);
assert.equal(chunkList(seventeen)[0].length, 8);
assert.equal(chunkList(seventeen)[2].length, 1);
assert.deepEqual(chunkList([]), [[]]);

console.log("author-seo-discovery-unit: ok");
