#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  proposeAuthorSeoQuery,
  reconcileAuthorDiscoverySuggestion,
} from "../src/lib/seo-queries/author-discovery.ts";

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
const wordstatSuggestions = read(
  "src/app/api/author/seo/wordstat/suggestions/route.ts",
);

assert.match(discoveryRoute, /requireAuthorMembership\(authorId\)/);
assert.match(discoveryRoute, /fetchWordstatSuggestions\(phrase, \{ userId: user\.id \}\)/);
assert.match(discoveryRoute, /from "@\/lib\/seo\/wordstat\/client"/);
assert.match(discoveryRoute, /suggestion\.count/);
assert.doesNotMatch(discoveryRoute, /topicTotalCount/);
assert.doesNotMatch(discoveryRoute, /YANDEX_SEARCH_API_KEY|NEXT_PUBLIC_YANDEX|folderId/);
assert.doesNotMatch(discoveryRoute, /wordstat\.yandex\.ru/);

assert.match(proposalsRoute, /requireAuthorMutationMembership\(authorId\)/);
assert.match(proposalsRoute, /proposeAuthorSeoQuery/);
assert.doesNotMatch(proposalsRoute, /YANDEX_SEARCH_API_KEY|analysis_status:\s*"analyzed"/);

assert.match(ui, /Найти SEO-тему/);
assert.match(ui, /Найти запросы/);
assert.match(ui, /Предложить запрос/);
assert.match(ui, /Отправлен на проверку/);
assert.match(ui, /Запросов в месяц/);
assert.match(ui, /\/api\/author\/seo\/discovery/);
assert.match(ui, /\/api\/author\/seo\/proposals/);
assert.match(ui, /\/api\/author\/seo-reservations/);
assert.doesNotMatch(ui, /analysis_status|YANDEX_SEARCH_API_KEY/);
assert.doesNotMatch(ui, /api\/author\/seo\/discovery[\s\S]*normalized_query/);

assert.match(migration, /CREATE TABLE public\.seo_query_proposals/);
assert.match(migration, /seo_query_proposals_query_author_unique/);
assert.match(migration, /submitted_by_user_id/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);

assert.match(reserveMigration, /seo_query_not_analyzed/);
assert.match(wordstatSuggestions, /fetchWordstatSuggestions/);

const authorA = "author-a";
const authorB = "author-b";

// 1. analyzed + free → available
{
  const row = reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "музыка для сна", count: 320 },
    authorId: authorA,
    query: { id: "q1", analysisStatus: "analyzed" },
    reservation: null,
    alreadyProposedByAuthor: false,
  });
  assert.equal(row.status, "available");
  assert.equal(row.statusLabel, "Свободен");
  assert.equal(row.canReserve, true);
  assert.equal(row.frequency, 320);
}

// 2. analyzed + other reservation → occupied
{
  const row = reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "музыка для сна", count: 320 },
    authorId: authorA,
    query: { id: "q1", analysisStatus: "analyzed" },
    reservation: {
      id: "r1",
      queryId: "q1",
      authorId: authorB,
      status: "active",
      productTitle: null,
    },
    alreadyProposedByAuthor: false,
  });
  assert.equal(row.status, "occupied");
  assert.equal(row.statusLabel, "Занят");
  assert.equal(row.canReserve, false);
}

// 3. analyzed + own reservation → own
{
  const row = reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "музыка для сна", count: 320 },
    authorId: authorA,
    query: { id: "q1", analysisStatus: "analyzed" },
    reservation: {
      id: "r1",
      queryId: "q1",
      authorId: authorA,
      status: "active",
      productTitle: "Мой трек",
    },
    alreadyProposedByAuthor: false,
  });
  assert.equal(row.status, "own");
  assert.equal(row.statusLabel, "У вас в работе");
  assert.equal(row.productTitle, "Мой трек");
  assert.equal(row.canReserve, false);
}

// 4. not_analyzed → pending_review
{
  const row = reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "новая тема", count: 10 },
    authorId: authorA,
    query: { id: "q2", analysisStatus: "not_analyzed" },
    reservation: null,
    alreadyProposedByAuthor: false,
  });
  assert.equal(row.status, "pending_review");
  assert.equal(row.statusLabel, "На проверке");
  assert.equal(row.canPropose, true);
}

// 5. not_applicable
{
  const row = reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "мусор", count: 1 },
    authorId: authorA,
    query: { id: "q3", analysisStatus: "not_applicable" },
    reservation: null,
    alreadyProposedByAuthor: false,
  });
  assert.equal(row.status, "not_applicable");
  assert.equal(row.canReserve, false);
  assert.equal(row.canPropose, false);
}

// 6. missing → new
{
  const row = reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "бренд новая", count: 55 },
    authorId: authorA,
    query: null,
    reservation: null,
    alreadyProposedByAuthor: false,
  });
  assert.equal(row.status, "new");
  assert.equal(row.canPropose, true);
}

// 8. topicTotalCount must not drive frequency — suggestion.count wins even if caller had a topic total nearby
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

function createProposalRepository({
  rows = [],
  proposals = [],
  conflictOnCreate = false,
  conflictOnProposal = false,
} = {}) {
  const records = rows.map((row) => ({ ...row }));
  const proposalRows = proposals.map((row) => ({ ...row }));
  let nextId = records.length + 1;
  let nextProposal = proposalRows.length + 1;
  let shouldConflict = conflictOnCreate;
  let shouldConflictProposal = conflictOnProposal;
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
      if (shouldConflictProposal) {
        shouldConflictProposal = false;
        proposalRows.push({
          id: `p-race-${nextProposal++}`,
          query_id: input.queryId,
          author_id: input.authorId,
          submitted_by_user_id: input.submittedByUserId,
        });
        return { status: "conflict" };
      }
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

// 7. proposal creates seo_query not_analyzed with correct source/frequency/checked_at
{
  const repo = createProposalRepository();
  const result = await proposeAuthorSeoQuery(
    {
      phrase: "  Музыка для йоги  ",
      count: 880,
      authorId: authorA,
      submittedByUserId: "user-a",
    },
    repo,
    () => checkedAt,
  );
  assert.equal(result.ok, true);
  assert.equal(result.status, "proposed");
  assert.equal(result.createdQuery, true);
  assert.equal(result.analysisStatus, "not_analyzed");
  assert.equal(result.source, "wordstat");
  assert.equal(result.frequency, 880);
  assert.equal(result.frequencyCheckedAt, checkedAt);
  assert.equal(repo.records.length, 1);
  assert.equal(repo.records[0].analysis_status, "not_analyzed");
  assert.equal(repo.proposalRows.length, 1);
}

// 9 + 10. duplicate normalized / unique race reuses existing query
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
  assert.equal(result.createdQuery, false);
  assert.equal(repo.records.length, 1);
  assert.equal(repo.proposalRows.length, 1);
  assert.equal(repo.records[0].analysis_status, "not_analyzed");
}

// 11. same author does not duplicate proposal
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
  assert.equal(result.ok, true);
  assert.equal(result.status, "already_proposed");
  assert.equal(repo.proposalRows.length, 1);
}

// 12. other author can propose pending query without duplicate seo_query
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
  assert.equal(result.status, "proposed");
  assert.equal(result.createdQuery, false);
  assert.equal(repo.records.length, 1);
  assert.equal(repo.proposalRows.length, 2);
}

// already analyzed cannot be proposed as new
{
  const repo = createProposalRepository({
    rows: [
      {
        id: "q-analyzed",
        query_text: "готовая",
        normalized_query: "готовая",
        source: "manual",
        frequency: 9,
        frequency_checked_at: checkedAt,
        analysis_status: "analyzed",
      },
    ],
  });
  const result = await proposeAuthorSeoQuery(
    {
      phrase: "готовая",
      count: 9,
      authorId: authorA,
      submittedByUserId: "user-a",
    },
    repo,
    () => checkedAt,
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "already_analyzed");
  assert.equal(repo.proposalRows.length, 0);
}

// 13. membership enforcement in routes
assert.match(discoveryRoute, /requireAuthorMembership\(authorId\)/);
assert.match(proposalsRoute, /requireAuthorMutationMembership\(authorId\)/);
assert.match(proposalsRoute, /author_id/);

// 14 + 15. reservation limit + not_analyzed gate remain in reserve RPC / route
const reservationsRoute = read("src/app/api/author/seo-reservations/route.ts");
assert.match(reservationsRoute, /reserve_seo_query/);
assert.match(reservationsRoute, /seo_reservation_limit_reached/);
assert.match(reserveMigration, /v_active_count >= 5/);
assert.match(reserveMigration, /analysis_status <> 'analyzed'/);
assert.match(reserveMigration, /seo_query_not_analyzed/);

// 16. no secrets in browser UI / discovery response contract
assert.doesNotMatch(ui, /apiKey|YANDEX|service_role|folderId/);
assert.doesNotMatch(discoveryRoute, /apiKey|service_role|YANDEX_SEARCH/);

// proposed state after own proposal on pending
{
  const row = reconcileAuthorDiscoverySuggestion({
    suggestion: { phrase: "на проверке моя", count: 3 },
    authorId: authorA,
    query: { id: "q4", analysisStatus: "not_analyzed" },
    reservation: null,
    alreadyProposedByAuthor: true,
  });
  assert.equal(row.status, "proposed");
  assert.equal(row.canPropose, false);
}

console.log("author-seo-discovery-unit: ok");
