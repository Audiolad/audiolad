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
import { DEFAULT_MODEL, SZ_DEFAULT_MODEL, SUPPORTED_MODELS, TARIFF, defaultModelFor, costRub, estimatePromptTokens, worstCaseRub } from "./lib/cost.mjs";
import { collectResult, isWriterId, runDetached, writerCallId, WRITER_ID_MAX } from "./lib/moscow.mjs";
import { normalizePack } from "./lib/sites/sz/brief.mjs";
import { compareSzChecks } from "./lib/sites/sz/checks.mjs";
import { SZ, SZ_BODY_PLAN, szBodyPlanBudget } from "./lib/sites/sz/config.mjs";
import { TIERED_COST_PROFILE, estimateCallRub, estimateTieredArticle, loadModelPrices } from "./lib/sites/sz/estimate.mjs";
import { szH2Count, szPackCost, szQuantityReport } from "./lib/sites/sz/metrics.mjs";
import { applyDeterministicSzFixes, buildSzFragment, cheapTokenCap, fragmentBanned, fragmentTruncated, latinizeSlug, lengthFragmentTokens, repairSzArticleTiered, repairSzPackDuplicates, retryTokenCap, tieredRepairCallName } from "./lib/sites/sz/tiered.mjs";
import { collectExperts, loadSzContext } from "./lib/sites/sz/context.mjs";
import {
  CONFLICTING_EXPERTS, EXPERT_BANS, KNOWN_CARDS, defaultExpertPool, expertCard, missingMix, parseExpertsMd, rankExperts, rotationAdvice, rotationProblems,
} from "./lib/sites/sz/experts.mjs";
import { fieldsFromMarkdown } from "./lib/sites/sz/extract.mjs";
import { CORRECTIONS, LESSONS, LESSONS_FILE, parseCorrections, readReference } from "./lib/sites/sz/knowledge.mjs";
import { SzStop, assertBranchFree, packView, resolveCards, runSzPipeline, repairSzArticle, szRepairOptions, szReportMarkdown } from "./lib/sites/sz/pipeline.mjs";
import { applySzRepairPatch, buildSzMessages, buildSzRepairMessages, buildSzTargetedRepair, szArticleSchema, szRepairFields } from "./lib/sites/sz/prompt.mjs";
import { DISCOMFORT_PATTERNS, alignListCount, checkSzArticle, checkSzPack, faqAnswerTypeMismatch, genericLinkAnchor, isSpecialistQuestion, leadWordFragments, linkLeadResidue, normalize, paragraphsTooClose, protectedRemovalOk, sectionRetellsStory, statedListCount, words } from "./lib/sites/sz/rules.mjs";

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
  assert.match(text, /Сюжет рассказывается только здесь/);
  assert.match(text, /не «материал», не «здесь», не «подробнее»/);
  assert.match(text, /открытый вопрос/);
  assert.match(text, /не «Пять шагов»/);
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
  const bodyLength = szRepairFields(raw, [{ severity: "error", field: "sections", code: "body-length", message: "объём" }]);
  assert.ok(bodyLength.includes("steps") && !bodyLength.includes("faqHeading"));
});

test("targeted: rejects lost experts before assembly; the gate rejects placeholder cards", () => {
  const raw = structuredClone(fields);
  raw.experts[0].bridge += " article-expert-initials";
  const before = structuredClone(raw);
  const problems = hybridBuild(raw).problems;
  assert.deepEqual(errorsOf(problems).map((p) => p.code), ["expert-card"]);
  const target = buildSzTargetedRepair(brief, raw, problems);
  assert.deepEqual(target.fields, ["experts"]);
  const valid = structuredClone(fields.experts);
  const missingBridge = structuredClone(valid);
  delete missingBridge[0].bridge;
  const placeholder = (thesis) => valid.map((expert, i) => (i ? expert : { ...expert, thesis }));
  const cases = [
    [], valid.slice(0, 1), [...valid].reverse(),
    valid.map((expert) => ({ ...expert, name: "Другой эксперт" })),
    [valid[0], valid[0]], missingBridge,
    ...["thesis", "bridge"].flatMap((key) => ["", " \n\t", "… ** –", "а", "б", "главная мысль", "Главная мысль.", "главная мысль а", "главная мысль о выборе"].map((text) => valid.map((expert, i) => (i ? expert : { ...expert, [key]: text })))),
    placeholder("главная   мысль"),
  ];
  for (const experts of cases) {
    const patch = { experts };
    const patchBefore = structuredClone(patch);
    assert.equal(applySzRepairPatch(raw, patch, target.schema, brief), null);
    const state = { warnings: [] };
    let builds = 0;
    const result = repairSzArticle({
      brief, raw, build: (value) => { builds += 1; return hybridBuild(value); },
      repair: { mode: "targeted" }, callRepair: () => patch, state,
    });
    assert.equal(builds, 1);
    assert.deepEqual(result.result, hybridBuild(raw));
    assert.deepEqual(result.errors, result.errorsBeforeRepair);
    assert.match(result.repairSkipped, /^rejected: .*(experts|схемы)/);
    assert.ok(state.warnings[0].includes(result.repairSkipped));
    const report = szReportMarkdown({ calls: [], spentRub: 0, warnings: state.warnings, articles: [{ slug: brief.slug, ...result, errorsAfterRepair: result.errors }] });
    assert.ok(report.includes(`repairSkipped: ${result.repairSkipped}`));
    assert.deepEqual(raw, before);
    assert.deepEqual(patch, patchBefore);
  }
  const emptied = assembleSzArticle(brief, { ...structuredClone(raw), experts: [] }, view.site, { date: pack.publishedAt });
  assert.match(emptied, /Марина Мелия: главная мысль/);
  assert.match(emptied, /Эрих Фромм: главная мысль/);
  const gate = errorsOf(checkSzArticle(emptied, cfg, env)).map((problem) => problem.code);
  assert.ok(gate.includes("expert-thesis") && gate.includes("expert-bridge"), gate.join(","));
  const accepted = applySzRepairPatch(raw, { experts: valid }, target.schema, brief);
  assert.deepEqual(errorsOf(hybridBuild(accepted).problems), []);
  assert.deepEqual(accepted.experts, valid);
  for (const key of Object.keys(raw)) if (key !== "experts") assert.deepEqual(accepted[key], raw[key]);
  assert.equal(applySzRepairPatch({ ...raw, experts: [] }, { experts: [] }, target.schema, brief), null);
  const state = { warnings: [] };
  let builds = 0;
  const fixed = repairSzArticle({
    brief, raw, build: (value) => { builds += 1; return hybridBuild(value); },
    repair: { mode: "targeted" }, callRepair: () => ({ experts: structuredClone(valid) }), state,
  });
  assert.equal(builds, 2);
  assert.deepEqual(fixed.errors, []);
  assert.equal(fixed.repairSkipped, null);
  assert.equal(state.warnings.length, 0);
});

test("targeted and gate: hollow prose is rejected after normalization for any field", () => {
  const raw = structuredClone(fields);
  const gateOf = (value) => errorsOf(checkSzArticle(assembleSzArticle(brief, value, view.site, { date: pack.publishedAt }), cfg, env));
  const rejected = (field, value) => {
    const target = buildSzTargetedRepair(brief, raw, [{ severity: "error", field, code: "test", message: "test" }]);
    assert.equal(applySzRepairPatch(raw, { [field]: value }, target.schema, brief), null, `${field}: ${JSON.stringify(value).slice(0, 80)}`);
  };
  const has = (problems, code, message) => problems.some((problem) => problem.code === code && (!message || message.test(problem.message)));

  const hollowExperts = raw.experts.map((expert) => ({ ...expert, thesis: "а", bridge: "б" }));
  rejected("experts", hollowExperts);
  const expertGate = gateOf({ ...structuredClone(raw), experts: hollowExperts });
  assert.ok(has(expertGate, "expert-thesis") && has(expertGate, "expert-bridge"), expertGate.map((problem) => problem.code).join(","));

  const nearPlaceholder = raw.experts.map((expert, index) => (index ? expert : { ...expert, thesis: "главная мысль а" }));
  rejected("experts", nearPlaceholder);
  assert.ok(has(gateOf({ ...structuredClone(raw), experts: nearPlaceholder }), "expert-thesis", /главная мысль|содержательн/));
  const nearSentence = raw.experts.map((expert, index) => (index ? expert : { ...expert, thesis: "главная мысль о выборе" }));
  rejected("experts", nearSentence);
  assert.ok(has(gateOf({ ...structuredClone(raw), experts: nearSentence }), "expert-thesis", /главная мысль/));

  for (const storyEnding of ["Чем закончилась история.", "****", "\u200B", "Чем закончилась история.\u200B"]) {
    rejected("storyEnding", storyEnding);
    assert.ok(has(gateOf({ ...structuredClone(raw), storyEnding }), "story-ending", /содержательн|предложен/), storyEnding);
  }
  rejected("psychologyIntro", "****");
  assert.ok(has(gateOf({ ...structuredClone(raw), psychologyIntro: "****" }), "psychology-intro"));
  rejected("finalInvite", "****");
  assert.ok(has(gateOf({ ...structuredClone(raw), finalInvite: "****" }), "final-invite", /содержательн/));

  rejected("invitation", "Это ангел.");
  assert.ok(has(gateOf({ ...structuredClone(raw), invitation: "Это ангел." }), "invitation", /содержательн/));
  const checklist = { ...raw.checklist, items: ["б", ...raw.checklist.items.slice(1)] };
  rejected("checklist", checklist);
  assert.ok(has(gateOf({ ...structuredClone(raw), checklist }), "checklist", /содержательн/));
  const sectionsBefore = structuredClone(raw.sectionsBefore);
  sectionsBefore[0] = { ...sectionsBefore[0], paragraphs: ["****", ...sectionsBefore[0].paragraphs.slice(1)] };
  rejected("sectionsBefore", sectionsBefore);
  assert.ok(has(gateOf({ ...structuredClone(raw), sectionsBefore }), "thin-prose", /содержательн/));
  const tableSection = structuredClone(raw.tableSection);
  tableSection.columns = ["а", ...tableSection.columns.slice(1)];
  rejected("tableSection", tableSection);
  assert.ok(has(gateOf({ ...structuredClone(raw), tableSection }), "thin-prose"));
  rejected("question", "**а?**");
  assert.ok(has(gateOf({ ...structuredClone(raw), question: "**а?**" }), "question", /содержательн/));

  const substantive = raw.experts.map((expert, index) => (index ? expert : { ...expert, thesis: "главная мысль о бережном ежедневном выборе" }));
  const target = buildSzTargetedRepair(brief, raw, [{ severity: "error", field: "experts", code: "test", message: "test" }]);
  const accepted = applySzRepairPatch(raw, { experts: substantive }, target.schema, brief);
  assert.ok(accepted);
  assert.ok(!has(gateOf(accepted), "expert-thesis"));
});

test("targeted: cannot empty selected strings, arrays or nested mandatory fields", () => {
  const cases = [
    ["description", ""], ["description", " \n\t"], ["story", []], ["story", [" "]],
    ["checklist", { ...fields.checklist, title: " " }],
    ["checklist", { ...fields.checklist, items: [] }],
    ["sectionsBefore", fields.sectionsBefore.map((section) => ({ ...section, paragraphs: [] }))],
    ["tableSection", { ...fields.tableSection, rows: [[]] }],
    ["faq", fields.faq.map((item) => ({ ...item, answer: "" }))],
  ];
  for (const [key, value] of cases) {
    const target = buildSzTargetedRepair(brief, fields, [{ severity: "error", field: key, code: "test", message: "test" }]);
    assert.equal(applySzRepairPatch(fields, { [key]: value }, target.schema, brief), null, key);
  }
  const raw = { ...structuredClone(fields), sectionsAfter: [] };
  const target = buildSzTargetedRepair(brief, raw, [{ severity: "error", field: "sectionsAfter", code: "test", message: "test" }]);
  assert.ok(applySzRepairPatch(raw, { sectionsAfter: [] }, target.schema, brief));
  const shortened = applySzRepairPatch(fields, { description: `${fields.description.slice(0, -1)}ы` }, buildSzTargetedRepair(brief, fields, [{ severity: "error", field: "description", code: "test", message: "test" }]).schema, brief);
  assert.ok(shortened);
  assert.notEqual(shortened.description, fields.description);
});

test("targeted: duplicate FAQ heading and actual matching fields; story context is read-only", () => {
  const problem = { severity: "error", field: "sections", code: "unique", message: `заголовок «${fields.faqHeading}» уже есть в статье other` };
  assert.deepEqual(szRepairFields(fields, [problem]), ["faqHeading"]);
  const same = { ...structuredClone(fields), sectionsBefore: [{ title: fields.faqHeading, paragraphs: ["текст"] }] };
  assert.deepEqual(szRepairFields(same, [problem]), ["faqHeading", "sectionsBefore"]);
  const unquoted = { ...problem, message: "заголовок повторяется внутри статьи" };
  const unquotedFields = szRepairFields(fields, [unquoted]);
  assert.ok(unquotedFields.includes("faqHeading") && unquotedFields.includes("steps"));
  const packQuote = { severity: "error", field: "sections", code: "unique-pack", message: "«этой цитаты нет в полях» повторяет статью пакета other" };
  assert.ok(!szRepairFields(fields, [packQuote]).includes("faqHeading"));
  const bold = { severity: "error", field: "question", code: "bold-query", message: `запрос «${brief.query}» не выделяется жирным («${fields.finalQuestion.slice(0, 40)}»)` };
  assert.deepEqual(szRepairFields(fields, [bold]), ["finalQuestion"]);
  const boldMiss = { severity: "error", field: "question", code: "bold-query", message: "запрос «ангел-хранитель» не выделяется жирным («этой фразы нет нигде»)" };
  assert.deepEqual(szRepairFields(fields, [boldMiss]), ["question", "finalQuestion"]);
  for (const key of ["story", "transition", "storyEnding"]) {
    const target = buildSzTargetedRepair(brief, fields, [{ severity: "error", field: key, code: "test", message: "test" }]);
    assert.deepEqual(target.fields, [key]);
    const context = JSON.parse(target.messages[1].content.split("БРИФ:\n")[1].split("\nОШИБКИ")[0]);
    assert.deepEqual(context.storyContext, { story: fields.story, transition: fields.transition, storyEnding: fields.storyEnding });
    assert.match(context.storyContextRule, /только для чтения.*героев.*детали/);
    assert.deepEqual(target.schema.required, [key]);
    assert.equal(target.schema.additionalProperties, false);
  }
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

test("prompt: main-body target is 950–1100 and the section budgets sum inside it", () => {
  const budget = szBodyPlanBudget();
  assert.ok(budget.low >= 950, `low ${budget.low}`);
  assert.ok(budget.mid >= 950 && budget.mid <= 1100, `mid ${budget.mid}`);
  const text = buildSzMessages(brief, view.site).map((message) => message.content).join("\n");
  assert.ok(text.includes("950–1100"));
  assert.ok(text.includes("ровно 2 раздела"));
  assert.ok(text.includes("пустой массив"));
  assert.ok(text.includes("45–70"));
  assert.ok(text.includes("116–135"));
  assert.ok(text.includes("500–800"));
  assert.ok(text.includes(`разделы sectionsBefore: 2 × ${SZ_BODY_PLAN.sectionsBefore.wordsEach[0]}–${SZ_BODY_PLAN.sectionsBefore.wordsEach[1]}`));
  assert.ok(text.includes(`каждый из трёх шагов: ${SZ_BODY_PLAN.stepText[0]}–${SZ_BODY_PLAN.stepText[1]}`));
  assert.ok(text.includes("три абзаца"));
  assert.ok(text.includes(`Гейт допускает ${SZ.limits.bodyH2[0]}–${SZ.limits.bodyH2[1]}`));
});

test("checklist: a two-word imperative passes; a letter and the placeholder do not", () => {
  const target = buildSzTargetedRepair(brief, fields, [{ severity: "error", field: "checklist", code: "test", message: "test" }]);
  const headphones = { ...fields.checklist, items: ["Наденьте наушники.", ...fields.checklist.items.slice(1)] };
  const accepted = applySzRepairPatch(fields, { checklist: headphones }, target.schema, brief);
  assert.ok(accepted);
  assert.deepEqual(errorsOf(hybridBuild(accepted).problems), []);
  for (const item of ["б", "главная мысль", "главная мысль а"]) {
    assert.equal(applySzRepairPatch(fields, { checklist: { ...headphones, items: [item, ...headphones.items.slice(1)] } }, target.schema, brief), null, item);
  }
});

test("quantity report: every numeric gate failure names a field, actual and bounds", () => {
  const raw = structuredClone(fields);
  raw.description = "Ангел-хранитель слишком коротко.";
  raw.faq = raw.faq.map((item, index) => (index ? item : { ...item, answer: "Короткий ответ про Ангела-хранителя и молитву без подробностей." }));
  const problems = errorsOf(hybridBuild(raw).problems);
  const report = szQuantityReport(raw, problems, [{ code: "unique-pack", field: "faq", slug: "other", message: `«${raw.faq[1].question}» повторяет статью пакета angel`, severity: "error" }]);
  const description = report.failures.find((row) => row.code === "description-length");
  const faq = report.failures.find((row) => row.code === "faq-length");
  const duplicate = report.failures.find((row) => row.code === "unique-pack");
  assert.equal(description.field, "description");
  assert.equal(description.unit, "chars");
  assert.ok(description.actual < description.min && description.max === 160);
  assert.equal(faq.path, "faq[0].answer");
  assert.ok(faq.actual < faq.min && faq.min === 40 && faq.max === 80);
  assert.equal(duplicate.path, "faq[1].question");
  assert.ok(report.sections.every((section) => section.path && section.words > 0));
  assert.ok(problems.some((problem) => problem.code === "body-length") === false);
});

const tierRepair = (overrides = {}) => ({
  mode: "tiered", cheapModel: "openai/gpt-oss-120b", strongModel: SZ_DEFAULT_MODEL, cheapTries: 2,
  cheapMaxTokens: 200, strongMaxTokens: 200, cheapBudget: 30, strongBudget: 30, maxRounds: 8, ...overrides,
});

test("tiered: deterministic homoglyph, dash and extra heading do not call a model", () => {
  const raw = structuredClone(fields);
  const at = raw.psychologyIntro.indexOf("а");
  raw.psychologyIntro = `${raw.psychologyIntro.slice(0, at)}a${raw.psychologyIntro.slice(at + 1)}`;
  raw.invitation = raw.invitation.replace("–", "—");
  raw.sectionsBefore = [...raw.sectionsBefore, { title: "Лишний раздел про паузу", paragraphs: ["Этот абзац достаточно длинный, чтобы его слили с предыдущим разделом, а не выбросили как пустую заглушку для проверки."] }];
  let calls = 0;
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair(), state: { spentRub: 0, calls: [], warnings: [] },
    callTier: () => { calls += 1; return {}; },
  });
  assert.equal(calls, 0);
  assert.equal(szH2Count(repaired.result.fields), 6);
  assert.ok(!repaired.result.md.includes("—"));
  assert.ok(!/[A-Za-z][А-Яа-яЁё]|[А-Яа-яЁё][A-Za-z]/u.test(repaired.result.fields.psychologyIntro));
  assert.equal(repaired.passed, true, errorsOf(repaired.result.problems).map((problem) => problem.message).join("; "));
});

test("tiered: cheap fragment fixes description and never receives the article", () => {
  const raw = structuredClone(fields);
  const original = raw.description;
  raw.description = "Ангел-хранитель слишком коротко.";
  const seen = [];
  const state = { spentRub: 0, calls: [], warnings: [] };
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair(), state,
    callTier: (tier, name, messages) => {
      seen.push({ tier, text: messages.map((message) => message.content).join("\n") });
      state.spentRub += 0.2;
      state.calls.push({ name, model: "openai/gpt-oss-120b", costRub: 0.2 });
      return { description: original };
    },
  });
  assert.deepEqual(seen.map((call) => call.tier), ["cheap"]);
  assert.ok(!seen[0].text.includes(fields.story[0].slice(0, 40)));
  assert.ok(!seen[0].text.includes(fields.sectionsBefore[0].title));
  assert.equal(repaired.passed, true);
  assert.equal(repaired.result.fields.description, original);
});

test("tiered: FAQ answer reaches gpt-5.5 only after two cheap misses, still as a fragment", () => {
  const raw = structuredClone(fields);
  const original = raw.faq[0].answer;
  raw.faq = raw.faq.map((item, index) => (index ? item : { ...item, answer: "Короткий ответ про Ангела-хранителя и молитву без подробностей." }));
  const seen = [];
  const state = { spentRub: 0, calls: [], warnings: [] };
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair(), state,
    callTier: (tier, name, messages) => {
      seen.push({ tier, text: messages.map((message) => message.content).join("\n") });
      state.spentRub += tier === "strong" ? 4 : 0.2;
      state.calls.push({ name, model: tier === "strong" ? SZ_DEFAULT_MODEL : "openai/gpt-oss-120b", costRub: tier === "strong" ? 4 : 0.2 });
      return tier === "strong" ? { answer: original } : { answer: "Все ещё слишком коротко для порога." };
    },
  });
  assert.deepEqual(seen.map((call) => call.tier), ["cheap", "cheap", "strong"]);
  for (const call of seen) {
    assert.ok(!call.text.includes(fields.story[0].slice(0, 40)));
    assert.ok(call.text.includes(raw.faq[0].question));
    assert.ok(!call.text.includes(fields.sectionsBefore[0].paragraphs[0].slice(0, 40)));
  }
  assert.equal(repaired.passed, true, errorsOf(repaired.result.problems).map((problem) => problem.message).join("; "));
});

test("tiered: short main body is expanded one section at a time", () => {
  const raw = structuredClone(fields);
  const removed = raw.sectionsBefore[0].paragraphs.splice(2, 4);
  assert.ok(words(removed.join(" ")) > 80);
  const before = errorsOf(hybridBuild(raw).problems);
  assert.ok(before.some((problem) => problem.code === "body-length"), before.map((problem) => problem.message).join("; "));
  const seen = [];
  const state = { spentRub: 0, calls: [], warnings: [] };
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair(), state,
    callTier: (tier, name, messages) => {
      const text = messages.map((message) => message.content).join("\n");
      seen.push(text);
      state.spentRub += 0.3;
      state.calls.push({ name, model: "openai/gpt-oss-120b", costRub: 0.3 });
      if (text.includes("Верни JSON { addition }")) return { addition: `${removed.join(" ")} Этот шаг остаётся бережным и не обещает результата.` };
      return { paragraphs: removed.slice(0, 2) };
    },
  });
  assert.ok(seen.length >= 1 && seen.length <= 4);
  assert.ok(seen.every((text) => !text.includes(fields.story[0].slice(0, 40))));
  assert.ok(seen[0].includes(raw.sectionsBefore[0].title));
  assert.equal(repaired.passed, true, errorsOf(repaired.result.problems).map((problem) => problem.message).join("; "));
});

test("tiered: banned word is rewritten from the fragment, and a failed article keeps its reasons", () => {
  const raw = structuredClone(fields);
  raw.finalInvite = "Если хотите короткую паузу, возьмите оберег ангела-хранителя перед следующим шагом.";
  const state = { spentRub: 0, calls: [], warnings: [] };
  const fixed = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair(), state,
    callTier: (tier, name, messages) => {
      assert.ok(messages.map((message) => message.content).join("\n").includes("оберег"));
      assert.ok(!messages.map((message) => message.content).join("\n").includes(fields.story[0].slice(0, 40)));
      state.spentRub += 0.2;
      state.calls.push({ name, model: "openai/gpt-oss-120b", costRub: 0.2 });
      return { text: fields.finalInvite };
    },
  });
  assert.equal(fixed.passed, true, errorsOf(fixed.result.problems).map((problem) => problem.message).join("; "));
  const stuck = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ cheapTries: 1, maxRounds: 3 }), state: { spentRub: 0, calls: [], warnings: [] },
    callTier: () => ({ text: "оберег остаётся в фрагменте и не проходит." }),
  });
  assert.equal(stuck.passed, false);
  assert.match(stuck.repairSkipped, /оберег|summoning|finalInvite/);
});

test("tiered defaults stay behind the flag; finished-article cost excludes failures", () => {
  const limits = { model: SZ_DEFAULT_MODEL, maxTokens: 16000 };
  assert.deepEqual(szRepairOptions({}, limits), { model: SZ_DEFAULT_MODEL, maxTokens: 16000, mode: "full" });
  const tier = szRepairOptions({ "repair-mode": "tiered", "tier-cheap-model": "openai/gpt-oss-120b", "tier-cheap-tries": "2", "tier-cheap-budget": "4", "tier-strong-budget": "6" }, limits);
  assert.equal(tier.mode, "tiered");
  assert.equal(tier.cheapModel, "openai/gpt-oss-120b");
  assert.equal(tier.strongModel, SZ_DEFAULT_MODEL);
  assert.equal(tier.cheapTries, 2);
  assert.equal(tier.cheapBudget, 4);
  assert.equal(tier.strongBudget, 6);
  assert.throws(() => szRepairOptions({ "repair-mode": "tiered", "tier-strong-model": "unknown" }, limits), (error) => error.code === 1);
  const pack = szPackCost([{ slug: "a", passed: true, costRub: 4.2 }, { slug: "b", passed: false, costRub: 19.25 }]);
  assert.deepEqual([pack.finished, pack.total, pack.finishedCostRub, pack.spentRub, pack.costPerFinished], [1, 2, 4.2, 23.45, 4.2]);
  const report = szReportMarkdown({ calls: [], spentRub: 23.45, warnings: [], articles: [{ slug: "a", passed: true, costRub: 4.2, errorsBeforeRepair: [], errorsAfterRepair: [], repairSkipped: null }, { slug: "b", passed: false, costRub: 19.25, errorsBeforeRepair: [], errorsAfterRepair: [{ field: "description", message: "132" }], repairSkipped: "description: 132" }] });
  assert.match(report, /стоимость готовой статьи: 4,200 ₽/);
  assert.match(report, /Готовых статей: 1\/2/);
  assert.match(report, /Цена одной готовой статьи: 4,200 ₽/);
});

test("offline price harness compares cheap models and does not call the network", () => {
  const prices = loadModelPrices();
  for (const [model, tariff] of Object.entries(TARIFF)) {
    assert.equal(prices[model].inputPer1M, tariff.inputPer1M, model);
    assert.equal(prices[model].outputPer1M, tariff.outputPer1M, model);
  }
  const full = estimateTieredArticle(prices, { draftModel: "openai/gpt-5.5", cheapModel: "openai/gpt-5.5", strongModel: "openai/gpt-5.5", ...TIERED_COST_PROFILE, draftOutputTokens: 8000, cheapCalls: 0, strongCalls: 0 });
  assert.ok(Math.abs(full.total - 62.342) < 0.001, full.total);
  const [oss, qwen, mini] = ["openai/gpt-oss-120b", "Qwen/Qwen3.6-35B-A3B", "openai/gpt-5.4-mini"].map((model) => estimateTieredArticle(prices, { draftModel: model, cheapModel: model, strongModel: "openai/gpt-5.5", ...TIERED_COST_PROFILE }));
  assert.ok(oss.total < 2 && qwen.total < mini.total && mini.total < 15);
  const repair = szRepairOptions({ "repair-mode": "tiered" }, { model: SZ_DEFAULT_MODEL, maxTokens: 16000 });
  assert.equal(TIERED_COST_PROFILE.strongOutputTokens, repair.strongMaxTokens);
  const strongCall = estimateCallRub(prices, "openai/gpt-5.5", TIERED_COST_PROFILE.strongPromptTokens, TIERED_COST_PROFILE.strongOutputTokens);
  assert.ok(strongCall <= repair.strongBudget, `${strongCall} > ${repair.strongBudget}`);
  const withStrong = [oss, qwen, mini].map((row) => estimateTieredArticle(prices, { draftModel: row.draftModel, cheapModel: row.cheapModel, strongModel: "openai/gpt-5.5", ...TIERED_COST_PROFILE, strongCalls: 1 }));
  assert.ok(withStrong[0].total > oss.total && withStrong[0].total < 12);
  assert.ok(withStrong[1].total < 18 && withStrong[2].total < 18);
  assert.ok(Math.abs(withStrong[0].total - 6.035) < 0.02, withStrong[0].total);
  assert.ok(Math.abs(withStrong[1].total - 13.875) < 0.02, withStrong[1].total);
  assert.ok(Math.abs(withStrong[2].total - 15.966) < 0.02, withStrong[2].total);
});

test("trim: a 172-character description is cut only at a sentence, and a dangling ending fails the gate", () => {
  const long = `${fields.description} Это не обещание исцеления.`;
  assert.equal([...long].length, 172);
  const legacy = (() => {
    const chars = [...long];
    let cut = chars.slice(0, 160).join("");
    const space = cut.lastIndexOf(" ");
    if (space >= 40) cut = cut.slice(0, space);
    return cut.replace(/[\s,.;:–\-]+$/u, "").trim();
  })();
  assert.equal([...legacy].length, 152);
  assert.ok(legacy.endsWith("Это не"), legacy.slice(-20));
  const fixed = applyDeterministicSzFixes({ ...structuredClone(fields), description: long }, { query: brief.query });
  assert.equal(fixed.fields.description, fields.description);
  assert.ok(fixed.fields.description.endsWith("чудес."));
  assert.equal(errorsOf(hybridBuild(fixed.fields).problems).length, 0);
  const dangling = hybridBuild({ ...structuredClone(fields), description: legacy });
  const fragment = errorsOf(dangling.problems).filter((problem) => problem.code === "description-fragment");
  assert.equal(fragment.length, 1);
  assert.equal(fragment[0].field, "description");
  assert.ok(!errorsOf(dangling.problems).some((problem) => problem.code === "description-length"));
  assert.ok(normalize(legacy).includes(normalize(brief.query)));
  const unanswered = structuredClone(fields);
  unanswered.faq = unanswered.faq.map((item, index) => (index ? item : { ...item, answer: `${item.answer} Это не` }));
  const faqFragment = errorsOf(hybridBuild(unanswered).problems).find((problem) => problem.code === "faq-fragment");
  assert.ok(faqFragment, errorsOf(hybridBuild(unanswered).problems).map((problem) => problem.message).join("; "));
  const tooLongSentence = `Ангел-хранитель ${"бережно ".repeat(30)}остаётся образом без точки`;
  assert.ok([...tooLongSentence].length > 160);
  const kept = applyDeterministicSzFixes({ ...structuredClone(fields), description: tooLongSentence }, { query: brief.query });
  assert.equal(kept.fields.description, tooLongSentence);
  const seo = `Ангел-хранитель: ${"длинное ".repeat(8)}название без точки`;
  assert.ok([...seo].length > 60);
  const seoKept = applyDeterministicSzFixes({ ...structuredClone(fields), seoTitle: seo }, { query: brief.query });
  assert.equal([...seoKept.fields.seoTitle].length > 60, true);
  assert.equal(seoKept.fields.seoTitle, seo);
  const seoCut = "Ангел-хранитель: короткая мысль. И ещё много лишних слов, которые не входят в лимит символов заголовка.";
  assert.ok([...seoCut].length > 60);
  const seoFixed = applyDeterministicSzFixes({ ...structuredClone(fields), seoTitle: seoCut }, { query: brief.query });
  assert.equal(seoFixed.fields.seoTitle, "Ангел-хранитель: короткая мысль.");
  const faqOver = `${fields.faq[0].answer} ${"Дополнительное предложение остаётся законченным. ".repeat(8)}`;
  assert.ok(words(faqOver) > 80);
  const faqFixed = applyDeterministicSzFixes({
    ...structuredClone(fields),
    faq: fields.faq.map((item, index) => (index ? item : { ...item, answer: faqOver })),
  }, { query: brief.query });
  assert.ok(words(faqFixed.fields.faq[0].answer) >= 40 && words(faqFixed.fields.faq[0].answer) <= 80);
  assert.ok(faqFixed.fields.faq[0].answer.endsWith("."));
  assert.ok(faqOver.startsWith(faqFixed.fields.faq[0].answer));
  const faqBlob = `Ангел-хранитель ${"бережно ".repeat(90)}остаётся образом`;
  assert.ok(words(faqBlob) > 80);
  const faqKept = applyDeterministicSzFixes({
    ...structuredClone(fields),
    faq: fields.faq.map((item, index) => (index ? item : { ...item, answer: faqBlob })),
  }, { query: brief.query });
  assert.equal(faqKept.fields.faq[0].answer, faqBlob);
  let handed = 0;
  const handedOff = repairSzArticleTiered({
    brief, raw: faqKept.fields, build: hybridBuild, repair: tierRepair(), state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name) => {
      handed += 1;
      assert.equal(tier, "cheap");
      assert.match(name, /faq/);
      return { answer: fields.faq[0].answer };
    },
  });
  assert.equal(handed, 1);
  assert.equal(handedOff.passed, true, handedOff.repairSkipped);
});

test("tiered: default strong budget covers one fragment, and a skipped strong try does not drop later cheap fragments", () => {
  const repair = szRepairOptions({ "repair-mode": "tiered" }, { model: SZ_DEFAULT_MODEL, maxTokens: 16000 });
  assert.equal(repair.strongMaxTokens, 800);
  assert.equal(repair.strongBudget, 6);
  const short = structuredClone(fields);
  short.faq = short.faq.map((item, index) => (index ? item : { ...item, answer: "Короткий ответ про Ангела-хранителя и молитву без подробностей." }));
  const failure = szQuantityReport(short, errorsOf(hybridBuild(short).problems)).failures.find((row) => row.code === "faq-length");
  const job = buildSzFragment(brief, short, failure);
  const worst = worstCaseRub(repair.strongModel, estimatePromptTokens(job.messages, repair.strongModel), repair.strongMaxTokens);
  assert.ok(worst <= repair.strongBudget, `${worst} > ${repair.strongBudget}`);
  const blockedAt1200 = worstCaseRub(repair.strongModel, estimatePromptTokens(job.messages, repair.strongModel), 1200);
  assert.ok(blockedAt1200 > 6, blockedAt1200);
  const raw = structuredClone(fields);
  raw.description = "Ангел-хранитель слишком коротко.";
  raw.faq = short.faq;
  const seen = [];
  const state = { spentRub: 0, calls: [], warnings: [] };
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, state,
    repair: tierRepair({
      cheapModel: "openai/gpt-5.4-mini", strongModel: SZ_DEFAULT_MODEL, cheapTries: 2,
      cheapMaxTokens: 800, strongMaxTokens: 1200, cheapBudget: 8, strongBudget: 6,
    }),
    callTier: (tier, name) => {
      seen.push({ tier, name });
      const cost = tier === "strong" ? 6 : 0.2;
      state.spentRub += cost;
      state.calls.push({ name, model: tier === "strong" ? SZ_DEFAULT_MODEL : "openai/gpt-5.4-mini", costRub: cost });
      if (String(name).includes("description")) return { description: "ещё короче" };
      return { answer: fields.faq[0].answer };
    },
  });
  assert.ok(state.warnings.some((warning) => warning.includes("ярус strong остановлен бюджетом 6")));
  assert.equal(seen.filter((call) => call.tier === "strong").length, 0);
  assert.ok(seen.some((call) => call.tier === "cheap" && String(call.name).includes("faq")), seen.map((call) => call.name).join(", "));
  assert.equal(repaired.result.fields.faq[0].answer, fields.faq[0].answer);
  assert.equal(repaired.passed, false);
});

test("pack FAQ repair counts cheap spend already charged for the article and the pack", () => {
  const question = fields.faq[0].question;
  const problem = { code: "unique-pack", field: "faq", slug: brief.slug, message: `«${question}» повторяет статью пакета other`, severity: "error" };
  const repair = tierRepair({ cheapModel: "openai/gpt-5.4-mini", cheapMaxTokens: 800, cheapBudget: 8 });
  const item = () => ({
    brief,
    fields: structuredClone(fields),
    build: hybridBuild,
    packProblems: [problem],
    attempts: [],
  });
  const spent = item();
  const blocked = { spentRub: 8, calls: [{ name: `${brief.slug}-repair-cheap-description`, model: repair.cheapModel, costRub: 8 }], warnings: [] };
  let calls = 0;
  repairSzPackDuplicates({
    items: [spent], repair, state: blocked,
    callTier: () => { calls += 1; return { question: "Чем молитва отличается от медитации на практике?" }; },
  });
  assert.equal(calls, 0);
  assert.ok(blocked.warnings.some((warning) => warning.includes("ярус cheap")));
  assert.equal(spent.fields.faq[0].question, question);
  const open = item();
  const state = { spentRub: 0, calls: [], warnings: [] };
  repairSzPackDuplicates({
    items: [open], repair, state,
    callTier: (tier, name) => {
      calls += 1;
      state.spentRub += 0.2;
      state.calls.push({ name, model: repair.cheapModel, costRub: 0.2 });
      return { question: "Чем молитва отличается от медитации на практике?" };
    },
  });
  assert.equal(calls, 1);
  assert.equal(open.fields.faq[0].question, "Чем молитва отличается от медитации на практике?");
  const otherBrief = { ...brief, slug: "drugaya-statya" };
  const otherProblem = { ...problem, slug: otherBrief.slug };
  const otherFields = structuredClone(fields);
  const otherJob = buildSzFragment(otherBrief, otherFields, { code: "unique-pack", field: "faq", path: "faq[0].question", message: otherProblem.message });
  const otherWorst = worstCaseRub(repair.cheapModel, estimatePromptTokens(otherJob.messages, repair.cheapModel), repair.cheapMaxTokens);
  assert.ok(otherWorst < repair.cheapBudget);
  const packCap = repair.cheapBudget * 2;
  const first = { brief, fields: structuredClone(fields), build: hybridBuild, packProblems: [], attempts: [{ tier: "cheap", key: "description", costRub: packCap - otherWorst / 2 }] };
  const second = { brief: otherBrief, fields: otherFields, build: hybridBuild, packProblems: [otherProblem], attempts: [] };
  const packState = { spentRub: first.attempts[0].costRub, calls: [], warnings: [] };
  let packCalls = 0;
  repairSzPackDuplicates({
    items: [first, second], repair, state: packState,
    callTier: () => { packCalls += 1; return { question: "Новый вопрос пакета?" }; },
  });
  assert.equal(packCalls, 0);
  assert.ok(packState.warnings.some((warning) => warning.includes(otherBrief.slug)));
  assert.equal(second.fields.faq[0].question, question);
});

test("tiered call ids pass the Moscow run-id validator", () => {
  const live = "tsvet-svechi-v-ezoterike-repair-cheap-body-length-sectionsBefore[0]";
  assert.equal(isWriterId(live), false);
  const slug = "tsvet-svechi-v-ezoterike";
  const bodyFailure = { code: "body-length", field: "sections", message: "основная часть 700 слов, нужно 880–1400", actual: 700, min: 880 };
  const shortSection = structuredClone(fields);
  shortSection.sectionsBefore[0].paragraphs.splice(2);
  const sectionJob = buildSzFragment(brief, shortSection, bodyFailure);
  assert.match(sectionJob.key, /sectionsBefore\[\d+\]/);
  const stepFields = structuredClone(fields);
  for (const key of ["sectionsBefore", "sectionsAfter"]) {
    for (const section of stepFields[key] ?? []) section.paragraphs = ["длинный абзац ".repeat(120)];
  }
  stepFields.steps.items[0].text = "Короткий шаг без лишних подробностей.";
  const stepJob = buildSzFragment(brief, stepFields, bodyFailure);
  assert.match(stepJob.key, /steps\.items\[\d+\]\.text/);
  const summoned = structuredClone(fields);
  summoned.sectionsBefore[0].paragraphs[0] = "В этом абзаце достаточно слов и есть оберег, чтобы путь фрагмента содержал скобки.";
  const summonJob = buildSzFragment(brief, summoned, { code: "summoning", field: "*", message: "«оберег» – без призыва" });
  assert.match(summonJob.key, /sectionsBefore\[0\]\.paragraphs\[0\]/);
  const forbiddenFields = structuredClone(fields);
  forbiddenFields.sectionsAfter = [{ title: "Отдельный раздел", paragraphs: ["Здесь стоит запретная фраза и больше ничего опасного для проверки пути."] }];
  const forbiddenJob = buildSzFragment(brief, forbiddenFields, { code: "forbidden", field: "*", message: "«запретная фраза»" });
  assert.match(forbiddenJob.key, /sectionsAfter\[0\]\.paragraphs\[0\]/);
  const mixedFields = structuredClone(fields);
  mixedFields.sectionsBefore[1].paragraphs[0] = `Слово молитв${"a"} с латинской буквой внутри достаточно длинное для пути фрагмента.`;
  const mixedJob = buildSzFragment(brief, mixedFields, { code: "mixed-script", field: "*", message: "латиница внутри кириллицы" });
  assert.match(mixedJob.key, /sectionsBefore\[1\]\.paragraphs\[0\]/);
  const jobs = [
    sectionJob,
    stepJob,
    summonJob,
    forbiddenJob,
    mixedJob,
    buildSzFragment(brief, { ...fields, description: "Ангел-хранитель слишком коротко." }, { code: "description-length", field: "description", path: "description", message: "description 20 символов, нужно 140–160" }),
    buildSzFragment(brief, { ...fields, description: `${fields.description.slice(0, -1)} Это не` }, { code: "description-fragment", field: "description", path: "description", message: "description нет конца предложения" }),
    buildSzFragment(brief, fields, { code: "seoTitle-length", field: "seoTitle", path: "seoTitle", message: "seoTitle 80 символов, нужно ≤ 60" }),
    buildSzFragment(brief, fields, { code: "seoTitle-query", field: "seoTitle", path: "seoTitle", message: "seoTitle должен начинаться с запроса" }),
    buildSzFragment(brief, fields, { code: "faq-length", field: "faq", path: "faq[0].answer", message: `ответ на «${fields.faq[0].question}» 10 слов, нужно 40–80` }),
    buildSzFragment(brief, fields, { code: "faq-fragment", field: "faq", path: "faq[1].answer", message: `ответ на «${fields.faq[1].question}» нет конца предложения` }),
    buildSzFragment(brief, fields, { code: "unique-pack", field: "faq", path: "faq[2].question", message: `«${fields.faq[2].question}» повторяет статью пакета other` }),
  ];
  assert.ok(jobs.every(Boolean));
  const used = new Set();
  const ids = [];
  for (const job of jobs) {
    for (const tier of ["cheap", "strong"]) {
      for (const attempt of [0, 1]) ids.push(tieredRepairCallName({ slug, tier, attempt, fragmentKey: job.key, used }));
    }
    ids.push(tieredRepairCallName({ slug, tier: "cheap", attempt: "pack-0", fragmentKey: job.key, used }));
  }
  ids.push(writerCallId(`${slug}-repair-cheap-0-body-length:sectionsBefore[0]`, { used }));
  ids.push(writerCallId("Slug_With.Dots[2]", { used }));
  const longA = `${"a".repeat(200)}X[0]`;
  const longB = `${"a".repeat(200)}Y[1]`;
  ids.push(writerCallId(longA, { used, maxLength: WRITER_ID_MAX }));
  ids.push(writerCallId(longB, { used, maxLength: WRITER_ID_MAX }));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.equal(isWriterId(id), true, id);
    assert.ok(id.length <= WRITER_ID_MAX, id);
    assert.equal(id, id.toLowerCase());
  }
  const sectionId = tieredRepairCallName({ slug, tier: "cheap", attempt: 0, fragmentKey: sectionJob.key });
  assert.match(sectionId, /sectionsbefore-\d+/);
  assert.equal(isWriterId(sectionId), true);
  const raw = structuredClone(shortSection);
  raw.description = "Ангел-хранитель слишком коротко.";
  const names = [];
  repairSzArticleTiered({
    brief: { ...brief, slug }, raw, build: hybridBuild, repair: tierRepair({ cheapTries: 2, maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name) => {
      names.push({ tier, name });
      assert.equal(isWriterId(name), true, name);
      if (name.includes("description")) return { description: "ещё короче" };
      return { paragraphs: fields.sectionsBefore[0].paragraphs.slice(0, 2) };
    },
  });
  const cheapDescription = names.filter((call) => call.tier === "cheap" && call.name.includes("description"));
  assert.ok(cheapDescription.length >= 2);
  assert.notEqual(cheapDescription[0].name, cheapDescription[1].name);
  assert.ok(names.some((call) => call.tier === "strong" && call.name.includes("description")));
  assert.ok(names.some((call) => /sectionsbefore-\d+/.test(call.name)), names.map((call) => call.name).join(", "));
  assert.ok(names.every((call) => call.name !== live));
  const packNames = [];
  const packItem = {
    brief: { ...brief, slug },
    fields: structuredClone(fields),
    build: hybridBuild,
    packProblems: [{ code: "unique-pack", field: "faq", slug, message: `«${fields.faq[0].question}» повторяет статью пакета other`, severity: "error" }],
    attempts: [],
  };
  repairSzPackDuplicates({
    items: [packItem], repair: tierRepair(), state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name) => {
      packNames.push(name);
      assert.equal(tier, "cheap");
      assert.equal(isWriterId(name), true, name);
      return { question: "Чем домашняя молитва отличается от короткой паузы?" };
    },
  });
  assert.equal(packNames.length, 1);
  assert.match(packNames[0], /faq-\d+-question/);
});

test("cheap token cap: reasoning models get headroom, mini and gpt-5.5 stay on the flag", () => {
  assert.equal(cheapTokenCap({ model: "openai/gpt-5.4-mini", fragmentKey: "body-length:sectionsBefore[0]", configured: 800 }), 800);
  assert.equal(cheapTokenCap({ model: "openai/gpt-5.5", fragmentKey: "story-length:story", configured: 800 }), 800);
  assert.ok(cheapTokenCap({ model: "openai/gpt-oss-120b", fragmentKey: "description-length:description", configured: 800 }) >= 2400);
  assert.ok(cheapTokenCap({ model: "Qwen/Qwen3.6-35B-A3B", fragmentKey: "faq-length:faq[0].answer", configured: 800 }) >= 2400);
  assert.ok(cheapTokenCap({ model: "openai/gpt-oss-120b", fragmentKey: "body-length:sectionsBefore[0]", configured: 800 }) >= 4000);
  assert.ok(cheapTokenCap({ model: "Qwen/Qwen3.6-35B-A3B", fragmentKey: "total-length:sectionsBefore[0]", configured: 800 }) >= 4000);
  assert.ok(cheapTokenCap({ model: "openai/gpt-oss-120b", fragmentKey: "story-length:story", configured: 800 }) >= 4000);
  assert.equal(cheapTokenCap({ model: "openai/gpt-oss-120b", fragmentKey: "faq-length:faq[0].answer", configured: 5000 }), 5000);
  assert.equal(retryTokenCap(2400), 4800);
  assert.equal(retryTokenCap(9000), 16000);
  assert.equal(fragmentTruncated(null, {}), true);
  assert.equal(fragmentTruncated("{", {}), true);
  assert.equal(fragmentTruncated('{"description":"x"}', {}), false);
  assert.equal(fragmentTruncated({ description: "x" }, { finishReason: "length" }), true);
  assert.equal(fragmentTruncated({ description: "x" }, { finishReason: "stop" }), false);
  const row = szQuantityReport(fields, [{ code: "query-count", field: "sections", message: "запрос «ангел-хранитель» в тексте 1 раз, нужно 2–4", severity: "error" }]).failures[0];
  assert.equal(row.actual, 1);
  assert.equal(row.min, 2);
  assert.equal(row.max, 4);
  assert.equal(row.unit, "times");
});

test("tiered: a truncated cheap fragment is retried once with a larger cap and both calls are billed", () => {
  const raw = structuredClone(fields);
  raw.description = "Ангел-хранитель слишком коротко.";
  const nine = "Девять коротких слов в ответе без нужной длины здесь.";
  assert.equal(words(nine), 9);
  raw.faq = raw.faq.map((item, index) => (index ? item : { ...item, answer: nine }));
  const repair = tierRepair({ cheapModel: "openai/gpt-oss-120b", cheapMaxTokens: 800, cheapTries: 2, cheapBudget: 30, strongBudget: 30 });
  const state = { spentRub: 0, calls: [], warnings: [] };
  const seen = [];
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair, state,
    callTier: (tier, name, messages, schema, options = {}) => {
      seen.push({ tier, name, maxTokens: options.maxTokens });
      assert.equal(isWriterId(name), true, name);
      if (String(name).includes("description") && !String(name).includes("retry")) {
        state.spentRub += 0.11;
        state.calls.push({ name, costRub: 0.11, finishReason: "length" });
        return null;
      }
      if (String(name).includes("description")) {
        state.spentRub += 0.23;
        state.calls.push({ name, costRub: 0.23, finishReason: "stop" });
        return { description: fields.description };
      }
      state.spentRub += 0.05;
      state.calls.push({ name, costRub: 0.05, finishReason: "stop" });
      assert.ok(messages.map((message) => message.content).join("\n").includes(raw.faq[0].question));
      return { answer: fields.faq[0].answer };
    },
  });
  const descriptions = seen.filter((call) => call.name.includes("description"));
  assert.equal(descriptions.length, 2);
  assert.ok(descriptions[0].maxTokens >= 2400);
  assert.equal(descriptions[1].maxTokens, retryTokenCap(descriptions[0].maxTokens));
  assert.ok(descriptions[1].name.includes("retry"));
  assert.notEqual(descriptions[0].name, descriptions[1].name);
  assert.ok(seen.some((call) => call.name.includes("faq")));
  assert.equal(seen.filter((call) => call.tier === "strong").length, 0);
  const descriptionAttempt = repaired.attempts.filter((attempt) => attempt.key.includes("description"));
  assert.equal(descriptionAttempt.length, 1);
  assert.equal(descriptionAttempt[0].costRub, 0.34);
  assert.equal(descriptionAttempt[0].applied, true);
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: a cut-off but parseable fragment falls back to the first answer when the retry does not apply", () => {
  const raw = structuredClone(fields);
  raw.description = "Ангел-хранитель слишком коротко.";
  const state = { spentRub: 0, calls: [], warnings: [] };
  let calls = 0;
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ cheapModel: "openai/gpt-oss-120b", cheapMaxTokens: 800, cheapTries: 2, cheapBudget: 30 }), state,
    callTier: (tier, name) => {
      calls += 1;
      if (!String(name).includes("retry")) {
        state.spentRub += 0.1;
        state.calls.push({ name, costRub: 0.1, finishReason: "length" });
        return { description: fields.description };
      }
      state.spentRub += 0.2;
      state.calls.push({ name, costRub: 0.2, finishReason: "length" });
      return null;
    },
  });
  assert.equal(calls, 2);
  assert.ok(Math.abs(repaired.attempts[0].costRub - 0.3) < 1e-9);
  assert.equal(repaired.result.fields.description, fields.description);
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: a truncated retry is skipped when the larger cap does not fit the cheap budget", () => {
  const raw = structuredClone(fields);
  raw.description = "Ангел-хранитель слишком коротко.";
  const failure = szQuantityReport(raw, errorsOf(hybridBuild(raw).problems)).failures.find((row) => row.code === "description-length");
  const job = buildSzFragment(brief, raw, failure);
  const model = "openai/gpt-oss-120b";
  const cap = cheapTokenCap({ model, fragmentKey: job.key, configured: 800 });
  const worst = worstCaseRub(model, estimatePromptTokens(job.messages, model), cap);
  const retryWorst = worstCaseRub(model, estimatePromptTokens(job.messages, model), retryTokenCap(cap));
  assert.ok(retryWorst > worst);
  let calls = 0;
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild,
    repair: tierRepair({ cheapModel: model, cheapMaxTokens: 800, cheapTries: 1, cheapBudget: worst, strongBudget: 0.01, maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: () => { calls += 1; return null; },
  });
  assert.equal(calls, 1);
  assert.equal(repaired.passed, false);
});

test("tiered: repair output with a banned phrase or a brief ban is not accepted", () => {
  const grow = (text) => {
    let next = text.replace(/\.+$/u, "");
    while ([...next].length < 139) next += " тихо";
    return `${next}.`;
  };
  const promised = grow("Ангел-хранитель гарантирует спокойный вечер после короткой паузы и бережного разговора без ожидания чудес и лишней спешки");
  const forbidden = grow("Ангел-хранитель помогает, если призвать ангела в тишине и бережно закончить мысль без ожидания чудес и лишней спешки");
  assert.ok([...promised].length >= 140 && [...promised].length <= 160, [...promised].length);
  assert.ok([...forbidden].length >= 140 && [...forbidden].length <= 160, [...forbidden].length);
  assert.equal(fragmentBanned({ description: promised }, brief), true);
  assert.equal(fragmentBanned({ description: forbidden }, brief), true);
  const short = { ...fields, description: "Ангел-хранитель слишком коротко." };
  const failure = { code: "description-length", field: "description", path: "description", message: "description 32 символов, нужно 140–160" };
  const job = buildSzFragment(brief, short, failure);
  assert.equal(job.apply(short, { description: promised }), null);
  assert.equal(job.apply(short, { description: forbidden }), null);
  assert.equal(job.apply(short, { description: fields.description }).description, fields.description);
  const seen = [];
  const repaired = repairSzArticleTiered({
    brief, raw: short, build: hybridBuild, repair: tierRepair(), state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name) => {
      seen.push(name);
      return seen.length === 1 ? { description: promised } : { description: fields.description };
    },
  });
  assert.equal(seen.length, 2);
  assert.equal(repaired.result.fields.description, fields.description);
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

const fieldStrings = (value, path = "", out = []) => {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, index) => fieldStrings(item, `${path}[${index}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) fieldStrings(item, path ? `${path}.${key}` : key, out);
  }
  return out;
};

test("tiered: a transition without the exact query is a fragment, and the church sentence stays", () => {
  const raw = structuredClone(fields);
  const church = raw.sectionsBefore[0].paragraphs[0];
  assert.match(church, /Ангел-хранитель даётся человеку при Крещении/);
  raw.transition = raw.transition.replace(/ангел-хранитель/giu, "этом образе");
  const before = fieldStrings(raw);
  const deterministic = applyDeterministicSzFixes(raw, { query: brief.query, links: brief.links });
  assert.deepEqual(fieldStrings(deterministic.fields), before);
  const template = `Дальше речь пойдёт о ${brief.query}.`;
  const planted = `${raw.transition.trim()} ${template}`;
  const plantedWords = words([...raw.story, planted].join(" "));
  assert.ok(plantedWords >= SZ.limits.story[0] && plantedWords <= SZ.limits.story[1], plantedWords);
  const seen = [];
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ cheapTries: 2, maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      const text = messages.map((message) => message.content).join("\n");
      seen.push({ tier, text });
      assert.ok(text.includes(raw.transition.slice(0, 40)));
      assert.ok(!text.includes(church.slice(0, 40)));
      assert.ok(!text.includes(fields.sectionsBefore[0].title));
      return seen.length === 1 ? { transition: planted } : { transition: fields.transition };
    },
  });
  assert.equal(seen.length, 2);
  assert.ok(seen[0].text.includes("дословно"));
  assert.equal(repaired.result.fields.transition, fields.transition);
  assert.equal(repaired.result.fields.sectionsBefore[0].paragraphs[0], church);
  assert.ok(!repaired.result.md.includes(template));
  assert.ok(!repaired.result.fields.transition.includes("этом образе"));
  const after = new Map(fieldStrings(repaired.result.fields));
  for (const [path, text] of before) {
    if (path === "transition") continue;
    assert.equal(after.get(path), text, path);
  }
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: a transition at the query maximum is not bought by rewriting another sentence", () => {
  const raw = structuredClone(fields);
  const church = raw.sectionsBefore[0].paragraphs[0];
  raw.transition = raw.transition.replace(/ангел-хранитель/giu, "этом образе");
  raw.sectionsBefore[0].paragraphs[1] = `${raw.sectionsBefore[0].paragraphs[1]} Здесь назван ангел-хранитель. И ещё раз назван ангел-хранитель.`;
  const problems = errorsOf(hybridBuild(raw).problems);
  assert.ok(problems.some((problem) => problem.code === "transition-query"));
  const counted = szQuantityReport(raw, problems).failures.find((row) => row.code === "query-count");
  assert.equal(counted, undefined);
  const template = `Дальше речь пойдёт о ${brief.query}.`;
  const seen = [];
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ cheapTries: 1, strongBudget: 30, maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      const text = messages.map((message) => message.content).join("\n");
      seen.push({ tier, text });
      assert.match(text, /осталось в диапазоне 2–4/);
      assert.ok(!text.includes(church.slice(0, 40)));
      return seen.length === 1 ? { transition: template } : { transition: fields.transition };
    },
  });
  assert.ok(seen.some((call) => call.tier === "cheap"));
  assert.ok(seen.some((call) => call.tier === "strong"));
  assert.equal(repaired.result.fields.transition, raw.transition);
  assert.equal(repaired.result.fields.sectionsBefore[0].paragraphs[0], church);
  assert.ok(!repaired.result.md.includes(template));
  assert.ok(!repaired.result.md.includes("этот образ даётся"));
  assert.equal(repaired.passed, false);
});

test("tiered: a search phrase below the range is raised by one grammatical sentence", () => {
  const raw = structuredClone(fields);
  const church = raw.sectionsBefore[0].paragraphs[0];
  const skip = new Set(["description", "seoTitle"]);
  const replaceQuery = (value, key) => {
    if (skip.has(key)) return value;
    if (typeof value === "string") return value.replace(/ангел-хранитель/giu, "этот образ");
    if (Array.isArray(value)) return value.map((item) => replaceQuery(item, key));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([child, item]) => [child, replaceQuery(item, child)]));
    return value;
  };
  const stripped = replaceQuery(raw, "");
  const before = szQuantityReport(stripped, errorsOf(hybridBuild(stripped).problems)).failures.find((row) => row.code === "query-count");
  assert.equal(before.actual, 1, before?.message);
  const sentence = "В этом разделе слово ангел-хранитель стоит в точной форме и без кавычек вокруг него.";
  const template = `Дальше речь пойдёт о ${brief.query}.`;
  const seen = [];
  const repaired = repairSzArticleTiered({
    brief, raw: stripped, build: hybridBuild, repair: tierRepair({ maxRounds: 6 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      const text = messages.map((message) => message.content).join("\n");
      seen.push(text);
      if (text.includes("Верни JSON { transition }")) return seen.filter((item) => item.includes("Верни JSON { transition }")).length === 1 ? { transition: template } : { transition: fields.transition };
      if (text.includes("Верни JSON { sentence }")) return { sentence: template };
      return {};
    },
  });
  assert.ok(seen.some((text) => text.includes("Верни JSON { transition }")));
  assert.equal(repaired.result.fields.transition, fields.transition);
  assert.equal(repaired.result.fields.sectionsBefore[0].paragraphs[0], stripped.sectionsBefore[0].paragraphs[0]);
  assert.ok(!repaired.result.md.includes(template));
  assert.ok(!repaired.result.fields.sectionsBefore[0].paragraphs[0].includes("Ангел-хранитель"));
  assert.notEqual(stripped.sectionsBefore[0].paragraphs[0], church);
  const after = szQuantityReport(repaired.result.fields, errorsOf(repaired.result.problems)).failures.find((row) => row.code === "query-count");
  assert.equal(after, undefined);
  assert.ok(!JSON.stringify(repaired.result.fields).includes(`«${brief.query}»`));
  assert.equal(repaired.passed, true, repaired.repairSkipped);
  const low = buildSzFragment(brief, stripped, { code: "query-count", field: "sections", message: "запрос «ангел-хранитель» в тексте 1 раз, нужно 2–4", actual: 1, min: 2, max: 4 });
  assert.equal(low.apply(stripped, { sentence: template }), null);
  assert.ok(low.apply(stripped, { sentence }));
});

test("tiered: a two-word expert thesis is rewritten as a fragment, and a short story is appended", () => {
  const raw = structuredClone(fields);
  raw.experts[1].thesis = "вера как";
  raw.story = raw.story.slice(0, 1);
  assert.ok(words([...raw.story, raw.transition].join(" ")) < 200);
  const seen = [];
  const sentence = "Бережная пауза помогает собраться с мыслями и сделать следующий шаг спокойно и без спешки.";
  let paragraph = sentence;
  while (words(paragraph) < 50) paragraph = `${paragraph} ${sentence}`;
  let extra = "Вечером разговор с братом всё-таки состоялся, и они договорились, кто поедет к маме.";
  while (words(extra) < 50) extra = `${extra} Решение о поездке осталось за ними.`;
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ maxRounds: 8 }), state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      const text = messages.map((message) => message.content).join("\n");
      seen.push({ name, text });
      if (text.includes("Тезис эксперта")) return { thesis: "вера как опора" };
      if (text.includes("абзацы истории")) return { paragraphs: [paragraph, extra] };
      if (text.includes("Верни JSON { addition }")) return { addition: paragraph };
      if (text.includes("Верни JSON { paragraphs }")) return { paragraphs: [paragraph] };
      if (text.includes("Верни JSON { text }")) return { text: `${paragraph} ${paragraph}` };
      return {};
    },
  });
  const thesisCall = seen.find((call) => call.text.includes("Тезис эксперта"));
  const storyCall = seen.find((call) => call.text.includes("абзацы истории"));
  assert.ok(thesisCall);
  assert.ok(storyCall);
  assert.ok(!thesisCall.text.includes(fields.sectionsBefore[0].title));
  assert.ok(!storyCall.text.includes(fields.sectionsBefore[0].title));
  assert.equal(repaired.result.fields.experts[1].thesis, "вера как опора");
  assert.equal(repaired.result.fields.experts[1].name, "Эрих Фромм");
  assert.ok(repaired.result.fields.story.length > 1);
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: missing internal links and a half-Cyrillic slug are fixed from the brief", () => {
  assert.equal(latinizeSlug("ogон-в-эзотерике"), "ogon-v-ezoterike");
  assert.equal(genericLinkAnchor("материал"), true);
  assert.equal(genericLinkAnchor("Эзотерика и психология"), false);
  const raw = structuredClone(fields);
  const stripLinks = (value) => {
    if (typeof value === "string") return value.replace(/\[[^\]]+\]\(\/s\/[^)]+\)/g, "материал");
    if (Array.isArray(value)) return value.map(stripLinks);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripLinks(item)]));
    return value;
  };
  const stripped = stripLinks(raw);
  assert.ok(errorsOf(hybridBuild(stripped).problems).some((problem) => problem.code === "links-contextual"));
  const before = fieldStrings(stripped);
  let calls = 0;
  const titles = { "ezoterika-i-tserkov": "Эзотерика и церковь", "psihologiya-i-ezoterika": "Эзотерика и психология", "chenneling-v-ezoterike": "Ченнелинг в эзотерике" };
  const linked = repairSzArticleTiered({
    brief, raw: stripped, build: hybridBuild, repair: tierRepair(), state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      calls += 1;
      assert.equal(isWriterId(name), true, name);
      const text = messages.map((message) => message.content).join("\n");
      const slug = text.match(/ссылку на \/s\/([a-z0-9-]+)/)?.[1];
      const host = text.split("АБЗАЦ:\n").at(-1).trim();
      assert.ok(slug && host && !host.includes(fields.faq[0].question));
      const link = `[${titles[slug]}](/s/${slug})`;
      const woven = host.includes(".") ? host.replace(/\.\s*/, ` в статье ${link}. `) : `В статье ${link} сказано то же самое. ${host}`;
      return { text: woven };
    },
  });
  assert.ok(calls >= 2, String(calls));
  const hrefs = [...linked.result.md.matchAll(/\]\(\/s\/([a-z0-9-]+)\)/g)].map((match) => match[1]);
  assert.ok(hrefs.length >= 2 && hrefs.length <= 5, hrefs.join(","));
  assert.ok(hrefs.every((slug) => brief.links.contextual.includes(slug)), hrefs.join(","));
  assert.ok(!linked.result.md.includes("[материал]"), "общий анкор");
  assert.ok(!linked.result.md.includes("Подробнее: ["));
  const after = new Map(fieldStrings(linked.result.fields));
  const changed = before.filter(([path, text]) => after.get(path) !== text).map(([path]) => path);
  assert.ok(changed.length >= 2, changed.join(","));
  const sections = new Set(changed.map((path) => path.match(/sections(?:Before|After)\[\d+\]|tableSection|steps/)?.[0]));
  assert.ok(sections.size >= 2, changed.join(","));
  assert.equal(linked.passed, true, linked.repairSkipped);
  calls = 0;
  const mixed = structuredClone(fields);
  const broken = `/s/${"\u0435"}z${"\u043e"}terika-i-tserk${"\u043e"}v`;
  mixed.sectionsBefore[1].paragraphs[4] = mixed.sectionsBefore[1].paragraphs[4].replace("/s/ezoterika-i-tserkov", broken);
  assert.ok(errorsOf(hybridBuild(mixed).problems).some((problem) => problem.code === "links-internal"));
  const slugged = repairSzArticleTiered({
    brief, raw: mixed, build: hybridBuild, repair: tierRepair(), state: { spentRub: 0, calls: [], warnings: [] },
    callTier: () => { calls += 1; return {}; },
  });
  assert.equal(calls, 0);
  assert.ok(slugged.result.md.includes("](/s/ezoterika-i-tserkov)"));
  assert.ok(!slugged.result.md.includes(broken));
  assert.equal(slugged.passed, true, slugged.repairSkipped);
  const slugBefore = fieldStrings(mixed);
  const slugFixed = applyDeterministicSzFixes(mixed, { query: brief.query, links: brief.links });
  const slugAfter = new Map(fieldStrings(slugFixed.fields));
  for (const [path, text] of slugBefore) {
    if (path === "sectionsBefore[1].paragraphs[4]") {
      assert.ok(slugAfter.get(path).includes("](/s/ezoterika-i-tserkov)"));
      assert.ok(!slugAfter.get(path).includes(broken));
    } else {
      assert.equal(slugAfter.get(path), text, path);
    }
  }
});

test("tiered: one contextual slug is inserted once", () => {
  const stripLinks = (value) => {
    if (typeof value === "string") return value.replace(/\[[^\]]+\]\(\/s\/[^)]+\)/g, "материал");
    if (Array.isArray(value)) return value.map(stripLinks);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripLinks(item)]));
    return value;
  };
  const raw = stripLinks(structuredClone(fields));
  const oneBrief = { ...brief, links: { ...brief.links, contextual: ["ezoterika-i-tserkov"] } };
  const before = fieldStrings(raw);
  const preview = buildSzFragment(oneBrief, raw, { code: "links-contextual", path: "slug:ezoterika-i-tserkov", field: "sections", message: "0 ссылок /s в тексте, нужно 2–5", actual: 0, min: 2, max: 5 });
  const host = preview.messages.map((message) => message.content).join("\n").split("АБЗАЦ:\n").at(-1).trim();
  assert.equal(preview.apply(raw, { text: `${host} Подробнее: [материал](/s/ezoterika-i-tserkov).` }), null);
  const foreign = host.includes(".") ? host.replace(/\.\s*/, " в статье [Чужой сайт](/s/religiya-i-ezoterika). ") : `В статье [Чужой сайт](/s/religiya-i-ezoterika) сказано иное. ${host}`;
  assert.equal(preview.apply(raw, { text: foreign }), null);
  let calls = 0;
  const repaired = repairSzArticleTiered({
    brief: oneBrief, raw, build: hybridBuild, repair: tierRepair(), state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      calls += 1;
      const text = messages.map((message) => message.content).join("\n");
      const paragraph = text.split("АБЗАЦ:\n").at(-1).trim();
      if (calls === 1) return { text: `${paragraph} Подробнее: [материал](/s/ezoterika-i-tserkov).` };
      const link = "[Эзотерика и церковь](/s/ezoterika-i-tserkov)";
      const woven = paragraph.includes(".") ? paragraph.replace(/\.\s*/, ` в статье ${link}. `) : `В статье ${link} сказано то же самое. ${paragraph}`;
      return { text: woven };
    },
  });
  assert.equal(calls, 2);
  const hrefs = [...repaired.result.md.matchAll(/\]\(\/s\/ezoterika-i-tserkov\)/g)];
  assert.equal(hrefs.length, 1);
  assert.ok(!repaired.result.md.includes("[материал]"));
  const after = new Map(fieldStrings(repaired.result.fields));
  const changed = before.filter(([path, text]) => after.get(path) !== text).map(([path]) => path);
  assert.equal(changed.length, 1, changed.join(","));
  assert.ok(after.get(changed[0]).includes("[Эзотерика и церковь](/s/ezoterika-i-tserkov)"));
  assert.ok(!after.get(changed[0]).startsWith(before.find(([path]) => path === changed[0])[1]));
  assert.deepEqual(repaired.result.fields.story, fields.story);
  const job = buildSzFragment(oneBrief, repaired.result.fields, { code: "links-contextual", field: "sections", message: "1 ссылок /s в тексте, нужно 2–5", actual: 1, min: 2, max: 5 });
  assert.equal(job, null);
});

test("tiered: article repair and pack repair share one used set", () => {
  const callIds = new Set();
  const names = [];
  const raw = structuredClone(fields);
  raw.transition = raw.transition.replace(/ангел-хранитель/giu, "этом образе");
  repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ cheapTries: 1, strongBudget: 0.01, maxRounds: 2 }),
    state: { spentRub: 0, calls: [], warnings: [] }, callIds,
    callTier: (tier, name) => {
      names.push(name);
      assert.equal(isWriterId(name), true, name);
      return { transition: fields.transition };
    },
  });
  assert.ok(names.length >= 1);
  assert.ok([...callIds].includes(names[0]));
  const bare = tieredRepairCallName({
    slug: brief.slug, tier: "cheap", attempt: "pack-0", fragmentKey: "unique-pack:faq[0].question", used: new Set(),
  });
  callIds.add(bare);
  const packItem = {
    brief,
    fields: structuredClone(fields),
    build: hybridBuild,
    packProblems: [{ code: "unique-pack", field: "faq", slug: brief.slug, message: `«${fields.faq[0].question}» повторяет статью пакета other`, severity: "error" }],
    attempts: [],
  };
  repairSzPackDuplicates({
    items: [packItem], repair: tierRepair(), state: { spentRub: 0, calls: [], warnings: [] }, callIds,
    callTier: (tier, name) => {
      names.push(name);
      assert.equal(tier, "cheap");
      assert.equal(isWriterId(name), true, name);
      assert.notEqual(name, bare);
      return { question: "Чем домашняя молитва отличается от короткой паузы?" };
    },
  });
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every((name) => name.startsWith(`${brief.slug}-`) && name.includes("-repair-cheap-")));
});

test("tiered: a nine-word FAQ answer and a short total use fragment repair", () => {
  const nine = "Девять коротких слов в ответе без нужной длины здесь.";
  const raw = structuredClone(fields);
  raw.faq = raw.faq.map((item, index) => (index ? item : { ...item, answer: nine }));
  const seen = [];
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair(), state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      seen.push(messages.map((message) => message.content).join("\n"));
      return { answer: fields.faq[0].answer };
    },
  });
  assert.equal(seen.length, 1);
  assert.ok(seen[0].includes(raw.faq[0].question));
  assert.ok(!seen[0].includes(fields.sectionsBefore[0].title));
  assert.equal(repaired.passed, true, repaired.repairSkipped);
  const totalFailure = { code: "total-length", field: "sections", message: "всего 1342 слов с FAQ, нужно 1600–2200", actual: 1342, min: 1600, max: 2200 };
  const totalJob = buildSzFragment(brief, fields, totalFailure);
  assert.match(totalJob.key, /^total-length:/);
  assert.ok(!totalJob.messages.map((message) => message.content).join("\n").includes(fields.story[0].slice(0, 40)));
  const addition = "Этот новый абзац добавляет спокойное пояснение к короткому разделу и не обещает результата. Он остаётся в рамках темы и не зовёт к ритуалу.";
  const expanded = totalJob.key.includes("steps")
    ? totalJob.apply(fields, { addition })
    : totalJob.apply(fields, { paragraphs: [addition] });
  assert.ok(expanded);
  const beforeWords = words(JSON.stringify(fields.sectionsBefore) + JSON.stringify(fields.steps));
  const afterWords = words(JSON.stringify(expanded.sectionsBefore) + JSON.stringify(expanded.steps));
  assert.ok(afterWords > beforeWords);
});

test("tiered: a short main body reaches a strong expansion when that fragment still fits", () => {
  const repair = szRepairOptions({ "repair-mode": "tiered" }, { model: SZ_DEFAULT_MODEL, maxTokens: 16000 });
  const raw = structuredClone(fields);
  const kept = raw.sectionsBefore[0].paragraphs.slice(0, 1);
  raw.sectionsBefore[0].paragraphs = kept;
  const church = kept[0];
  const failure = { code: "body-length", field: "sections", message: "основная часть 720 слов, нужно 880–1400", actual: 720, min: 880, max: 1400 };
  const job = buildSzFragment(brief, raw, failure);
  assert.ok(job.outputTokens);
  assert.ok(job.outputTokens < repair.strongMaxTokens, job.outputTokens);
  assert.equal(lengthFragmentTokens(160), job.outputTokens);
  const promptTokens = estimatePromptTokens(job.messages, repair.strongModel);
  const ceiling = worstCaseRub(repair.strongModel, promptTokens, repair.strongMaxTokens);
  const sized = worstCaseRub(repair.strongModel, promptTokens, job.outputTokens);
  const left = repair.strongBudget - 1.968;
  assert.ok(ceiling > left, `${ceiling} should exceed the 4.03 ₽ left after description`);
  assert.ok(sized <= left, `${sized} should fit in ${left}`);
  assert.ok(!job.messages.map((message) => message.content).join("\n").includes(fields.story[0].slice(0, 40)));
  const addition = "Новый абзац спокойно поясняет образ и не обещает чуда. Он остаётся в рамках темы и помогает добрать нужный объём раздела без переписывания уже сказанного.";
  assert.equal(job.apply(raw, { paragraphs: [addition, addition] }), null);
  assert.equal(job.apply(raw, { paragraphs: [church] }), null);
  assert.equal(job.apply(raw, { paragraphs: [`${addition} Подробнее на https://example.com/candle.`] }), null);
  assert.equal(job.apply(raw, { paragraphs: [`${addition} Если появится дискомфорт, просто отметьте это.`] }), null);
  assert.equal(job.apply(raw, { paragraphs: [addition.replace(" и ", " — ")] }), null);
  assert.equal(job.apply(raw, { paragraphs: [`${addition} Этот образ гарантирует спокойствие.`] }), null);
  const seen = [];
  const state = { spentRub: 0, calls: [], warnings: [] };
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild,
    repair: tierRepair({
      cheapModel: "openai/gpt-5.4-mini", strongModel: SZ_DEFAULT_MODEL, cheapTries: 2,
      cheapMaxTokens: 800, strongMaxTokens: 800, cheapBudget: 8, strongBudget: 6, maxRounds: 8,
    }),
    state,
    callTier: (tier, name, messages, schema, options = {}) => {
      seen.push({ tier, name, maxTokens: options.maxTokens });
      state.spentRub += tier === "strong" ? 1.2 : 0.05;
      state.calls.push({ name, model: tier === "strong" ? SZ_DEFAULT_MODEL : "openai/gpt-5.4-mini", costRub: tier === "strong" ? 1.2 : 0.05 });
      if (tier === "strong" && /body-length|total-length/.test(name)) {
        assert.ok(options.maxTokens <= job.outputTokens, options.maxTokens);
        assert.ok(worstCaseRub(SZ_DEFAULT_MODEL, estimatePromptTokens(messages, SZ_DEFAULT_MODEL), options.maxTokens) <= repair.strongBudget);
        return { paragraphs: [addition] };
      }
      return { paragraphs: ["Мало слов для порога длины."] };
    },
  });
  const strongLength = seen.filter((call) => call.tier === "strong" && /body-length|total-length/.test(call.name));
  assert.ok(strongLength.length >= 1, seen.map((call) => `${call.tier}:${call.name}`).join(", "));
  assert.equal(repaired.result.fields.sectionsBefore[0].paragraphs[0], church);
  assert.ok(repaired.result.fields.sectionsBefore[0].paragraphs.includes(addition));
  const copied = structuredClone(fields);
  copied.sectionsBefore[1].paragraphs.push(church);
  assert.ok(errorsOf(hybridBuild(copied).problems).some((problem) => problem.code === "duplicate-paragraph"));
});

test("tiered: a query above the maximum is not shortened in place", () => {
  const shapes = [
    ["цвет свечи при гадании", "Цвет свечи при гадании выбирают вечером дома."],
    ["молитва в трудный час", "Молитва в трудный час поддерживает человека в тишине."],
    ["сила молитвы к ангелу", "Сила молитвы к ангелу поддерживает человека в тишине."],
    ["цвет свечи для медитации", "Цвет свечи для медитации выбирают ближе к вечеру."],
    ["свеча какого цвета", "Свеча какого цвета стоит на столе у окна."],
    ["цвет свечи в эзотерике", "Здесь берут цвет свечи в эзотерике свечи и оставляют её до утра."],
  ];
  for (const [query, paragraph] of shapes) {
    const candleBrief = { ...brief, query, title: brief.title };
    const candleCfg = ruleConfig(candleBrief, pack.publishedAt, pool);
    const candleBuild = (value) => {
      const { fields: normalized } = normalizeSzFields(value);
      const md = assembleSzArticle(candleBrief, normalized, view.site, { date: pack.publishedAt });
      return { fields: normalized, md, problems: checkSzArticle(md, candleCfg, env) };
    };
    const raw = structuredClone(fields);
    const heading = "Цвет свечи при гадании дома вечером";
    const quote = "«Цвет свечи при гадании выбирают вечером», – сказала она и замолчала, подбирая следующие слова для разговора.";
    raw.sectionsBefore[0].title = heading;
    raw.story[0] = quote;
    const planted = `${paragraph} ${paragraph} ${paragraph}`;
    raw.transition = `${raw.transition} ${paragraph}`;
    raw.sectionsBefore[1].paragraphs[raw.sectionsBefore[1].paragraphs.length - 1] = planted;
    const counted = bodyQueryCountOf(candleBuild(raw).md, query);
    assert.ok(counted > 4, `${query}: ${counted}`);
    let calls = 0;
    const repaired = repairSzArticleTiered({
      brief: candleBrief, raw, build: candleBuild, repair: tierRepair(), args: { "no-repair": true },
      state: { spentRub: 0, calls: [], warnings: [] },
      callTier: () => { calls += 1; return {}; },
    });
    assert.equal(calls, 0, query);
    assert.equal(repaired.passed, false, query);
    assert.equal(bodyQueryCountOf(repaired.result.md, query), counted, query);
    assert.equal(repaired.result.fields.sectionsBefore[1].paragraphs.at(-1), planted, query);
    assert.equal(repaired.result.fields.sectionsBefore[0].title, heading, query);
    assert.equal(repaired.result.fields.story[0], quote, query);
    assert.equal(repaired.result.fields.transition, raw.transition, query);
    assert.equal(repaired.result.fields.description, raw.description, query);
    assert.ok(!repaired.result.md.includes("Цвет свечи при выбирают"), query);
    assert.ok(!repaired.result.md.includes("цвет свечи свечи"), query);
    assert.ok(!repaired.result.md.includes("Молитва в трудный поддерживает"), query);
  }
  const query = "цвет свечи в эзотерике";
  const candleBrief = { ...brief, query, title: brief.title };
  const candleCfg = ruleConfig(candleBrief, pack.publishedAt, pool);
  const candleBuild = (value) => {
    const { fields: normalized } = normalizeSzFields(value);
    const md = assembleSzArticle(candleBrief, normalized, view.site, { date: pack.publishedAt });
    return { fields: normalized, md, problems: checkSzArticle(md, candleCfg, env) };
  };
  const raw = structuredClone(fields);
  const church = raw.sectionsBefore[0].paragraphs[0];
  const heading = "Цвет свечи в эзотерике дома вечером";
  const quote = "«Цвет свечи в эзотерике выбирают вечером», – сказала она и замолчала, подбирая следующие слова.";
  const host = raw.sectionsBefore[1].paragraphs.at(-1);
  raw.sectionsBefore[0].title = heading;
  raw.story[0] = quote;
  raw.transition = `${raw.transition} Тема цвет свечи в эзотерике остаётся в этом абзаце.`;
  raw.description = `${raw.description.slice(0, 80)} цвет свечи в эзотерике.`;
  const slot = `${host} Здесь назван цвет свечи в эзотерике.`;
  raw.sectionsBefore[1].paragraphs[raw.sectionsBefore[1].paragraphs.length - 1] = slot;
  const before = fieldStrings(raw);
  const counted = bodyQueryCountOf(candleBuild(raw).md, query);
  assert.ok(counted > 4, counted);
  const failure = szQuantityReport(raw, errorsOf(candleBuild(raw).problems)).failures.find((row) => row.code === "query-count");
  const job = buildSzFragment(candleBrief, raw, failure);
  const prompt = job.messages.map((message) => message.content).join("\n");
  assert.ok(prompt.includes("Здесь назван цвет свечи в эзотерике"));
  assert.ok(!prompt.includes(heading));
  assert.ok(!prompt.includes(quote.slice(0, 24)));
  assert.ok(!prompt.includes(raw.transition.slice(0, 40)));
  assert.ok(!prompt.includes(raw.description.slice(0, 40)));
  const rephrase = "Здесь речь об оттенке пламени, без дословной формулировки запроса, и вечер остаётся спокойным.";
  const applied = job.apply(raw, { text: rephrase });
  assert.ok(applied);
  const after = new Map(fieldStrings(applied));
  const changed = before.filter(([path, text]) => after.get(path) !== text).map(([path]) => path);
  assert.deepEqual(changed, [`sectionsBefore[1].paragraphs[${raw.sectionsBefore[1].paragraphs.length - 1}]`]);
  assert.equal(applied.sectionsBefore[0].paragraphs[0], church);
  assert.equal(applied.sectionsBefore[0].title, heading);
  assert.equal(applied.story[0], quote);
  assert.equal(applied.transition, raw.transition);
  assert.equal(applied.description, raw.description);
  const nextCount = counted - 1;
  assert.ok(nextCount >= 2, nextCount);
  const heavyFields = structuredClone(fields);
  const heavyParagraph = "Цвет свечи в эзотерике. Цвет свечи в эзотерике. Цвет свечи в эзотерике. Цвет свечи в эзотерике. Вечер остаётся спокойным.";
  heavyFields.sectionsBefore[1].paragraphs[heavyFields.sectionsBefore[1].paragraphs.length - 1] = heavyParagraph;
  const heavy = bodyQueryCountOf(candleBuild(heavyFields).md, query);
  assert.ok(heavy - 4 < 2, heavy);
  const heavyJob = buildSzFragment(candleBrief, heavyFields, { code: "query-count", field: "sections", message: `запрос «${query}» в тексте ${heavy} раз, нужно 2–4`, actual: heavy, min: 2, max: 4 });
  assert.equal(heavyJob.apply(heavyFields, { text: rephrase }), null);
  const angel = structuredClone(fields);
  const angelIndex = angel.sectionsBefore[1].paragraphs.length - 1;
  const angelHost = angel.sectionsBefore[1].paragraphs[angelIndex];
  angel.sectionsBefore[1].paragraphs[angelIndex] = `${angelHost} Здесь ещё раз назван ангел-хранитель, и снова ангел-хранитель, и в третий раз ангел-хранитель.`;
  const angelBefore = fieldStrings(angel);
  const angelCount = bodyQueryCountOf(hybridBuild(angel).md, brief.query);
  assert.ok(angelCount > 4, angelCount);
  const angelRephrase = "В утренней и вечерней молитве человек говорит о слабостях дня и сам решает, что делать дальше, без лишней точной формулы.";
  const seen = [];
  const repaired = repairSzArticleTiered({
    brief, raw: angel, build: hybridBuild, repair: tierRepair({ cheapTries: 1, maxRounds: 3 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      const text = messages.map((message) => message.content).join("\n");
      seen.push({ tier, text });
      assert.equal(tier, "cheap");
      assert.ok(!text.includes(angel.transition.slice(0, 40)));
      assert.ok(!text.includes(fields.sectionsBefore[0].title));
      assert.ok(!text.includes(fields.faq[0].question));
      return { text: angelRephrase };
    },
  });
  assert.equal(seen.length, 1);
  assert.ok(seen[0].text.includes("ангел-хранитель"));
  assert.equal(repaired.result.fields.sectionsBefore[1].paragraphs[angelIndex], angelRephrase);
  const angelAfter = new Map(fieldStrings(repaired.result.fields));
  const angelChanged = angelBefore.filter(([path, text]) => angelAfter.get(path) !== text).map(([path]) => path);
  assert.deepEqual(angelChanged, [`sectionsBefore[1].paragraphs[${angelIndex}]`]);
  assert.ok(bodyQueryCountOf(repaired.result.md, brief.query) >= 2);
  const angelCrowded = structuredClone(fields);
  angelCrowded.finalInvite = "Первый ангел-хранитель. Второй ангел-хранитель. Третий ангел-хранитель. Четвёртый ангел-хранитель.";
  const rejectJob = buildSzFragment(brief, angelCrowded, { code: "query-count", field: "sections", message: "запрос «ангел-хранитель» в тексте 5 раз, нужно 2–4", actual: 5, min: 2, max: 4 });
  assert.ok(rejectJob.messages.map((message) => message.content).join("\n").includes("Четвёртый ангел-хранитель"));
  assert.ok(!rejectJob.messages.map((message) => message.content).join("\n").includes(angelCrowded.transition.slice(0, 40)));
  assert.equal(rejectJob.apply(angelCrowded, { text: "Здесь речь об ангела-хранителе и о бережном обращении без точной фразы запроса." }), null);
  const keptOne = "В абзаце один раз остаётся ангел-хранитель, остальные обороты уже другие и бережные.";
  const kept = rejectJob.apply(angelCrowded, { text: keptOne });
  assert.ok(kept);
  assert.equal(kept.transition, angelCrowded.transition);
  assert.equal(kept.finalInvite, keptOne);
  assert.equal(kept.sectionsBefore[0].paragraphs[0], angelCrowded.sectionsBefore[0].paragraphs[0]);
});

test("tiered: an inline quote is not a query-count rewrite target", () => {
  const query = "цвет свечи при гадании";
  const candleBrief = { ...brief, query, title: brief.title };
  const candleCfg = ruleConfig(candleBrief, pack.publishedAt, pool);
  const candleBuild = (value) => {
    const { fields: normalized } = normalizeSzFields(value);
    const md = assembleSzArticle(candleBrief, normalized, view.site, { date: pack.publishedAt });
    return { fields: normalized, md, problems: checkSzArticle(md, candleCfg, env) };
  };
  const quoted = [
    "Мастер сказал: «Цвет свечи при гадании выбирают вечером». Дальше разговор стал тише, и в комнате остался только свет лампы.",
    'Мастер сказал: "Цвет свечи при гадании выбирают вечером". Дальше разговор стал тише, и в комнате остался только свет лампы.',
    "Мастер сказал так.\n> Цвет свечи при гадании выбирают вечером.\nДальше разговор стал тише, и в комнате остался только свет лампы.",
    "<blockquote>Цвет свечи при гадании выбирают вечером.</blockquote> Дальше разговор стал тише, и в комнате остался только свет лампы.",
    "Мастер сказал: 'Цвет свечи при гадании выбирают вечером'. Дальше разговор стал тише, и в комнате остался только свет лампы.",
    "Мастер сказал: ‘Цвет свечи при гадании выбирают вечером’. Дальше разговор стал тише, и в комнате остался только свет лампы.",
    "Мастер сказал: ‹Цвет свечи при гадании выбирают вечером›. Дальше разговор стал тише, и в комнате остался только свет лампы.",
    "Мастер сказал: «Цвет свечи при гадании выбирают вечером. Дальше разговор стал тише, и в комнате остался только свет лампы.",
    "Мастер сказал: “Цвет свечи при гадании выбирают вечером. Дальше разговор стал тише, и в комнате остался только свет лампы.",
    "Мастер сказал: „Цвет свечи при гадании выбирают вечером. Дальше разговор стал тише, и в комнате остался только свет лампы.",
  ];
  for (const storyLine of quoted) {
    const raw = structuredClone(fields);
    raw.story[1] = storyLine;
    raw.sectionsBefore[0].title = "Цвет свечи при гадании дома вечером";
    raw.transition = `${raw.transition} Цвет свечи при гадании. Цвет свечи при гадании.`;
    raw.description = `${raw.description.slice(0, 80)} цвет свечи при гадании.`;
    const counted = bodyQueryCountOf(candleBuild(raw).md, query);
    assert.ok(counted > 4, `${counted}: ${storyLine.slice(0, 24)}`);
    const failure = szQuantityReport(raw, errorsOf(candleBuild(raw).problems)).failures.find((row) => row.code === "query-count");
    assert.equal(buildSzFragment(candleBrief, raw, failure), null, storyLine.slice(0, 24));
    let calls = 0;
    const repaired = repairSzArticleTiered({
      brief: candleBrief, raw, build: candleBuild, repair: tierRepair(), args: { "no-repair": true },
      state: { spentRub: 0, calls: [], warnings: [] },
      callTier: () => { calls += 1; return { text: "Другой абзац без запроса." }; },
    });
    assert.equal(calls, 0);
    assert.equal(repaired.result.fields.story[1], storyLine);
    assert.equal(repaired.result.fields.sectionsBefore[0].title, raw.sectionsBefore[0].title);
    assert.equal(repaired.result.fields.transition, raw.transition);
    assert.equal(repaired.result.fields.description, raw.description);
  }
  const raw = structuredClone(fields);
  const storyLine = quoted[0];
  raw.story[1] = storyLine;
  raw.sectionsBefore[0].title = "Цвет свечи при гадании дома вечером";
  raw.transition = `${raw.transition} Цвет свечи при гадании. Цвет свечи при гадании.`;
  const open = "Здесь назван цвет свечи при гадании обычной фразой, без кавычек и без врезки.";
  raw.finalInvite = open;
  const failure = szQuantityReport(raw, errorsOf(candleBuild(raw).problems)).failures.find((row) => row.code === "query-count");
  const job = buildSzFragment(candleBrief, raw, failure);
  assert.equal(job.key, "query-count:finalInvite");
  const prompt = job.messages.map((message) => message.content).join("\n");
  assert.ok(prompt.includes(open));
  assert.ok(!prompt.includes("Мастер сказал"));
  assert.ok(!prompt.includes(raw.sectionsBefore[0].title));
  assert.ok(!prompt.includes(raw.transition.slice(0, 40)));
  assert.ok(!prompt.includes(raw.description.slice(0, 40)));
  const named = structuredClone(fields);
  const apostrophe = "Д'Артаньян сказал, что цвет свечи при гадании выбирают вечером, и разговор стал тише.";
  named.story[1] = apostrophe;
  named.sectionsBefore[0].title = "Цвет свечи при гадании дома вечером";
  named.transition = `${named.transition} Цвет свечи при гадании. Цвет свечи при гадании.`;
  const namedFailure = szQuantityReport(named, errorsOf(candleBuild(named).problems)).failures.find((row) => row.code === "query-count");
  const namedJob = buildSzFragment(candleBrief, named, namedFailure);
  assert.equal(namedJob.key, "query-count:story[1]");
  assert.ok(namedJob.messages.map((message) => message.content).join("\n").includes("Д'Артаньян"));
});

test("tiered: bare addresses and mail fail the fragment and the gate", () => {
  const raw = structuredClone(fields);
  raw.sectionsBefore[0].paragraphs = raw.sectionsBefore[0].paragraphs.slice(0, 1);
  const failure = { code: "body-length", field: "sections", message: "основная часть 720 слов, нужно 880–1400", actual: 720, min: 880, max: 1400 };
  const job = buildSzFragment(brief, raw, failure);
  const addition = "Новый абзац спокойно поясняет образ и не обещает чуда. Он остаётся в рамках темы и помогает добрать нужный объём раздела без переписывания уже сказанного.";
  assert.ok(job.apply(raw, { paragraphs: [addition] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} Это не гарантирует внешний результат, а только даёт паузу.`] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} Подробнее в материале [Эзотерика и церковь](/s/ezoterika-i-tserkov).`] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} Заметка есть на https://sergey-zoya.ru/about и на https://audiolad.ru/articles/x.`] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} Заметка есть на https://www.sergey-zoya.ru/about и на https://www.audiolad.ru/articles/x.`] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} Заметка есть на www.sergey-zoya.ru/about и на www.audiolad.ru/x.`] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} Зеркало https://cdn.audiolad.ru/media/a и https://blog.sergey-zoya.ru/about.`] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} На Node.js, Vue.js, Next.js и ASP.NET пишут сервисы, файл зовут photo.jpg, и это не адрес сайта.`] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} Картинка лежит на https://audiolad.ru/media/photo.jpg.`] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} В конце.Далее идёт обычный текст.`] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} В конце. Далее идёт обычный текст.`] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} Смотрите https://audiolad.ru/?next=https://sergey-zoya.ru/about.`] }));
  assert.ok(job.apply(raw, { paragraphs: [`${addition} Смотрите https://audiolad.ru/?u=www.audiolad.ru.`] }));
  const foreign = [
    "example.com/candle", "t.me/audiolad", "zoya@example.com", "//example.com/candle", "www.example.com/candle", "https://example.com/candle",
    "сайт.рф", "САЙТ.РФ", "www.сайт.рф", "пример.москва", "что.рус", "школа.дети", "портал.онлайн", "личный.сайт",
    "xn--80aswg.xn--p1ai", "www.xn--80aswg.xn--p1ai", "XN--80ASWG.XN--P1AI",
    "https://сайт.рф", "https://xn--80aswg.xn--p1ai", "https://www.xn--80aswg.xn--p1ai",
    "https://audiolad.ru/?next=https://evil.com", "https://audiolad.ru/?u=evil.com",
    "https://audiolad.ru/path/evil.com", "https://audiolad.ru/page#evil.com", "https://audiolad.ru/#https://evil.com",
    "https://audiolad.ru/сайт.рф", "https://audiolad.ru/?u=сайт.рф", "https://audiolad.ru/#сайт.рф",
    "https://audiolad.ru/path/evil%2Ecom", "https://audiolad.ru/path/evil%252Ecom",
    "https://audiolad.ru/?u=%D1%81%D0%B0%D0%B9%D1%82.%D1%80%D1%84",
    "https://audiolad.ru/xn--80aswg.xn--p1ai", "https://audiolad.ru/?u=пример.москва",
  ];
  for (const sample of foreign) {
    assert.equal(job.apply(raw, { paragraphs: [`${addition} Подробнее: ${sample}.`] }), null, sample);
  }
  for (const sample of foreign) {
    const codes = errorsOf(checkSzArticle(firstPara(assembled, `Подробнее: ${sample}.`), cfg, env)).map((problem) => problem.code);
    assert.ok(codes.includes("links-external"), `${sample}: ${codes.join(",")}`);
  }
  const safe = [
    "То есть т.е. и т.д. остаются обычными сокращениями.",
    "А. С. Пушкин писал коротко и ясно.",
    "А.\u00A0С.\u00A0Пушкин писал коротко и ясно.",
    "Версия 1.5 остаётся прежней и понятной.",
    "Практики есть на audiolad.ru и на sergey-zoya.ru.",
    "На Node.js, Vue.js, Next.js и ASP.NET пишут сервисы, файл зовут photo.jpg, и это не адрес сайта.",
    "Картинка лежит на https://audiolad.ru/media/photo.jpg.",
    "Смотрите https://www.sergey-zoya.ru/about и https://www.audiolad.ru/articles/x.",
    "Смотрите www.sergey-zoya.ru/about и www.audiolad.ru/x.",
    "Зеркало https://cdn.audiolad.ru/media/a и https://blog.sergey-zoya.ru/about.",
    "В конце.Далее идёт обычный текст.",
    "В конце. Далее идёт обычный текст.",
    "Смотрите https://audiolad.ru/?next=https://sergey-zoya.ru/about.",
    "Смотрите https://audiolad.ru/?u=www.audiolad.ru.",
  ];
  for (const sample of safe) {
    const codes = errorsOf(checkSzArticle(firstPara(assembled, sample), cfg, env)).map((problem) => problem.code);
    assert.ok(!codes.includes("links-external"), `${sample}: ${codes.join(",")}`);
  }
  const cross = firstPara(assembled, "Смотрите https://sergey-zoya.ru/about и https://audiolad.ru/articles/x.");
  const crossCodes = errorsOf(checkSzArticle(cross, cfg, env)).map((problem) => problem.code);
  assert.ok(!crossCodes.includes("links-external"), crossCodes.join(","));
});

test("tiered: an out-of-range description is rewritten from the closest candidate", () => {
  const raw = structuredClone(fields);
  raw.description = "Ангел-хранитель слишком коротко.";
  const failure = szQuantityReport(raw, errorsOf(hybridBuild(raw).problems)).failures.find((row) => row.code === "description-length");
  const job = buildSzFragment(brief, raw, failure);
  const prompt = job.messages.map((message) => message.content).join("\n");
  assert.match(prompt, new RegExp(`сейчас ${[...raw.description].length} символов`));
  assert.match(prompt, /Цель ровно 150 символов/);
  assert.match(prompt, /140–160/);
  const long = "Ангел-хранитель и свечной фитиль мерцают отдельно от храмового хора, пока тихий двор хранит паузу без спешки и без чужих адресов в этом длинном описании целиком.";
  const longer = `${long} Ещё одна фраза про фитиль и хор остаётся лишней для длины.`;
  assert.ok([...long].length > 160 && [...longer].length > [...long].length, `${[...long].length} ${[...longer].length}`);
  assert.equal(job.apply(raw, { description: long }), null);
  assert.equal(job.apply(raw, { description: longer }), null);
  assert.equal(job.apply(raw, { description: fields.description }).description, fields.description);
  const seen = [];
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ cheapTries: 2, maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      const text = messages.map((message) => message.content).join("\n");
      seen.push({ name, text });
      if (seen.length === 1) return { description: longer };
      if (seen.length === 2) return { description: long };
      return { description: fields.description };
    },
  });
  assert.match(seen[1].name, /tighten/);
  assert.ok(seen[1].text.includes(longer));
  assert.match(seen[1].text, /короче/);
  assert.match(seen[1].text, new RegExp(`сейчас ${[...longer].length} символов`));
  assert.match(seen[1].text, /Цель ровно 150 символов/);
  assert.ok(seen[2].text.includes(long));
  assert.ok(!seen[2].text.includes("лишней для длины"));
  assert.equal(repaired.result.fields.description, fields.description);
  assert.notEqual(repaired.result.fields.description, longer.slice(0, [...fields.description].length));
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: a duplicate FAQ question is rewritten and checked against other articles", () => {
  const question = "Когда стоит обратиться к специалисту?";
  const taken = "Чем домашняя пауза отличается от разговора со специалистом?";
  const fresh = "В какой момент лучше обсудить переживание со специалистом?";
  const raw = structuredClone(fields);
  const answer = raw.faq[0].answer;
  const rest = raw.faq.slice(1).map((item) => item.question);
  raw.faq = raw.faq.map((item, index) => (index ? item : { ...item, question }));
  const questions = new Map(env.unique.questions);
  questions.set(normalize(question), "meditaciya-na-prinyatie-sebya");
  questions.set(normalize(taken), "drugaya-statya");
  const localEnv = { ...env, unique: { ...env.unique, questions } };
  const build = (value) => {
    const { fields: normalized } = normalizeSzFields(value);
    const md = assembleSzArticle(brief, normalized, view.site, { date: pack.publishedAt });
    return { fields: normalized, md, problems: checkSzArticle(md, cfg, localEnv) };
  };
  const failure = szQuantityReport(raw, errorsOf(build(raw).problems)).failures.find((row) => row.code === "unique");
  assert.equal(failure.field, "faq");
  assert.equal(failure.path, "faq[0].question");
  assert.match(failure.message, /meditaciya-na-prinyatie-sebya/);
  const job = buildSzFragment(brief, raw, { ...failure, occupiedQuestions: new Set([normalize(question), normalize(taken)]) });
  const jobPrompt = job.messages.map((message) => message.content).join("\n");
  assert.match(jobPrompt, /только этот вопрос/);
  assert.ok(jobPrompt.includes(question));
  assert.ok(!jobPrompt.includes(answer.slice(0, 48)));
  assert.equal(job.apply(raw, { question }), null);
  assert.equal(job.apply(raw, { question: taken }), null);
  assert.equal(job.apply(raw, { question: raw.faq[1].question }), null);
  const applied = job.apply(raw, { question: fresh });
  assert.equal(applied.faq[0].question, fresh);
  assert.equal(applied.faq[0].answer, answer);
  assert.deepEqual(applied.faq.slice(1).map((item) => item.question), rest);
  const seen = [];
  const repaired = repairSzArticleTiered({
    brief, raw, build, unique: localEnv.unique,
    repair: tierRepair({ cheapTries: 2, maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      const text = messages.map((message) => message.content).join("\n");
      seen.push({ tier, name, text });
      assert.equal(tier, "cheap");
      assert.ok(text.includes(question));
      return seen.length === 1 ? { question } : { question: fresh };
    },
  });
  assert.equal(seen.length, 2);
  assert.equal(repaired.result.fields.faq[0].question, fresh);
  assert.equal(repaired.result.fields.faq[0].answer, answer);
  assert.deepEqual(repaired.result.fields.faq.slice(1).map((item) => item.question), rest);
  assert.ok(!errorsOf(repaired.result.problems).some((problem) => problem.code === "unique"), repaired.repairSkipped);
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: a pathless or unaffordable strong error does not block the others", () => {
  const raw = structuredClone(fields);
  raw.description = "Ангел-хранитель слишком коротко.";
  raw.sectionsBefore[1].paragraphs[0] = `${raw.sectionsBefore[1].paragraphs[0]} В этом абзаце упомянут оберег.`;
  const build = (value) => {
    const result = hybridBuild(value);
    result.problems.push({ code: "order", field: "*", message: "нарушен канонический порядок блоков", severity: "error" });
    return result;
  };
  const rows = szQuantityReport(raw, errorsOf(build(raw).problems)).failures.map((row) => {
    const fragment = buildSzFragment(brief, raw, row);
    if (!fragment) return { code: row.code, worst: null };
    const cap = Math.min(fragment.outputTokens ?? 800, 800);
    return { code: row.code, worst: worstCaseRub(SZ_DEFAULT_MODEL, estimatePromptTokens(fragment.messages, SZ_DEFAULT_MODEL), cap) };
  });
  const description = rows.find((row) => row.code === "description-length");
  const summoning = rows.find((row) => row.code === "summoning");
  const order = rows.find((row) => row.code === "order");
  assert.equal(order.worst, null);
  assert.ok(description.worst > 0 && summoning.worst > 0);
  const [affordable, blocked] = description.worst <= summoning.worst ? [description, summoning] : [summoning, description];
  const budget = Math.round(((affordable.worst + blocked.worst) / 2) * 1000) / 1000;
  assert.ok(affordable.worst <= budget && blocked.worst > budget, `${affordable.code}:${affordable.worst} ${blocked.code}:${blocked.worst} ${budget}`);
  const seen = [];
  const state = { spentRub: 0, calls: [], warnings: [] };
  repairSzArticleTiered({
    brief, raw, build,
    repair: tierRepair({ cheapTries: 0, strongModel: SZ_DEFAULT_MODEL, strongMaxTokens: 800, strongBudget: budget, maxRounds: 6 }),
    state,
    callTier: (tier, name) => {
      seen.push(name);
      return { description: fields.description, text: raw.sectionsBefore[1].paragraphs[0].replace(" В этом абзаце упомянут оберег.", "") };
    },
  });
  const marker = (code) => (code === "description-length" ? "description" : "summoning");
  assert.ok(seen.some((name) => name.includes(marker(affordable.code))), seen.join(","));
  assert.ok(!seen.some((name) => name.includes(marker(blocked.code))), seen.join(","));
  assert.ok(state.warnings.some((warning) => warning.includes(blocked.code) && warning.includes("один не помещается") && warning.includes("остальные ошибки не блокируются")), state.warnings.join(" | "));
});

test("tiered: strong reserve is the real fragment cap and is not dropped", () => {
  const repair = szRepairOptions({ "repair-mode": "tiered" }, { model: SZ_DEFAULT_MODEL, maxTokens: 16000 });
  assert.equal(repair.strongModel, SZ_DEFAULT_MODEL);
  assert.equal(repair.strongBudget, 6);
  assert.equal(repair.strongMaxTokens, 800);
  const priced = (value, codes) => {
    const rows = szQuantityReport(value, errorsOf(hybridBuild(value).problems)).failures.filter((row) => codes.includes(row.code));
    return rows.map((row) => {
      const job = buildSzFragment(brief, value, row);
      const cap = Math.min(job.outputTokens ?? repair.strongMaxTokens, repair.strongMaxTokens);
      return { code: row.code, cap, worst: worstCaseRub(repair.strongModel, estimatePromptTokens(job.messages, repair.strongModel), cap) };
    });
  };
  const pair = structuredClone(fields);
  pair.sectionsBefore[0].paragraphs = pair.sectionsBefore[0].paragraphs.slice(0, 1);
  pair.sectionsBefore[1].paragraphs[0] = `${pair.sectionsBefore[1].paragraphs[0]} В этом абзаце упомянут оберег.`;
  assert.deepEqual(errorsOf(hybridBuild(pair).problems).map((problem) => problem.code).sort(), ["body-length", "summoning"]);
  const two = priced(pair, ["body-length", "total-length", "summoning"]);
  assert.ok(two.some((row) => row.code === "body-length" && row.cap < 800 && row.cap >= 200));
  assert.ok(two.some((row) => row.code === "summoning" && row.cap === 800));
  const twoSum = two.reduce((sum, row) => sum + row.worst, 0);
  assert.ok(twoSum > repair.strongBudget, two.map((row) => `${row.code}:${row.worst.toFixed(3)}`).join(" "));
  const pairAffordable = two.filter((row) => row.worst <= repair.strongBudget);
  assert.ok(pairAffordable.length > 0, two.map((row) => `${row.code}:${row.worst.toFixed(3)}`).join(" "));
  let pairCalls = 0;
  const pairSeen = [];
  const pairState = { spentRub: 0, calls: [], warnings: [] };
  repairSzArticleTiered({
    brief, raw: pair, build: hybridBuild,
    repair: tierRepair({ cheapTries: 0, strongModel: SZ_DEFAULT_MODEL, strongMaxTokens: 800, strongBudget: 6, maxRounds: 4 }),
    state: pairState,
    callTier: (tier, name, messages, schema, options = {}) => {
      pairCalls += 1;
      pairSeen.push({ name, maxTokens: options.maxTokens });
      return {};
    },
  });
  assert.equal(pairCalls, pairAffordable.length, pairState.warnings.join(" | "));
  const pairLength = pairSeen.find((call) => call.name.includes("body-length"));
  const pairLengthRow = two.find((row) => row.code === "body-length");
  if (pairLengthRow.worst <= repair.strongBudget) assert.equal(pairLength.maxTokens, pairLengthRow.cap);
  const many = structuredClone(pair);
  many.description = "Ангел-хранитель слишком коротко.";
  many.faq = many.faq.map((item, index) => (index ? item : { ...item, answer: "Короткий ответ про ангела." }));
  many.seoTitle = "Ангел-хранитель: слишком длинный заголовок, который не помещается в шестьдесят символов";
  many.experts[1].thesis = "вера как";
  const six = priced(many, ["body-length", "total-length", "summoning", "description-length", "faq-length", "seoTitle-length", "expert-thesis", "story-length"]);
  assert.equal(six.length, 6, six.map((row) => `${row.code}`).join(","));
  const sixSum = six.reduce((sum, row) => sum + row.worst, 0);
  assert.ok(sixSum > repair.strongBudget);
  const sixAffordable = six.filter((row) => row.worst <= repair.strongBudget);
  assert.ok(sixAffordable.length > 0, six.map((row) => `${row.code}:${row.worst.toFixed(3)}`).join(" "));
  let sixCalls = 0;
  const sixState = { spentRub: 0, calls: [], warnings: [] };
  repairSzArticleTiered({
    brief, raw: many, build: hybridBuild,
    repair: tierRepair({ cheapTries: 0, strongModel: SZ_DEFAULT_MODEL, strongMaxTokens: 800, strongBudget: 6, maxRounds: 12 }),
    state: sixState,
    callTier: () => { sixCalls += 1; return {}; },
  });
  assert.equal(sixCalls, sixAffordable.length, sixState.warnings.join(" | "));
  const lengthOnly = structuredClone(fields);
  lengthOnly.sectionsBefore[0].paragraphs = lengthOnly.sectionsBefore[0].paragraphs.slice(0, 1);
  const openLength = priced(lengthOnly, ["body-length", "total-length"]).filter((row) => row.worst > 0);
  const budget = openLength.reduce((sum, row) => sum + row.worst, 0) + 0.05;
  const seen = [];
  const state = { spentRub: 0, calls: [], warnings: [] };
  repairSzArticleTiered({
    brief, raw: lengthOnly, build: hybridBuild,
    repair: tierRepair({
      cheapTries: 0, strongModel: SZ_DEFAULT_MODEL, strongMaxTokens: 800, strongBudget: budget, cheapBudget: 1, maxRounds: 4,
    }),
    state,
    callTier: (tier, name, messages, schema, options = {}) => {
      seen.push({ name, maxTokens: options.maxTokens });
      const first = !name.includes("retry");
      state.spentRub += 0.2;
      state.calls.push({ name, model: SZ_DEFAULT_MODEL, costRub: 0.2, finishReason: first ? "length" : "stop" });
      return null;
    },
  });
  assert.equal(seen.filter((call) => call.name.includes("retry")).length, 0, seen.map((call) => call.name).join(","));
  assert.ok(seen.length >= openLength.length, seen.map((call) => call.name).join(","));
  const lengthRow = openLength.find((row) => row.code === "body-length");
  const lengthCall = seen.find((call) => call.name.includes("body-length"));
  assert.equal(lengthCall.maxTokens, lengthRow.cap);
  const peerReserve = openLength.filter((row) => row.code !== "body-length").reduce((sum, row) => sum + row.worst, 0);
  const retryWorst = worstCaseRub(SZ_DEFAULT_MODEL, 400, retryTokenCap(lengthRow.cap));
  assert.ok(retryWorst > budget - peerReserve, `${retryWorst} should exceed the share left after ${peerReserve}`);
});

test("tiered: each banned phrase occurrence gets its own tries, including a table cell", () => {
  const phrase = "магнит для денег";
  const localBrief = { ...brief, forbiddenPhrases: [...brief.forbiddenPhrases, phrase] };
  const localCfg = ruleConfig(localBrief, pack.publishedAt, pool);
  const localBuild = (value) => {
    const { fields: normalized } = normalizeSzFields(value);
    const md = assembleSzArticle(localBrief, normalized, view.site, { date: pack.publishedAt });
    return { fields: normalized, md, problems: checkSzArticle(md, localCfg, env) };
  };
  const raw = structuredClone(fields);
  const storyText = raw.story[1];
  const sectionText = raw.sectionsBefore[2].paragraphs[0];
  const cellText = raw.tableSection.rows[0][1];
  raw.story[1] = `${storyText.slice(0, -1)} и вспомнила фразу магнит для денег.`;
  raw.sectionsBefore[2].paragraphs[0] = `${sectionText.slice(0, -1)} и отдельно звучит магнит для денег.`;
  raw.tableSection.rows[0][1] = `${cellText}: магнит для денег`;
  const tableJob = buildSzFragment(localBrief, raw, {
    code: "forbidden",
    path: "tableSection.rows[0][1]",
    field: "tableSection.rows[0][1]",
    message: `запрещённая брифом фраза «${phrase}»`,
  });
  const tablePrompt = tableJob.messages.map((message) => message.content).join("\n");
  assert.ok(tablePrompt.includes(phrase));
  assert.ok(!tablePrompt.includes(raw.story[1].slice(0, 40)));
  assert.equal(tableJob.apply(raw, { text: `${cellText} и призвать ангела` }), null);
  assert.equal(tableJob.apply(raw, { text: `${cellText}: ${phrase}` }), null);
  const tableOnly = tableJob.apply(raw, { text: cellText });
  assert.equal(tableOnly.tableSection.rows[0][1], cellText);
  assert.ok(tableOnly.story[1].includes(phrase));
  assert.ok(tableOnly.sectionsBefore[2].paragraphs[0].includes(phrase));
  const names = [];
  let storyCalls = 0;
  const repaired = repairSzArticleTiered({
    brief: localBrief, raw, build: localBuild, repair: tierRepair({ cheapTries: 2, maxRounds: 8 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name) => {
      names.push({ tier, name });
      assert.equal(isWriterId(name), true, name);
      if (name.includes("forbidden-story")) {
        storyCalls += 1;
        if (storyCalls === 1) return { text: `${raw.story[1]} Нельзя призвать ангела ради удачи.` };
        return { text: storyText };
      }
      if (name.includes("forbidden-sectionsbefore")) return { text: sectionText };
      if (name.includes("forbidden-tablesection")) return { text: cellText };
      return {};
    },
  });
  const forbidden = names.filter((call) => call.name.includes("forbidden"));
  assert.equal(storyCalls, 2, forbidden.map((call) => call.name).join(", "));
  assert.equal(forbidden.filter((call) => call.name.includes("forbidden-sectionsbefore")).length, 1, forbidden.map((call) => `${call.tier}:${call.name}`).join(", "));
  assert.equal(forbidden.filter((call) => call.name.includes("forbidden-tablesection")).length, 1, forbidden.map((call) => `${call.tier}:${call.name}`).join(", "));
  assert.ok(forbidden.every((call) => call.tier === "cheap"), forbidden.map((call) => call.tier).join(","));
  assert.equal(repaired.result.fields.story[1], storyText);
  assert.equal(repaired.result.fields.sectionsBefore[2].paragraphs[0], sectionText);
  assert.equal(repaired.result.fields.tableSection.rows[0][1], cellText);
  assert.ok(!JSON.stringify(repaired.result.fields).includes(phrase));
  assert.ok(!repaired.result.fields.story[1].includes("призвать ангела"));
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: a later duplicate paragraph is deleted without a model and every duplicate is reported", () => {
  const clean = applyDeterministicSzFixes(structuredClone(fields), { query: brief.query, links: brief.links });
  assert.deepEqual(clean.fields.story, fields.story);
  assert.deepEqual(clean.fields.sectionsBefore, fields.sectionsBefore);
  const raw = structuredClone(fields);
  const church = raw.sectionsBefore[0].paragraphs[0];
  const plain = raw.sectionsBefore[2].paragraphs[0];
  const near = plain.replace("часто", "нередко");
  assert.notEqual(near, plain);
  assert.equal(paragraphsTooClose(plain, near), true);
  raw.sectionsBefore[2].paragraphs.push(near);
  raw.sectionsBefore[2].paragraphs.push(church);
  const reported = errorsOf(hybridBuild(raw).problems).filter((problem) => problem.code === "duplicate-paragraph");
  assert.equal(reported.length, 2, reported.map((problem) => problem.message).join(" | "));
  let calls = 0;
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: () => { calls += 1; return {}; },
  });
  assert.equal(calls, 0, repaired.repairSkipped);
  assert.equal(repaired.result.fields.sectionsBefore[0].paragraphs[0], church);
  assert.equal(repaired.result.fields.sectionsBefore[2].paragraphs[0], plain);
  assert.ok(!repaired.result.fields.sectionsBefore[2].paragraphs.includes(near));
  assert.ok(!repaired.result.fields.sectionsBefore[2].paragraphs.includes(church));
  assert.ok(repaired.result.md.includes(church));
  assert.ok(repaired.result.md.includes("| Подход |"));
  assert.ok(!errorsOf(repaired.result.problems).some((problem) => problem.code === "duplicate-paragraph"));
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: a specialist FAQ keeps its role and a missing one is rewritten", () => {
  const offTopic = "Как практика принятия себя меняет день?";
  const fresh = "Когда стоит обсудить сильное переживание со специалистом, если образ не отпускает?";
  const occupied = new Set([normalize("Когда стоит обратиться к специалисту?")]);
  const raw = structuredClone(fields);
  const answer = raw.faq[4].answer;
  const others = raw.faq.slice(0, 4).map((item) => item.question);
  raw.faq[4] = { ...raw.faq[4], question: "Как отличить спокойный образ от навязчивой мысли в конце дня?" };
  assert.equal(isSpecialistQuestion(raw.faq[4].question), false);
  assert.ok(errorsOf(hybridBuild(raw).problems).some((problem) => problem.code === "faq-specialist"));
  const failure = szQuantityReport(raw, errorsOf(hybridBuild(raw).problems)).failures.find((row) => row.code === "faq-specialist");
  const job = buildSzFragment(brief, raw, { ...failure, occupiedQuestions: occupied });
  const prompt = job.messages.map((message) => message.content).join("\n");
  assert.ok(prompt.includes(brief.query), prompt);
  assert.ok(prompt.includes(brief.title));
  assert.match(prompt, /Роль этого слота/);
  assert.match(prompt, /специалист/);
  assert.equal(job.apply(raw, { question: offTopic }), null);
  assert.equal(job.apply(raw, { question: "Когда стоит обратиться к специалисту?" }), null);
  const applied = job.apply(raw, { question: fresh });
  assert.equal(applied.faq[4].question, fresh);
  assert.equal(applied.faq[4].answer, answer);
  assert.deepEqual(applied.faq.slice(0, 4).map((item) => item.question), others);
  const specialist = structuredClone(fields);
  const specialistQuestion = specialist.faq[4].question;
  assert.equal(isSpecialistQuestion(specialistQuestion), true);
  const uniqueJob = buildSzFragment(brief, specialist, {
    code: "unique",
    field: "faq",
    path: "faq[4].question",
    message: `«${specialistQuestion}» повторяет статью meditaciya-na-prinyatie-sebya`,
    occupiedQuestions: occupied,
  });
  const uniquePrompt = uniqueJob.messages.map((message) => message.content).join("\n");
  assert.ok(uniquePrompt.includes(brief.query));
  assert.ok(uniquePrompt.includes(brief.title));
  assert.match(uniquePrompt, /Роль этого слота/);
  assert.equal(uniqueJob.apply(specialist, { question: offTopic }), null);
  const rephrased = uniqueJob.apply(specialist, { question: fresh });
  assert.equal(rephrased.faq[4].question, fresh);
  assert.equal(rephrased.faq[4].answer, specialist.faq[4].answer);
  assert.deepEqual(rephrased.faq.slice(0, 4).map((item) => item.question), others);
  const seen = [];
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, unique: env.unique,
    repair: tierRepair({ cheapTries: 2, maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      seen.push(name);
      assert.equal(tier, "cheap");
      assert.equal(isWriterId(name), true, name);
      const text = messages.map((message) => message.content).join("\n");
      assert.ok(text.includes(brief.query));
      assert.match(text, /Роль этого слота/);
      return seen.length === 1 ? { question: offTopic } : { question: fresh };
    },
  });
  assert.ok(seen.some((name) => name.includes("faq-specialist")), seen.join(","));
  assert.equal(repaired.result.fields.faq[4].question, fresh);
  assert.equal(repaired.result.fields.faq[4].answer, answer);
  assert.deepEqual(repaired.result.fields.faq.slice(0, 4).map((item) => item.question), others);
  assert.ok(!errorsOf(repaired.result.problems).some((problem) => problem.code === "faq-specialist"), repaired.repairSkipped);
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: a description does not open with a lowercase quoted query", () => {
  let rest = "остаётся тихим образом рядом с человеком и помогает сделать спокойную паузу без обещания чуда.";
  const pad = " Тишина короткая.";
  let desc = `«${brief.query}» ${rest}`;
  while ([...desc].length < 140) {
    rest += pad;
    desc = `«${brief.query}» ${rest}`;
  }
  assert.ok([...desc].length >= 140 && [...desc].length <= 160, [...desc].length);
  const raw = structuredClone(fields);
  raw.description = desc;
  const codes = errorsOf(hybridBuild(raw).problems).map((problem) => problem.code);
  assert.ok(codes.includes("description-start"), codes.join(","));
  const fixed = applyDeterministicSzFixes(raw, { query: brief.query });
  assert.equal(fixed.fields.description, `Ангел-хранитель ${rest}`);
  assert.equal(fixed.fields.description.startsWith("«"), false);
  assert.ok(normalize(fixed.fields.description).includes(normalize(brief.query)));
  assert.ok(!errorsOf(hybridBuild(fixed.fields).problems).some((problem) => problem.code === "description-start" || problem.code === "description-length"));
  const job = buildSzFragment(brief, fields, { code: "description-length", field: "description", path: "description", message: "description 100 символов, нужно 140–160" });
  assert.match(job.messages.map((message) => message.content).join("\n"), /кавычк/);
  assert.equal(job.apply(fields, { description: desc }), null);
  assert.equal(job.apply(fields, { description: fields.description }).description, fields.description);
  assert.equal(errorsOf(checkSzArticle(assembled, cfg, env)).some((problem) => problem.code === "description-start"), false);
});

test("brief: additional queries pass through, with secondaryKeywords as an alias", () => {
  assert.deepEqual(brief.additionalQueries, []);
  assert.deepEqual(cfg.additionalQueries, []);
  const raw = structuredClone(rawPack);
  raw.articles[0].additionalQueries = ["сильная аффирмация", "  "];
  const parsed = normalizePack(raw, { baseDir: fixtures, pool });
  assert.deepEqual(parsed.articles[0].additionalQueries, ["сильная аффирмация"]);
  assert.deepEqual(ruleConfig(parsed.articles[0], pack.publishedAt, pool).additionalQueries, ["сильная аффирмация"]);
  const alias = structuredClone(rawPack);
  alias.articles[0].secondaryKeywords = ["утреннее намерение"];
  assert.deepEqual(normalizePack(alias, { baseDir: fixtures, pool }).articles[0].additionalQueries, ["утреннее намерение"]);
  const messages = buildSzMessages(parsed.articles[0], view.site);
  assert.match(messages.map((message) => message.content).join("\n"), /сильная аффирмация/);
});

test("tiered: a generic anchor is rewritten inside the sentence", () => {
  const raw = structuredClone(fields);
  const original = raw.sectionsBefore[2].paragraphs[2];
  raw.sectionsBefore[2].paragraphs[2] = original.replace("[Эзотерика и психология]", "[материал]").replace("[Ченнелинг в эзотерике]", "[здесь]");
  const codes = errorsOf(hybridBuild(raw).problems).filter((problem) => problem.code === "links-anchor");
  assert.equal(codes.length, 2, codes.map((problem) => problem.message).join(" | "));
  let calls = 0;
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      calls += 1;
      assert.equal(isWriterId(name), true, name);
      const text = messages.map((message) => message.content).join("\n");
      const host = text.split("АБЗАЦ:\n").at(-1).trim();
      return { text: host.replace("[материал]", "[Эзотерика и психология]").replace("[здесь]", "[Ченнелинг в эзотерике]") };
    },
  });
  assert.equal(calls, 1, repaired.repairSkipped);
  assert.equal(repaired.result.fields.sectionsBefore[2].paragraphs[2], original);
  const keptSentence = original.split(/(?<=[.!?…])\s+/u)[0];
  assert.equal(repaired.result.fields.sectionsBefore[2].paragraphs[2].split(/(?<=[.!?…])\s+/u)[0], keptSentence);
  assert.ok(!errorsOf(repaired.result.problems).some((problem) => problem.code === "links-anchor"));
  assert.equal(repaired.passed, true, repaired.repairSkipped);
  const anchorJob = buildSzFragment(brief, raw, codes[0]);
  const dropped = "Подробнее о границах использования образов читайте в статье [Эзотерика и психология](/s/psihologiya-i-ezoterika) и в материале [Ченнелинг в эзотерике](/s/chenneling-v-ezoterike).";
  assert.equal(anchorJob.apply(raw, { text: dropped }), null);
  assert.equal(raw.sectionsBefore[2].paragraphs[2].split(/(?<=[.!?…])\s+/u)[0], keptSentence);
});

test("tiered: a generic anchor inside the angel story moves out and keeps the quotation", () => {
  const opening = fields.story[0];
  const prayer = fields.sectionsBefore[0].paragraphs[1];
  const raw = structuredClone(fields);
  raw.story[0] = `${opening} Подробнее: [материал](/s/ezoterika-i-tserkov).`;
  const anchorErrors = errorsOf(hybridBuild(raw).problems).filter((problem) => problem.code === "links-anchor");
  assert.equal(anchorErrors.length, 1, anchorErrors.map((problem) => problem.message).join(" | "));
  const job = buildSzFragment(brief, raw, anchorErrors[0]);
  const prompt = job.messages.map((message) => message.content).join("\n");
  assert.equal(job.key.includes("story"), false, job.key);
  assert.match(job.key, /sectionsBefore\[0\]\.paragraphs\[\d+\]/);
  assert.equal(prompt.includes(opening.slice(0, 40)), false);
  assert.equal(prompt.includes("Ангеле Божий"), false);
  assert.match(prompt, /АБЗАЦ:\nЗдесь просят сохранить жизнь/);
  const bridge = "Образ остаётся тихой опорой рядом с человеком и не решает трудный разговор за него.";
  let swap = "Границу церковного взгляда и современных практик спокойно разбирает статья [Эзотерика и церковь](/s/ezoterika-i-tserkov).";
  while (words(swap) < 90) swap = `${swap} ${bridge}`;
  const swapped = job.apply(raw, { text: swap });
  assert.ok(swapped, "ответ без цитаты не должен отменяться: ссылка уходит в обычный абзац");
  assert.equal(swapped.story[0], opening);
  assert.equal(swapped.story[1], fields.story[1]);
  assert.equal(swapped.story[2], fields.story[2]);
  assert.equal(swapped.sectionsBefore[0].paragraphs[0], fields.sectionsBefore[0].paragraphs[0]);
  assert.equal(swapped.sectionsBefore[0].paragraphs[1], prayer);
  assert.notEqual(swapped.story[0], swap);
  assert.equal(swapped.sectionsBefore[0].paragraphs[4], swap);
  const gated = hybridBuild(swapped);
  assert.ok(gated.md.includes(opening.slice(0, 80)));
  assert.equal(gated.fields.story[0], opening);
  assert.equal(errorsOf(gated.problems).some((problem) => problem.code === "links-anchor"), false);
  let calls = 0;
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      calls += 1;
      assert.equal(tier, "cheap");
      assert.equal(isWriterId(name), true, name);
      const text = messages.map((message) => message.content).join("\n");
      assert.equal(text.includes(opening.slice(0, 40)), false);
      assert.equal(text.includes("Ангеле Божий"), false);
      const host = text.split("АБЗАЦ:\n").at(-1).trim();
      assert.match(host, /^Здесь просят сохранить жизнь/);
      const link = "[Эзотерика и церковь](/s/ezoterika-i-tserkov)";
      const woven = host.includes(".") ? host.replace(/\.\s*/, ` в статье ${link}. `) : `В статье ${link} сказано то же самое. ${host}`;
      return { text: woven };
    },
  });
  assert.equal(calls, 1, repaired.repairSkipped);
  assert.equal(repaired.result.fields.story[0], opening);
  assert.equal(repaired.result.fields.story[1], fields.story[1]);
  assert.equal(repaired.result.fields.story[2], fields.story[2]);
  assert.equal(repaired.result.fields.sectionsBefore[0].paragraphs[0], fields.sectionsBefore[0].paragraphs[0]);
  assert.equal(repaired.result.fields.sectionsBefore[0].paragraphs[1], prayer);
  assert.ok(repaired.result.fields.sectionsBefore[0].paragraphs[4].includes("[Эзотерика и церковь](/s/ezoterika-i-tserkov)"));
  assert.ok(repaired.result.md.includes(opening.slice(0, 80)));
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: a generic anchor inside the angel prayer moves out and keeps the quotation", () => {
  const opening = fields.story[0];
  const prayer = fields.sectionsBefore[0].paragraphs[1];
  const glue = (slug) => ` Подробнее: [материал](/s/${slug}).`;
  const raw = structuredClone(fields);
  raw.sectionsBefore[0].paragraphs[1] = `${prayer}${glue("ezoterika-i-tserkov")}`;
  const anchorErrors = errorsOf(hybridBuild(raw).problems).filter((problem) => problem.code === "links-anchor");
  assert.equal(anchorErrors.length, 1, anchorErrors.map((problem) => problem.message).join(" | "));
  const job = buildSzFragment(brief, raw, anchorErrors[0]);
  const prompt = job.messages.map((message) => message.content).join("\n");
  assert.equal(prompt.includes("Ангеле Божий"), false);
  assert.equal(prompt.includes(opening.slice(0, 40)), false);
  assert.match(job.key, /sectionsBefore\[0\]\.paragraphs\[\d+\]/);
  assert.equal(job.key.includes("paragraphs[1]"), false, job.key);
  const bridge = "Образ остаётся тихой опорой рядом с человеком и не решает трудный разговор за него.";
  let swap = "Границу церковного взгляда и современных практик спокойно разбирает статья [Эзотерика и церковь](/s/ezoterika-i-tserkov).";
  while (words(swap) < 90) swap = `${swap} ${bridge}`;
  const swapped = job.apply(raw, { text: swap });
  assert.ok(swapped, "молитва не должна заменяться абзацем без цитаты");
  assert.equal(swapped.sectionsBefore[0].paragraphs[1], prayer);
  assert.equal(swapped.story[0], opening);
  assert.notEqual(swapped.sectionsBefore[0].paragraphs[1], swap);
  assert.equal(swapped.sectionsBefore[0].paragraphs[4], swap);
  const gated = hybridBuild(swapped);
  assert.ok(gated.md.includes("Ангеле Божий, хранителю мой святый"));
  assert.equal(gated.fields.sectionsBefore[0].paragraphs[1], prayer);
  assert.equal(errorsOf(gated.problems).some((problem) => problem.code === "links-anchor"), false);
  const inline = structuredClone(fields);
  const token = "[материал](/s/chenneling-v-ezoterike)";
  inline.sectionsBefore[0].paragraphs[1] = prayer.replace("Аминь.»", `${token}Аминь.»`);
  const inlineErrors = errorsOf(hybridBuild(inline).problems).filter((problem) => problem.code === "links-anchor");
  assert.equal(inlineErrors.length, 1);
  const inlineJob = buildSzFragment(brief, inline, inlineErrors[0]);
  const inlinePrompt = inlineJob.messages.map((message) => message.content).join("\n");
  assert.equal(inlinePrompt.includes("Ангеле Божий"), false);
  let calls = 0;
  const repaired = repairSzArticleTiered({
    brief, raw: inline, build: hybridBuild, repair: tierRepair({ maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      calls += 1;
      assert.equal(tier, "cheap");
      assert.equal(isWriterId(name), true, name);
      const text = messages.map((message) => message.content).join("\n");
      assert.equal(text.includes("Ангеле Божий"), false);
      const host = text.split("АБЗАЦ:\n").at(-1).trim();
      const link = "[Ченнелинг в эзотерике](/s/chenneling-v-ezoterike)";
      const woven = host.includes(".") ? host.replace(/\.\s*/, ` в статье ${link}. `) : `В статье ${link} сказано то же самое. ${host}`;
      return { text: woven };
    },
  });
  assert.equal(calls, 1, repaired.repairSkipped);
  assert.equal(repaired.result.fields.sectionsBefore[0].paragraphs[1], prayer);
  assert.equal(repaired.result.fields.story[0], opening);
  assert.equal(repaired.result.fields.sectionsBefore[0].paragraphs[0], fields.sectionsBefore[0].paragraphs[0]);
  assert.ok(repaired.result.fields.sectionsBefore[0].paragraphs[4].includes("[Ченнелинг в эзотерике](/s/chenneling-v-ezoterike)"));
  assert.ok(repaired.result.md.includes("«Ангеле Божий, хранителю мой святый"));
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: every glued link suffix leaves the story and the prayer, and residue fails the gate", () => {
  const opening = fields.story[0];
  const prayer = fields.sectionsBefore[0].paragraphs[1];
  assert.equal(errorsOf(checkSzArticle(assembled, cfg, env)).some((problem) => problem.code === "links-residue"), false);
  assert.equal(linkLeadResidue("Подробнее о границах в статье [Эзотерика и церковь](/s/ezoterika-i-tserkov).").length, 0);
  assert.equal(linkLeadResidue("Подробнее: [Эзотерика и церковь](/s/ezoterika-i-tserkov).").length, 0);
  assert.equal(linkLeadResidue("Прочитайте также: [Эзотерика и церковь](/s/ezoterika-i-tserkov).").length, 0);
  assert.equal(linkLeadResidue("Дочитайте также: [материал](/s/ezoterika-i-tserkov).").length, 0);
  for (const sample of ["Подробнее: .", "Подробнее:", "Читайте также: .", "Читайте также:", "Прочитайте также: .", "См. также: .", "Узнать больше:", "[]().", "Мысль обрывается: .", "Цитата оборвалась:»", "направи. Подробнее: .»"]) {
    const codes = errorsOf(checkSzArticle(firstPara(assembled, sample), cfg, env)).map((problem) => problem.code);
    assert.ok(codes.includes("links-residue"), `${sample}: ${codes.join(",")}`);
  }
  const glue = (lead, slug, anchor = "материал") => ` ${lead}: [${anchor}](/s/${slug}).`;
  const titles = { "ezoterika-i-tserkov": "Эзотерика и церковь", "psihologiya-i-ezoterika": "Эзотерика и психология", "chenneling-v-ezoterike": "Ченнелинг в эзотерике" };
  const weave = (messages) => {
    const text = messages.map((message) => message.content).join("\n");
    assert.equal(text.includes(opening.slice(0, 40)), false);
    assert.equal(text.includes("Ангеле Божий"), false);
    const slug = text.match(/ссылку на \/s\/([a-z0-9-]+)/)?.[1];
    const host = text.split("АБЗАЦ:\n").at(-1).trim();
    const link = `[${titles[slug]}](/s/${slug})`;
    return { text: host.includes(".") ? host.replace(/\.\s*/, ` в статье ${link}. `) : `В статье ${link} сказано то же самое. ${host}` };
  };
  const repair = (raw) => {
    let calls = 0;
    const repaired = repairSzArticleTiered({
      brief, raw, build: hybridBuild, repair: tierRepair({ maxRounds: 6 }),
      state: { spentRub: 0, calls: [], warnings: [] },
      callTier: (tier, name, messages) => {
        calls += 1;
        assert.equal(tier, "cheap");
        assert.equal(isWriterId(name), true, name);
        return weave(messages);
      },
    });
    return { calls, repaired };
  };
  const two = structuredClone(fields);
  two.story[0] = `${opening}${glue("Подробнее", "ezoterika-i-tserkov")}${glue("Подробнее", "psihologiya-i-ezoterika")}`;
  const twoJob = buildSzFragment(brief, two, errorsOf(hybridBuild(two).problems).find((problem) => problem.code === "links-anchor"));
  assert.equal(twoJob.messages.map((message) => message.content).join("\n").includes(opening.slice(0, 40)), false);
  const bridge = "Образ остаётся тихой опорой рядом с человеком и не решает трудный разговор за него.";
  let swap = "Границу церковного взгляда и современных практик спокойно разбирает статья [Эзотерика и церковь](/s/ezoterika-i-tserkov).";
  while (words(swap) < 90) swap = `${swap} ${bridge}`;
  const swapped = twoJob.apply(two, { text: swap });
  assert.ok(swapped, "две склейки не должны оставлять «Подробнее: .»");
  assert.equal(swapped.story[0], opening);
  assert.equal(swapped.story[0].includes("Подробнее:"), false);
  const twoFixed = repair(two);
  assert.equal(twoFixed.calls, 1, twoFixed.repaired.repairSkipped);
  assert.equal(twoFixed.repaired.result.fields.story[0], opening);
  assert.equal(twoFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1], prayer);
  assert.equal(twoFixed.repaired.passed, true, twoFixed.repaired.repairSkipped);
  const twice = structuredClone(fields);
  twice.story[0] = `${opening}${glue("Подробнее", "ezoterika-i-tserkov")}${glue("Подробнее", "ezoterika-i-tserkov")}`;
  const sameSlug = repair(twice);
  assert.equal(sameSlug.repaired.result.fields.story[0], opening);
  assert.equal(sameSlug.repaired.passed, true, sameSlug.repaired.repairSkipped);
  const three = structuredClone(fields);
  three.story[0] = `${opening}${glue("Подробнее", "ezoterika-i-tserkov")}${glue("Читайте также", "psihologiya-i-ezoterika", "здесь")}${glue("Подробнее", "chenneling-v-ezoterike")}`;
  const threeFixed = repair(three);
  assert.equal(threeFixed.calls, 1, threeFixed.repaired.repairSkipped);
  assert.equal(threeFixed.repaired.result.fields.story[0], opening);
  assert.equal(threeFixed.repaired.result.fields.story[1], fields.story[1]);
  assert.equal(threeFixed.repaired.result.fields.story[2], fields.story[2]);
  assert.equal(threeFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1], prayer);
  assert.equal(threeFixed.repaired.passed, true, threeFixed.repaired.repairSkipped);
  const inside = structuredClone(fields);
  inside.sectionsBefore[0].paragraphs[1] = `${prayer.slice(0, -1)}${glue("Подробнее", "ezoterika-i-tserkov")}${glue("Читайте также", "psihologiya-i-ezoterika")}${prayer.slice(-1)}`;
  const insideFixed = repair(inside);
  assert.equal(insideFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1], prayer);
  assert.equal(insideFixed.repaired.result.fields.story[0], opening);
  assert.equal(insideFixed.repaired.result.md.includes("Подробнее: ."), false);
  assert.equal(insideFixed.repaired.passed, true, insideFixed.repaired.repairSkipped);
  const shaped = structuredClone(fields);
  shaped.sectionsBefore[0].paragraphs[1] = prayer.replace(" Аминь.»", " Подробнее: [материал](/s/ezoterika-i-tserkov).»");
  const shapedFixed = repair(shaped);
  assert.equal(shapedFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1], prayer.replace(" Аминь.»", "»"));
  assert.equal(shapedFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1].includes("Подробнее"), false);
  assert.ok(shapedFixed.repaired.result.md.includes("направи.»"));
  assert.equal(shapedFixed.repaired.result.md.includes("Подробнее: ."), false);
  assert.equal(shapedFixed.repaired.passed, true, shapedFixed.repaired.repairSkipped);
  const mixed = structuredClone(fields);
  mixed.story[0] = `${opening}${glue("Подробнее", "ezoterika-i-tserkov")}${glue("Подробнее", "psihologiya-i-ezoterika")}`;
  mixed.sectionsBefore[0].paragraphs[1] = `${prayer.slice(0, -1)}${glue("Читайте также", "chenneling-v-ezoterike")}${prayer.slice(-1)}`;
  const mixedFixed = repair(mixed);
  assert.equal(mixedFixed.calls, 2, mixedFixed.repaired.repairSkipped);
  assert.equal(mixedFixed.repaired.result.fields.story[0], opening);
  assert.equal(mixedFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1], prayer);
  assert.equal(mixedFixed.repaired.result.fields.sectionsBefore[0].paragraphs[0], fields.sectionsBefore[0].paragraphs[0]);
  assert.equal(mixedFixed.repaired.result.md.includes("Подробнее: ."), false);
  assert.equal(mixedFixed.repaired.passed, true, mixedFixed.repaired.repairSkipped);
});

test("tiered: a glued link in the middle of the story or the prayer comes out without a double space", () => {
  const opening = fields.story[0];
  const prayer = fields.sectionsBefore[0].paragraphs[1];
  const tail = "Брат всё ещё ждал этого звонка.";
  const titles = { "ezoterika-i-tserkov": "Эзотерика и церковь", "psihologiya-i-ezoterika": "Эзотерика и психология", "chenneling-v-ezoterike": "Ченнелинг в эзотерике" };
  const repair = (raw) => {
    let calls = 0;
    const repaired = repairSzArticleTiered({
      brief, raw, build: hybridBuild, repair: tierRepair({ maxRounds: 6 }),
      state: { spentRub: 0, calls: [], warnings: [] },
      callTier: (tier, name, messages) => {
        calls += 1;
        assert.equal(tier, "cheap");
        assert.equal(isWriterId(name), true, name);
        const text = messages.map((message) => message.content).join("\n");
        assert.equal(text.includes(opening.slice(0, 40)), false);
        assert.equal(text.includes("Ангеле Божий"), false);
        const slug = text.match(/ссылку на \/s\/([a-z0-9-]+)/)?.[1];
        const host = text.split("АБЗАЦ:\n").at(-1).trim();
        assert.equal(host.includes("Подробнее: ["), false);
        const link = `[${titles[slug]}](/s/${slug})`;
        return { text: host.includes(".") ? host.replace(/\.\s*/, ` в статье ${link}. `) : `В статье ${link} сказано то же самое. ${host}` };
      },
    });
    return { calls, repaired };
  };
  const storyMid = structuredClone(fields);
  storyMid.story[0] = `${opening} Подробнее: [материал](/s/ezoterika-i-tserkov). Читайте также: [здесь](/s/psihologiya-i-ezoterika). ${tail}`;
  const storyJob = buildSzFragment(brief, storyMid, errorsOf(hybridBuild(storyMid).problems).find((problem) => problem.code === "links-anchor"));
  const bridge = "Образ остаётся тихой опорой рядом с человеком и не решает трудный разговор за него.";
  let swap = "Границу церковного взгляда и современных практик спокойно разбирает статья [Эзотерика и церковь](/s/ezoterika-i-tserkov).";
  while (words(swap) < 90) swap = `${swap} ${bridge}`;
  const swapped = storyJob.apply(storyMid, { text: swap });
  assert.ok(swapped, "склейка в середине истории не должна отменять правку");
  assert.equal(swapped.story[0], `${opening} ${tail}`);
  assert.equal(swapped.story[0].includes("  "), false);
  assert.equal(swapped.story[0].endsWith(tail), true);
  assert.equal(swapped.story[0].includes(opening), true);
  const storyFixed = repair(storyMid);
  assert.equal(storyFixed.calls, 1, storyFixed.repaired.repairSkipped);
  assert.equal(storyFixed.repaired.result.fields.story[0], `${opening} ${tail}`);
  assert.equal(storyFixed.repaired.result.fields.story[1], fields.story[1]);
  assert.equal(storyFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1], prayer);
  assert.equal(storyFixed.repaired.result.md.includes("Подробнее: ."), false);
  assert.equal(storyFixed.repaired.passed, true, storyFixed.repaired.repairSkipped);
  const prayerMid = structuredClone(fields);
  prayerMid.sectionsBefore[0].paragraphs[1] = prayer.replace(" Аминь.»", " Подробнее: [материал](/s/ezoterika-i-tserkov). Аминь.»");
  const prayerFixed = repair(prayerMid);
  assert.equal(prayerFixed.calls, 1, prayerFixed.repaired.repairSkipped);
  assert.equal(prayerFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1], prayer);
  assert.equal(prayerFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1].includes("  "), false);
  assert.equal(prayerFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1].includes("направи. Аминь.»"), true);
  assert.equal(prayerFixed.repaired.result.fields.story[0], opening);
  assert.equal(prayerFixed.repaired.passed, true, prayerFixed.repaired.repairSkipped);
  const both = structuredClone(fields);
  const middle = "Середина абзаца держит свою точку.";
  both.story[0] = `${opening} Подробнее: [материал](/s/ezoterika-i-tserkov). ${middle} Читайте также: [здесь](/s/psihologiya-i-ezoterika). Подробности: [материал](/s/chenneling-v-ezoterike).`;
  const bothFixed = repair(both);
  assert.equal(bothFixed.calls, 1, bothFixed.repaired.repairSkipped);
  assert.equal(bothFixed.repaired.result.fields.story[0], `${opening} ${middle}`);
  assert.equal(bothFixed.repaired.result.fields.story[0].includes("  "), false);
  assert.equal(bothFixed.repaired.result.fields.story[0].endsWith("."), true);
  assert.equal(bothFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1], prayer);
  assert.equal(bothFixed.repaired.passed, true, bothFixed.repaired.repairSkipped);
});

test("tiered: a lead is a whole word, and a cut prefix fails the gate", () => {
  const opening = fields.story[0];
  const prayer = fields.sectionsBefore[0].paragraphs[1];
  const tail = "Брат всё ещё ждал этого звонка.";
  assert.equal(opening.endsWith("приезжать."), true);
  assert.deepEqual(leadWordFragments(opening), []);
  assert.deepEqual(leadWordFragments("сказал про брата и замолчал."), []);
  assert.deepEqual(leadWordFragments(`${opening} Про ${tail}`), ["Про"]);
  const titles = { "ezoterika-i-tserkov": "Эзотерика и церковь", "psihologiya-i-ezoterika": "Эзотерика и психология", "chenneling-v-ezoterike": "Ченнелинг в эзотерике" };
  const repair = (raw) => {
    let calls = 0;
    const repaired = repairSzArticleTiered({
      brief, raw, build: hybridBuild, repair: tierRepair({ maxRounds: 6 }),
      state: { spentRub: 0, calls: [], warnings: [] },
      callTier: (tier, name, messages) => {
        calls += 1;
        assert.equal(tier === "cheap" || tier === "strong", true, tier);
        assert.equal(isWriterId(name), true, name);
        const text = messages.map((message) => message.content).join("\n");
        assert.equal(text.includes(opening.slice(0, 40)), false);
        assert.equal(text.includes("Ангеле Божий"), false);
        const slug = text.match(/ссылку на \/s\/([a-z0-9-]+)/)?.[1];
        const host = text.split("АБЗАЦ:\n").at(-1).trim();
        const link = `[${titles[slug]}](/s/${slug})`;
        return { text: host.includes(".") ? host.replace(/\.\s*/, ` в статье ${link}. `) : `В статье ${link} сказано то же самое. ${host}` };
      },
    });
    return { calls, repaired };
  };
  const whole = `${opening} Прочитайте также: [материал](/s/ezoterika-i-tserkov). ${tail}`;
  const cut = `${opening} Про ${tail}`;
  assert.equal(protectedRemovalOk(whole, `${opening} ${tail}`), true);
  assert.equal(protectedRemovalOk(whole, cut), false);
  assert.equal(protectedRemovalOk(opening.replace("начать", "начПодробнее: [ссылка](/s/ezoterika-i-tserkov).ать"), opening), false);
  const story = structuredClone(fields);
  story.story[0] = whole;
  const storyFixed = repair(story);
  assert.equal(storyFixed.calls, 1, storyFixed.repaired.repairSkipped);
  assert.equal(storyFixed.repaired.result.fields.story[0], `${opening} ${tail}`);
  assert.equal(storyFixed.repaired.result.fields.story[0].includes("Про "), false);
  assert.equal(storyFixed.repaired.result.fields.story[0].includes("  "), false);
  assert.equal(storyFixed.repaired.result.fields.story[1], fields.story[1]);
  assert.equal(storyFixed.repaired.result.fields.sectionsBefore[0].paragraphs[1], prayer);
  assert.equal(storyFixed.repaired.passed, true, storyFixed.repaired.repairSkipped);
  for (const lead of ["прочитайте также", "См. также", "Узнать больше"]) {
    const raw = structuredClone(fields);
    raw.story[0] = `${opening} ${lead}: [материал](/s/ezoterika-i-tserkov). ${tail}`;
    const fixed = repair(raw);
    assert.equal(fixed.repaired.result.fields.story[0], `${opening} ${tail}`, lead);
    assert.equal(fixed.repaired.result.fields.story[0].includes("  "), false, lead);
    assert.equal(fixed.repaired.passed, true, fixed.repaired.repairSkipped);
  }
  for (const lead of ["Дочитайте также", "Перечитайте также", "Вычитайте также", "Неподробнее"]) {
    const raw = structuredClone(fields);
    raw.story[0] = `${opening} ${lead}: [материал](/s/ezoterika-i-tserkov). ${tail}`;
    const fixed = repair(raw);
    assert.equal(fixed.repaired.passed, false, lead);
    assert.equal(fixed.repaired.result.fields.story[0], raw.story[0], lead);
    assert.equal(fixed.repaired.result.fields.story[0].includes(lead), true, lead);
    assert.equal(/\sПро\s/u.test(fixed.repaired.result.fields.story[0]), false, lead);
    assert.equal(fixed.repaired.result.md.includes("Про Брат"), false, lead);
  }
  const insideWord = structuredClone(fields);
  insideWord.story[0] = opening.replace("начать", "начПодробнее: [ссылка](/s/ezoterika-i-tserkov).ать");
  const insideFixed = repair(insideWord);
  assert.equal(insideFixed.repaired.passed, false);
  assert.equal(insideFixed.repaired.result.fields.story[0], insideWord.story[0]);
  assert.equal(insideFixed.repaired.result.fields.story[0].includes("начать"), false);
  assert.equal(insideFixed.repaired.result.fields.story[0].includes("начПодробнее:"), true);
  assert.equal(insideFixed.repaired.result.fields.story[0].includes("ать"), true);
  for (const fragment of ["Про", "Под", "Чит", "Смо"]) {
    const raw = structuredClone(fields);
    raw.story[0] = `${opening} ${fragment} ${tail}`;
    const codes = errorsOf(hybridBuild(raw).problems).map((problem) => problem.code);
    assert.ok(codes.includes("links-fragment"), `${fragment}: ${codes.join(",")}`);
    assert.equal(raw.story[0].includes(fragment), true);
  }
  const prayerCut = structuredClone(fields);
  prayerCut.sectionsBefore[0].paragraphs[1] = prayer.replace(" Аминь.»", " Про.»");
  const prayerCodes = errorsOf(hybridBuild(prayerCut).problems).map((problem) => problem.code);
  assert.ok(prayerCodes.includes("links-fragment"), prayerCodes.join(","));
  assert.equal(errorsOf(checkSzArticle(assembled, cfg, env)).some((problem) => problem.code === "links-fragment"), false);
});

test("tiered: a later section that retells the story is rewritten forward", () => {
  const story = [...fields.story, fields.transition].join("\n\n");
  for (const section of fields.sectionsBefore) {
    assert.equal(sectionRetellsStory(story, section.paragraphs.join("\n\n")), false, section.title);
  }
  const raw = structuredClone(fields);
  const plot = [...raw.story, raw.transition].join(" ").replace(/[«»"“”„]/g, "");
  let paraphrase = plot.split(/\s+/).slice(0, 130).join(" ");
  const tail = "Дальше сцена повторяется почти теми же подробностями и тем же ходом.";
  while (words(paraphrase) < 160) paraphrase = `${paraphrase} ${tail}`;
  paraphrase = `${paraphrase}.`;
  for (const paragraph of raw.story) assert.equal(paragraphsTooClose(paragraph, paraphrase), false);
  assert.equal(sectionRetellsStory(story, paraphrase), true);
  const quote = "«Короткая фраза остаётся со мной до вечера и не требует чуда.»";
  const kept = raw.sectionsBefore[2].paragraphs[2];
  raw.sectionsBefore[2].paragraphs = [paraphrase, quote, kept];
  assert.ok(errorsOf(hybridBuild(raw).problems).some((problem) => problem.code === "story-retell"));
  const filler = "Назовите одно чувство своими словами и выберите короткую фразу, которую готовы повторить спокойно. Сделайте паузу и запишите эту фразу. Затем произнесите её ещё раз, когда дыхание выровняется.";
  const pad = (target) => {
    let out = filler;
    while (words(out) < target) out = `${out} ${filler}`;
    return out;
  };
  assert.equal(sectionRetellsStory(story, `${pad(40)}\n\n${quote}\n\n${kept}`), false);
  let calls = 0;
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ maxRounds: 6 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      calls += 1;
      assert.equal(tier, "cheap");
      assert.equal(isWriterId(name), true, name);
      const text = messages.map((message) => message.content).join("\n");
      assert.ok(!text.includes(fields.sectionsBefore[0].title), "чужой раздел в промпте");
      assert.ok(!text.includes(fields.faq[0].question), "чужой вопрос в промпте");
      const parts = text.split(/АБЗАЦ \d+:\n/).slice(1).map((part) => part.trim());
      assert.ok(parts.length >= 1);
      return { paragraphs: parts.map((part) => (part.includes("](/s/") ? part : pad(Math.max(40, words(part))))) };
    },
  });
  assert.equal(calls, 1, repaired.repairSkipped);
  assert.deepEqual(repaired.result.fields.story, fields.story);
  assert.equal(repaired.result.fields.transition, fields.transition);
  assert.equal(repaired.result.fields.sectionsBefore[2].paragraphs[1], quote);
  assert.equal(repaired.result.fields.sectionsBefore[2].paragraphs[2], kept);
  assert.ok(!repaired.result.fields.sectionsBefore[2].paragraphs[0].includes("позвонить"));
  assert.equal(sectionRetellsStory(story, repaired.result.fields.sectionsBefore[2].paragraphs.join("\n\n")), false);
  assert.ok(!errorsOf(repaired.result.problems).some((problem) => problem.code === "story-retell"));
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: every additional query is woven in, and a miss does not spend the others", () => {
  const phrases = ["денежная формула", "сильная аффирмация", "слова которым веришь", "утреннее намерение"];
  const localBrief = { ...brief, additionalQueries: phrases };
  const localCfg = ruleConfig(localBrief, pack.publishedAt, pool);
  const localBuild = (value) => {
    const { fields: normalized } = normalizeSzFields(value);
    const md = assembleSzArticle(localBrief, normalized, view.site, { date: pack.publishedAt });
    return { fields: normalized, md, problems: checkSzArticle(md, localCfg, env) };
  };
  const raw = structuredClone(fields);
  const missing = errorsOf(localBuild(raw).problems).filter((problem) => problem.code === "extra-query");
  assert.equal(missing.length, phrases.length, missing.map((problem) => problem.message).join(" | "));
  let calls = 0;
  const seen = [];
  const repaired = repairSzArticleTiered({
    brief: localBrief, raw, build: localBuild, repair: tierRepair({ maxRounds: 12 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      calls += 1;
      assert.equal(isWriterId(name), true, name);
      const text = messages.map((message) => message.content).join("\n");
      const phrase = text.match(/Дополнительный запрос «([^»]+)»/)?.[1];
      const host = text.split("АБЗАЦ:\n").at(-1).trim();
      seen.push(phrase);
      assert.ok(!text.includes(fields.faq[0].question));
      if (calls === 1) return { text: host };
      const woven = host.includes(".") ? host.replace(/\.\s*/, `, и здесь уместна формулировка ${phrase}. `) : `Формулировка ${phrase} стоит в начале мысли. ${host}`;
      return { text: woven };
    },
  });
  assert.equal(calls, phrases.length + 1, seen.join(" | "));
  assert.equal(seen[0], seen[1], "отклонённый запрос повторён, а не заменён другим");
  assert.equal(new Set(seen).size, phrases.length);
  const body = repaired.result.md.replace(/^---\n[\s\S]*?\n---\n/, "");
  for (const phrase of phrases) assert.ok(normalize(body).includes(normalize(phrase)), phrase);
  assert.ok(!errorsOf(repaired.result.problems).some((problem) => problem.code === "extra-query"), repaired.repairSkipped);
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: an open FAQ question is not answered with yes or no", () => {
  assert.equal(faqAnswerTypeMismatch(fields.faq[1].question, fields.faq[1].answer), false);
  assert.equal(faqAnswerTypeMismatch(fields.faq[4].question, fields.faq[4].answer), false);
  assert.equal(faqAnswerTypeMismatch("Как понять, что слова свои?", "Да, слова уже свои и этого достаточно для практики."), true);
  const raw = structuredClone(fields);
  const question = raw.faq[2].question;
  let bad = "Да, это авторская практика внимания, а молитва остаётся обращением в церковной традиции и не смешивается с ней.";
  while (words(bad) < 40) bad += " Обе формы дают паузу, но смысл у них разный.";
  assert.ok(words(bad) <= 80, words(bad));
  assert.equal(faqAnswerTypeMismatch(question, bad), true);
  raw.faq[2] = { ...raw.faq[2], answer: bad };
  let good = "Медитация остаётся авторской практикой внимания: дыхание, образ тёплого света и ощущение заботы. Молитва – обращение в церковной традиции, словами молитвослова или своими. Смысл у этих форм разный, поэтому их не смешивают в одном правиле. Вопрос был о различии, и ответ держится этого различия.";
  while (words(good) < 40) good += " Различие остаётся.";
  assert.ok(words(good) >= 40 && words(good) <= 80, words(good));
  assert.equal(faqAnswerTypeMismatch(question, good), false);
  const others = raw.faq.map((item, index) => (index === 2 ? item.question : item.answer));
  let calls = 0;
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair({ maxRounds: 4 }),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: (tier, name, messages) => {
      calls += 1;
      assert.equal(isWriterId(name), true, name);
      const text = messages.map((message) => message.content).join("\n");
      assert.ok(text.includes(question));
      assert.ok(!text.includes(fields.sectionsBefore[0].title));
      return calls === 1 ? { answer: bad } : { answer: good };
    },
  });
  assert.equal(calls, 2, repaired.repairSkipped);
  assert.equal(repaired.result.fields.faq[2].question, question);
  assert.equal(repaired.result.fields.faq[2].answer, good);
  assert.deepEqual(repaired.result.fields.faq.map((item, index) => (index === 2 ? item.question : item.answer)), others);
  assert.ok(!errorsOf(repaired.result.problems).some((problem) => problem.code === "faq-answer-type"));
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

test("tiered: a heading count is aligned with its own list", () => {
  assert.equal(statedListCount(fields.checklist.title), 5);
  assert.equal(statedListCount(fields.steps.title), 3);
  assert.equal(alignListCount(fields.checklist.title, fields.checklist.items.length), fields.checklist.title);
  assert.equal(alignListCount(fields.steps.title, fields.steps.items.length), fields.steps.title);
  assert.equal(alignListCount("Пять шагов, чтобы выбрать слова", 3), "Три шага, чтобы выбрать слова");
  const clean = applyDeterministicSzFixes(structuredClone(fields), { query: brief.query, links: brief.links });
  assert.equal(clean.fields.checklist.title, fields.checklist.title);
  assert.equal(clean.fields.steps.title, fields.steps.title);
  const raw = structuredClone(fields);
  raw.steps.title = "Пять шагов, чтобы обращаться к образу бережно";
  raw.checklist.title = "Три шага – бережное обращение к образу";
  const problems = errorsOf(hybridBuild(raw).problems).filter((problem) => problem.code === "count-mismatch");
  assert.deepEqual(problems.map((problem) => problem.field).sort(), ["checklist", "steps"]);
  let calls = 0;
  const repaired = repairSzArticleTiered({
    brief, raw, build: hybridBuild, repair: tierRepair(),
    state: { spentRub: 0, calls: [], warnings: [] },
    callTier: () => { calls += 1; return {}; },
  });
  assert.equal(calls, 0, repaired.repairSkipped);
  assert.equal(repaired.result.fields.steps.title, "Три шага, чтобы обращаться к образу бережно");
  assert.equal(repaired.result.fields.checklist.title, "Пять шагов – бережное обращение к образу");
  assert.deepEqual(repaired.result.fields.steps.items, fields.steps.items);
  assert.deepEqual(repaired.result.fields.checklist.items, fields.checklist.items);
  assert.ok(!errorsOf(repaired.result.problems).some((problem) => problem.code === "count-mismatch"));
  assert.equal(repaired.passed, true, repaired.repairSkipped);
});

function bodyQueryCountOf(md, query) {
  const body = String(md).match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)?.[1] ?? "";
  const nq = normalize(query);
  return nq ? normalize(body).split(nq).length - 1 : 0;
}

rmSync(site, { recursive: true, force: true });
console.log(`writer sz-unit: ${count} tests ok`);
