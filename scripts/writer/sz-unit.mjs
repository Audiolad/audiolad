#!/usr/bin/env node
/**
 * Offline unit tests for «Райтер» in sergey-zoya.ru mode (`--site sz`): expert pool and cautions,
 * brief validation, assembly + rules on the approved «Ангел-хранитель» article (positive reference)
 * and on broken copies of it (negative samples), apply helpers, the generated stage gate and the
 * baseline comparison of the site checks. No network, no Cloud.ru, no sergey-zoya-site checkout:
 * a tiny synthetic site is built in a temp dir.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { bumpCanonicalCount, gateSource, insertStoryOpening, ruleConfig, storyOpening, wireGate } from "./lib/sites/sz/apply.mjs";
import { assembleSzArticle, normalizeSzFields } from "./lib/sites/sz/assemble.mjs";
import { BudgetError, makeCaller } from "./lib/call.mjs";
import { normalizePack } from "./lib/sites/sz/brief.mjs";
import { compareSzChecks } from "./lib/sites/sz/checks.mjs";
import { SZ } from "./lib/sites/sz/config.mjs";
import { collectExperts, loadSzContext } from "./lib/sites/sz/context.mjs";
import {
  CONFLICTING_EXPERTS, EXPERT_BANS, KNOWN_CARDS, defaultExpertPool, expertCard, missingMix, parseExpertsMd, rankExperts, rotationAdvice, rotationProblems,
} from "./lib/sites/sz/experts.mjs";
import { fieldsFromMarkdown } from "./lib/sites/sz/extract.mjs";
import { CORRECTIONS, LESSONS, LESSONS_FILE, parseCorrections, readReference } from "./lib/sites/sz/knowledge.mjs";
import { packView, resolveCards } from "./lib/sites/sz/pipeline.mjs";
import { buildSzMessages } from "./lib/sites/sz/prompt.mjs";
import { DISCOMFORT_PATTERNS, checkSzArticle, checkSzPack } from "./lib/sites/sz/rules.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures/sz");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const errorsOf = (problems) => problems.filter((problem) => problem.severity === "error");
let count = 0;
const test = (name, fn) => {
  fn();
  count += 1;
  console.log(`ok ${name}`);
};

// ── expert pool ──
const pool = defaultExpertPool();
test("pool: the whole EXPERTS_RU.md is read (40 experts, every section)", () => {
  assert.equal(pool.size, 40);
  for (const name of ["Юлия Гиппенрейтер", "Вирджиния Сатир", "Блюма Зейгарник", "Игорь Кон", "Лиза Фельдман Барретт", "Пол Экман"]) assert.ok(pool.has(name), name);
  const cells = {};
  for (const expert of pool.values()) cells[`${expert.gender}${expert.group}`] = (cells[`${expert.gender}${expert.group}`] ?? 0) + 1;
  assert.deepEqual(cells, { ЖРУ: 10, МРУ: 10, ЖЗАР: 10, МЗАР: 10 });
  assert.match(pool.get("Барбара Фредриксон").caution, /3:1/);
  assert.match(pool.get("Дэниел Сигел").caution, /психиатр/);
});

test("pool: sections added later are picked up without code changes", () => {
  const extra = parseExpertsMd("# Пул\n\n1. **Тест Тестова** [Ж, РУ]: психолог.\n   Осторожно: только тест.\n\n## Расширение пула, 2099-01-01\n\n41. **Новый Эксперт** [М/ЗАР] психолог\n");
  assert.deepEqual([...extra.keys()], ["Тест Тестова", "Новый Эксперт"]);
  assert.equal(extra.get("Новый Эксперт").group, "ЗАР");
  assert.match(extra.get("Тест Тестова").caution, /только тест/);
});

test("pool: every expert has a card (photo, «Портрет …» alt, credit, role) matching its tags", () => {
  for (const name of pool.keys()) {
    const card = KNOWN_CARDS.find((item) => item.name === name);
    assert.ok(card, `${name}: нет KNOWN_CARDS`);
    assert.equal(card.gender, pool.get(name).gender, name);
    assert.equal(card.group, pool.get(name).group, name);
    assert.match(card.alt, /^(?:Портрет |Карл Роджерс, рисованный портрет)/, name);
    assert.match(card.credit, /^(?:Фото|Портрет): /, name);
    assert.ok(card.role && !/https?:|www\./.test(card.credit + card.role), name);
  }
  const added = "zeigarnik granovskaya andreeva sapogova nourkova krol petrovsky reshetnikov vachkov kon feldman-barrett fredrickson langer lyubomirsky santos csikszentmihalyi rollo-may siegel kornfield ekman".split(" ");
  for (const slug of added) assert.ok(KNOWN_CARDS.some((card) => card.photo === `${slug}.webp`), slug);
  assert.match(KNOWN_CARDS.find((card) => card.name === "Дэниел Сигел").role, /^Психиатр/);
});

test("pool: site card > KNOWN_CARDS > brief override", () => {
  const siteCards = new Map([["Марина Мелия", { name: "Марина Мелия", photo: "melia-2.webp", alt: "a", credit: "c", role: "r" }]]);
  assert.equal(expertCard("Марина Мелия").photo, "melia.webp");
  assert.equal(expertCard("Марина Мелия", { siteCards }).photo, "melia-2.webp");
  assert.equal(expertCard("Марина Мелия", { siteCards, override: { photo: "x.webp" } }).photo, "x.webp");
});

test("pool: mix, rotation limit and rotation advice prefer less-used experts", () => {
  assert.deepEqual(missingMix(["Марина Мелия", "Эрих Фромм"], pool), []);
  assert.ok(missingMix(["Марина Мелия", "Галина Андреева"], pool).length > 0);
  const art = (slug, ...names) => ({ slug, experts: names.map((name) => ({ name })) });
  assert.equal(rotationProblems([art("a", "Эрих Фромм"), art("b", "Эрих Фромм"), art("c", "Эрих Фромм")]).length, 1);
  assert.equal(rotationProblems([art("a", "Эрих Фромм"), art("b", "Эрих Фромм")]).length, 0);
  const usage = new Map([["Эрих Фромм", 32], ["Марина Мелия", 24], ["Пол Экман", 1]]);
  assert.equal(rankExperts(pool, usage)[0].used, 0);
  const advice = rotationAdvice([art("a", "Марина Мелия", "Эрих Фромм")], pool, usage, { portraitOnSite: (name) => name !== "Джек Корнфилд" });
  assert.equal(advice.length, 2);
  assert.match(advice[0], /Марина Мелия.*24.*\(Ж, РУ\)/);
  assert.match(advice[1], /Эрих Фромм.*\(М, ЗАР\)/);
  assert.doesNotMatch(advice[1], /Пол Экман/); // 1 + slack 2 < 32, but only top-3 fresh (0 uses) are listed
  assert.match(advice[1], /Джек Корнфилд – 0 \(портрета ещё нет на сайте/);
  assert.deepEqual(rotationAdvice([art("a", "Пол Экман")], pool, new Map([["Пол Экман", 2]])), []);
});

test("pool: cautions – conflicting pair and banned claims", () => {
  assert.deepEqual(CONFLICTING_EXPERTS, [["Лиза Фельдман Барретт", "Пол Экман"]]);
  const ban = (name, text) => EXPERT_BANS[name].some(({ re }) => re.test(text));
  assert.ok(ban("Барбара Фредриксон", "позитивных эмоций должно быть втрое больше: 3:1"));
  assert.ok(ban("Барбара Фредриксон", "коэффициент позитивности"));
  assert.ok(!ban("Барбара Фредриксон", "маленькие радости расширяют внимание"));
  assert.ok(ban("Дэниел Сигел", "психолог Дэниел Сигел пишет"));
  assert.ok(!ban("Дэниел Сигел", "психиатр Дэниел Сигел пишет"));
  assert.ok(ban("Пол Экман", "по лицу можно распознать ложь"));
});

test("pool: site usage is counted per article from published cards", () => {
  const card = (name, photo) => `<section class="article-expert" aria-label="${name}">\n<div class="article-expert-head"><img class="article-expert-photo" src="/media/experts/${photo}" alt="Портрет" width="64"><div><p class="article-expert-name">${name}</p><p class="article-expert-role">Психолог</p><p class="article-expert-credit">Фото: X, CC0</p>`;
  const { cards, usage } = collectExperts([
    { slug: "a", md: `${card("Эрих Фромм", "fromm.webp")}\n${card("Эрих Фромм", "fromm.webp")}` },
    { slug: "b", md: card("Эрих Фромм", "fromm.webp") },
  ]);
  assert.equal(usage.get("Эрих Фромм"), 2);
  assert.equal(cards.get("Эрих Фромм").photo, "fromm.webp");
});

// ── synthetic site + the approved angel article ──
const angelMd = readReference("reference-angel-hranitel.md");
const galleryMd = readReference("reference-prakticheskaya-ezoterika.md");
const site = mkdtempSync(join(tmpdir(), "writer-sz-unit-"));
const write = (rel, text) => {
  mkdirSync(dirname(join(site, rel)), { recursive: true });
  writeFileSync(join(site, rel), text);
};
const rawPack = readJson(join(fixtures, "pack-angel-replay.json"));
const linkTargets = [...new Set(rawPack.articles.flatMap((article) => [...article.links.contextual, ...article.links.readmore]))];
write(`content/articles/${SZ.referenceGallerySlug}.md`, galleryMd);
for (const slug of linkTargets) write(`content/articles/${slug}.md`, `---\ntitle: "Статья ${slug}"\ndraft: false\n---\n\nТекст.\n`);
write("content/articles/chernovik.md", '---\ntitle: "Черновик"\ndraft: true\n---\n\nТекст.\n');
for (const photo of ["melia.webp", "fromm.webp"]) write(`public/media/experts/${photo}`, "webp");
write("scripts/check-canonical-order.mjs", 'assert.equal(articles.length, 113, "113 published articles");\n');
write("scripts/check-stage23-articles.mjs", "console.log('ok');\n");
const ctx = loadSzContext(site);
const pack = normalizePack(rawPack, { baseDir: fixtures, pool });
const view = packView(ctx, pack);
const brief = pack.articles[0];
const cfg = ruleConfig(brief, pack.publishedAt, pool);
const env = { published: view.published, unique: ctx.unique, referenceGallery: ctx.referenceGallery, portraitExists: (src) => ctx.portraitExists(src.replace(/^\/media\/experts\//, "")) };

test("site context: articles, drafts, gallery, counter, next stage", () => {
  assert.equal(ctx.publishedCount, 113);
  assert.equal(ctx.nextStage, 24);
  assert.ok(ctx.referenceGallery?.startsWith(":::gallery"));
  assert.ok(!view.published.has("chernovik") && view.published.has("angel-hranitel"));
  assert.deepEqual(view.problems, []);
});

test("cards: portraits resolved, missing portrait is a problem", () => {
  assert.deepEqual(resolveCards(pack, ctx).problems, []);
  const other = normalizePack(rawPack, { baseDir: fixtures, pool });
  other.articles[0].experts[0].card = { photo: "nobody.webp" };
  assert.match(resolveCards(other, ctx).problems.join("\n"), /нет портрета/);
});

const angelFields = readJson(join(fixtures, "angel-hranitel.json"));
const { fields } = normalizeSzFields(angelFields);
const assembled = assembleSzArticle(brief, fields, view.site, { date: pack.publishedAt });

test("positive reference: the approved angel article passes the rules (0 errors)", () => {
  assert.deepEqual(errorsOf(checkSzArticle(angelMd, cfg, env)).map((problem) => problem.message), []);
});

test("positive reference: fields → assemble round trip passes too and keeps the fixed blocks", () => {
  assert.deepEqual(errorsOf(checkSzArticle(assembled, cfg, env)).map((problem) => problem.message), []);
  assert.deepEqual(fieldsFromMarkdown(angelMd).faq.length, fields.faq.length);
  for (const fixed of [`author: "${SZ.author}"`, `buttonLabel: "${SZ.maxLabel}"`, ":::cta early\n:::", ":::overview\n:::", ":::practiceAudio\n:::"]) assert.ok(assembled.includes(fixed), fixed);
  assert.deepEqual(checkSzPack([{ cfg, md: assembled }]).filter((problem) => problem.severity === "error"), []);
});

const broken = (label, mutate, code) => test(`negative: ${label}`, () => {
  const md = mutate(assembled);
  assert.notEqual(md, assembled, "mutation applied");
  const codes = errorsOf(checkSzArticle(md, cfg, env)).map((problem) => problem.code);
  assert.ok(codes.includes(code), `${code} not in ${codes.join(",")}; all: ${checkSzArticle(md, cfg, env).map((p) => p.code).join(",")}`);
});
const firstPara = (md, add) => md.replace(/(\n---\n\n[^\n]+)/, `$1 ${add}`);
broken("discomfort priming (base patterns)", (md) => firstPara(md, "Если появится дискомфорт, остановите запись."), "discomfort");
broken("discomfort priming (site check mirror)", (md) => firstPara(md, "Во время практики может подняться тревога."), "discomfort");
broken("prediction", (md) => firstPara(md, "Этот знак предсказывает будущее."), "prediction");
broken("external link", (md) => firstPara(md, "Подробнее на https://example.com/page."), "links-external");
broken("MAX link in text", (md) => firstPara(md, "Пишите в max.ru."), "links-external");
broken("internal link to an unknown article", (md) => firstPara(md, "[Здесь](/s/net-takoy-stati)."), "links-target");
broken("em dash", (md) => firstPara(md, "Ангел — рядом."), "em-dash");
broken("promise of a result", (md) => firstPara(md, "Медитация исцелит вас."), "promise");
broken("summoning / protection", (md) => firstPara(md, "Ангел защитит от бед."), "summoning");
broken("wrong byline", (md) => md.replace(`author: "${SZ.author}"`, 'author: "Сергей Петров"'), "author");
broken("MAX button label", (md) => md.replace(`buttonLabel: "${SZ.maxLabel}"`, 'buttonLabel: "Перейти в MAX"'), "max");
broken("unsupported «research shows» (review #72)", (md) => firstPara(md, "Научные исследования показывают, что это работает."), "unsupported-science");
broken("source-file leftover in prose (review #72)", (md) => firstPara(md, "Мелия пишет об этом на странице 16 сохранённого издания."), "service-marker");
broken("keyword pasted in quotes (review #72)", (md) => firstPara(md, "Тем, кто интересуется «ангел-хранитель», важно знать."), "query-quoted");
broken("duplicate disclaimer (review #72)", (md) => firstPara(md, '<p class="article-disclaimer">Эта статья не заменяет консультацию.</p>'), "disclaimer");
broken("visible date", (md) => firstPara(md, "Она выбрала 22 июня."), "visible-date");
broken("latin inside a russian word", (md) => firstPara(md, "Тension в плечах исчез."), "mixed-script");

test("negative: expert caution bans travel with the config (Fredrickson 3:1)", () => {
  const withBan = { ...cfg, expertBans: EXPERT_BANS["Барбара Фредриксон"].map((ban) => ({ expert: "Барбара Фредриксон", name: ban.name, source: ban.re.source, flags: ban.re.flags })) };
  const md = firstPara(assembled, "Позитивных эмоций нужно втрое больше, 3:1.");
  assert.ok(errorsOf(checkSzArticle(md, withBan, env)).some((problem) => problem.code === "expert-caution"));
  assert.ok(!errorsOf(checkSzArticle(assembled, withBan, env)).some((problem) => problem.code === "expert-caution"));
});

test("discomfort patterns are the audiolad validator's", () => {
  assert.ok(DISCOMFORT_PATTERNS.length >= 5);
});

// ── briefs ──
const clone = () => JSON.parse(JSON.stringify(rawPack));
const briefError = (mutate, pattern) => {
  const raw = clone();
  mutate(raw);
  assert.throws(() => normalizePack(raw, { baseDir: fixtures, pool }), pattern);
};
test("brief: expert outside the pool, unverified quote, wrong mix, Barrett + Ekman", () => {
  briefError((raw) => { raw.articles[0].experts[0].name = "Карл Юнг"; }, /пул|EXPERTS_RU/);
  briefError((raw) => { raw.articles[0].experts[0].quote = "Этой фразы нет в источнике вообще никогда."; }, /цитат|источник/i);
  briefError((raw) => { raw.articles[0].experts = [raw.articles[0].experts[0]]; }, /Ж|М|РУ|ЗАР/);
  briefError((raw) => {
    raw.articles[0].experts = [
      { ...raw.articles[0].experts[0], name: "Лиза Фельдман Барретт" },
      { ...raw.articles[0].experts[1], name: "Пол Экман" },
    ];
  }, /спорят/);
  briefError((raw) => { raw.articles = Array.from({ length: 6 }, () => raw.articles[0]); }, /5|пакет/);
});

test("brief: maxRub must be a positive finite number ≤ ceiling – rejected before any spend", () => {
  for (const bad of ["3 ₽", "3", "abc", Number.NaN, 0, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e9, true, {}, []]) {
    briefError((raw) => { raw.maxRub = bad; }, /maxRub/);
  }
  const ok = clone();
  ok.maxRub = 2.5;
  assert.equal(normalizePack(ok, { baseDir: fixtures, pool }).maxRub, 2.5);
  delete ok.maxRub;
  assert.equal(normalizePack(ok, { baseDir: fixtures, pool }).maxRub, null);
});

test("budget: makeCaller refuses a non-finite or ≤ 0 limit, so the cap can never be switched off", () => {
  let calls = 0;
  const generate = () => { calls += 1; return { meta: {}, article: {} }; };
  const base = { model: "x", maxTokens: 100, outDir: tmpdir(), runId: "t", state: { spentRub: 0, calls: [] }, schemaName: "s", generate };
  for (const bad of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY, "3", "3 ₽", undefined, null]) {
    assert.throws(() => makeCaller({ ...base, maxRub: bad }), BudgetError);
  }
  assert.equal(calls, 0);
  assert.equal(typeof makeCaller({ ...base, maxRub: 3 }), "function");
});

test("prompt: lessons, caution, siblings and tone sample reach the model", () => {
  const messages = buildSzMessages(brief, view.site, { siblings: view.siblings });
  const text = messages.map((message) => message.content).join("\n");
  assert.ok(LESSONS.length >= 10);
  assert.ok(text.includes("УРОКИ РЕДАКТУРЫ"));
  assert.ok(text.includes("ОШИБКИ ИЗ РЕВЬЮ"));
  for (const item of CORRECTIONS) assert.ok(text.includes(item), `урок из LESSONS.md не попал в промпт: ${item.slice(0, 60)}`);
  assert.ok(LESSONS.some((lesson) => /не уверена[^.]*не упоминай/i.test(lesson)), "правило «не уверена – не упоминай»");
  assert.ok(text.includes("ОБРАЗЕЦ ТОНА"));
  assert.ok(text.includes(pool.get("Марина Мелия").caution.slice(0, 30)));
});

test("LESSONS.md: every bullet is a «Неверно → Верно» item, seeded from EDITS.md and review #72", () => {
  const text = readFileSync(LESSONS_FILE, "utf8");
  const bullets = text.split("\n").filter((line) => line.startsWith("- "));
  assert.equal(parseCorrections(text).length, bullets.length, "пункт LESSONS.md не в формате «- Неверно: … → Верно: … Почему: …»");
  assert.ok(CORRECTIONS.length >= 25);
  assert.ok(/sergey-zoya-site#72/.test(text) && /453eaa2a/.test(text));
  assert.deepEqual(parseCorrections("- Неверно: «а» → Верно: «б». Почему: в.\n- просто строка"), ["Неверно: «а» → Верно: «б». Почему: в."]);
});

// ── apply helpers + generated gate ──
test("apply: story opening, canonical counter, package.json wiring", () => {
  assert.equal(storyOpening(angelMd).length, 14);
  assert.equal(insertStoryOpening('{\n  "a": "x",\n  "c": "z"\n}\n', "b", "y"), '{\n  "a": "x",\n  "b": "y",\n  "c": "z"\n}\n');
  assert.throws(() => insertStoryOpening('{"a":"x"}', "a", "y"));
  assert.match(bumpCanonicalCount('assert.equal(articles.length, 113, "113 published articles");', 5), /118, "118 published/);
  const pkg = `{\n  "scripts": {\n    "test": "node scripts/check-stage22-articles.mjs && node scripts/check-stage23-articles.mjs && node scripts/check-typography.mjs"\n  }\n}\n`;
  assert.match(wireGate(pkg, "check-stage24-articles.mjs"), /stage23-articles\.mjs && node scripts\/check-stage24-articles\.mjs && node scripts\/check-typography/);
  assert.throws(() => wireGate(wireGate(pkg, "check-stage24-articles.mjs"), "check-stage24-articles.mjs"));
});

test("gate: the generated check-stageNN passes on the angel article and fails on a broken one", () => {
  write("content/articles/angel-hranitel.md", assembled);
  write("public/media/og/angel-hranitel.jpg", "jpg");
  write("scripts/check-stage24-articles.mjs", gateSource({ stage: 24, pack: pack.pack, date: pack.publishedAt, configs: [cfg] }));
  const run = () => spawnSync(process.execPath, ["scripts/check-stage24-articles.mjs"], { cwd: site, encoding: "utf8" });
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /stage 24 articles ok: 1/);
  write("content/articles/angel-hranitel.md", firstPara(assembled, "Этот знак предсказывает будущее."));
  assert.notEqual(run().status, 0);
});

test("site checks: only regressions block", () => {
  const step = (command, ok) => ({ command, ok });
  const baseline = { steps: [step("a", true), step("b", false)], tsc: step("tsc", true), build: null };
  assert.equal(compareSzChecks(baseline, { steps: [step("a", true), step("b", false), step("gate", true)], tsc: step("tsc", true), build: null }).ok, true);
  const bad = compareSzChecks(baseline, { steps: [step("a", false), step("b", false), step("gate", false)], tsc: step("tsc", true), build: null });
  assert.deepEqual(bad.blocking.map((item) => item.command), ["a", "gate"]);
  assert.deepEqual(bad.preexisting.map((item) => item.command), ["b"]);
});

rmSync(site, { recursive: true, force: true });
console.log(`writer sz-unit: ${count} tests ok`);
