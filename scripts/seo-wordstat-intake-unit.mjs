#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  importWordstatIntakeItem,
  readWordstatIntakeItems,
} from "../src/lib/seo-queries/wordstat-intake.ts";

const root = process.cwd();
const route = readFileSync(
  join(root, "src/app/api/admin/seo-queries/wordstat/route.ts"),
  "utf8",
);
const adminRoute = readFileSync(
  join(root, "src/app/api/admin/seo-queries/route.ts"),
  "utf8",
);
const ui = readFileSync(
  join(root, "src/components/admin/AdminSeoQueriesClient.tsx"),
  "utf8",
);

assert.match(route, /requireAdminPermission\("seo\.manage"\)/);
assert.match(route, /fetchWordstatSuggestions\(phrase, \{ userId: session\.userId \}\)/);
assert.match(route, /from "@\/lib\/seo\/wordstat\/client"/);
assert.doesNotMatch(route, /wordstat\.yandex\.ru/);
assert.doesNotMatch(route, /NEXT_PUBLIC_YANDEX|YANDEX_SEARCH_API_KEY|YANDEX_SEARCH_FOLDER_ID/);

// The database function remains the authoritative conflict canonicalization.
assert.match(route, /\.rpc\(\s*"normalize_seo_query",\s*\{\s*p_query: phrase/s);
assert.match(route, /\.eq\("normalized_query", normalizedQuery\)/);
assert.doesNotMatch(route, /normalizeWordstatPhrase|wordstatPhraseKey/);

assert.match(route, /frequency_checked_at: frequencyCheckedAt/);
assert.match(
  route,
  /\.update\(\{ frequency, frequency_checked_at: frequencyCheckedAt \}\)/,
);
assert.doesNotMatch(
  route,
  /\.update\(\{[^}]*?(?:query_text|source|cluster_id|intent|recommended_format|audio_fit)/s,
);
assert.match(route, /\.update\(\{ frequency, frequency_checked_at: frequencyCheckedAt, analysis_status: "analyzed" \}\)\s*\.eq\("id", id\)\s*\.eq\("analysis_status", "not_analyzed"\)/);
assert.equal([...route.matchAll(/\.update\(/g)].length, 2);
assert.match(route, /from\("seo_query_proposals"\).*?\.eq\("query_id", data.id\)/);
assert.doesNotMatch(route, /reservation_id|product_id|primary_seo_query_id/);

// Admin decisions are authoritative: manual and selected Wordstat queries are immediately author-visible.
assert.match(adminRoute, /analysis_status: "analyzed"/);
assert.match(ui, /audioFit: null, analysisStatus: "analyzed", lifecycle: "Свободен"/);

assert.match(ui, /Найти запросы в Wordstat/);
assert.match(ui, /Выбрать все/);
assert.match(ui, /Добавить выбранные в SEO-базу/);
assert.match(ui, /агрегат темы, не частотность исходной фразы/);
assert.match(ui, /map\(\(item\) => \(\{ phrase: item\.phrase, count: item\.count \}\)\)/);
assert.match(ui, /source === "result" \? "результат" : "ассоциация"/);
assert.match(ui, /item\.opportunity\.label/);
assert.match(ui, /Добавлено/);
assert.match(ui, /const imported = importStatus === "created" \|\| importStatus === "promoted"/);
assert.match(ui, /const importLabel = imported \? "Добавлено"/);
assert.match(ui, /importStatus === "refreshed" \? "Уже в базе"/);
assert.match(ui, /Не удалось добавить выбранные запросы:/);
assert.match(ui, /next\.findIndex\(\(row\) => row.id === query.id\)/);
assert.match(ui, /Добавлено: \$\{payload.summary.created \+ payload.summary.promoted\}; уже в базе:/);
assert.doesNotMatch(ui, /—/);
assert.doesNotMatch(ui, /folderId|apiKey|YANDEX_SEARCH_API_KEY/);

const checkedAt = "2026-09-13T12:00:00.000Z";
const apiKey = "unit-test-api-key-must-never-leak";

function storedQuery(row) {
  return { id: row.id, queryText: row.query_text, normalizedQuery: row.normalized_query,
    source: row.source, frequency: row.frequency, analysisStatus: row.analysis_status,
    createdAt: row.created_at ?? checkedAt };
}

function createRepository({ rows = [], conflictOnCreate = false } = {}) {
  const records = rows.map((row) => ({ ...row }));
  let nextId = records.length + 1;
  let shouldConflict = conflictOnCreate;
  const normalize = (phrase) => phrase.trim().toLowerCase().replace(/\s+/g, " ");

  return {
    records,
    async normalize(phrase) {
      return normalize(phrase);
    },
    async findByNormalized(normalizedQuery) {
      const row = records.find((item) => item.normalized_query === normalizedQuery);
      return row ? { id: row.id, analysisStatus: row.analysis_status, hasProposal: row.hasProposal ?? false } : null;
    },
    async refresh(id, frequency, frequencyCheckedAt) {
      const row = records.find((item) => item.id === id);
      if (!row) return null;
      row.frequency = frequency;
      row.frequency_checked_at = frequencyCheckedAt;
      return storedQuery(row);
    },
    async promote(id, frequency, frequencyCheckedAt) {
      const row = records.find((item) => item.id === id && item.analysis_status === "not_analyzed");
      if (!row) return null;
      row.frequency = frequency;
      row.frequency_checked_at = frequencyCheckedAt;
      row.analysis_status = "analyzed";
      return storedQuery(row);
    },
    async create(input) {
      if (shouldConflict) {
        shouldConflict = false;
        records.push({
          id: `q-${nextId++}`, query_text: input.queryText, normalized_query: normalize(input.queryText),
          source: "manual", frequency: 1, frequency_checked_at: null, cluster_id: "cluster-race",
          intent: "existing", recommended_format: "article", audio_fit: "low", analysis_status: "analyzed",
          reservation_id: "reservation-race", product_id: "product-race",
        });
        return { status: "conflict" };
      }
      const row = {
        id: `q-${nextId++}`, query_text: input.queryText, normalized_query: normalize(input.queryText),
        source: input.source, frequency: input.frequency, frequency_checked_at: input.frequencyCheckedAt,
        cluster_id: null, intent: null, recommended_format: null, audio_fit: null,
        analysis_status: input.analysisStatus, reservation_id: null, product_id: null,
      };
      records.push(row);
      return { status: "created", query: storedQuery(row) };
    },
  };
}

const newRepository = createRepository();
const newResult = await importWordstatIntakeItem(
  { phrase: "  Медитация для сна  ", count: 880 }, newRepository, () => checkedAt,
);
assert.equal(newResult.status, "created");
assert.equal(newRepository.records.length, 1);
assert.deepEqual(newRepository.records[0], {
  id: "q-1", query_text: "  Медитация для сна  ", normalized_query: "медитация для сна",
  source: "wordstat", frequency: 880, frequency_checked_at: checkedAt, cluster_id: null,
  intent: null, recommended_format: null, audio_fit: null, analysis_status: "analyzed",
  reservation_id: null, product_id: null,
});

const existingRow = {
  id: "q-existing", query_text: "Медитация для сна", normalized_query: "медитация для сна",
  source: "manual", frequency: 50, frequency_checked_at: "2026-08-01T00:00:00.000Z",
  cluster_id: "cluster-1", intent: "informational", recommended_format: "practice",
  audio_fit: "high", analysis_status: "analyzed", reservation_id: "reservation-1", product_id: "product-1",
};
const existingRepository = createRepository({ rows: [existingRow] });
const refreshResult = await importWordstatIntakeItem(
  { phrase: "  МЕДИТАЦИЯ  ДЛЯ СНА ", count: 999 }, existingRepository, () => checkedAt,
);
assert.equal(refreshResult.status, "refreshed");
assert.equal(existingRepository.records.length, 1);
assert.deepEqual(existingRepository.records[0], {
  ...existingRow, frequency: 999, frequency_checked_at: checkedAt,
});

const raceRepository = createRepository({ conflictOnCreate: true });
const raceResult = await importWordstatIntakeItem(
  { phrase: "Белый шум", count: 3200 }, raceRepository, () => checkedAt,
);
assert.equal(raceResult.status, "refreshed");
assert.equal(raceRepository.records.length, 1);
assert.equal(raceRepository.records[0].frequency, 3200);
assert.equal(raceRepository.records[0].reservation_id, "reservation-race");
assert.equal(raceRepository.records[0].product_id, "product-race");
assert.equal(raceRepository.records[0].source, "manual");

assert.equal(readWordstatIntakeItems(Array.from({ length: 21 }, () => ({ phrase: "сон", count: 1 }))).ok, false);
assert.equal(readWordstatIntakeItems([{ phrase: " ", count: 1 }]).ok, false);
assert.equal(readWordstatIntakeItems([{ phrase: "сон", count: -1 }]).ok, false);
assert.equal(readWordstatIntakeItems([{ phrase: "сон", count: 1.5 }]).ok, false);

const topicTotalCount = 21500;
const topicResult = await importWordstatIntakeItem(
  { phrase: "музыка для сна", count: 3200 }, createRepository(), () => checkedAt,
);
assert.equal(topicResult.frequency, 3200);
assert.notEqual(topicResult.frequency, topicTotalCount);
assert.equal(JSON.stringify(topicResult).includes(apiKey), false);
assert.doesNotMatch(route, /console\.(?:log|info|warn|error).*?(?:API|key|token|folder)/i);

const massagePhrase = "успокаивающая музыка для массажа";
const massageRepository = createRepository();
const massageCreated = await importWordstatIntakeItem(
  { phrase: `  ${massagePhrase.toUpperCase()}  `, count: 640 },
  massageRepository,
  () => checkedAt,
);
assert.equal(massageCreated.status, "created");
assert.equal(massageCreated.id, "q-1");
assert.equal(massageRepository.records.length, 1);
assert.equal(
  massageRepository.records[0].normalized_query,
  "успокаивающая музыка для массажа",
);
const massageRefreshed = await importWordstatIntakeItem(
  { phrase: "  Успокаивающая   музыка для массажа ", count: 700 },
  massageRepository,
  () => checkedAt,
);
assert.equal(massageRefreshed.status, "refreshed");
assert.equal(massageRefreshed.id, massageCreated.id);
assert.equal(massageRepository.records.length, 1);
assert.equal(massageRepository.records[0].frequency, 700);
assert.equal(massageRepository.records[0].analysis_status, "analyzed");

for (const [analysisStatus, hasProposal, expected] of [
  ["not_analyzed", false, "promoted"],
  ["not_analyzed", true, "needs_review"],
  ["not_applicable", false, "not_applicable"],
  ["analyzed", false, "refreshed"],
]) {
  const original = { ...existingRow, analysis_status: analysisStatus, hasProposal };
  const repository = createRepository({ rows: [original] });
  const result = await importWordstatIntakeItem({ phrase: existingRow.query_text, count: 123 }, repository, () => checkedAt);
  assert.equal(result.status, expected);
  const expectedStatus = expected === "promoted" ? "analyzed" : analysisStatus;
  assert.deepEqual(repository.records[0], { ...original, analysis_status: expectedStatus, frequency: 123, frequency_checked_at: checkedAt });
  assert.deepEqual(result.query, storedQuery(repository.records[0]));
}

for (const method of ["normalize", "findByNormalized", "refresh", "promote", "create"]) {
  const rows = method === "create" || method === "normalize" ? [] : [{ ...existingRow, analysis_status: method === "promote" ? "not_analyzed" : "analyzed" }];
  const repository = createRepository({ rows });
  repository[method] = async () => { throw new Error("read/write failed"); };
  assert.equal((await importWordstatIntakeItem({ phrase: existingRow.query_text, count: 1 }, repository)).status, "error");
}
const readError = createRepository();
readError.findByNormalized = async () => undefined;
assert.equal((await importWordstatIntakeItem({ phrase: "лоу фай", count: 1 }, readError)).status, "error");

for (const status of ["analyzed", "not_applicable", "not_analyzed"]) {
  const repository = createRepository({ rows: [{ ...existingRow, analysis_status: "not_analyzed" }] });
  repository.promote = async () => {
    repository.records[0].analysis_status = status;
    repository.records[0].hasProposal = true;
    return null;
  };
  const result = await importWordstatIntakeItem({ phrase: existingRow.query_text, count: 9 }, repository);
  assert.equal(result.status, status === "analyzed" ? "refreshed" : status === "not_applicable" ? "not_applicable" : "needs_review");
}
// A unique conflict must re-enter every existing-row branch.
for (const [status, hasProposal, expected] of [
  ["not_analyzed", false, "promoted"], ["not_analyzed", true, "needs_review"],
  ["not_applicable", false, "not_applicable"], ["analyzed", false, "refreshed"],
]) {
  const repository = createRepository();
  repository.create = async () => {
    repository.records.push({ ...existingRow, analysis_status: status, hasProposal });
    return { status: "conflict" };
  };
  const result = await importWordstatIntakeItem({ phrase: existingRow.query_text, count: 10 }, repository);
  assert.equal(result.status, expected);
}

console.log("seo-wordstat-intake-unit: ok");
