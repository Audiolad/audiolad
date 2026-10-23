#!/usr/bin/env node
/** Offline unit tests for the «Райтер» pipeline: validators, normalizer, converter. */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeBrief } from "./lib/brief.mjs";
import { AUDIT_PATH, MASTER_PATH, loadContext } from "./lib/context.mjs";
import { COUNT_TEST_FILES, bumpCountTests, constName, toDefinition, toTypeScript, updateOperational, masterEntry } from "./lib/convert.mjs";
import { costRub } from "./lib/cost.mjs";
import { normalizeArticle } from "./lib/normalize.mjs";
import { articleSchema, buildMessages } from "./lib/prompt.mjs";
import { validateArticle } from "./lib/validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const context = await loadContext(root);
const [linkA, linkB] = ["kak-razvit-lyubov-k-sebe", "kak-prinyat-sebya"];
assert(context.articleBySlug.has(linkA) && context.articleBySlug.has(linkB), "fixture articles exist");

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const brief = normalizeBrief(JSON.parse(readFileSync(join(fixtureDir, "brief.json"), "utf8")));
const FIXTURE = readFileSync(join(fixtureDir, "article.json"), "utf8");

const para = (text) => ({ kind: "paragraph", text });
function fixture() {
  return JSON.parse(FIXTURE);
}

async function check(article) {
  const { article: normalized } = normalizeArticle(article, context);
  return validateArticle(normalized, brief, context, { live: false });
}

// 1. Valid fixture passes; normalizer fixes typography and seeAlso titles.
{
  const raw = fixture();
  raw.leadBeforeAudio = raw.leadBeforeAudio.replace(":", " \u2014").replace("несколько", "не\u2011сколько");
  raw.metaTitle = raw.metaTitle.replace(" – АудиоЛад", " | AudioLad");
  const { article, changes } = normalizeArticle(raw, context);
  assert(!JSON.stringify(article).includes("\u2014"));
  assert(article.metaTitle.endsWith(" – АудиоЛад"), article.metaTitle);
  assert.equal(article.seeAlsoLinks[0].title, context.articleBySlug.get(linkA).title);
  assert(changes.length >= 3, changes.join("; "));
  const result = await validateArticle(article, brief, context, { live: false });
  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.quotes.verbatim, 1);
}

// 2. Altered quote and missing required quote.
{
  const raw = fixture();
  raw.sections[0].blocks[0] = para("Старая поговорка: «Тише едешь – дальше будешь, а спешка нужна лишь при ловле блох.»");
  const result = await check(raw);
  assert(result.errors.some((e) => e.includes("не дословна")), result.errors.join("\n"));
  assert(result.errors.some((e) => e.includes("[S1]")));
}

// 3. Promises are rejected unless negated.
{
  const raw = fixture();
  raw.introAfterAudio = ["Эта практика гарантирует исцеление и защитит от любых бед."];
  const result = await check(raw);
  assert(result.errors.filter((e) => e.includes("запрещённое обещание")).length >= 3, result.errors.join("\n"));
  raw.introAfterAudio = ["Практика не обещает исцеления и не заменяет врача: это просто пауза."];
  assert.deepEqual((await check(raw)).errors, []);
}

// 4. Links: unknown article, foreign practice, external URL not in brief, missing primary practice link.
{
  const raw = fixture();
  raw.sections[0].blocks[1].segments[1].href = "/practice/someone/other";
  raw.sections[1].blocks[2].segments[1].href = "/articles/net-takoy-stati";
  raw.sections[1].blocks[2].segments.push({ href: "https://evil.example.com/x", label: "x" });
  const result = await check(raw);
  for (const needle of ["не из брифа", "не существует в реестре", "внешняя ссылка", "нет ссылки на основную практику"]) {
    assert(result.errors.some((e) => e.includes(needle)), `${needle}\n${result.errors.join("\n")}`);
  }
}

// 5. Em dash survives only if inserted after normalization; HTML and table without support.
{
  const { article } = normalizeArticle(fixture(), context);
  article.closingSection.paragraphs[0] += " \u2014 <a href=\"/x\">x</a>";
  const result = await validateArticle(article, brief, { ...context, supportsTable: false }, { live: false });
  for (const needle of ["длинное тире", "HTML-тег", "table не поддерживается"]) {
    assert(result.errors.some((e) => e.includes(needle)), `${needle}\n${result.errors.join("\n")}`);
  }
}

// 5b. The fixture table is valid where types.ts supports tables.
{
  const { article } = normalizeArticle(fixture(), context);
  const result = await validateArticle(article, brief, { ...context, supportsTable: true }, { live: false });
  assert(!result.errors.some((e) => e.includes("table")), result.errors.join("\n"));
}

// 6. Duplicates: existing slug and existing title.
{
  const raw = fixture();
  raw.title = context.articleBySlug.get(linkA).title;
  const result = await validateArticle(normalizeArticle(raw, context).article, { ...brief, slug: linkA }, context, { live: false });
  assert(result.errors.some((e) => e.includes("уже есть в реестре")));
  assert(result.errors.some((e) => e.includes("title совпадает")));
}

// 7. Brief: only practice type; schema follows table support and related practices.
assert.throws(() => normalizeBrief({ ...brief, articleType: "creator" }), /practice/);
{
  const { messages, tableAllowed } = buildMessages(brief, { ...context, supportsTable: false });
  assert.equal(tableAllowed, false);
  assert(!messages[1].content.includes('kind:"table"'));
  const schema = articleSchema(brief, { tableAllowed: true });
  assert.deepEqual(schema.properties.relatedPracticeBlurbs.required, ["elixir-molodosti"]);
  assert.equal(schema.properties.sections.items.properties.blocks.items.anyOf.length, 5);
}

// 8. Converter: TS module, count bump, operational files on a temporary copy.
{
  const { article } = normalizeArticle(fixture(), context);
  const definition = toDefinition(article, brief, "2026-10-23");
  assert.equal(definition.closingSection.id, "glavnoe");
  assert.equal(definition.topicSlug, "pending-hub-reconciliation");
  const ts = toTypeScript(definition, brief, "Cloud.ru gpt-oss-120b");
  assert(ts.includes(`export const ${constName(brief.slug)} = {`));
  assert(ts.includes("as const satisfies ArticleDefinition;"));
  const tmp = mkdtempSync(join(tmpdir(), "writer-unit-"));
  try {
    for (const file of [...COUNT_TEST_FILES, MASTER_PATH, AUDIT_PATH]) cpSync(join(root, file), join(tmp, file), { recursive: true });
    const counts = bumpCountTests(tmp, context.articles.length);
    assert.equal(counts.reduce((sum, item) => sum + item.hits, 0) >= 3, true);
    assert.throws(() => bumpCountTests(tmp, 1), /не найдено/);
    const before = JSON.parse(readFileSync(join(tmp, MASTER_PATH), "utf8"));
    updateOperational(tmp, masterEntry(definition, brief, "2026-10-23"));
    const master = JSON.parse(readFileSync(join(tmp, MASTER_PATH), "utf8"));
    const audit = JSON.parse(readFileSync(join(tmp, AUDIT_PATH), "utf8"));
    assert.equal(master.articles.length, before.articles.length + 1);
    assert.equal(master.articles.at(-1).status, "PLANNED");
    assert.equal(audit.entries.at(-1).validationStatus, "PLANNED");
    assert.deepEqual(master.nextQueue, before.nextQueue);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// 9. Tariff.
assert.equal(costRub("openai/gpt-oss-120b", 1_000_000, 1_000_000), 76.86);
assert.throws(() => costRub("unknown/model", 1, 1));

console.log("writer-unit: OK");
