#!/usr/bin/env node
/**
 * Offline unit tests for «Райтер» in AudioLad coffee mode (`--site coffee`) and for its separation
 * from the approved «Сергей и Зоя» template (`--site sz`):
 *  - the sz template files are byte-for-byte equal to sz-template.lock.json;
 *  - no import edge between lib/sites/coffee and lib/sites/sz in either direction;
 *  - the coffee loader refuses sz packs, run.mjs refuses a coffee pack in sz mode and vice versa
 *    (before any Cloud.ru call);
 *  - the approved reference (+ a composite story) passes the coffee rules, broken copies fail;
 *  - the generated data module imports and matches the article.
 * No network, no Cloud.ru.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { COFFEE_DEFAULT_MODEL, DEFAULT_MODEL, SZ_DEFAULT_MODEL, SUPPORTED_MODELS, defaultModelFor } from "./lib/cost.mjs";
import { applyCoffeePack, registerArticles } from "./lib/sites/coffee/apply.mjs";
import { assembleCoffeeArticle, normalizeText, parseInline, toTsModule } from "./lib/sites/coffee/assemble.mjs";
import { CoffeeBriefError, isAllowedTextHref, loadCoffeeExperts, loadCoffeePack, normalizeCoffeePack } from "./lib/sites/coffee/brief.mjs";
import { COFFEE } from "./lib/sites/coffee/config.mjs";
import { LESSONS, corrections, toneSample } from "./lib/sites/coffee/knowledge.mjs";
import { CoffeeStop, prBody, runCoffeePipeline } from "./lib/sites/coffee/pipeline.mjs";
import { buildCoffeeMessages, buildCoffeeRepairMessages, coffeeArticleSchema } from "./lib/sites/coffee/prompt.mjs";
import { capitalisedMidSentence, checkCoffeeArticle, dialogueLines, hasQueryWords } from "./lib/sites/coffee/rules.mjs";
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
const check = (raw, b = brief) => checkCoffeeArticle(assembleCoffeeArticle(b, raw), b, { experts, storyCount: (raw.story ?? []).length, repoDir: root });
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

test("coffee never imports sz and sz never imports coffee", () => {
  for (const file of sources("lib/sites/coffee")) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /sites\/sz|\.\.\/sz\/|from "\.\/sz/, `${relative(here, file)} ссылается на шаблон sz`);
  }
  for (const file of sources("lib/sites/sz")) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /sites\/coffee|\.\.\/coffee\/|audiolad-coffee|АудиоЛад Кофейни/, `${relative(here, file)} ссылается на шаблон coffee`);
  }
  for (const file of sources("lib/sites/coffee").filter((f) => f.endsWith(".mjs"))) {
    const text = readFileSync(file, "utf8");
    const specs = [...text.matchAll(/^import [^;]*?from "([^"]+)";/gms), ...text.matchAll(/\bimport\("([^"]+)"\)/g)].map((m) => m[1]);
    for (const spec of specs) {
      if (!spec.startsWith(".")) continue;
      const target = relative(here, join(dirname(file), spec));
      assert.ok(target.startsWith("lib/sites/coffee/") || /^lib\/(call|cost|publish|util|prompt|moscow)\.mjs$/.test(target), `${relative(here, file)} импортирует ${target}`);
    }
  }
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
  assert.equal(defaultModelFor("coffee", "openai/gpt-oss-120b"), "openai/gpt-oss-120b");
  assert.ok(SUPPORTED_MODELS.includes(COFFEE_DEFAULT_MODEL));
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
  const repair = buildCoffeeRepairMessages(messages, fields, [{ field: "story", severity: "error", message: "тест" }]);
  assert.ok(repair.length > messages.length);
  const schema = coffeeArticleSchema();
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes("story") && schema.required.includes("bridge"));
});

test("tone sample is verbatim from the reference article", () => {
  const reference = readFileSync(join(root, COFFEE.articlesDir, `${COFFEE.referenceSlug}.ts`), "utf8");
  const sample = toneSample();
  const strings = JSON.stringify(sample).match(/"(?:[^"\\]|\\.)*"/g).map((s) => JSON.parse(s)).filter((s) => s.length > 40);
  assert.ok(strings.length >= 5);
  for (const s of strings) assert.ok(reference.includes(JSON.stringify(s).slice(1, -1)), `не из эталона: ${s.slice(0, 60)}`);
});

// ── rules ────────────────────────────────────────────────────────────────────

test("reference + composite story passes all coffee rules", () => {
  assert.deepEqual(check(fields), []);
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
  assert.equal(normalizeText("а \u2014 б - в"), "а – б – в");
  assert.deepEqual(parseInline("см. [атлас](/b/atlas-kofeen) тут"), ["см. ", { href: "/b/atlas-kofeen", label: "атлас" }, " тут"]);
});

const NEGATIVES = [
  ["em dash survives only if not normalised – a Latin word fails", (f) => { f.partOne[0].paragraphs[0] += " Это эспрессо blend."; }, /латиница/],
  ["«точка» instead of «кофейня»", (f) => { f.partTwo[0].paragraphs[0] += " Каждая точка выбирает своё зерно."; }, /точка/],
  ["«точка безубыточности»", (f) => { f.partTwo[0].paragraphs[0] += " Так быстрее достигается точка безубыточности."; }, /точка/],
  ["«Редакция»", (f) => { f.bridge += " Редакция советует не спешить."; }, /Редакция/],
  ["player/comments", (f) => { f.partTwo[1].paragraphs[0] += " Включите плеер с музыкой."; }, /плеер/],
  ["negative priming", (f) => { f.partTwo[1].paragraphs[0] += " Гости испытывают дискомфорт."; }, /негативн/],
  ["external link", (f) => { f.partOne[1].paragraphs[0] += " Подробнее – [здесь](https://example.com/coffee)."; }, /запрещённая ссылка/],
  ["link not from the brief", (f) => { f.partOne[1].paragraphs[0] += " Подробнее – [здесь](/b/other)."; }, /нет в брифе/],
  ["raw address in text", (f) => { f.partOne[1].paragraphs[0] += " Пишите на сайт www.coffee.ru."; }, /адрес сайта/],
  ["named person in the story", (f) => { f.story[2] = f.story[2].replace("первый гость", "гость Иван"); }, /имя/],
  ["story without dialogue", (f) => { f.story = f.story.map((p) => p.replace(/«[^»]*»/g, "это").replace(/^– /gm, "")); }, /диалог/],
  ["story too short", (f) => { f.story = f.story.slice(0, 2); }, /история/],
  ["story not in first person", (f) => { f.story = ["Утро было светлым и тихим, кофе пах карамелью и орехами, бариста улыбалась каждому гостю у стойки.", "– Попробуете? – спросила бариста.\n– Конечно, – ответил гость.", "Гость сказал: «Это особенный кофе». Бариста кивнула: «Спасибо, мы старались»."]; }, /первого лица|история/],
  ["bridge without the query", (f) => { f.bridge = "Дальше – спокойный разбор."; }, /мостик/],
  ["table row length mismatch", (f) => { f.table.rows[0] = f.table.rows[0].slice(0, 2); }, /значений/],
  ["only 2 FAQ", (f) => { f.faq = f.faq.slice(0, 2); }, /вопросов/],
  ["4 checklist items", (f) => { f.checklist.items = f.checklist.items.slice(0, 4); }, /пунктов/],
  ["one section in part two missing", (f) => { f.partTwo = f.partTwo.slice(0, 2); }, /3 раздела/],
  ["seoTitle without the query at start", (f) => { f.seoTitle = "Как выбрать зерно для кофейни"; }, /seoTitle/],
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
  const next = registerArticles(source, ["barnaya-stoyka-dlya-kofeyni"]);
  assert.match(next, /import \{ BARNAYA_STOYKA_DLYA_KOFEYNI \} from "\.\/articles\/barnaya-stoyka-dlya-kofeyni";/);
  assert.match(next, /\[KOFE_V_ZERNAH_DLYA_KOFEYNI, BARNAYA_STOYKA_DLYA_KOFEYNI\]/);
  assert.throws(() => registerArticles(next, ["barnaya-stoyka-dlya-kofeyni"]), /уже/);
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
