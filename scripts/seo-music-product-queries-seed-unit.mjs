#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath =
  "supabase/migrations/20261031120100_seo_music_product_queries_seed.sql";
const migration = readFileSync(path.join(root, migrationPath), "utf8");
const spaSeed = readFileSync(
  path.join(root, "supabase/migrations/20261022120000_seo_spa_massage_queries_seed.sql"),
  "utf8",
);

const phrases = [
  "музыка для сна",
  "музыка для глубокого сна",
  "музыка для засыпания",
  "музыка для отдыха",
  "музыка для релакса",
  "музыка для релаксации",
  "музыка для глубокого расслабления",
  "музыка для медитации",
  "музыка для медитации перед сном",
  "музыка для утренней медитации",
  "музыка для дыхания",
  "музыка для массажа",
  "музыка для массажного кабинета",
  "музыка для спа",
  "музыка для спа-салона",
  "музыка для йоги",
  "музыка для йоги нидры",
  "музыка для растяжки",
  "музыка для пилатеса",
  "музыка для тренировки",
  "музыка для работы",
  "музыка для учебы",
  "музыка для офиса",
  "музыка для коворкинга",
  "музыка для концентрации",
  "музыка для фокуса",
  "музыка для чтения",
  "музыка для чтения книг",
  "музыка для библиотеки",
  "музыка для фона",
  "музыка для кафе",
  "музыка для ресторана",
  "музыка для магазина",
  "музыка для салона красоты",
  "музыка для бизнеса",
  "музыка для отеля",
  "музыка для приемной",
  "музыка для ванны",
  "музыка для вечера",
  "музыка для утра",
  "музыка для восстановления",
  "музыка для антистресса",
  "музыка для спокойствия",
  "музыка для творчества",
  "музыка для звуковой ванны",
  "музыка для рейки",
  "музыка для чакр",
  "музыка для беременности",
  "музыка для детского сна",
];

const spaPhrases = [
  "фоновая музыка для спа",
  "музыка для спа-процедур",
  "музыка для релаксации и массажа",
  "успокаивающая музыка для массажа",
  "красивая музыка для массажа",
  "спокойная музыка для массажа",
  "музыка для массажа расслабляющая час",
];

assert.equal(new Set(phrases).size, phrases.length, "seed phrases are unique");
for (const phrase of phrases) {
  assert.match(phrase, /^музыка для /);
  assert.equal(spaPhrases.includes(phrase), false, phrase);
  assert.match(
    migration,
    new RegExp(`'${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`),
  );
  assert.doesNotMatch(spaSeed, new RegExp(`'${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
}
for (const phrase of spaPhrases) {
  assert.doesNotMatch(
    migration,
    new RegExp(`'${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`),
  );
}

const valueRows = [...migration.matchAll(/\('музыка для [^']*',\s*'manual'/g)];
assert.equal(valueRows.length, phrases.length, "one value row per phrase");

assert.match(migration, /analysis_status/);
assert.match(migration, /'analyzed'/);
assert.match(migration, /'music'/);
assert.match(migration, /'Музыка'/);
assert.match(migration, /'high'/);
assert.match(migration, /NULL,\s*NULL,\s*'music'/);
assert.doesNotMatch(migration, /frequency,\s*\d+/);
assert.doesNotMatch(migration, /frequency_checked_at,\s*'20/);

assert.match(migration, /ON CONFLICT \(normalized_query\) DO UPDATE/);
assert.match(migration, /analysis_status = 'analyzed'/);
assert.match(
  migration,
  /intent = COALESCE\(public\.seo_queries\.intent, EXCLUDED\.intent\)/,
);
assert.match(
  migration,
  /recommended_format = COALESCE\(public\.seo_queries\.recommended_format, EXCLUDED\.recommended_format\)/,
);
assert.match(
  migration,
  /audio_fit = COALESCE\(public\.seo_queries\.audio_fit, EXCLUDED\.audio_fit\)/,
);
assert.doesNotMatch(migration, /DO UPDATE SET[\s\S]*frequency\s*=/);
assert.doesNotMatch(migration, /DO UPDATE SET[\s\S]*frequency_checked_at\s*=/);
assert.doesNotMatch(migration, /DO UPDATE SET[\s\S]*source\s*=/);
assert.doesNotMatch(migration, /DO UPDATE SET[\s\S]*query_text\s*=/);
assert.doesNotMatch(migration, /CREATE TABLE|ADD COLUMN/);

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(
  pkg.scripts["test:seo-music-product-queries-seed"],
  "npx tsx scripts/seo-music-product-queries-seed-unit.mjs",
);

console.log("seo-music-product-queries-seed-unit: ok");
