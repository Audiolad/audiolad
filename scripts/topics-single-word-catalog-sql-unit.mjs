#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const filename = "20261006120000_topics_single_word_catalog.sql";
const path = join(root, "supabase/migrations", filename);
const sql = readFileSync(path, "utf8");
const docs = readFileSync(join(root, "docs/TOPICS.md"), "utf8");

const EXPECTED_ORDER = [
  ["money", "Деньги", 10],
  ["abundance", "Изобилие", 20],
  ["love", "Любовь", 30],
  ["relationships", "Отношения", 40],
  ["calm", "Спокойствие", 50],
  ["sleep", "Сон", 60],
  ["self-worth", "Уверенность", 70],
  ["self-esteem", "Самооценка", 80],
  ["body-wellbeing", "Самочувствие", 90],
  ["energy", "Энергия", 100],
  ["purpose", "Предназначение", 110],
  ["career", "Карьера", 120],
  ["business", "Бизнес", 130],
  ["learning", "Обучение", 140],
  ["spirituality", "Духовность", 150],
];

assert.equal(existsSync(path), true, "single-word catalog migration exists");
assert.match(filename, /^20261006120000_/, "timestamp is 20261006120000");
assert.match(sql, /INSERT INTO public\.topics/);
assert.match(sql, /ON CONFLICT \(key\) DO UPDATE/);
assert.doesNotMatch(sql, /DELETE FROM public\.topics/i, "does not delete topic rows");
assert.doesNotMatch(sql, /INSERT INTO public\.practice_topics/i, "does not rewrite practice_topics");
assert.doesNotMatch(sql, /UPDATE\s+public\.practice_topics/i, "does not reassign practice_topics");
assert.doesNotMatch(sql, /INSERT INTO public\.playlist_topics/i, "does not rewrite playlist_topics");
assert.doesNotMatch(sql, /DROP TABLE/i);
assert.doesNotMatch(sql, /ALTER TABLE/);
assert.doesNotMatch(sql, /publication_class/);

assert.match(sql, /'abundance'/);
assert.match(sql, /'Изобилие'/);
assert.match(sql, /'love'/);
assert.match(sql, /'Любовь'/);
assert.match(sql, /'self-esteem'/);
assert.match(sql, /'Самооценка'/);
assert.match(sql, /title = 'Уверенность'/);
assert.match(sql, /title = 'Самочувствие'/);
assert.match(sql, /title = 'Энергия'/);
assert.match(sql, /key = 'self-worth'/);
assert.match(sql, /key = 'body-wellbeing'/);
assert.match(sql, /key = 'energy'/);

assert.match(sql, /Уверенность и самоценность/);
assert.match(sql, /Уверенность и самооценка/);
assert.match(sql, /Тело и самочувствие/);
assert.match(sql, /Энергия и ресурс/);

assert.match(sql, /MIGRATION_COUNTS/);
assert.match(sql, /confidence_self_esteem/);
assert.match(sql, /body_wellbeing/);
assert.match(sql, /energy_resource/);
assert.match(sql, /count\(DISTINCT pt\.practice_id\)/);
assert.match(
  sql,
  /confidence_self_esteem \(self-worth\) = 9/,
  "documents seed baseline for self-worth",
);
assert.match(sql, /body_wellbeing\s+= 2/, "documents seed baseline for body-wellbeing");
assert.match(sql, /energy_resource\s+= 7/, "documents seed baseline for energy");

assert.match(
  sql,
  /does NOT\s+auto-assign «Самооценка»/i,
);
assert.match(sql, /expected 15 active catalog topics/);
assert.match(
  sql,
  /practice_topics rows still reference old compound titles/,
);
assert.match(sql, /playlist_topics rows still reference old compound titles/);

for (const [key, title, sortOrder] of EXPECTED_ORDER) {
  assert.match(
    sql,
    new RegExp(`${key}\\|${title}\\|${sortOrder}`),
    `post-check includes ${key} ${title} ${sortOrder}`,
  );
  assert.match(
    docs,
    new RegExp(`\`${key}\` \\| ${title} \\| ${sortOrder}`),
    `TOPICS.md lists ${key} ${title} ${sortOrder}`,
  );
}

assert.equal(EXPECTED_ORDER.length, 15, "15 topics in expected catalog");
assert.match(docs, /20261006120000_topics_single_word_catalog\.sql/);
assert.doesNotMatch(docs, /\| `self-worth` \| Уверенность и самоценность/);
assert.doesNotMatch(docs, /\| `self-worth` \| Уверенность и самооценка/);
assert.doesNotMatch(docs, /\| `body-wellbeing` \| Тело и самочувствие/);
assert.doesNotMatch(docs, /\| `energy` \| Энергия и ресурс/);

console.log("topics-single-word-catalog-sql-unit: ok");
