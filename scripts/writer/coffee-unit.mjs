#!/usr/bin/env node
/**
 * Offline unit tests for «Райтер» in AudioLad coffee mode (`--site coffee`) and for its separation
 * from the approved «Сергей и Зоя» template (`--site sz`):
 *  - the sz template files are byte-for-byte equal to sz-template.lock.json;
 *  - no import edge between lib/sites/coffee and lib/sites/sz in either direction;
 *  - the coffee loader refuses sz packs, run.mjs refuses a coffee pack in sz mode and vice versa
 *    (before any Cloud.ru call);
 *  - the approved reference passes the coffee rules (no opening story), broken copies fail;
 *  - topics come only from the pack (Sergey's task), never from a Wordstat CSV;
 *  - the foreign expert Howard Schultz is page-ready (licensed photo, verified quotes);
 *  - the generated data module imports and matches the article.
 * No network, no Cloud.ru.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { COFFEE_DEFAULT_MODEL, DEFAULT_MODEL, TARIFF, costRub, estimatePromptTokens, SZ_DEFAULT_MODEL, SUPPORTED_MODELS, defaultModelFor } from "./lib/cost.mjs";
import { applyCoffeePack, registerArticles } from "./lib/sites/coffee/apply.mjs";
import { assembleCoffeeArticle, normalizeText, parseInline, toTsModule } from "./lib/sites/coffee/assemble.mjs";
import { CoffeeBriefError, quoteFitWarnings, expertSlotProblems, isAllowedTextHref, isInternalHref, loadCoffeeExperts, loadCoffeePack, normalizeCoffeePack } from "./lib/sites/coffee/brief.mjs";
import { COFFEE } from "./lib/sites/coffee/config.mjs";
import { LESSONS, corrections, toneSample } from "./lib/sites/coffee/knowledge.mjs";
import { CoffeeStop, draftTokenWindow, prBody, runCoffeePipeline } from "./lib/sites/coffee/pipeline.mjs";
import { buildCoffeeMessages, buildCoffeeRepairMessages, coffeeArticleSchema } from "./lib/sites/coffee/prompt.mjs";
import { authorProse, capitalisedMidSentence, checkCoffeeArticle, dialogueLines, hasQueryWords, imperativeIndexes, kanceliarit, ordinalAgreementSlips, prohibitions, rotationProblems, TONE, toneMetrics } from "./lib/sites/coffee/rules.mjs";
import { buildRequest } from "./lib/prompt.mjs";
import { COFFEE_TEMPLATE_ID, packTemplateMismatch } from "./lib/template-guard.mjs";
import { LOCK_FILE, szHashes } from "./sz-template-lock.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const fixtures = join(here, "fixtures/coffee");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const errorsOf = (problems) => problems.filter((problem) => problem.severity === "error");
let count = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const experts = loadCoffeeExperts(root);
const packFile = join(fixtures, "pack-fixture.json");
const pack = loadCoffeePack(packFile, { experts, repoDir: root });
const brief = pack.articles[0];
const fields = readJson(join(fixtures, `${brief.slug}.json`));
const check = (raw, b = brief) => checkCoffeeArticle(assembleCoffeeArticle(b, raw), b, { experts, repoDir: root });
const szPackFile = join(here, "fixtures/sz/pack-angel-replay.json");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const sources = (dir) => walk(join(here, dir)).filter((path) => /\.(mjs|js|ts|mts|json|md)$/.test(path));

// ── separation ───────────────────────────────────────────────────────────────

test("sz template is byte-for-byte equal to sz-template.lock.json", () => {
  const lock = readJson(LOCK_FILE).files;
  assert.deepEqual(szHashes(), lock, "файлы шаблона «Сергей и Зоя» изменились – coffee-шаблон не должен их трогать");
  assert.ok(Object.keys(lock).some((file) => file === "lib/sites/sz/pipeline.mjs"));
  assert.ok(Object.keys(lock).length >= 10);
});

// Every static or dynamic import / re-export, single or double quotes, multi-line.
// Code that this file generates or passes to `tsx -e` sits inside string literals and is not an import edge of
// the writer itself; real imports never follow a quote.
const IMPORT_SPECS = [
  /(?<!['"`]\s*)\bimport\s+(?:[\w*{}\s,$]+?\s+from\s+)?(["'])([^"'\n]+)\1/g,
  /(?<!['"`]\s*)\bexport\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(["'])([^"'\n]+)\1/g,
  /\bimport\s*\(\s*(["'`])([^"'`\n]+)\1\s*\)/g,
  /\brequire\s*\(\s*(["'`])([^"'`\n]+)\1\s*\)/g,
];
function importSpecs(text) {
  return IMPORT_SPECS.flatMap((re) => [...text.matchAll(re)].map((m) => m[2]));
}
function resolveImport(from, spec) {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null; // node: and packages are outside the repo graph
  // Code passed to child processes (tsx -e) imports relative to the repo/worktree root.
  const bases = spec.startsWith("/") ? [spec] : [join(dirname(from), spec), join(root, spec)];
  for (const base of bases) {
    for (const candidate of [base, `${base}.mjs`, `${base}.js`, `${base}.ts`, `${base}.mts`, join(base, "index.mjs"), join(base, "index.js"), join(base, "index.ts")]) {
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {}
    }
  }
  throw new Error(`${relative(root, from)}: не найден импорт ${spec}`);
}
/** Transitive closure of repo files reachable by imports from the given roots. */
function importGraph(roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(mjs|js|ts|mts)$/.test(file)) continue;
    for (const spec of importSpecs(readFileSync(file, "utf8"))) {
      const target = resolveImport(file, spec);
      if (target && !seen.has(target)) stack.push(target);
    }
  }
  return seen;
}

test("import parser sees every form (quotes, multi-line, re-export, dynamic)", () => {
  const text = `import a from './a.mjs';\nimport {\n  b,\n  c,\n} from "../b.mjs";\nimport './side.mjs';\nexport * from "./d.mjs";\nexport { e } from './e.mjs';\nconst f = await import('./f.mjs');\nconst g = await import(\`./g.mjs\`);\nconst generated = 'import type { T } from "../types";';`;
  assert.deepEqual(importSpecs(text).sort(), ["../b.mjs", "./a.mjs", "./d.mjs", "./e.mjs", "./f.mjs", "./g.mjs", "./side.mjs"]);
});

test("coffee never reaches sz and sz never reaches coffee (full import graph, both ways)", () => {
  const coffeeDir = join(here, "lib/sites/coffee");
  const szDir = join(here, "lib/sites/sz");
  const inside = (file, dir) => file === dir || file.startsWith(`${dir}/`);
  const code = (dir) => walk(dir).filter((path) => /\.(mjs|js|ts|mts)$/.test(path));
  const coffeeRoots = code(coffeeDir);
  const szRoots = [...code(szDir), join(here, "sz-unit.mjs")];
  const coffeeGraph = importGraph(coffeeRoots);
  const szGraph = importGraph(szRoots);
  assert.ok(coffeeGraph.size > coffeeRoots.length, "граф coffee должен включать общие модули");
  for (const file of coffeeGraph) assert.ok(!inside(file, szDir), `coffee достаёт до sz: ${relative(here, file)}`);
  for (const file of szGraph) assert.ok(!inside(file, coffeeDir), `sz достаёт до coffee: ${relative(here, file)}`);
  for (const file of szGraph) {
    if (!/\.(mjs|js|ts|mts)$/.test(file)) continue;
    assert.doesNotMatch(readFileSync(file, "utf8"), /audiolad-coffee|АудиоЛад Кофейни/, `${relative(root, file)} (граф sz) знает о шаблоне coffee`);
  }
  // Shared modules reachable from coffee stay outside both template folders.
  for (const file of coffeeGraph) if (!inside(file, coffeeDir)) assert.ok(!inside(file, szDir));
});

test("remote generate.py knows every TARIFF model at the same price (else Moscow refuses the call)", () => {
  const source = readFileSync(join(root, "scripts/writer/remote/generate.py"), "utf8");
  for (const [model, { inputPer1M, outputPer1M }] of Object.entries(TARIFF)) {
    const match = source.match(new RegExp(`"${model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}": \\("([\\d.]+)", "([\\d.]+)"\\)`));
    assert.ok(match, `${model} нет в PRICES generate.py`);
    assert.equal(Number(match[1]), inputPer1M, `${model}: цена входа`);
    assert.equal(Number(match[2]), outputPer1M, `${model}: цена выхода`);
  }
});

test("per-draft cap: a call never makes one draft cost more than 10 ₽", () => {
  assert.equal(COFFEE.maxRubPerDraft, 10);
  const messages = buildCoffeeMessages(brief, { experts });
  const window = (model, spentRub = 0) => draftTokenWindow(model, messages, { spentRub, capRub: COFFEE.maxRubPerDraft, maxTokens: 16000, minTokens: COFFEE.draftMinTokens });
  const worst = (model, tokens, spent = 0) => spent + costRub(model, estimatePromptTokens(messages, model), tokens);
  const mini = window("openai/gpt-5.4-mini");
  assert.ok(mini >= COFFEE.draftMinTokens && mini < 16000, `окно mini ${mini}`);
  assert.ok(worst("openai/gpt-5.4-mini", mini) <= 10);
  assert.ok(worst("openai/gpt-5.4-mini", mini + 50) > 10, "окно не меньше, чем позволяет лимит");
  assert.equal(window("openai/gpt-5.4-mini", 6), 0, "после 6 ₽ второй полный вызов mini не помещается");
  assert.equal(window("openai/gpt-5.5"), 0, "gpt-5.5 в лимит черновика не помещается");
  assert.throws(() => window("no/such-model"), /нет тарифа/);
});

test("separate ids: template, schema name, site, branch prefix", () => {
  assert.equal(COFFEE.templateId, COFFEE_TEMPLATE_ID);
  assert.equal(COFFEE.site, "coffee");
  assert.equal(COFFEE.schemaName, "audiolad_coffee_guide_article");
  assert.notEqual(COFFEE.schemaName, "sergey_zoya_article");
  assert.equal(COFFEE.byline, "АудиоЛад Кофейни");
  const verticals = readFileSync(join(root, COFFEE.verticalsFile), "utf8");
  assert.match(verticals, /АудиоЛад Кофейни/);
});

test("model defaults: sz unchanged, coffee explicit", () => {
  assert.equal(defaultModelFor("sz"), SZ_DEFAULT_MODEL);
  assert.equal(SZ_DEFAULT_MODEL, "openai/gpt-5.5");
  assert.equal(defaultModelFor("audiolad"), DEFAULT_MODEL);
  assert.equal(defaultModelFor("coffee"), COFFEE_DEFAULT_MODEL);
  assert.ok(SUPPORTED_MODELS.includes(COFFEE_DEFAULT_MODEL));
  assert.equal(COFFEE_DEFAULT_MODEL, "openai/gpt-5.4-mini");
  assert.equal(COFFEE.draft.model, COFFEE_DEFAULT_MODEL);
  assert.deepEqual(TARIFF["openai/gpt-5.4-mini"], { inputPer1M: 147.315, outputPer1M: 883.89 });
});

test("coffee loader refuses sz packs and untagged packs", () => {
  assert.throws(() => loadCoffeePack(szPackFile, { experts, repoDir: root }), CoffeeBriefError);
  const raw = readJson(packFile);
  assert.throws(() => normalizeCoffeePack({ ...raw, template: undefined }, { experts, repoDir: root }), /шаблона coffee/);
  assert.throws(() => normalizeCoffeePack({ ...raw, site: "sz" }, { experts, repoDir: root }), /шаблона coffee/);
});

test("template guard: sz/audiolad refuse coffee packs, coffee refuses sz packs", () => {
  const coffeePack = readJson(packFile);
  const szPack = readJson(szPackFile);
  assert.match(packTemplateMismatch("sz", coffeePack), /не смешиваются/);
  assert.match(packTemplateMismatch("audiolad", coffeePack), /не смешиваются/);
  assert.match(packTemplateMismatch("coffee", szPack), /не смешиваются/);
  assert.equal(packTemplateMismatch("sz", szPack), null);
  assert.equal(packTemplateMismatch("coffee", coffeePack), null);
});

test("run.mjs: --site sz with a coffee pack and --site coffee with an sz pack stop with code 2", () => {
  const env = { ...process.env, CLOUDRU_API_KEY: "", WRITER_MOSCOW_HOST: "invalid.invalid" };
  const a = spawnSync(process.execPath, [join(here, "run.mjs"), "--site", "sz", "--briefs", packFile, "--repo", tmpdir()], { encoding: "utf8", env, input: "", timeout: 60000 });
  assert.equal(a.status, 2, a.stderr);
  assert.match(a.stderr, /не смешиваются/);
  const b = spawnSync(process.execPath, [join(here, "run.mjs"), "--site", "coffee", "--briefs", szPackFile], { encoding: "utf8", env, input: "", timeout: 60000 });
  assert.equal(b.status, 2, b.stderr);
  assert.match(b.stderr, /не смешиваются/);
});

test("coffee prompt carries coffee rules and no sz markers", () => {
  const messages = buildCoffeeMessages(brief, { experts, avoid: ["Как выбрать обжарщика"] });
  const text = messages.map((m) => m.content).join("\n");
  for (const marker of ["Зоя", "Сергей Петров", "ангел", "sergey_zoya", "Летописец"]) assert.ok(!text.includes(marker), `в промпте coffee есть «${marker}»`);
  for (const marker of ["АудиоЛад Кофейни", "кофейн", "«точка»", "Редакция", "–", brief.primaryQuery]) assert.ok(text.includes(marker), `в промпте нет «${marker}»`);
  assert.doesNotMatch(text.replace(/«\u2014»/g, ""), /\u2014/, "длинное тире в промпте (кроме самого правила «—»)");
  assert.ok(text.includes("Как выбрать обжарщика"));
  assert.ok(LESSONS.length >= 10 && corrections().length >= 8);
  const repair = buildCoffeeRepairMessages(messages, fields, [{ field: "intro", severity: "error", message: "тест" }]);
  assert.ok(repair.length > messages.length);
  const schema = coffeeArticleSchema();
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes("intro"));
  assert.ok(!("story" in schema.properties) && !("bridge" in schema.properties), "в схеме coffee нет истории");
  assert.doesNotMatch(text, /ИСТОРИЯ|от первого лица|реплик|мостик|bridge/, "промпт coffee не просит историю");
  assert.match(text, /Статья сразу начинается с практической темы, без истории/);
});

test("tone sample is verbatim from the reference article", () => {
  const reference = readFileSync(join(root, COFFEE.articlesDir, `${COFFEE.referenceSlug}.ts`), "utf8");
  const sample = toneSample();
  const strings = JSON.stringify(sample).match(/"(?:[^"\\]|\\.)*"/g).map((s) => JSON.parse(s)).filter((s) => s.length > 40);
  assert.ok(strings.length >= 5);
  for (const s of strings) assert.ok(reference.includes(JSON.stringify(s).slice(1, -1)), `не из эталона: ${s.slice(0, 60)}`);
});

// ── rules ────────────────────────────────────────────────────────────────────

test("reference intro (no story, query first) passes all coffee rules", () => {
  // The reference has 22.5 imperatives per 1000 words: above the 20 target (warning), below the 25 error.
  assert.deepEqual(errorsOf(check(fields)), []);
  assert.deepEqual(check(fields).map((p) => p.message), ["повелительных глаголов 22.5 на 1000 слов (цель ≤ 20)"]);
});

test("helpers: dialogue, names, query words, links, typography", () => {
  assert.equal(dialogueLines(["Она сказала: «Да». Я: «Нет».", "– Правда?\n– Правда."]), 4);
  assert.deepEqual(capitalisedMidSentence("Утром я встретил Ивана. Он сказал: «Привет»."), ["Ивана"]);
  assert.ok(hasQueryWords("Какой кофе в зёрнах выбрать для кофейни", "кофе в зёрнах для кофейни"));
  assert.ok(!hasQueryWords("Обжарка под эспрессо", "кофе в зёрнах для кофейни"));
  assert.ok(isAllowedTextHref("/b/coffee"));
  assert.ok(isAllowedTextHref(COFFEE.maxUrl));
  assert.ok(isAllowedTextHref("https://sergey-zoya.ru/articles/x"));
  assert.ok(!isAllowedTextHref("https://example.com/"));
  assert.ok(!isAllowedTextHref("//evil.ru/x"));
  for (const href of ["/\\example.com/x", "/\\\\example.com", "\\\\example.com", "\\/example.com", "/%5Cexample.com", "/%2F%2Fexample.com", "/%2fexample.com", "/\t/example.com", "/ /example.com", "https://sergey-zoya.ru\\@example.com/", "https://user@sergey-zoya.ru/x", "https://sergey-zoya.ru.example.com/", "http://sergey-zoya.ru/x", "javascript:alert(1)"]) {
    assert.ok(!isAllowedTextHref(href), `пропущена ссылка ${href}`);
    assert.ok(!isInternalHref(href), `внутренней признана ${href}`);
  }
  assert.ok(isInternalHref("/b/coffee?tab=1#faq"));
  assert.equal(normalizeText("а \u2014 б - в"), "а – б – в");
  assert.deepEqual(parseInline("см. [атлас](/b/atlas-kofeen) тут"), ["см. ", { href: "/b/atlas-kofeen", label: "атлас" }, " тут"]);
});

test("topics come only from Sergey's task: pack needs task, no storyHint, no Wordstat CSV in the code", () => {
  const raw = readJson(packFile);
  const noTask = clone(raw);
  delete noTask.task;
  assert.throws(() => normalizeCoffeePack(noTask, { experts, repoDir: root }), /task: укажите задачу Сергея/);
  const withStory = clone(raw);
  withStory.articles[0].storyHint = "Утро в кофейне";
  assert.throws(() => normalizeCoffeePack(withStory, { experts, repoDir: root }), /storyHint больше не используется/);
  assert.equal(pack.task, raw.task);
  for (const file of sources("lib/sites/coffee").filter((path) => path.endsWith(".mjs"))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /wordstat-candidates|\.csv/i, `${relative(here, file)} не должен читать темы из CSV`);
  }
});

test("foreign expert Howard Schultz is page-ready: licensed face crop, verified quotes, Russian labels", () => {
  const schultz = experts.get("howard-schultz");
  assert.equal(schultz.name, "Говард Шульц");
  assert.equal(schultz.origin, "foreign");
  assert.equal(schultz.gender, "man");
  assert.equal(schultz.photo.file, "/business/coffee-guides/experts/howard-schultz.webp");
  assert.equal(schultz.photo.license, "CC BY-SA 3.0");
  assert.equal(schultz.photo.author, "Gage Skidmore");
  assert.match(schultz.photo.credit, /^Фото: Гейдж Скидмор, Викисклад, .*кадрировано$/);
  const head = readFileSync(join(root, "public", schultz.photo.file)).subarray(0, 12).toString("latin1");
  assert.ok(head.startsWith("RIFF") && head.endsWith("WEBP"), "портрет – webp");
  assert.equal(schultz.quotes.length, 2);
  const translations = [
    "В 1983 году я, ещё молодым человеком, впервые поехал в Италию. Как и многих, кто бывал в Италии, меня покорили итальянские кофейные бары, романтика и театр эспрессо. Но по-настоящему меня поразило чувство общности, которое было внутри всех этих баров, – то, что я начал понимать и называть третьим местом между домом и работой.",
    "Но со временем мы поняли, что продавали не кофе. Мы продавали впечатление и это чувство общности.",
  ];
  for (const [quoteIndex, quote] of schultz.quotes.entries()) {
    assert.equal(quote.language, "en");
    assert.match(quote.sourceLabel, /Атлантический совет, Вашингтон, 10 мая 2018 года$/);
    assert.deepEqual(expertSlotProblems({ id: "howard-schultz", quoteIndex, translation: translations[quoteIndex] }, experts, { repoDir: root }), []);
    assert.match(expertSlotProblems({ id: "howard-schultz", quoteIndex }, experts, { repoDir: root }).join("\n"), /нужен перевод/);
  }
});

const NEGATIVES = [
  ["em dash survives only if not normalised – a Latin word fails", (f) => { f.partOne[0].paragraphs[0] += " Это эспрессо blend."; }, /латиница/],
  ["«точка» instead of «кофейня»", (f) => { f.partTwo[0].paragraphs[0] += " Каждая точка выбирает своё зерно."; }, /точка/],
  ["«точка безубыточности»", (f) => { f.partTwo[0].paragraphs[0] += " Так быстрее достигается точка безубыточности."; }, /точка/],
  ["«Редакция»", (f) => { f.intro[1] += " Редакция советует не спешить."; }, /Редакция/],
  ["music in the text is blocking", (f) => { f.partTwo[1].paragraphs[0] += " Включите гостям спокойную музыку."; }, /музыка в тексте/],
  ["songs in the text are blocking", (f) => { f.faq[0].answer += " Хорошо звучат песни без слов."; }, /музыка в тексте/],
  ["player/comments", (f) => { f.partTwo[1].paragraphs[0] += " Включите плеер с музыкой."; }, /плеер/],
  ["negative priming", (f) => { f.partTwo[1].paragraphs[0] += " Гости испытывают дискомфорт."; }, /негативн/],
  ["pain wording", (f) => { f.partTwo[1].paragraphs[0] += " От громкой кофемолки у гостей болит голова."; }, /негативн/],
  ["heaviness wording", (f) => { f.partTwo[1].paragraphs[0] += " Бариста тяжело работать без графика."; }, /негативн/],
  ["unpleasant wording", (f) => { f.partTwo[1].paragraphs[0] += " Гостям неприятно ждать."; }, /негативн/],
  ["fatigue wording", (f) => { f.partTwo[1].paragraphs[0] += " К вечеру команда устаёт и устала от потока."; }, /негативн/],
  ["made-up statistic", (f) => { f.partTwo[1].paragraphs[0] += " По данным исследования, 87 % гостей выбирают кофе по цвету чашки."; }, /статистика или исследование без источника/],
  ["made-up research without numbers", (f) => { f.partOne[0].paragraphs[0] += " Исследования показывают, что гости любят светлую обжарку."; }, /статистика или исследование без источника/],
  ["made-up percent", (f) => { f.faq[0].answer += " Так экономится 30% зерна."; }, /статистика или исследование без источника/],
  ["number not from the facts", (f) => { f.partOne[0].paragraphs[0] += " Зерно лучше всего раскрывается на 14-й день после обжарки."; }, /число 14 не из фактов брифа/],
  ["year not from the facts", (f) => { f.partOne[0].paragraphs[0] += " Эспрессо появился в 1884 году."; }, /число 1884 не из фактов брифа/],
  ["link /\\ escapes to another host", (f) => { f.partOne[1].paragraphs[0] += " Подробнее – [здесь](/\\example.com/x)."; }, /запрещённая ссылка/],
  ["external link", (f) => { f.partOne[1].paragraphs[0] += " Подробнее – [здесь](https://example.com/coffee)."; }, /запрещённая ссылка/],
  ["link not from the brief", (f) => { f.partOne[1].paragraphs[0] += " Подробнее – [здесь](/b/other)."; }, /нет в брифе/],
  ["raw address in text", (f) => { f.partOne[1].paragraphs[0] += " Пишите на сайт www.coffee.ru."; }, /адрес сайта/],
  ["intro without the query", (f) => { f.intro[0] = "Зерно – то, с чего начинается каждая чашка в зале. От него зависит вкус эспрессо и капучино."; }, /первый абзац вступления/],
  ["intro opens with a dialogue story", (f) => { f.intro = ["Кофе в зёрнах для кофейни привезли рано утром.", "– Попробуете? – спросила бариста.\n– Конечно, – ответил гость."]; }, /диалогов и прямой речи/],
  ["intro in the first person", (f) => { f.intro[1] += " Я выбираю зерно сам."; }, /рассказчика/],
  ["intro with a story opener", (f) => { f.intro[0] = "Однажды кофе в зёрнах для кофейни привезли раньше обычного, и все в зале это заметили."; }, /похоже на историю/],
  ["intro too long", (f) => { f.intro = [...f.intro, f.intro[1], f.intro[1]]; }, /вступление – 1–3 абзаца/],
  ["table row length mismatch", (f) => { f.table.rows[0] = f.table.rows[0].slice(0, 2); }, /значений/],
  ["only 2 FAQ", (f) => { f.faq = f.faq.slice(0, 2); }, /вопросов/],
  ["4 checklist items", (f) => { f.checklist.items = f.checklist.items.slice(0, 4); }, /пунктов/],
  ["one section in part two missing", (f) => { f.partTwo = f.partTwo.slice(0, 2); }, /3 раздела/],
  ["seoTitle without the query at start", (f) => { f.seoTitle = "Как выбрать зерно для кофейни"; }, /seoTitle/],
  // Round 2 of the pilot (30.10.2026): slips that got through round 1.
  ["ordinal/noun gender slip «Третий место»", (f) => { f.partOne[0].paragraphs[0] += " Третий место в зале – у окна."; }, /не согласовано: «Третий место»/],
  ["ordinal/noun gender slip «первая шаг»", (f) => { f.faq[0].answer += " Это первая шаг к выбору."; }, /не согласовано/],
  ["expert lead without the expert's name", (f) => { f.expertOne.lead = "Эксперт ответил на вопрос о том, с чего начинался его бизнес."; }, /lead называет эксперта/],
  ["exclamation mark", (f) => { f.partTwo[0].paragraphs[0] += " Так зерно раскроется лучше!"; }, /восклицательный тон/],
  ["filler opener «Отлично»", (f) => { f.faq[1].answer = "Отлично, если поставщик присылает дату обжарки. " + f.faq[1].answer; }, /восклицательный тон/],
  ["numeric column without numbers", (f) => { f.table.columns[1] = "Размер"; }, /обещает цифры/],
  ["seoTitle in lowercase", (f) => { f.seoTitle = f.seoTitle.charAt(0).toLowerCase() + f.seoTitle.slice(1); }, /заглавной/],
  ["description without the exact query form", (f) => { f.description = "Как выбрать кофе в зёрнах для кофеен: свежесть обжарки, вкус в чашке, расчёт стоимости порции и вопросы поставщику перед первой закупкой."; }, /дословно/],
  // Round 3 (30.10.2026): tone and expert rotation.
  ["«Не …йте» prohibition", (f) => { f.partTwo[0].paragraphs[0] += " Не покупайте зерно без даты обжарки."; }, /запрет «не покупайте…»/],
  ["imperative density above 25 per 1000 words", (f) => { f.partTwo[0].paragraphs[0] += " Проверьте пачку, посчитайте расход, сравните цены, запишите итог, обсудите выбор, закажите партию, попробуйте зерно."; f.partTwo[1].paragraphs[0] += " Спросите поставщика, уточните график, договоритесь о замене, сохраните ответы."; }, /повелительных глаголов [\d.]+ на 1000 слов \(> 25\)/],
  ["description too long", (f) => { f.description = "Кофе в зёрнах для кофейни: " + "свежесть обжарки, вкус, ".repeat(8); }, /description 120–170 символов/],
];
for (const [name, mutate, expected] of NEGATIVES) {
  test(`negative: ${name}`, () => {
    const broken = clone(fields);
    mutate(broken);
    const errors = errorsOf(check(broken));
    assert.ok(errors.length > 0, "ошибок нет");
    assert.ok(errors.some((e) => expected.test(e.message)), errors.map((e) => e.message).join(" | "));
  });
}

test("statistic with a sourced brief fact passes; the brief refuses a fact without a source", () => {
  const sourced = { ...brief, facts: ["Две трети посетителей кофеен заказывают напитки на основе эспрессо: 64 % опрошенных. Источник: опрос Национальной кофейной ассоциации США, 2024 год"] };
  const ok = clone(fields);
  ok.partTwo[1].paragraphs[0] += " По опросу Национальной кофейной ассоциации США, 64 % гостей кофеен заказывают напитки на основе эспрессо.";
  assert.deepEqual(errorsOf(check(ok, sourced)), []);
  const unnamed = clone(fields);
  unnamed.partTwo[1].paragraphs[0] += " По данным опроса, 64 % гостей кофеен заказывают напитки на основе эспрессо.";
  assert.match(errorsOf(check(unnamed, sourced)).map((e) => e.message).join("\n"), /статистика или исследование без источника/);
  const raw = readJson(packFile);
  const real = raw.articles[0].facts;
  raw.articles[0].facts = [...real, "64 % гостей заказывают эспрессо"];
  assert.throws(() => normalizeCoffeePack(raw, { experts, repoDir: root }), /нужен реальный источник/);
  raw.articles[0].facts = [...real, "64 % гостей заказывают эспрессо. Источник: опрос Национальной кофейной ассоциации США, 2024 год"];
  assert.doesNotThrow(() => normalizeCoffeePack(raw, { experts, repoDir: root }));
});

test("prompt has no «общеизвестное» allowance for numbers", () => {
  const text = buildCoffeeMessages({ ...brief, facts: [] }, { experts }).map((m) => m.content).join("\n");
  assert.doesNotMatch(text, /общеизвест/i);
  assert.doesNotMatch(LESSONS.join("\n"), /общеизвест/i);
  assert.match(text, /никаких цифр статистики/);
});

test("em dash from the model is normalised to en dash", () => {
  const raw = clone(fields);
  raw.partOne[0].paragraphs[0] = raw.partOne[0].paragraphs[0].replace(" – ", " \u2014 ");
  const article = assembleCoffeeArticle(brief, raw);
  assert.doesNotMatch(JSON.stringify(article), /\u2014/);
});

test("brief: experts must be registry, licensed, man+woman, ru+foreign; foreign quote needs translation", () => {
  const raw = readJson(packFile);
  const bad = clone(raw);
  bad.articles[0].experts = [{ id: "dmitry-kotov", quoteIndex: 0 }, { id: "nobody", quoteIndex: 0 }];
  assert.throws(() => normalizeCoffeePack(bad, { experts, repoDir: root }), /нет в реестре/);
  const pair = clone(raw);
  pair.articles[0].experts = [{ id: "dmitry-kotov", quoteIndex: 0 }, { id: "anna-tsfasman", quoteIndex: 0 }];
  assert.throws(() => normalizeCoffeePack(pair, { experts, repoDir: root }), /иностранный/);
  const noTranslation = clone(raw);
  noTranslation.articles[0].experts = noTranslation.articles[0].experts.map(({ id, quoteIndex }) => ({ id, quoteIndex }));
  assert.throws(() => normalizeCoffeePack(noTranslation, { experts, repoDir: root }), /перевод/);
  const unlicensed = new Map(experts);
  unlicensed.set("sunalini-menon", { ...experts.get("sunalini-menon"), photo: { file: "x.jpg" } });
  assert.throws(() => normalizeCoffeePack(raw, { experts: unlicensed, repoDir: root }), /фото/);
  const external = clone(raw);
  external.articles[0].links = ["https://example.com/"];
  assert.throws(() => normalizeCoffeePack(external, { experts, repoDir: root }), /разрешены только/);
  const reference = clone(raw);
  reference.articles[0].slug = COFFEE.referenceSlug;
  assert.throws(() => normalizeCoffeePack(reference, { experts, repoDir: root }), /эталонная/);
  const six = clone(raw);
  six.articles = Array.from({ length: 6 }, (_, i) => ({ ...raw.articles[0], slug: `a-${i}` }));
  assert.throws(() => normalizeCoffeePack(six, { experts, repoDir: root }), /1–5/);
});

// ── output ───────────────────────────────────────────────────────────────────

test("registerArticles adds import + ARTICLES entry and refuses duplicates", () => {
  const source = readFileSync(join(root, COFFEE.registryFile), "utf8");
  // Slug that is never a real article, so the test stays valid as content sets get registered.
  const slug = "unit-test-stoyka-dlya-kofeyni";
  assert.ok(!source.includes(slug));
  const next = registerArticles(source, [slug]);
  assert.match(next, /import \{ UNIT_TEST_STOYKA_DLYA_KOFEYNI \} from "\.\/articles\/unit-test-stoyka-dlya-kofeyni";/);
  assert.match(next, /\[KOFE_V_ZERNAH_DLYA_KOFEYNI(, [A-Z0-9_]+)*, UNIT_TEST_STOYKA_DLYA_KOFEYNI\]/);
  assert.throws(() => registerArticles(next, [slug]), /уже/);
  // Real registered articles are refused too.
  assert.throws(() => registerArticles(source, ["kofe-v-zernah-dlya-kofeyni"]), /уже/);
});

test("generated data module imports and equals the assembled article", async () => {
  const article = assembleCoffeeArticle(brief, fields);
  const file = join(root, COFFEE.articlesDir, `__coffee-unit-${process.pid}.ts`);
  writeFileSync(file, toTsModule({ ...article }, { packId: "coffee-fixture", model: "offline" }));
  try {
    const mod = await import(pathToFileURL(file).href);
    const [value] = Object.values(mod);
    assert.deepEqual(value, article);
    assert.equal(value.verticalId, "coffee");
    assert.match(value.checklist.storageKey, /^audiolad\.b\.coffee\./);
  } finally {
    rmSync(file, { force: true });
  }
});

test("applyCoffeePack writes into a scratch tree only", () => {
  const dir = mkdtempSync(join(tmpdir(), "coffee-apply-"));
  try {
    const registry = join(dir, COFFEE.registryFile);
    spawnSync("mkdir", ["-p", dirname(registry), join(dir, COFFEE.articlesDir)]);
    writeFileSync(registry, readFileSync(join(root, COFFEE.registryFile), "utf8"));
    const { changed } = applyCoffeePack(dir, { items: [{ article: assembleCoffeeArticle(brief, fields) }], packId: "p", model: "m" });
    assert.deepEqual(changed, [`${COFFEE.articlesDir}/${brief.slug}.ts`, COFFEE.registryFile]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ordinal agreement helper: slips only, correct pairs pass", () => {
  assert.deepEqual(ordinalAgreementSlips("Третий место и вторая зона, первый шаг, третье место, последняя стойка").map((s) => s.text), ["Третий место"]);
  assert.equal(ordinalAgreementSlips("Второй стол, второе правило, вторая стойка.").length, 0);
  assert.equal(ordinalAgreementSlips("Первое решение и первый вопрос").length, 0);
  assert.equal(ordinalAgreementSlips("Последний зона").length, 1);
});

test("tone: imperatives, prohibitions, канцелярит and explanatory share", () => {
  assert.deepEqual(imperativeIndexes("Проверьте дату обжарки и сравните два образца."), [0, 4]);
  assert.deepEqual(imperativeIndexes("Если вы сами стоите за стойкой, ведёте закупки и следите за залом, это видно."), [], "-ите after «вы» is the present tense");
  assert.deepEqual(imperativeIndexes("Вы готовите эспрессо на сайте и в кредите."), []);
  assert.deepEqual(prohibitions("Не ставьте выдачу у кассы. Гость не спешит."), ["не ставьте"]);
  assert.deepEqual(kanceliarit("Это является основой, а при отсутствии данных – в целях проверки."), ["является", "при отсутствии", "в целях"]);
  assert.deepEqual(kanceliarit("Удобно, когда выдача стоит чуть в стороне."), []);
  const warm = toneMetrics([["p", "Выдача работает свободнее чуть в стороне от кассы. Так гостю удобно забрать заказ. Можно попробовать оба варианта на макете."]]);
  assert.equal(warm.imperatives, 0);
  assert.equal(warm.explanatoryShare, 1);
  const strict = toneMetrics([["p", "Проверьте кассу. Не ставьте выдачу рядом. Посчитайте поток."]]);
  assert.equal(strict.imperativeStartShare, 1);
  assert.deepEqual(strict.prohibitions, [["p", "не ставьте"]]);
  assert.ok(strict.imperativesPer1000 > TONE.imperativesPer1000.error);
  // Step titles and checklist items may stay imperative: they are not author prose.
  const article = assembleCoffeeArticle(brief, fields);
  const proseFields = authorProse(article).map(([field]) => field);
  assert.ok(!proseFields.some((f) => /title|checklist\.items|heading|question/.test(f)), proseFields.join(", "));
  assert.ok(proseFields.some((f) => f.startsWith("steps.items[")) && proseFields.some((f) => f.startsWith("faq[")));
  const many = clone(fields);
  many.partOne[0].paragraphs[0] += " Это является нормой, при отсутствии данных – в целях проверки, в рамках закупки, в соответствии с планом.";
  assert.match(check(many).filter((p) => p.severity === "warning").map((p) => p.message).join("\n"), /канцелярит/);
});

test("rotation: a quote already on the site and an expert repeated in the pack are errors", () => {
  const article = assembleCoffeeArticle(brief, fields);
  const one = article.expertOne;
  const siteQuotes = new Map([[`${one.expertId}#${one.quoteIndex}`, "kofe-v-zernah-dlya-kofeyni"]]);
  assert.match(rotationProblems({ ...article, slug: "other" }, { siteQuotes }).map(([, m]) => m).join("\n"), /уже есть на сайте/);
  assert.deepEqual(rotationProblems({ ...article, slug: "kofe-v-zernah-dlya-kofeyni" }, { siteQuotes }), [], "an article does not clash with itself");
  const packExperts = new Map([[one.expertId, "first-article"]]);
  assert.match(rotationProblems({ ...article, slug: "second-article" }, { packExperts }).map(([, m]) => m).join("\n"), /уже есть в этом пакете/);
  const errors = errorsOf(checkCoffeeArticle(article, brief, { experts, repoDir: root, siteQuotes: new Map([[`${one.expertId}#${one.quoteIndex}`, "elsewhere"]]) }));
  assert.ok(errors.some((e) => /уже есть на сайте/.test(e.message)));
  assert.match(rotationProblems({ slug: "x", expertOne: { expertId: "a", quoteIndex: 0 }, expertTwo: { expertId: "a", quoteIndex: 1 } }).map(([, m]) => m).join("\n"), /два слота одного эксперта/);
  // Brief level: one expert in two articles of a pack is rejected.
  const raw = readJson(packFile);
  const twice = clone(raw);
  twice.articles.push({ ...clone(raw.articles[0]), slug: "vtoraya-statya" });
  assert.throws(() => normalizeCoffeePack(twice, { experts, repoDir: root }), /в пакете каждый эксперт один раз/);
});

test("round 3 should-fixes: «не боится» is not negative; ordinals; numeric headers by whole word", () => {
  const negative = (text) => { const f = clone(fields); f.partTwo[1].paragraphs[0] += text; return errorsOf(check(f)).filter((p) => /негативн/.test(p.message)); };
  assert.equal(negative(" Хорошая смесь не боится молока.").length, 0);
  assert.equal(negative(" Гость боится ждать.").length, 1);
  assert.deepEqual(ordinalAgreementSlips("Начните с первой. Место у окна свободно."), []);
  assert.deepEqual(ordinalAgreementSlips("Вторая стойка, второй шаг.").map((s) => s.text), []);
  for (const header of ["Нормативный документ", "Весь ассортимент", "Длинный путь"]) {
    const f = clone(fields);
    f.table.columns[1] = header;
    assert.ok(!errorsOf(check(f)).some((p) => /обещает цифры/.test(p.message)), header);
  }
  for (const header of ["Норма", "Вес", "Цена"]) {
    const f = clone(fields);
    f.table.columns[1] = header;
    assert.ok(errorsOf(check(f)).some((p) => /обещает цифры/.test(p.message)), header);
  }
});

test("prompt asks for the warm explanatory tone; no reuse-expert permission anywhere in the coffee template", () => {
  const text = buildCoffeeMessages(brief, { experts }).map((m) => m.content).join("\n");
  assert.match(text, /тёплый/);
  assert.match(text, /Не …йте/);
  assert.match(text, /explanatoryParagraphs/);
  assert.ok(toneSample().explanatoryParagraphs.length >= 4);
  const docs = [join(here, "lib/sites/coffee/knowledge/TEMPLATE_RU.md"), join(root, "docs/business/coffee-guides/TEMPLATE.md"), join(root, "scripts/business-coffee-guide-unit.mts")].map((p) => readFileSync(p, "utf8")).join("\n");
  assert.doesNotMatch(docs, /permits reusing|разрешает повтор|можно повторять эксперт/i);
  assert.match(docs, /ротир/);
});

test("facts block is required: 3–6 sourced facts; the reference fixture brief carries 3 real ones", () => {
  assert.deepEqual(COFFEE.facts, [3, 6]);
  assert.ok(brief.facts.length >= 3 && brief.facts.length <= 6);
  for (const fact of brief.facts) assert.match(fact, /Источник: [А-ЯЁа-яё«]/);
  const raw = readJson(packFile);
  for (const facts of [[], raw.articles[0].facts.slice(0, 2), [...raw.articles[0].facts, ...raw.articles[0].facts, raw.articles[0].facts[0]]]) {
    const copy = clone(raw);
    copy.articles[0].facts = facts;
    assert.throws(() => normalizeCoffeePack(copy, { experts, repoDir: root }), /facts – нужно 3–6/);
  }
  const text = buildCoffeeMessages(brief, { experts }).map((m) => m.content).join("\n");
  assert.match(text, /ФАКТЫ \(используй каждый/);
  assert.match(text, /около 1600 слов/);
  assert.match(text, /КОНКРЕТИКА/);
  assert.match(text, /без восклицательных знаков/);
  assert.match(text, /начинается с имени и фамилии эксперта/);
});

test("quote fit: a better registry quote of the same expert is suggested, never an invented one", () => {
  const bar = { slug: "barnaya-stoyka-dlya-kofeyni", title: "Барная стойка для кофейни: размеры, зоны и материалы", primaryQuery: "барная стойка для кофейни", intent: "Владелец планирует рабочее место бариста и оборудование стойки", sectionsHint: ["оборудованная рабочая площадка бариста"], tableHint: "", experts: [{ id: "anna-tsfasman", quoteIndex: 0 }, { id: "howard-schultz", quoteIndex: 0, translation: "Я был очарован итальянскими кофейными барами." }] };
  const warnings = quoteFitWarnings(bar, experts);
  assert.match(warnings.join("\n"), /anna-tsfasman цитата №1 ближе к теме/);
  assert.equal(quoteFitWarnings({ ...bar, experts: [{ id: "anna-tsfasman", quoteIndex: 1 }, bar.experts[1]] }, experts).filter((w) => /anna/.test(w)).length, 0);
  // Warnings never block the brief and never add quotes.
  assert.equal(experts.get("anna-tsfasman").quotes.length, 2);
});

test("draft setup mirrors sz pack 17: gpt-5.4-mini only, max_tokens 9000, temperature 0.4, no repair", async () => {
  assert.deepEqual(COFFEE.draft, { model: "openai/gpt-5.4-mini", maxTokens: 9000, temperature: 0.4, repair: false });
  assert.equal(buildRequest(COFFEE.draft.model, [], {}, { maxTokens: 9000, schemaName: COFFEE.schemaName }).temperature, COFFEE.draft.temperature);
  const generate = () => { throw new Error("не должно вызываться"); };
  for (const model of ["openai/gpt-oss-120b", "openai/gpt-5.5"]) {
    await assert.rejects(runCoffeePipeline({ briefs: packFile, repo: root, "dry-run": true }, { model, maxRub: 10, maxTokens: 9000, generate }), /только моделью openai\/gpt-5\.4-mini/);
  }
  await assert.rejects(runCoffeePipeline({ briefs: packFile, repo: root, base: "HEAD" }, { model: COFFEE.draft.model, maxRub: 10, maxTokens: 9000, generate }), /--base только вместе с --dry-run/);
  const source = readFileSync(join(here, "lib/sites/coffee/pipeline.mjs"), "utf8");
  assert.match(source, /COFFEE\.draft\.repair && !args\["no-repair"\]/);
  assert.doesNotMatch(readFileSync(join(here, "lib/cost.mjs"), "utf8"), /COFFEE_ALT_MODEL/);
});

test("pipeline refuses an sz pack before any Cloud.ru call", async () => {
  let called = false;
  const generate = () => { called = true; throw new Error("не должно вызываться"); };
  await assert.rejects(runCoffeePipeline({ briefs: szPackFile, repo: root, offline: true }, { model: COFFEE_DEFAULT_MODEL, maxRub: 1, maxTokens: 100, generate }), CoffeeBriefError);
  assert.equal(called, false);
  assert.ok(CoffeeStop);
});

test("PR body names template, byline and the coffee guide test to update", () => {
  const body = prBody({ articles: [{ slug: brief.slug, warnings: [] }], calls: [], spentRub: 0, model: "m", secretScan: { ok: true } }, [{ brief }], pack);
  assert.match(body, /audiolad-coffee-guide-v1/);
  assert.match(body, /АудиоЛад Кофейни/);
  assert.match(body, /business-coffee-guide-unit/);
  assert.match(body, /черновик Райтера, не публикация/);
  assert.match(body, /Codex делает финальную доводку и публикует/);
  assert.doesNotMatch(body, /\u2014/);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    count += 1;
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}
console.log(`coffee-unit: ${count} тестов пройдено`);
