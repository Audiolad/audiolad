#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const route = readFileSync(
  join(root, "src/app/api/admin/seo-queries/wordstat/route.ts"),
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

assert.match(route, /MAX_IMPORT_ITEMS = 20/);
assert.match(route, /value\.length === 0 \|\| value\.length > MAX_IMPORT_ITEMS/);
assert.match(route, /Number\.isInteger\(record\.count\)/);
assert.match(route, /\(record\.count as number\) < 0/);
assert.match(route, /const phrase = readPhrase\(record\.phrase\)/);

// The database function is the only canonicalization used for conflict lookup.
assert.match(route, /\.rpc\(\s*"normalize_seo_query",\s*\{ p_query: item\.phrase \}/s);
assert.match(route, /\.eq\("normalized_query", normalizedQuery\)/);
assert.doesNotMatch(route, /normalizeWordstatPhrase|wordstatPhraseKey|toLowerCase\(/);

assert.match(route, /source: "wordstat"/);
assert.match(route, /frequency: item\.count/);
assert.match(route, /frequency_checked_at: frequencyCheckedAt/);
assert.match(route, /analysis_status: "not_analyzed"/);
assert.match(
  route,
  /\.update\(\{ frequency, frequency_checked_at: frequencyCheckedAt \}\)/,
);
assert.doesNotMatch(
  route,
  /\.update\(\{[^}]*?(?:query_text|source|cluster_id|intent|recommended_format|audio_fit|analysis_status)/s,
);
assert.doesNotMatch(route, /reservation_id|product_id|primary_seo_query_id/);
assert.match(route, /insertError\?\.code === "23505"/);

assert.match(ui, /Найти запросы в Wordstat/);
assert.match(ui, /Выбрать все/);
assert.match(ui, /Добавить выбранные в SEO-базу/);
assert.match(ui, /агрегат темы, не частотность исходной фразы/);
assert.match(ui, /map\(\(item\) => \(\{ phrase: item\.phrase, count: item\.count \}\)\)/);
assert.doesNotMatch(ui, /topicTotalCount.*count|count.*topicTotalCount/s);
assert.match(ui, /source === "result" \? "результат" : "ассоциация"/);
assert.match(ui, /item\.opportunity\.label/);
assert.match(ui, /Добавлено/);
assert.match(ui, /Добавлено: \$\{payload\.summary\.created\}; обновлено: \$\{payload\.summary\.refreshed\}; ошибок: \$\{payload\.summary\.errors\}/);
assert.doesNotMatch(ui, /folderId|apiKey|YANDEX_SEARCH_API_KEY/);

console.log("seo-wordstat-intake-unit: ok");
