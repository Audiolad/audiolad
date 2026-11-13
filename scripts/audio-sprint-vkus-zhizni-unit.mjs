// АудиоСпринт «Вкус жизни» landing (Company Core eb792a06): static guards.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = "src/app/(platform)/(listener)/vkus-zhizni/page.tsx";
const layoutPath = "src/app/(platform)/(listener)/vkus-zhizni/layout.tsx";
assert.ok(existsSync(path.join(root, pagePath)));
assert.ok(existsSync(path.join(root, layoutPath)));
const page = readFileSync(path.join(root, pagePath), "utf8");

// Content rules: en dash only, no outgoing links, no seasonal autumn accent.
assert.doesNotMatch(page, /\u2014/, "em dash is not allowed");
assert.doesNotMatch(page, /https?:\/\//, "no outgoing links");
assert.doesNotMatch(page, /осен/i, "no autumn accent");
assert.doesNotMatch(page, /и практики/, "categories are exactly «Музыка» and «Медитации»");

// Approved hero and facts.
for (const text of [
  "Вкус жизни",
  "АудиоСпринт для авторов АудиоЛада",
  "14–29 ноября 2026 года",
  "У каждого момента жизни есть своё звучание",
  "Именно этому посвящён наш новый АудиоСпринт – «Вкус жизни».",
  "16 дней",
  "на создание и публикацию",
  "на старте спринта",
  "const SPRINT_START_QUERY_COUNT = AUDIO_SPRINT_VKUS_ZHIZNI_QUERY_COUNT;",
  "6 000 ₽",
  "3 000 ₽",
  "2 000 ₽",
  "1 000 ₽",
  "до пяти броней одновременно",
  "Каждая бронь действует семь дней",
  "Каждый продукт – отдельный шанс",
  "Количество продуктов от одного автора не ограничено.",
  "10 продуктов",
  "Ограничение «до 5» относится только к количеству поисковых",
  "Три денежных приза",
  "После завершения «Вкус жизни» мы проведём розыгрыш",
  "не более одного денежного",
  "Розыгрыш состоится",
  'const RAFFLE_DATE = "30 ноября 2026 года";',
  "Давайте вместе наполним жизнь красивым звучанием!",
  "АудиоЛад – пусть жизнь звучит красиво!",
]) {
  assert.ok(page.includes(text), `missing: ${text}`);
}

// Raffle date is the owner's fact (t1418u): 30 November 2026, defined once.
assert.equal((page.match(/ноября 2026 года"/g) ?? []).length, 1);
assert.doesNotMatch(page, /будет объявлена позже/);
assert.equal((page.match(/Каждый продукт – отдельный шанс/g) ?? []).length, 1);

// Hero stats follow the /osen-zvuchit format; the query count is one constant.
assert.equal((page.match(/SPRINT_START_QUERY_COUNT/g) ?? []).length, 2);
assert.doesNotMatch(page, /2 направления/);
assert.match(page, /Музыка для расслабления, джаз для кофеен, музыка для отдыха и\s+приятных моментов жизни\./, "music card text (t1430u)");
assert.doesNotMatch(page, /танго|при наличии всех|правами на музыку/, "no tango / music rights caveat (t1430u)");
assert.match(page, /<GiftIcon tone=\{index\}/);

// Decorations: inline SVG only, hidden from assistive tech.
const decor = readFileSync(path.join(root, "src/app/(platform)/(listener)/vkus-zhizni/decor.tsx"), "utf8");
assert.doesNotMatch(decor, /https?:\/\/(?!www\.w3\.org)/);
assert.doesNotMatch(decor, /<img|<image|url\(/);
assert.equal((decor.match(/<svg/g) ?? []).length, (decor.match(/aria-hidden="true"/g) ?? []).length);

// Approved list (t1427u): static page data, 265 = 139 music + 126 meditations (t1429u: one removed), CTA to the cabinet sprint.
const queriesSrc = readFileSync(path.join(root, "src/app/(platform)/(listener)/vkus-zhizni/queries.ts"), "utf8");
const listSrc = readFileSync(path.join(root, "src/app/(platform)/(listener)/vkus-zhizni/QueryList.tsx"), "utf8");
const block = (name) => queriesSrc.split(`export const ${name}`)[1].split("];")[0];
const musicItems = block("VKUS_ZHIZNI_MUSIC_QUERIES").match(/^  ".*",$/gm) ?? [];
const voiceItems = block("VKUS_ZHIZNI_MEDITATION_QUERIES").match(/^  ".*",$/gm) ?? [];
assert.equal(musicItems.length, 139);
assert.equal(voiceItems.length, 126);
assert.equal(new Set([...musicItems, ...voiceItems].map((s) => s.toLowerCase())).size, 265);
assert.doesNotMatch(queriesSrc, /\u2014/);
const sprintLib = readFileSync(path.join(root, "src/lib/seo-queries/audio-sprint.ts"), "utf8");
assert.match(sprintLib, /AUDIO_SPRINT_VKUS_ZHIZNI_QUERY_COUNT = 265;/);
assert.match(sprintLib, /AUDIO_SPRINT_VKUS_ZHIZNI_SLUG = "vkus-zhizni-2026";/);
assert.doesNotMatch(page, /Список готовится/);
assert.match(page, /<VkusZhizniQueryList bookingHref=\{SPRINT_HREF\} \/>/);
assert.match(page, /const SPRINT_HREF = `\/author-dashboard\/audio-sprints\/\$\{AUDIO_SPRINT_VKUS_ZHIZNI_SLUG\}`;/);
assert.doesNotMatch(page, /osen-zvuchit-2026/, "no link into the October sprint data");
assert.match(listSrc, /Показать все/);
assert.match(listSrc, /Поиск по запросам/);
assert.doesNotMatch(listSrc, /frequency|частотн/i, "the landing list shows no frequency");
assert.doesNotMatch(listSrc, /\u2014/);

// Seed migration: own sprint, 266 initial queries, idempotent, October sprint untouched.
const migration = readFileSync(path.join(root, "supabase/migrations/20270306120000_seo_sprint_vkus_zhizni_seed.sql"), "utf8");
assert.match(migration, /VALUES \('vkus-zhizni-2026', 'Вкус жизни'\)\nON CONFLICT \(slug\) DO UPDATE/);
assert.match(migration, /ON CONFLICT \(normalized_query\) DO UPDATE SET/);
assert.match(migration, /ON CONFLICT \(sprint_id, query_id\) DO UPDATE SET/);
assert.match(migration, /v_total <> 266 OR v_music <> 140 OR v_voice <> 126/);
assert.doesNotMatch(migration, /osen-zvuchit|DELETE |DROP |TRUNCATE /i);
assert.match(migration, /WHERE NOT EXISTS \(\n  SELECT 1\n  FROM public\.seo_sprint_queries AS other_sq/, "rows shared with another sprint stay unchanged");
assert.equal((migration.match(/^  \('/gm) ?? []).length, 266);

// t1429u: one query removed from the landing and the database.
assert.ok(![...musicItems, ...voiceItems].some((s) => /бриля/i.test(s)), "removed query is not on the landing");
const removal = readFileSync(path.join(root, "supabase/migrations/20270307120000_seo_sprint_vkus_zhizni_remove_bril.sql"), "utf8");
assert.match(removal, /normalize_seo_query\('ансамбль современного джаза игоря бриля'\)/);
assert.match(removal, /seo_query_reservations WHERE query_id = v_query_id/);
assert.match(removal, /normalize_seo_query\('ансамбль современного джаза игоря бриля'\)\n[\s\S]*?FOR UPDATE;/, "query row is locked before the booking check");
assert.match(removal, /v_total <> 265 OR v_music <> 139 OR v_voice <> 126/);
assert.doesNotMatch(removal, /osen-zvuchit|DROP |TRUNCATE /i);
assert.equal((removal.match(/DELETE FROM/g) ?? []).length, 2);

// CTA leads to the real booking flow in the cabinet.
assert.equal((page.match(/Выбрать поисковый запрос/g) ?? []).length, 1);
assert.match(page, /<Link href=\{SPRINT_HREF\} className=\{primaryCtaClassName\}>/);

// The October sprint landing is unchanged by this task.
try {
  const diff = execFileSync(
    "git",
    ["diff", "--name-only", "origin/main...HEAD", "--", "src/app/(platform)/(listener)/osen-zvuchit"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  assert.equal(diff.trim(), "");
} catch (error) {
  if (error instanceof assert.AssertionError) throw error;
}

// Cabinet: highlighted tab, dashboard banner, title lock on both sprints.
const navSrc = readFileSync(path.join(root, "src/components/author-dashboard/AuthorDashboardNav.tsx"), "utf8");
assert.match(navSrc, /href: audioSprintHref\(authorSlug, AUDIO_SPRINT_VKUS_ZHIZNI_SLUG\)/);
assert.match(navSrc, /label: AUDIO_SPRINT_VKUS_ZHIZNI_NAV_LABEL/);
assert.match(navSrc, /const autumn = item\.label === AUTUMN_NAV_LABEL \|\| vkus;/);
assert.match(navSrc, /до 29 ноября/);
assert.match(sprintLib, /AUDIO_SPRINT_VKUS_ZHIZNI_NAV_LABEL = "Аудиоспринт «Вкус жизни»";/);
assert.match(sprintLib, /AUDIO_SPRINT_VKUS_ZHIZNI_PROMO_ENDS_AT = "2026-11-30T00:00:00\+03:00";/);
const dashSrc = readFileSync(path.join(root, "src/components/author-dashboard/AuthorDashboardClient.tsx"), "utf8");
assert.match(dashSrc, /\{vkusPromoVisible \? \(\s*<Link\s+href="\/vkus-zhizni"[\s\S]*?Вкус жизни · АудиоСпринт[\s\S]*?<\/Link>\s*\) : null\}/);
const listLib = readFileSync(path.join(root, "src/lib/seo-queries/list-audio-sprint-queries.ts"), "utf8");
assert.match(listLib, /\.in\("slug", \[\.\.\.AUDIO_SPRINT_ENABLED_SLUGS\]\)/);
const sprintPage = readFileSync(path.join(root, "src/app/(platform)/author-dashboard/audio-sprints/[slug]/page.tsx"), "utf8");
assert.match(sprintPage, /sprintSlug=\{listing\.sprint\.slug\}/);

// t1440u: step «Оформите продукт» with the /osen-zvuchit wording, placed after «Создайте…».
const osenPage = readFileSync(path.join(root, "src/app/(platform)/(listener)/osen-zvuchit/page.tsx"), "utf8");
const packagingBlock = (src) => src.split("const packagingItems = [")[1].split("];")[0];
assert.equal(packagingBlock(page), packagingBlock(osenPage), "packaging list matches /osen-zvuchit");
for (const text of [
  ">Оформите продукт<",
  "Название продукта должно <strong className=\"text-[#25135c]\">точно совпадать с выбранным",
  "поисковым запросом</strong>.",
  "<p>Для участия в спринте заполните основные элементы оформления:</p>",
  "В кабинете автора есть готовый промпт, который поможет",
  "подготовить оформление продукта с помощью ИИ.",
]) {
  assert.ok(page.includes(text), `packaging step: ${text}`);
  assert.ok(osenPage.includes(text.replace(">Оформите продукт<", 'title="Оформите продукт"')), `osen wording: ${text}`);
}
const stepsBlock = page.split("const steps = [")[1].split("];")[0];
const stepOrder = stepsBlock.split("\n").map((line) => line.trim()).filter(Boolean);
assert.equal(stepOrder.length, 6, "six steps");
assert.match(stepOrder[2], /^"Создайте тематический аудиопродукт/);
assert.equal(stepOrder[3], "PACKAGING_STEP,");
assert.match(stepOrder[4], /^"Опубликуйте продукт на АудиоЛаде/);
assert.match(page, /\{text === PACKAGING_STEP \? \(\s*<PackagingStep \/>/);

// t1440u: the cabinet prompt for a sprint booking keeps the title equal to the booked query.
const sprintClient = readFileSync(path.join(root, "src/components/author-dashboard/AuthorAudioSprintClient.tsx"), "utf8");
assert.match(sprintClient, /<AuthorSeoPromptBuilder\s+primaryQueryText=\{item\.queryText\}\s+primaryQueryId=\{item\.id\}\s+analyzedOpportunities=\{related\}\s+exactTitle\s*\/>/);
assert.doesNotMatch(sprintClient, /osen-zvuchit-2026|AUDIO_SPRINT_OSEN_ZVUCHIT_SLUG &&[^\n]*AuthorSeoPromptBuilder/);

// t1441u: «Условия участия» use the /osen-zvuchit exact-title condition.
const exactTitleCondition = '"название продукта точно совпадает с выбранным поисковым запросом;"';
assert.ok(osenPage.includes(exactTitleCondition), "osen exact-title condition");
const vkusConditions = page.split("const conditions = [")[1].split("];")[0];
assert.ok(vkusConditions.includes(exactTitleCondition), "vkus exact-title condition");
assert.doesNotMatch(page, /продукт отвечает выбранному поисковому запросу/);
assert.equal((vkusConditions.match(/^  ".*",$/gm) ?? []).length, 4, "four conditions");

console.log("audio-sprint-vkus-zhizni-unit: ok");
