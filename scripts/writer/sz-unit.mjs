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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { bumpCanonicalCount, gateSource, insertStoryOpening, ruleConfig, storyOpening, wireGate } from "./lib/sites/sz/apply.mjs";
import { assembleSzArticle, nestQuotes, normalizeSzFields } from "./lib/sites/sz/assemble.mjs";
import { BudgetError, makeCaller } from "./lib/call.mjs";
import { DEFAULT_MODEL, SZ_DEFAULT_MODEL, SUPPORTED_MODELS, defaultModelFor, costRub, estimatePromptTokens, worstCaseRub } from "./lib/cost.mjs";
import { collectResult, runDetached } from "./lib/moscow.mjs";
import { normalizePack } from "./lib/sites/sz/brief.mjs";
import { compareSzChecks } from "./lib/sites/sz/checks.mjs";
import { SZ } from "./lib/sites/sz/config.mjs";
import { collectExperts, loadSzContext } from "./lib/sites/sz/context.mjs";
import {
  CONFLICTING_EXPERTS, EXPERT_BANS, KNOWN_CARDS, defaultExpertPool, expertCard, missingMix, parseExpertsMd, rankExperts, rotationAdvice, rotationProblems,
} from "./lib/sites/sz/experts.mjs";
import { fieldsFromMarkdown } from "./lib/sites/sz/extract.mjs";
import { CORRECTIONS, LESSONS, LESSONS_FILE, parseCorrections, readReference } from "./lib/sites/sz/knowledge.mjs";
import { SzStop, assertBranchFree, packView, resolveCards, runSzPipeline, repairSzArticle, szRepairOptions, szReportMarkdown } from "./lib/sites/sz/pipeline.mjs";
import { applySzRepairPatch, buildSzMessages, buildSzRepairMessages, buildSzTargetedRepair, szArticleSchema, szRepairFields } from "./lib/sites/sz/prompt.mjs";
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

// ── hybrid repair: injected generation only, no subprocesses or network ──
test("hybrid: strict repair options and unknown models fail before generate", () => {
  const limits = { model: SZ_DEFAULT_MODEL, maxTokens: 16000 };
  assert.deepEqual(szRepairOptions({}, limits), { model: SZ_DEFAULT_MODEL, maxTokens: 16000, mode: "full" });
  assert.deepEqual(szRepairOptions({ "repair-model": "openai/gpt-5.4-mini", "repair-max-tokens": "4000", "repair-mode": "targeted" }, limits), { model: "openai/gpt-5.4-mini", maxTokens: 4000, mode: "targeted" });
  for (const bad of ["0", "32001", "1.5", "1e3", "NaN", "", "-1", "Infinity"]) assert.throws(() => szRepairOptions({ "repair-max-tokens": bad }, limits), /repair-max-tokens/);
  for (const token of ["1", "32000"]) assert.equal(szRepairOptions({ "repair-max-tokens": token }, limits).maxTokens, Number(token));
  assert.throws(() => szRepairOptions({ "repair-model": "unknown" }, limits), (error) => error.code === 1);
  assert.throws(() => szRepairOptions({}, { ...limits, model: "unknown" }), (error) => error.code === 1);
  assert.throws(() => szRepairOptions({ "repair-mode": "other" }, limits), /repair-mode/);
  assert.equal(costRub("openai/gpt-5.4-mini", 1e6, 1e6), 147.315 + 883.89);
});

const hybridBuild = (raw) => {
  const { fields: normalized } = normalizeSzFields(raw);
  const md = assembleSzArticle(brief, normalized, view.site, { date: pack.publishedAt });
  return { fields: normalized, md, problems: checkSzArticle(md, cfg, env) };
};
const hybridRaw = () => ({ ...structuredClone(fields), description: "коротко" });

test("targeted: schema subset, compact context, deterministic merge and repeated gate", () => {
  const raw = hybridRaw();
  const before = structuredClone(raw);
  const problems = hybridBuild(raw).problems;
  const target = buildSzTargetedRepair(brief, raw, problems);
  assert.deepEqual(target.fields, ["description"]);
  assert.deepEqual(target.schema.properties, { description: szArticleSchema().properties.description });
  assert.equal(target.schema.additionalProperties, false);
  const merged = applySzRepairPatch(raw, { description: fields.description }, target.schema);
  assert.deepEqual(raw, before);
  for (const key of Object.keys(raw)) if (key !== "description") assert.deepEqual(merged[key], raw[key]);
  assert.deepEqual(errorsOf(hybridBuild(merged).problems), []);
  const full = buildSzRepairMessages(buildSzMessages(brief, view.site), raw, problems);
  const chars = (messages) => messages.reduce((sum, m) => sum + m.content.length, 0);
  assert.ok(chars(target.messages) * 3 < chars(full));
  console.log(`repair prompt chars: full=${chars(full)}, targeted=${chars(target.messages)}`);
  const compact = JSON.stringify(target.messages);
  assert.ok(!compact.includes("УРОКИ РЕДАКТУРЫ") && !compact.includes("sourceText") && !compact.includes('\\"story\\"'));
  const experts = buildSzTargetedRepair(brief, raw, [{ severity: "error", field: "experts[0].bridge", code: "expert-bridge", message: "цитата" }]);
  assert.deepEqual(experts.fields, ["experts"]);
  assert.ok(JSON.stringify(experts.messages).includes(brief.experts[0].quote));
  assert.ok(szRepairFields(raw, [{ severity: "error", field: "table", code: "table", message: "нет таблицы" }]).includes("tableSection"));
  assert.ok(szRepairFields(raw, [{ severity: "error", field: "sections", code: "body-length", message: "объём" }]).includes("steps"));
  assert.deepEqual(szRepairFields(raw, [{ severity: "error", field: "*", code: "unknown", message: "неизвестная ошибка" }]), Object.keys(szArticleSchema().properties));
  for (const patch of [null, {}, [], "json", { description: 12 }, { description: fields.description, story: [] }]) assert.equal(applySzRepairPatch(raw, patch, target.schema), null);
  assert.equal(applySzRepairPatch(raw, { experts: [{ name: "x" }] }, experts.schema), null);
});

test("hybrid calls: repair model/tokens, ledger, invalid patch, default full and shared budget", () => {
  const root = mkdtempSync(join(tmpdir(), "writer-hybrid-"));
  const oldHome = process.env.HOME;
  process.env.HOME = root;
  try {
    const state = { spentRub: 0, calls: [], warnings: [] };
    const requests = [];
    let answer = { description: fields.description };
    const generate = (_run, _call, requestFile) => {
      requests.push(readJson(requestFile));
      return { meta: { ok: true, http: 200, cost_rub: 0.1 }, article: structuredClone(answer) };
    };
    const model = "openai/gpt-5.4-mini";
    const base = { model, maxTokens: 800, maxRub: 45, outDir: root, runId: "test", state, schemaName: "s", generate };
    const repair = szRepairOptions({ "repair-model": SZ_DEFAULT_MODEL, "repair-mode": "targeted", "repair-max-tokens": "4000" }, base);
    const messages = buildSzMessages(brief, view.site);
    const callRepair = makeCaller({ ...base, ...repair });
    const runRepair = (options = {}) => repairSzArticle({ brief, raw: hybridRaw(), build: hybridBuild, messages, repair, callRepair, state, ...options });
    const fixed = runRepair();
    assert.deepEqual(fixed.errors, []);
    assert.ok(fixed.errorsBeforeRepair.length > 0);
    assert.equal(requests[0].model, SZ_DEFAULT_MODEL);
    assert.equal(requests[0].max_tokens, 4000);
    assert.equal(state.calls[0].model, SZ_DEFAULT_MODEL);
    const ledger = readFileSync(join(root, ".cache/writer/ledger.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(ledger[0].model, SZ_DEFAULT_MODEL);
    answer = {};
    const invalid = runRepair();
    assert.deepEqual(invalid.result.fields, hybridBuild(hybridRaw()).fields);
    assert.ok(invalid.errors.length > 0);
    assert.match(state.warnings.at(-1), /невалидный/);
    answer = structuredClone(fields);
    const defaults = szRepairOptions({}, base);
    const full = runRepair({ repair: defaults, callRepair: makeCaller(base) });
    assert.deepEqual(full.errors, []);
    assert.equal(requests.at(-1).model, model);
    assert.equal(requests.at(-1).max_tokens, 800);
    assert.deepEqual(requests.at(-1).messages, buildSzRepairMessages(messages, hybridRaw(), hybridBuild(hybridRaw()).problems));
    assert.deepEqual(requests.at(-1).response_format.json_schema.schema, szArticleSchema());

    const budgetState = { spentRub: 0, calls: [], warnings: [] };
    const cheap = makeCaller({ ...base, state: budgetState, maxRub: 5 });
    const expensive = makeCaller({ ...base, ...repair, state: budgetState, maxRub: 5 });
    answer = hybridRaw();
    const draft = cheap("first-generate", messages, szArticleSchema());
    const skipped = runRepair({ raw: draft, state: budgetState, callRepair: expensive });
    assert.equal(skipped.repairSkipped, "budget");
    assert.deepEqual(skipped.errorsBeforeRepair, skipped.errors);
    assert.equal(budgetState.calls.length, 1);
    assert.deepEqual(cheap("next-generate", messages, szArticleSchema()), draft);
    assert.deepEqual(budgetState.calls.map((call) => call.model), [model, model]);
    assert.equal(budgetState.spentRub, 0.2);
    const blocked = makeCaller({ ...base, maxRub: 0.001, state: budgetState });
    const countBefore = requests.length;
    assert.throws(() => blocked("blocked-generate", messages, szArticleSchema()), BudgetError);
    assert.equal(requests.length, countBefore);
    const unknown = { "repair-model": "unknown" };
    assert.throws(() => { szRepairOptions(unknown, base); cheap("never", messages, szArticleSchema()); }, (error) => error.code === 1);
    assert.equal(requests.length, countBefore);
    const report = szReportMarkdown({ ...budgetState, articles: [{ slug: brief.slug, ...skipped, errorsAfterRepair: skipped.errors }] });
    assert.match(report, /repairSkipped: budget/);
    assert.ok(report.includes(model) && report.includes("Итого:"));
    // With missing usage each caller charges its own model's worst case against the same state.
    const missing = makeCaller({ ...base, ...repair, generate: () => ({ meta: { ok: false }, article: null }) });
    const start = state.spentRub;
    missing("missing", [{ role: "user", content: "тест" }], szArticleSchema());
    assert.ok(Math.abs(state.spentRub - start - worstCaseRub(repair.model, estimatePromptTokens([{ role: "user", content: "тест" }], repair.model), repair.maxTokens)) < 1e-9);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    rmSync(root, { recursive: true, force: true });
  }
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

// ── pack branch on origin: checked before any spend ──
const testAsync = async (name, fn) => {
  await fn();
  count += 1;
  console.log(`ok ${name}`);
};
await testAsync("branch: writer/sz-<pack> on origin stops the run before generate; absent → generate runs", async () => {
  const root = mkdtempSync(join(tmpdir(), "writer-sz-remote-"));
  const git = (cwd, ...args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout;
  };
  const bare = join(root, "origin.git");
  const clone = join(root, "site");
  cpSync(site, clone, { recursive: true });
  rmSync(join(clone, "content/articles/angel-hranitel.md"), { force: true });
  git(root, "init", "-q", "--bare", "-b", "main", bare);
  git(clone, "init", "-q", "-b", "main");
  git(clone, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "add", "-A");
  git(clone, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "site");
  git(clone, "remote", "add", "origin", bare);
  git(clone, "push", "-q", "origin", "main");
  mkdirSync(join(clone, "node_modules"), { recursive: true });
  const branch = `writer/sz-${rawPack.pack}`;
  let calls = 0;
  const generate = () => {
    calls += 1;
    throw Object.assign(new Error("generate sentinel"), { code: 9 });
  };
  const args = (out) => ({ repo: clone, briefs: join(fixtures, "pack-angel-replay.json"), out: join(root, out) });
  const limits = { model: DEFAULT_MODEL, maxRub: 3, maxTokens: 100, generate };

  // Absent on origin (ls-remote exit 2) → the run proceeds to the first Cloud.ru call.
  assert.doesNotThrow(() => assertBranchFree(clone, branch));
  const proceeded = await runSzPipeline(args("run-absent"), limits);
  assert.equal(calls, 1);
  assert.equal(proceeded.code, 9);
  assert.match(proceeded.state.failure, /generate sentinel/);

  // Hybrid pack: skipped repairs do not stop the next article; generate budget refusal
  // retains completed drafts and both reports. Only local fixture Git operations are used.
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  try {
    const hybridPack = structuredClone(rawPack);
    const second = structuredClone(hybridPack.articles[0]);
    second.slug = "angel-second";
    second.query = "образ ангела";
    for (const expert of second.experts) expert.quote = expert.quote.split(" ").slice(0, -2).join(" ");
    hybridPack.articles.push(second);
    const hybridBrief = join(root, "hybrid-pack.json");
    writeFileSync(hybridBrief, JSON.stringify(hybridPack));
    const hybridArgs = (name) => ({ ...args(name), briefs: hybridBrief, "repair-model": SZ_DEFAULT_MODEL, "repair-max-tokens": "4000", "repair-mode": "targeted" });
    let billed = 0.01;
    const generated = [];
    const fakeGenerate = (_run, call, requestFile) => {
      generated.push({ call, request: readJson(requestFile) });
      return { meta: { ok: true, http: 200, cost_rub: billed }, article: hybridRaw() };
    };
    const hybridLimits = { ...limits, maxTokens: 100, generate: fakeGenerate };
    const skippedPack = await runSzPipeline(hybridArgs("hybrid-skip"), hybridLimits);
    assert.equal(skippedPack.code, 2);
    assert.equal(generated.length, 2);
    assert.ok(generated.every(({ call }) => call.endsWith("-generate")));
    assert.deepEqual(skippedPack.state.articles.map((article) => article.repairSkipped), ["budget", "budget"]);
    assert.ok(existsSync(join(root, "hybrid-skip", second.slug, "fields.json")));
    billed = 2.99;
    generated.length = 0;
    const exhausted = await runSzPipeline(hybridArgs("hybrid-exhausted"), hybridLimits);
    assert.equal(exhausted.code, 5);
    assert.equal(generated.length, 1);
    const saved = readJson(join(root, "hybrid-exhausted/report.json"));
    assert.equal(saved.articles.length, 1);
    assert.equal(saved.articles[0].repairSkipped, "budget");
    assert.ok(existsSync(join(root, "hybrid-exhausted", brief.slug, "fields.json")));
    assert.ok(existsSync(join(root, "hybrid-exhausted/report.md")));
    await assert.rejects(runSzPipeline({ ...hybridArgs("hybrid-unknown"), "repair-model": "unknown" }, hybridLimits), (error) => error.code === 1);
    assert.equal(generated.length, 1);

  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }

  // Present on origin (left from an earlier successful run, local branch already deleted) → stop, 0 calls.
  git(clone, "push", "-q", "origin", `main:refs/heads/${branch}`);
  assert.notEqual(spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: clone }).status, 0);
  calls = 0;
  await assert.rejects(runSzPipeline(args("run-present"), limits), (error) => error instanceof SzStop && /уже есть на origin/.test(error.message));
  await assert.rejects(runSzPipeline({ ...args("run-present-dry"), "dry-run": true, offline: true }, limits), /уже есть на origin/);
  assert.equal(calls, 0);
  assert.equal(existsSync(join(root, "run-present")), false);

  // ls-remote fails (origin unreachable) → stop too, not «absent».
  git(clone, "remote", "set-url", "origin", join(root, "missing.git"));
  await assert.rejects(runSzPipeline(args("run-broken"), limits), (error) => error instanceof SzStop && /не удалось проверить ветку/.test(error.message));
  assert.equal(calls, 0);
  rmSync(root, { recursive: true, force: true });
});


test("site default model: sz → gpt-5.5, audiolad unchanged, explicit --model wins", () => {
  assert.equal(SZ_DEFAULT_MODEL, "openai/gpt-5.5");
  assert.ok(SUPPORTED_MODELS.includes(SZ_DEFAULT_MODEL));
  assert.equal(defaultModelFor("sz", undefined), "openai/gpt-5.5");
  assert.equal(defaultModelFor("audiolad", undefined), DEFAULT_MODEL);
  assert.equal(defaultModelFor("sz", "anthropic/claude-opus-4.8"), "anthropic/claude-opus-4.8");
});

test("runDetached: finished remote call is picked up on the next poll, no long ssh session", () => {
  const fake = (pollReplies) => {
    const commands = [];
    let clock = 0;
    const sshCall = (command, options) => {
      commands.push({ command, timeoutMs: options?.timeoutMs });
      if (command.includes("setsid nohup")) return { status: 0, stdout: "started\n", stderr: "" };
      const reply = pollReplies.shift() ?? { status: 0, stdout: "", stderr: "" };
      return reply;
    };
    return { commands, sshCall, sleep: (ms) => { clock += ms; }, now: () => clock };
  };
  // Remote done after two polls; one poll hit an ssh timeout (status 255) and was retried.
  const done = fake([{ status: 0, stdout: "", stderr: "" }, { status: 255, stdout: "", stderr: "timeout" }, { status: 0, stdout: "0\n", stderr: "" }]);
  const result = runDetached("/root/writer/runs/r/c", done);
  assert.deepEqual(result, { status: 0, timedOut: false, started: true });
  assert.equal(done.commands.length, 4);
  assert.ok(done.commands.every((c) => c.timeoutMs <= 60000), "every ssh call is short");
  assert.match(done.commands[0].command, /exit\.code\.tmp && mv exit\.code\.tmp exit\.code/);
  // Non-zero exit of generate.py is passed through.
  assert.equal(runDetached("/d", fake([{ status: 0, stdout: "2\n", stderr: "" }])).status, 2);
  // Never finishes → stops at the deadline with timedOut, not later.
  const never = fake([]);
  const late = runDetached("/d", { ...never, timeoutMs: 60000, pollMs: 10000 });
  assert.deepEqual(late, { status: 124, timedOut: true, started: true });
  assert.ok(never.now() <= 60000);
  // Start failed → no polling.
  const broken = { sshCall: () => ({ status: 255, stdout: "", stderr: "Connection refused" }), sleep: () => assert.fail("must not poll") };
  assert.equal(runDetached("/d", broken).timedOut, false);
  // Previous generation still alive in the same directory → refused, nothing polled.
  const busy = { sshCall: () => ({ status: 3, stdout: "busy\n", stderr: "" }), sleep: () => assert.fail("must not poll") };
  assert.match(runDetached("/d", busy).error, /ещё идёт/);
  // Stale results of an earlier attempt are removed before the new start.
  assert.match(done.commands[0].command, /rm -f exit\.code exit\.code\.tmp meta\.json article\.json article\.txt/);
});

test("expert quotes: inner «…» kept by the brief and nested as „…“; phones line is accurate", () => {
  assert.equal(nestQuotes("не сформирован «алфавит чувств»."), "не сформирован „алфавит чувств“.");
  assert.equal(nestQuotes("без внутренних кавычек"), "без внутренних кавычек");
  assert.doesNotMatch(SZ.phones, /кризисе – телефон доверия 8-800-7000-600/);
  assert.match(SZ.phones, /домашнем насилии – Всероссийский телефон доверия для женщин 8-800-7000-600/);
});

test("brief: a quote ending with an inner «…» pair keeps it; a fully wrapped quote loses only the outer pair", () => {
  const withInner = clone();
  const expert = withInner.articles[0].experts[0];
  delete expert.sourceFile;
  expert.sourceText = "Ребёнок, у которого не сформирован «алфавит чувств», плохо понимает себя.";
  expert.quote = "у которого не сформирован «алфавит чувств»";
  assert.equal(normalizePack(withInner, { baseDir: fixtures, pool }).articles[0].experts[0].quote, "у которого не сформирован «алфавит чувств»");
  expert.quote = "«плохо понимает себя.»";
  assert.equal(normalizePack(withInner, { baseDir: fixtures, pool }).articles[0].experts[0].quote, "плохо понимает себя.");
});

test("collectResult: a refused start never takes the remote dir's artifacts as this call's result", () => {
  const dir = mkdtempSync(join(tmpdir(), "writer-collect-"));
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ ok: true, cost_rub: 1 })); // stale local leftovers
  const stale = (name, localPath) => { writeFileSync(localPath, name === "meta.json" ? JSON.stringify({ ok: true, cost_rub: 35 }) : JSON.stringify({ title: "чужая статья" })); return true; };
  const refused = collectResult({ status: 3, timedOut: false, started: false, error: "предыдущая генерация в этом каталоге ещё идёт" }, () => assert.fail("must not download"), dir);
  assert.equal(refused.meta.ok, false);
  assert.match(refused.meta.error, /ещё идёт/);
  assert.equal(refused.article, null);
  assert.ok(!existsSync(join(dir, "meta.json")), "local leftovers removed");
  const done = collectResult({ status: 0, timedOut: false, started: true }, stale, dir);
  assert.equal(done.meta.cost_rub, 35);
  assert.equal(done.article.title, "чужая статья");
  const died = collectResult({ status: 1, timedOut: false, started: true }, () => false, dir);
  assert.deepEqual([died.meta.ok, died.article], [false, null]);
  assert.match(died.meta.error, /код 1/);
  rmSync(dir, { recursive: true, force: true });
});

test("runDetached: ssh poll duration counts against the deadline", () => {
  let clock = 0;
  const sshCall = (command, options) => {
    if (command.includes("setsid nohup")) return { status: 0, stdout: "started\n", stderr: "" };
    clock += options.timeoutMs; // every poll hangs until its own ssh timeout
    return { status: 255, stdout: "", stderr: "timeout" };
  };
  const result = runDetached("/d", { sshCall, sleep: (ms) => { clock += ms; }, now: () => clock, timeoutMs: 60000, pollMs: 10000 });
  assert.deepEqual(result, { status: 124, timedOut: true, started: true });
  assert.ok(clock <= 60000, `stopped at ${clock} ms, limit 60000`);
});

test("both pipelines estimate prompt tokens with the model's own ratio", () => {
  for (const file of ["run.mjs", "lib/call.mjs"]) {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), file), "utf8");
    const calls = [...source.matchAll(/estimatePromptTokens\(([^)]*)\)/g)].map((m) => m[1]);
    assert.ok(calls.length > 0, file);
    for (const args of calls) assert.match(args, /,\s*model\b/, `${file}: estimatePromptTokens(${args}) без model`);
  }
});

rmSync(site, { recursive: true, force: true });
console.log(`writer sz-unit: ${count} tests ok`);
