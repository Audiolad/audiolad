#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const filename = "20261007130000_topics_functional_scenarios.sql";
const path = join(root, "supabase/migrations", filename);
const sql = readFileSync(path, "utf8");
const docs = readFileSync(join(root, "docs/TOPICS.md"), "utf8");

const EXPECTED_TOPICS = [
  ["rest", "Отдых", 160],
  ["relax", "Релакс", 170],
  ["work", "Работа", 180],
  ["concentration", "Концентрация", 190],
  ["study", "Учёба", 200],
  ["creativity", "Творчество", 210],
  ["sport", "Спорт", 220],
  ["desires", "Желания", 230],
];

assert.equal(existsSync(path), true, "functional scenario migration exists");
assert.match(filename, /^20261007130000_/, "migration timestamp is unique");
assert.match(sql, /INSERT INTO public\.topics/);
assert.match(sql, /ON CONFLICT \(key\) DO NOTHING/);
assert.doesNotMatch(sql, /UPDATE\s+public\.topics/i, "existing topic rows are unchanged");
assert.doesNotMatch(sql, /DELETE FROM public\.topics/i, "no topic rows are deleted");
assert.doesNotMatch(sql, /INSERT INTO public\.practice_topics/i, "no product topics backfill");
assert.doesNotMatch(sql, /UPDATE\s+public\.practice_topics/i, "no product topics remap");
assert.doesNotMatch(sql, /ALTER TABLE/i, "no schema changes");
assert.doesNotMatch(sql, /CREATE (?:OR REPLACE )?FUNCTION/i, "no RPC changes");
assert.doesNotMatch(sql, /Желание(?:'|,)/, "singular Желание is never seeded");
assert.doesNotMatch(sql, /Кафе|Ресторан|Магазин|Гостиница|Спортзал/, "no venue topics");

for (const [key, title, sortOrder] of EXPECTED_TOPICS) {
  assert.match(
    sql,
    new RegExp(`'${key}', '${key}', '${title}', NULL, ${sortOrder}, true, true`),
    `${title} is an active topic with the expected immutable key`,
  );
  assert.match(
    docs,
    new RegExp(`\\| \`${key}\` \\| ${title} \\| ${sortOrder}`),
    `TOPICS.md lists ${title}`,
  );
}

assert.match(docs, /\| `learning` \| Обучение \| 140/);
assert.match(docs, /\| `study` \| Учёба \| 200/);
assert.match(docs, /\| `desires` \| Желания \| 230/);
assert.doesNotMatch(docs, /\| `desire` \| Желание \|/);

console.log("topics-functional-scenarios-sql-unit: ok");
