#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  matchWordstatSuggestionCount,
  proposeAuthorSeoQuery,
  reconcileAuthorDiscoverySuggestion,
} from "../src/lib/seo-queries/author-discovery.ts";
import {
  AUTHOR_SEO_DISCOVERY_SURFACES,
  authorSeoDiscoverySurfaceFromPanelVariant,
  buildAuthorDiscoveryDatabaseMatches,
  isHiddenFromProductCreateDiscovery,
  parseAuthorSeoDiscoverySurface,
  resolveAuthorDiscoveryReservationState,
  shouldOmitFromWordstatAdditions,
} from "../src/lib/seo-queries/author-discovery-status.ts";
import { isEffectiveSeoReservation } from "../src/lib/seo-queries/reservation-effective.ts";
import {
  AURAFON_AUTHOR_ID,
  isAuthorSeoDiscoveryEnabled,
  isMusicCreateSeoDiscoveryEnabled,
} from "../src/lib/seo-queries/discovery-beta.ts";
import {
  countActiveAuthorSeoReservations,
  isSeoActiveReservationLimitReached,
  nextActiveReservationCountAfterReserve,
  SEO_ACTIVE_RESERVATION_LIMIT,
} from "../src/lib/seo-queries/types.ts";
import {
  SEO_DISCOVERY_IN_CHUNK_SIZE,
  chunkList,
} from "../src/lib/seo-queries/author-discovery-repository.ts";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf8");

const discoveryRoute = read("src/app/api/author/seo/discovery/route.ts");
const proposalsRoute = read("src/app/api/author/seo/proposals/route.ts");
const ui = read("src/components/author-dashboard/AuthorSeoOpportunitiesClient.tsx");
const panel = read("src/components/author-dashboard/AuthorSeoDiscoveryPanel.tsx");
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
assert.match(panel, /seed_phrase: discoverySeedPhrase/);
assert.match(panel, /discoverySeedPhrase/);
assert.match(panel, /payload\.phrase/);
assert.doesNotMatch(panel, /count:\s*item\.frequency/);

assert.match(migration, /submitted_by_user_id uuid NULL REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
assert.doesNotMatch(migration, /submitted_by_user_id uuid NOT NULL/);
assert.doesNotMatch(migration, /submitted_by_user_id[^\n]*ON DELETE CASCADE/);

assert.match(effectiveHelper, /isEffectiveSeoReservation/);
assert.match(discoveryRepo, /isEffectiveSeoReservation/);
assert.match(discoveryRepo, /expires_at/);
assert.match(queriesLib, /isEffectiveSeoReservation/);

assert.match(panel, /Найти запросы/);
assert.match(panel, /Запросов в месяц/);
assert.doesNotMatch(panel, /normalized:/);
assert.match(panel, /\/api\/author\/seo\/discovery/);
assert.match(panel, /surface: authorSeoDiscoverySurfaceFromPanelVariant\(variant\)/);
assert.match(panel, /\/api\/author\/seo\/proposals/);
assert.match(panel, /\/api\/author\/seo-reservations/);
assert.match(panel, /Отправить на проверку/);
assert.match(panel, /Взять в работу/);
assert.match(panel, /Данные изменились\. Выполните поиск ещё раз\./);

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
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({ authorId: AURAFON_AUTHOR_ID }),
  true,
);
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({
    authorId: AURAFON_AUTHOR_ID,
    publicationClass: "practice",
  }),
  true,
);
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({
    authorId: otherAuthorId,
    publicationClass: "release",
  }),
  true,
);
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({ authorId: otherAuthorId }),
  false,
);
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({
    authorId: otherAuthorId,
    publicationClass: "practice",
  }),
  false,
);
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({
    authorId: otherAuthorId,
    publicationClass: "course",
  }),
  false,
);
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({
    authorId: otherAuthorId,
    publicationClass: "audiobook",
  }),
  false,
);
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({
    authorId: otherAuthorId,
    publicationClass: "post",
  }),
  false,
);

const aurafonIdentity = read("src/lib/authors/aurafon.ts");
assert.match(aurafonIdentity, /59c7e5b8-eae4-4394-82fb-b815a10be6c2/);
const discoveryBeta = read("src/lib/seo-queries/discovery-beta.ts");
assert.match(discoveryBeta, /from "@\/lib\/authors\/aurafon"/);
assert.doesNotMatch(discoveryBeta, /59c7e5b8-eae4-4394-82fb-b815a10be6c2/);
assert.match(discoveryRoute, /isMusicCreateSeoDiscoveryEnabled/);
assert.match(discoveryRoute, /seo_discovery_beta_disabled/);
assert.match(discoveryRoute, /seo_discovery_context_failed/);
assert.match(proposalsRoute, /isMusicCreateSeoDiscoveryEnabled/);
assert.match(proposalsRoute, /seo_discovery_beta_disabled/);

const page = read("src/app/(platform)/author-dashboard/seo-opportunities/page.tsx");
assert.match(page, /isAuthorSeoDiscoveryEnabled/);
assert.match(page, /discoveryEnabled/);
assert.match(page, /Что ищут слушатели/);

assert.match(ui, /discoveryEnabled/);
assert.match(panel, /Найти запросы/);

const dash = read("src/components/author-dashboard/AuthorDashboardClient.tsx");
const createStep = read("src/components/author-dashboard/AuthorProductSeoQueryStep.tsx");
const createPage = read("src/app/(platform)/author-dashboard/products/new/page.tsx");
assert.doesNotMatch(dash, /isAuthorSeoDiscoveryEnabled/);
assert.doesNotMatch(dash, /AuthorSeoDiscoveryPanel/);
assert.doesNotMatch(dash, /variant="dashboard"/);
assert.doesNotMatch(dash, /Найдите тему для нового аудиопродукта/);
assert.match(createStep, /variant="product-create"/);
assert.match(createStep, /getProductSeoQueryStepCopy/);
assert.match(createStep, /copy\.title/);
assert.match(createStep, /Продолжить без поискового запроса/);
assert.match(createPage, /AuthorProductSeoQueryStep/);
assert.doesNotMatch(dash, /seo-opportunities\?author=/);
assert.doesNotMatch(dash, /href=\{\`\/author-dashboard\/seo-opportunities/);

const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
assert.match(nav, /isAuthorSeoDiscoveryEnabled/);
assert.doesNotMatch(nav, /isMusicCreateSeoDiscoveryEnabled/);
assert.match(nav, /Что ищут слушатели/);

// Shared panel: opportunities + product-create variants
assert.match(panel, /"opportunities" \| "product-create"/);
assert.match(panel, /product-create/);
assert.doesNotMatch(panel, /"dashboard"/);
assert.match(panel, /Взять в работу и продолжить/);
assert.match(panel, /Выбрать и продолжить/);
assert.doesNotMatch(panel, /Найдите тему для нового аудиопродукта/);
assert.match(panel, /Что ищут слушатели/);
assert.match(panel, /Бета/);
assert.match(panel, /Подходящие запросы из базы АудиоЛада/);
assert.match(panel, /Дополнительные варианты из Яндекса/);

// Products dashboard no longer embeds discovery (moved into create flow)
assert.doesNotMatch(dash, /author-seo-discovery-panel/);
assert.doesNotMatch(dash, /AuthorSeoDiscoveryPanel/);
assert.doesNotMatch(dash, /Посмотреть возможности/);
assert.doesNotMatch(dash, /Возможности для авторов/);

// Opportunities page still embeds the same panel
assert.match(ui, /AuthorSeoDiscoveryPanel/);
assert.match(ui, /variant="opportunities"/);
assert.match(ui, /discoveryEnabled/);

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

// --- Dashboard no longer preloads SEO counts (moved to create + opportunities) ---
const dashPage = read("src/app/(platform)/author-dashboard/page.tsx");
assert.doesNotMatch(dashPage, /listSeoOpportunitiesForAuthor/);
assert.doesNotMatch(dashPage, /countActiveAuthorSeoReservations/);
assert.doesNotMatch(dashPage, /seoActiveReservationCounts/);
assert.doesNotMatch(dashPage, /isAuthorSeoDiscoveryEnabled/);
assert.doesNotMatch(dashPage, /\/api\/author\/seo\/discovery/);
assert.doesNotMatch(dashPage, /\/api\/author\/seo\/proposals/);
assert.doesNotMatch(dashPage, /fetchWordstatSuggestions/);
assert.doesNotMatch(dashPage, /wordstat/i);

assert.doesNotMatch(dash, /seoActiveReservationCounts/);
assert.doesNotMatch(dash, /activeReservationCount=\{0\}/);

// A — count 0 → reserve not limited
assert.equal(isSeoActiveReservationLimitReached(0), false);
assert.equal(countActiveAuthorSeoReservations([]), 0);

// B — count 5 → reserve disabled before any POST
assert.equal(isSeoActiveReservationLimitReached(5), true);
assert.equal(SEO_ACTIVE_RESERVATION_LIMIT, 5);
assert.match(panel, /isSeoActiveReservationLimitReached\(effectiveActiveCount\)/);

// C — 4 → successful reserve → 5 → limit reached
assert.equal(nextActiveReservationCountAfterReserve(4, true), 5);
assert.equal(isSeoActiveReservationLimitReached(nextActiveReservationCountAfterReserve(4, true)), true);

// D — failed reserve does not bump
assert.equal(nextActiveReservationCountAfterReserve(4, false), 4);
assert.match(panel, /nextActiveReservationCountAfterReserve\(current\.local, true\)/);
assert.match(panel, /if \(!response\.ok\)/);
// increment only on success path (helper called with true after ok check)
const reserveFn = panel.slice(panel.indexOf("async function reserve"), panel.indexOf("async function runDiscovery"));
assert.ok(reserveFn.indexOf("if (!response.ok)") < reserveFn.indexOf("nextActiveReservationCountAfterReserve"), "fail returns before increment");

// Canonical filter: published / no reservationId excluded; in_progress counted
assert.equal(
  countActiveAuthorSeoReservations([
    { reservationId: "r1", lifecycle: "in_progress" },
    { reservationId: "r2", lifecycle: "moderation" },
    { reservationId: "r3", lifecycle: "published" },
    { reservationId: null, lifecycle: "available" },
  ]),
  2,
);

// E/F — create step + opportunities own the panel; products dashboard does not
assert.doesNotMatch(dash, /isAuthorSeoDiscoveryEnabled\(selectedAuthor\.id\)/);
assert.doesNotMatch(dash, /seoActiveReservationCounts/);
assert.match(createStep, /AuthorSeoDiscoveryPanel/);
assert.match(createPage, /isMusicCreateSeoDiscoveryEnabled/);

// G — seo-opportunities uses canonical counter
assert.match(ui, /countActiveAuthorSeoReservations\(items\)/);
assert.match(ui, /activeReservationCount=\{activeCount\}/);
assert.match(page, /listSeoOpportunitiesForAuthor/);

// H — dashboard client does not call discovery/proposals/Wordstat on load
assert.doesNotMatch(dash, /\/api\/author\/seo\/discovery/);
assert.doesNotMatch(dash, /\/api\/author\/seo\/proposals/);
assert.doesNotMatch(dash, /wordstat/i);
// products fetch only
assert.match(dash, /\/api\/author\/products/);

// I — beta gate lives on create page + opportunities (not products dashboard)
assert.match(createPage, /isMusicCreateSeoDiscoveryEnabled/);
assert.match(page, /isAuthorSeoDiscoveryEnabled/);

// J — single shared panel (create step + opportunities)
assert.match(createStep, /AuthorSeoDiscoveryPanel/);
assert.match(ui, /AuthorSeoDiscoveryPanel/);
assert.equal(
  read("src/components/author-dashboard/AuthorSeoDiscoveryPanel.tsx").includes("async function runDiscovery"),
  true,
);
assert.doesNotMatch(ui, /async function runDiscovery/);
assert.doesNotMatch(dash, /async function runDiscovery/);

// K — chunk size 8 regression (asserted above)
assert.equal(SEO_DISCOVERY_IN_CHUNK_SIZE, 8);

const discoveryStatusSource = read("src/lib/seo-queries/author-discovery-status.ts");
assert.match(discoveryRoute, /parseAuthorSeoDiscoverySurface\(body\.surface\)/);
assert.match(discoveryRoute, /buildAuthorDiscoveryDatabaseMatches/);
assert.match(discoveryRoute, /shouldOmitFromWordstatAdditions/);
assert.doesNotMatch(discoveryRoute, /databaseMatchStatus/);
assert.doesNotMatch(discoveryStatusSource, /import "server-only"/);
assert.doesNotMatch(discoveryBeta, /product_create/);
assert.equal(
  authorSeoDiscoverySurfaceFromPanelVariant("product-create"),
  AUTHOR_SEO_DISCOVERY_SURFACES.PRODUCT_CREATE,
);
assert.equal(
  authorSeoDiscoverySurfaceFromPanelVariant("opportunities"),
  AUTHOR_SEO_DISCOVERY_SURFACES.OPPORTUNITIES,
);
assert.equal(parseAuthorSeoDiscoverySurface("product_create"), "product_create");
assert.equal(parseAuthorSeoDiscoverySurface("opportunities"), "opportunities");
assert.equal(parseAuthorSeoDiscoverySurface("release"), null);
assert.equal(parseAuthorSeoDiscoverySurface(undefined), null);

const eveningJazzReservation = {
  id: "res-evening-jazz",
  authorId: authorA,
  status: "used",
  productId: "prod-evening-jazz",
  productTitle: "Вечерний джаз",
};

// A. own + active + product_id=null → «У вас в работе», visible in product-create
{
  const ownActive = reservation({
    authorId: authorA,
    status: "active",
    productId: null,
    productTitle: null,
  });
  const semantic = resolveAuthorDiscoveryReservationState({
    authorId: authorA,
    reservation: ownActive,
  });
  assert.equal(semantic.status, "own");
  assert.equal(semantic.statusLabel, "У вас в работе");
  assert.equal(isHiddenFromProductCreateDiscovery(ownActive), false);
  const built = buildAuthorDiscoveryDatabaseMatches({
    surface: "product_create",
    authorId: authorA,
    items: [
      {
        id: "q-active",
        queryText: "джаз лаунж",
        normalizedQuery: "джаз лаунж",
        frequency: 80,
        reservation: ownActive,
      },
    ],
  });
  assert.equal(built.matches.length, 1);
  assert.equal(built.matches[0].status, "own");
  assert.equal(built.matches[0].statusLabel, "У вас в работе");
  assert.match(panel, /Выбрать и продолжить/);
}

// B. own + used → «Опубликован», not «У вас в работе»
{
  const semantic = resolveAuthorDiscoveryReservationState({
    authorId: authorA,
    reservation: eveningJazzReservation,
  });
  assert.equal(semantic.status, "published");
  assert.equal(semantic.statusLabel, "Опубликован");
  assert.notEqual(semantic.statusLabel, "У вас в работе");
  const reconciled = reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "вечерний джаз", count: 210 },
    authorId: authorA,
    query: { id: "q-evening", analysisStatus: "analyzed" },
    reservation: {
      id: eveningJazzReservation.id,
      queryId: "q-evening",
      authorId: authorA,
      status: "used",
      productId: eveningJazzReservation.productId,
      expiresAt: null,
      productTitle: "Вечерний джаз",
    },
    alreadyProposedByAuthor: false,
  });
  assert.equal(reconciled.status, "published");
  assert.equal(reconciled.statusLabel, "Опубликован");
}

// C / J. product-create + own used «вечерний джаз» is absent
{
  const built = buildAuthorDiscoveryDatabaseMatches({
    surface: "product_create",
    authorId: authorA,
    items: [
      {
        id: "q-evening",
        queryText: "вечерний джаз",
        normalizedQuery: "вечерний джаз",
        frequency: 210,
        reservation: eveningJazzReservation,
      },
    ],
  });
  assert.equal(built.matches.length, 0);
  assert.deepEqual(built.hiddenNormalizedQueries, ["вечерний джаз"]);
  assert.equal(
    built.matches.some((item) => item.phrase === "вечерний джаз"),
    false,
  );
}

// D. product-create + foreign used is absent, not shown as «Занят»
{
  const foreignUsed = {
    ...eveningJazzReservation,
    authorId: authorB,
    productTitle: "Чужой джаз",
  };
  const built = buildAuthorDiscoveryDatabaseMatches({
    surface: "product_create",
    authorId: authorA,
    items: [
      {
        id: "q-foreign-used",
        queryText: "джаз для отдыха",
        normalizedQuery: "джаз для отдыха",
        frequency: 90,
        reservation: foreignUsed,
      },
    ],
  });
  assert.equal(built.matches.length, 0);
  assert.equal(isHiddenFromProductCreateDiscovery(foreignUsed), true);
}

// E. opportunities + own used → «Опубликован»
{
  const built = buildAuthorDiscoveryDatabaseMatches({
    surface: "opportunities",
    authorId: authorA,
    items: [
      {
        id: "q-evening",
        queryText: "вечерний джаз",
        normalizedQuery: "вечерний джаз",
        frequency: 210,
        reservation: eveningJazzReservation,
      },
    ],
  });
  assert.equal(built.matches.length, 1);
  assert.equal(built.matches[0].status, "published");
  assert.equal(built.matches[0].statusLabel, "Опубликован");
  assert.equal(built.matches[0].productTitle, "Вечерний джаз");
  assert.match(panel, /Опубликован/);
  assert.match(panel, /item\.status === "published"/);
}

// F. used analyzed query hidden from databaseMatches does not reappear in Wordstat
{
  const databaseNormalized = new Set( ["вечерний джаз"]);
  assert.equal(
    shouldOmitFromWordstatAdditions({
      surface: "product_create",
      analysisStatus: "analyzed",
      reservation: eveningJazzReservation,
      normalized: "вечерний джаз",
      databaseNormalized: new Set(),
    }),
    true,
  );
  assert.equal(
    shouldOmitFromWordstatAdditions({
      surface: "product_create",
      analysisStatus: "analyzed",
      reservation: eveningJazzReservation,
      normalized: "вечерний джаз",
      databaseNormalized,
    }),
    true,
  );
  assert.equal(
    shouldOmitFromWordstatAdditions({
      surface: "opportunities",
      analysisStatus: "not_analyzed",
      reservation: eveningJazzReservation,
      normalized: "вечерний джаз",
      databaseNormalized: new Set(),
    }),
    true,
  );
}

// G. available query remains selectable
{
  const built = buildAuthorDiscoveryDatabaseMatches({
    surface: "product_create",
    authorId: authorA,
    items: [
      {
        id: "q-free",
        queryText: "jazz lounge",
        normalizedQuery: "jazz lounge",
        frequency: 40,
        reservation: null,
      },
    ],
  });
  assert.equal(built.matches.length, 1);
  assert.equal(built.matches[0].status, "available");
  assert.equal(built.matches[0].canReserve, true);
}

// H. own active unlinked remains selectable in product-create
assert.match(panel, /isHiddenFromProductCreateDiscoveryUi/);
assert.match(panel, /visibleDatabaseMatches/);

// I. published/used do not consume active reservation slots
assert.equal(
  countActiveAuthorSeoReservations([
    { reservationId: "r-used", lifecycle: "published" },
    { reservationId: "r-active", lifecycle: "in_progress" },
  ]),
  1,
);

// Active already linked to a product is also hidden from product-create
{
  const linkedActive = reservation({
    authorId: authorA,
    status: "active",
    productId: "prod-draft",
    productTitle: "Черновик",
  });
  assert.equal(isHiddenFromProductCreateDiscovery(linkedActive), true);
  const built = buildAuthorDiscoveryDatabaseMatches({
    surface: "product_create",
    authorId: authorA,
    items: [
      {
        id: "q-linked",
        queryText: "связанный запрос",
        normalizedQuery: "связанный запрос",
        frequency: 12,
        reservation: linkedActive,
      },
    ],
  });
  assert.equal(built.matches.length, 0);
}

console.log("author-seo-discovery-unit: ok");
