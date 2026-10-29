/**
 * Reference B2B coffee article /b/coffee/kofe-v-zernah-dlya-kofeyni («Кофе в зёрнах для кофейни»).
 * It replaced the pilot /b/coffee/muzyka-dlya-kofeyni (301 in next.config.ts).
 * Route must not collide with the atlas or reserved venue landings.
 * Expert quotes and portraits come only from the checked registry. No outgoing links except MAX.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as GuideArticleViewModule from "../src/components/business/vertical-guides/GuideArticleView";

import { COFFEE_ATLAS_SHOPS } from "../src/lib/business/coffee-atlas/shops";
import { KOFE_V_ZERNAH_DLYA_KOFEYNI } from "../src/lib/business/vertical-guides/articles/kofe-v-zernah-dlya-kofeyni";
import { ATLAS_CARD_NAMES_RU, ATLAS_CARD_THEMES } from "../src/lib/business/vertical-guides/atlas-card-themes";
import {
  FOUR_CUPS_FINAL_IMAGE,
  FOUR_CUPS_MAX_HREF,
  FOUR_CUPS_MAX_LABEL,
  FOUR_CUPS_SLIDES,
} from "../src/lib/business/vertical-guides/four-cups";
import {
  assertCoffeeExpertRegistry,
  COFFEE_EXPERTS,
  countExperts,
  expertQuote,
  getCoffeeExpert,
  HAS_LATIN,
} from "../src/lib/business/vertical-guides/experts";
import { buildVerticalArticleMetadata } from "../src/lib/business/vertical-guides/metadata";
import { buildVerticalArticleJsonLd } from "../src/lib/business/vertical-guides/json-ld";
import {
  buildVerticalGuideRedirects,
  VERTICAL_GUIDE_LEGACY_REDIRECTS,
} from "../src/lib/business/vertical-guides/legacy-redirects";
import {
  articlePath,
  collectArticleHrefs,
  collectArticleText,
  getVerticalArticle,
  listVerticalArticles,
} from "../src/lib/business/vertical-guides/registry";
import { listVerticalGuideSitemapPaths } from "../src/lib/business/vertical-guides/sitemap";
import {
  B2B_VERTICALS,
  RESERVED_B_PATHS,
  verticalPathConflicts,
} from "../src/lib/business/vertical-guides/verticals";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const ARTICLE = KOFE_V_ZERNAH_DLYA_KOFEYNI;
const EM_DASH = "\u2014";

// ---------- Expert registry ----------
assertCoffeeExpertRegistry();
const counts = countExperts();
assert.equal(counts.foreignMen, 5);
assert.equal(counts.foreignWomen, 5);
assert.equal(counts.russianWomen, 1);
assert.equal(counts.russianMen, 1);
assert.equal(counts.total, 12);
assert.equal(counts.women, 6);
assert.equal(counts.men, 6);

for (const expert of COFFEE_EXPERTS) {
  // Owner rule 2026-10-29: only experts with a real portrait, no initials placeholders.
  assert.ok(expert.photo?.file, `${expert.id} has a real portrait`);
  assert.equal(HAS_LATIN.test(expert.photo.credit), false, `${expert.id} credit is Russian only`);
  assert.equal(HAS_LATIN.test(expert.name + expert.role), false, `${expert.id} name and role are Russian only`);
  const photo = join(root, "public", expert.photo.file);
  assert.ok(existsSync(photo), `${expert.id} photo`);
  assert.ok(statSync(photo).size > 5_000 && statSync(photo).size < 260_000, `${expert.id} photo size`);
  assert.match(expert.photo.file, /^\/business\/coffee-guides\/experts\/[a-z0-9-]+\.(jpg|webp)$/);
}
assert.equal(getCoffeeExpert("dmitry-borodai"), null, "no expert without a portrait");
assert.equal(read("src/content/business/coffee-experts.registry.json").includes(EM_DASH), false);

// ---------- Routing ----------
assert.equal(listVerticalArticles().length, 1, "reference article is the only article");
assert.equal(listVerticalArticles("restaurants").length, 0);
assert.deepEqual(getVerticalArticle("coffee", "kofe-v-zernah-dlya-kofeyni"), ARTICLE);
assert.equal(getVerticalArticle("coffee", "muzyka-dlya-kofeyni"), null, "old slug is only a redirect");
assert.equal(articlePath(ARTICLE), "/b/coffee/kofe-v-zernah-dlya-kofeyni");
assert.deepEqual(VERTICAL_GUIDE_LEGACY_REDIRECTS, [
  { source: "/b/coffee/muzyka-dlya-kofeyni", destination: "/b/coffee/kofe-v-zernah-dlya-kofeyni" },
]);
for (const redirect of buildVerticalGuideRedirects()) {
  assert.equal(redirect.statusCode, 301);
  assert.ok(listVerticalArticles().some((article) => articlePath(article) === redirect.destination));
}
const nextConfig = read("next.config.ts");
assert.match(nextConfig, /async redirects\(\)\s*\{[\s\S]*?buildVerticalGuideRedirects\(\)/);
assert.match(nextConfig, /from "\.\/src\/lib\/business\/vertical-guides\/legacy-redirects"/);
assert.equal(verticalPathConflicts("/b/coffee"), false);
assert.equal(verticalPathConflicts("/b/atlas-kofeen"), true);
assert.equal(verticalPathConflicts("/b/restaurants"), true);
assert.equal(verticalPathConflicts("/b/bars"), true);
assert.equal(verticalPathConflicts("/b/cafe"), true);

for (const vertical of B2B_VERTICALS) {
  assert.equal(verticalPathConflicts(vertical.path), false, vertical.path);
  if (vertical.reservedVenuePath) {
    assert.notEqual(vertical.path, vertical.reservedVenuePath);
    assert.ok(RESERVED_B_PATHS.includes(vertical.reservedVenuePath as (typeof RESERVED_B_PATHS)[number]));
  }
}
assert.equal(B2B_VERTICALS.filter((item) => item.status === "active").length, 1);

// ---------- SEO data ----------
const atlasSlugs = new Set<string>(COFFEE_ATLAS_SHOPS.map((shop) => shop.slug));
assert.equal(atlasSlugs.has(ARTICLE.slug), false);
const query = ARTICLE.primaryQuery;
assert.equal(query, "кофе в зёрнах для кофейни");
const hasQuery = (value: string) => value.toLocaleLowerCase("ru").includes(query);
assert.equal(hasQuery(ARTICLE.title), true);
assert.equal(hasQuery(ARTICLE.seoTitle), true);
assert.equal(hasQuery(ARTICLE.description), true);
assert.equal(hasQuery(ARTICLE.intro[0] ?? ""), true, "intro opens with the primary query");
assert.equal(hasQuery(ARTICLE.hero.alt), true, "hero alt carries the query");
assert.equal(hasQuery(FOUR_CUPS_FINAL_IMAGE.alt), true, "final image alt carries the query");
assert.ok(
  [...ARTICLE.partOne, ...ARTICLE.partTwo, ARTICLE.table].filter((section) => /кофе в зёрнах|зерн|зёрн/i.test(section.heading)).length >= 2,
  "some H2 mention the grain",
);
assert.ok(ARTICLE.seoTitle.length <= 70, ARTICLE.seoTitle);
assert.ok(ARTICLE.description.length >= 80 && ARTICLE.description.length <= 180);
assert.ok(ARTICLE.faq.length >= 5 && ARTICLE.faq.length <= 7, "FAQ has 5-7 items");
assert.equal(ARTICLE.checklist.items.length, 5);
assert.ok(ARTICLE.steps.items.length === 3, "three steps");
for (const row of ARTICLE.table.rows) {
  assert.equal(row.length, ARTICLE.table.columns.length, row[0]);
}
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === "\"") {
        if (line[index + 1] === "\"") {
          current += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

const candidateCsv = read("docs/business/coffee-guides/wordstat-candidates.csv").trim().split("\n");
assert.equal(candidateCsv[0], "priority,theme,query,monthly_frequency");
assert.equal(candidateCsv.length - 1, 838, "candidate rows");
const candidateRows = candidateCsv.slice(1).map((line) => {
  const cells = parseCsvLine(line);
  assert.equal(cells.length, 4, line);
  const [priority, theme, query, frequency] = cells;
  assert.ok(priority && theme && query);
  assert.match(priority ?? "", /^P[1-4]$/);
  return { priority, theme, query, frequency: Number(frequency) };
});
const frequencyOf = (query: string) => {
  const row = candidateRows.find((item) => item.query === query);
  assert.ok(row, query);
  return row.frequency;
};
assert.equal(frequencyOf("музыка для кофеен"), 1829);
assert.equal(frequencyOf("музыка для кофейни"), 1729);
assert.equal(candidateRows.filter((row) => row.priority === "P1").length, 40);
assert.equal(candidateRows.filter((row) => row.priority === "P2").length, 519);
assert.equal(candidateRows.filter((row) => row.priority === "P3").length, 259);
assert.equal(candidateRows.filter((row) => row.priority === "P4").length, 20);
assert.equal(
  candidateRows.filter((row) => row.priority === "P1").reduce((sum, row) => sum + row.frequency, 0),
  7273,
);
for (const item of ARTICLE.relatedQueries) {
  assert.equal(item.frequency, frequencyOf(item.phrase), item.phrase);
}
assert.deepEqual(
  ARTICLE.relatedQueries.map((item) => [item.phrase, item.frequency]),
  [
    ["кофе в зернах для кофейни", 161],
    ["кофе в зернах для кофеен", 273],
    ["кофе для кофеен зерновой", 104],
    ["кофейные зерна для кофейни", 74],
  ],
);
assert.equal(candidateRows.some((row) => row.query.toLocaleLowerCase("ru").includes("отсеяно")), false);

// ---------- Visible text ----------
const visible = collectArticleText(ARTICLE).join("\n");
const visibleLower = visible.toLocaleLowerCase("ru");
assert.doesNotMatch(visible, /пилот/i, "article visible text has no pilot wording");
for (const vertical of B2B_VERTICALS) {
  assert.doesNotMatch([vertical.title, vertical.kicker, vertical.intro].join("\n"), /пилот/i);
}
assert.equal(visible.includes(EM_DASH), false, "visible article text uses an en dash, not an em dash");
assert.equal(visible.includes("http://") || visible.includes("https://"), false);
assert.equal(/www\.|\.ru\b|\.com\b/i.test(visible), false, "sources are named in plain text, no addresses");
for (const banned of ["джаз", "плейлист", "трек", "слушать онлайн", "Джоффман", "Хоффман"]) {
  assert.equal(visibleLower.includes(banned.toLocaleLowerCase("ru")), false, banned);
}
const keywordHits = visibleLower.split(query).length - 1;
assert.ok(keywordHits >= 3 && keywordHits <= 10, `primary query used ${keywordHits} times: present, not stuffed`);
const coffeeVertical = B2B_VERTICALS.find((vertical) => vertical.id === "coffee");
assert.ok(coffeeVertical?.byline);
assert.equal(coffeeVertical.byline, "АудиоЛад Кофейни");
assert.equal(coffeeVertical.title, "Музыка для кофейни");
assert.doesNotMatch(coffeeVertical.byline, /Редакция/i);
for (const vertical of B2B_VERTICALS.filter((item) => item.status === "planned")) {
  assert.equal(vertical.byline, undefined);
}

// ---------- Links: internal only ----------
const hrefs = collectArticleHrefs(ARTICLE);
assert.ok(hrefs.length >= 5);
for (const href of hrefs) {
  assert.equal(href.startsWith("/"), true, href);
  assert.equal(href.startsWith("//"), false, href);
}
for (const required of ["/b/atlas-kofeen", "/b/atlas-kofeen/coffee-collective", "/b/atlas-kofeen/la-colombe"]) {
  assert.ok(hrefs.includes(required), required);
}
for (const link of ARTICLE.readMore) {
  assert.equal(link.href.startsWith("/"), true, link.href);
}

// ---------- Experts: one Russian-speaking man, one English-speaking woman ----------
assert.deepEqual([ARTICLE.expertOne.expertId, ARTICLE.expertTwo.expertId], ["dmitry-kotov", "sunalini-menon"]);
const slotExperts = [ARTICLE.expertOne, ARTICLE.expertTwo].map((slot) => {
  const expert = getCoffeeExpert(slot.expertId);
  assert.ok(expert, slot.expertId);
  const quote = expertQuote(expert, slot.quoteIndex);
  assert.equal(quote.text.includes(EM_DASH), false, "quote shown on the page must not contain an em dash");
  assert.ok(quote.sourceLabel, `${expert.id} has a plain-text source label`);
  assert.equal(/https?:/.test(quote.sourceLabel ?? ""), false);
  assert.equal(HAS_LATIN.test(quote.sourceLabel ?? ""), false, `${expert.id} source label is Russian only`);
  for (const paragraph of [...slot.lead, ...slot.after]) {
    const text = paragraph.map((part) => (typeof part === "string" ? part : part.label)).join("");
    assert.equal(text.includes(quote.text), false, "editor text does not repeat the quote");
  }
  if (quote.language && quote.language !== "ru") {
    assert.ok(slot.translation, `${expert.id} foreign quote needs a translation`);
  } else {
    assert.equal(slot.translation, undefined);
  }
  return { expert, quote };
});
assert.equal(slotExperts[0]?.expert.gender, "man");
assert.equal(slotExperts[0]?.quote.language, "ru");
assert.equal(slotExperts[1]?.expert.gender, "woman");
assert.equal(slotExperts[1]?.quote.language, "en");
assert.equal(slotExperts[0]?.expert.photo.file, "/business/coffee-guides/experts/dmitry-kotov.webp");
assert.equal(slotExperts[0]?.expert.photo.license, "CC BY-SA 4.0");
assert.ok(slotExperts[1]?.expert.photo.credit, "Menon portrait has a licence credit");

// ---------- JSON-LD and sitemap ----------
const structuredData = buildVerticalArticleJsonLd(ARTICLE);
const jsonLd = JSON.stringify(structuredData);
const graph = structuredData["@graph"] as Array<Record<string, unknown>>;
const articleNode = graph.find((node) => node["@type"] === "Article");
assert.deepEqual(articleNode?.author, {
  "@type": "Organization",
  name: "АудиоЛад Кофейни",
  url: (articleNode?.url as string).replace(/\/kofe-v-zernah-dlya-kofeyni$/, ""),
});
assert.match(jsonLd, /"@type":"Article"/);
assert.match(jsonLd, /"@type":"FAQPage"/);
assert.match(jsonLd, /"@type":"BreadcrumbList"/);
const breadcrumb = graph.find((node) => node["@type"] === "BreadcrumbList");
const crumbNames = (breadcrumb?.itemListElement as Array<{ name: string }>).map((item) => item.name);
assert.deepEqual(crumbNames, ["Главная", "Музыка для кофейни", ARTICLE.title]);
assert.equal(jsonLd.includes("АудиоЛад Бизнес"), false);
const faqNode = graph.find((node) => node["@type"] === "FAQPage");
assert.equal((faqNode?.mainEntity as unknown[]).length, ARTICLE.faq.length);
assert.equal(jsonLd.includes(EM_DASH), false);
assert.doesNotMatch(jsonLd, /пилот/i);

assert.deepEqual(listVerticalGuideSitemapPaths(), ["/b/coffee", "/b/coffee/kofe-v-zernah-dlya-kofeyni"]);
assert.match(read("src/lib/seo/sitemap-data.ts"), /listVerticalGuideSitemapPaths/);

// ---------- View: fixed block order ----------
const guideDir = "src/components/business/vertical-guides";
const view = read(`${guideDir}/GuideArticleView.tsx`);
assert.doesNotMatch(view, /пилот/i);
assert.doesNotMatch(view, /article\.hero\./, "hero data is reserved for metadata, not the article header");
assert.doesNotMatch(view, /АудиоЛад Бизнес/, "no «АудиоЛад Бизнес» in header or crumbs");
assert.doesNotMatch(view, /PracticeComments|GuideTrack|GuideExperts|COFFEE_ATLAS_OFFER|guide-band|Tortoni/);
assert.match(view, /Атлас: 10 удивительных кофеен мира/);
const hero = view.match(/<section className="guide-hero"[\s\S]*?<\/section>/)?.[0];
assert.ok(hero, "article has a title section");
assert.match(hero, /aria-labelledby="guide-title"/);
assert.match(hero, /<h1 id="guide-title" className="guide-display">\s*\{article\.title\}\s*<\/h1>/);
assert.doesNotMatch(hero, /<Image/);
assert.match(hero, /<\/h1>\s*\{vertical\?\.byline && <p className="guide-byline">\{vertical\.byline\}<\/p>\}/);
assert.ok(view.indexOf('className="guide-wrap guide-crumbs"') < view.indexOf(hero));
const order = [
  "article.intro.map",
  "<GuideFourCups",
  "<GuideSections sections={[article.partOne[0]]}",
  "<GuideAtlasHeroBanner",
  "<GuideSections sections={[article.partOne[1]]}",
  "<GuideTable",
  "<GuideSections sections={[article.partTwo[0]]}",
  "<GuideExpertCard slot={article.expertOne}",
  "<GuideSections sections={[article.partTwo[1]]}",
  "<GuideAtlasCardsBanner",
  "<GuideSections sections={[article.partTwo[2]]}",
  "<GuideExpertCard slot={article.expertTwo}",
  "<GuideSteps",
  "<GuideChecklist",
  "<GuideFaq",
  "<GuideFinalCups",
  "<GuideReadMore",
];
let previous = view.indexOf(hero);
for (const marker of order) {
  const at = view.indexOf(marker);
  assert.ok(at > previous, `block order: ${marker}`);
  previous = at;
}
assert.match(view, /data-coffee-guide="article"/);
assert.match(view, /Адрес материала: \{path\}\./);

const componentFiles = readdirSync(join(root, guideDir)).filter((file) => file.endsWith(".tsx"));
for (const file of componentFiles) {
  const source = read(`${guideDir}/${file}`);
  assert.equal(source.includes(EM_DASH), false, file);
  assert.equal(source.includes("https://"), false, `${file}: outgoing links live only in four-cups.ts`);
  assert.equal(source.includes("http://"), false, file);
  assert.equal(source.includes("sourceUrl"), false, file);
  assert.equal(source.includes("competenceUrl"), false, file);
}
for (const removed of ["GuideTrack.tsx", "GuideExperts.tsx"]) {
  assert.equal(existsSync(join(root, guideDir, removed)), false, removed);
}
assert.equal(existsSync(join(root, "src/lib/business/vertical-guides/load-track.ts")), false);

const css = read(`${guideDir}/guide.css`);
assert.doesNotMatch(css, /\.guide-hero__/);
assert.doesNotMatch(css, /guide-player|guide-band|guide-listen|guide-offer/);
assert.match(css, /\.guide-hero\s*\{[^}]*background: var\(--guide-bg\);[^}]*color: #4a2c1a;/);
assert.match(css, /\.guide-hero h1\s*\{[^}]*font-size: clamp\(2rem, 6vw, 3\.6rem\);/);
assert.match(css, /\.guide-byline\s*\{[^}]*color: var\(--guide-muted\);[^}]*font-size: 0\.88rem;/);
assert.match(css, /\.guide-block\s*\{\s*margin-top: clamp\(36px, 5vw, 52px\);/, "blocks keep at least paragraph spacing");
assert.match(css, /linear-gradient\(100deg, #5533ee, #7a33e4 55%, #9933dd\)/);
assert.match(css, /repeat\(5, minmax\(0, 1fr\)\)/, "ten atlas cards in five columns on desktop");

const cups = read(`${guideDir}/GuideFourCups.tsx`);
assert.match(cups, /aria-roledescription="carousel"/);
assert.match(cups, /Предыдущий слайд/);
assert.match(cups, /Следующий слайд/);
assert.match(cups, /\/ \{count\}/);
assert.match(cups, /<GuideMaxButton placement="slider" \/>/);
assert.doesNotMatch(cups, /role="tablist"/);
const maxButton = read(`${guideDir}/GuideMaxButton.tsx`);
assert.match(maxButton, /target="_blank"/);
assert.match(maxButton, /rel="noopener noreferrer"/);
assert.match(maxButton, /data-four-cups-max="true"/);
assert.match(maxButton, /\/school\/messengers\/max\.png/);
assert.match(read(`${guideDir}/GuideFinalCups.tsx`), /<GuideMaxButton placement="final" \/>/);
assert.equal(FOUR_CUPS_MAX_LABEL, "Выбрать чашку и узнать характер кофейни в Максе");
const slideSource = read("src/lib/business/vertical-guides/four-cups.ts");
assert.equal(slideSource.includes(EM_DASH), false);
assert.equal(slideSource.includes("http://"), false);
assert.equal(slideSource.split("https://").length - 1, 1);
assert.equal(FOUR_CUPS_MAX_HREF, "https://max-potok.ru/r/gqwvf");
assert.equal(FOUR_CUPS_SLIDES.length, 7);
for (const slide of [...FOUR_CUPS_SLIDES, FOUR_CUPS_FINAL_IMAGE]) {
  assert.equal(slide.alt.includes(EM_DASH), false, slide.src);
  assert.ok(slide.alt.length > 20, slide.src);
  assert.ok(existsSync(join(root, "public", slide.src)), slide.src);
}
assert.equal(FOUR_CUPS_FINAL_IMAGE.src.endsWith("06-all-cups.jpg"), true);
assert.ok(existsSync(join(root, "public/school/messengers/max.png")));

const cardsBanner = read(`${guideDir}/GuideAtlasCardsBanner.tsx`);
assert.equal((cardsBanner.match(/<Link\b/g) ?? []).length, 1, "one link around the whole banner");
assert.match(cardsBanner, /10 кофеен – 10 характеров звучания/);
assert.match(cardsBanner, /-hero\.webp/);
for (const shop of COFFEE_ATLAS_SHOPS) {
  assert.ok(ATLAS_CARD_THEMES[shop.slug], shop.slug);
  assert.ok(existsSync(join(root, "public/business/atlas-kofeen", `${shop.slug}-hero.webp`)), shop.slug);
}
assert.equal(COFFEE_ATLAS_SHOPS.length, 10);
const heroBanner = read(`${guideDir}/GuideAtlasHeroBanner.tsx`);
assert.equal((heroBanner.match(/<Link\b/g) ?? []).length, 1);
assert.match(heroBanner, /Кофе · люди · города · вдохновение/);
assert.match(heroBanner, /Почему сюда возвращаются\?/);
assert.match(heroBanner, /cover\.webp/);

const checklist = read(`${guideDir}/GuideChecklist.tsx`);
assert.match(checklist, /localStorage/);
assert.match(checklist, /type="checkbox"/);
assert.match(checklist, /Отмечено/);
assert.match(checklist, /role="progressbar"/);
assert.match(checklist, /is-complete/);
const expertCard = read(`${guideDir}/GuideExpertCard.tsx`);
assert.match(expertCard, /blockquote/);
assert.match(expertCard, /Источник: /);
assert.match(expertCard, /Перевод с английского/);
assert.doesNotMatch(expertCard, /expertInitials|guide-expert__initials|Оригинал/);
assert.match(expertCard, /lang="ru"/);

const seriesPlan = read("docs/business/coffee-guides/SERIES-PLAN.md");
assert.equal(seriesPlan.includes("\u2014"), false);
assert.match(seriesPlan, /3 558/);
assert.match(seriesPlan, /1 829/);
assert.match(seriesPlan, /1 729/);
assert.match(seriesPlan, /838/);
for (const slug of [
  "otkrytie-kofeyni",
  "biznes-plan-kofeyni",
  "oborudovanie-dlya-kofeyni",
  "postavshchiki-dlya-kofeyni",
  "personal-kofeyni",
  "arenda-kofeyni",
  "formaty-kofeyni",
  "tovary-dlya-kofeyni",
  "uchet-i-dokumenty-kofeyni",
  "logotip-kofeyni",
  "menyu-kofeyni",
  "interer-kofeyni",
  "nazvanie-kofeyni",
  "marketing-kofeyni",
  "idei-kofeyni",
]) {
  assert.match(seriesPlan, new RegExp(`/b/coffee/${slug}`));
  assert.equal(getVerticalArticle("coffee", slug), null, slug);
}
assert.ok(existsSync(join(root, "src/app/(platform)/b/coffee/page.tsx")));
assert.ok(existsSync(join(root, "src/app/(platform)/b/coffee/[slug]/page.tsx")));
assert.ok(existsSync(join(root, "docs/business/coffee-guides/TEMPLATE.md")));
assert.doesNotMatch(read("src/app/(platform)/b/coffee/[slug]/page.tsx"), /loadGuideTrack/);
assert.doesNotMatch(read("src/app/(platform)/b/atlas-kofeen/[slug]/page.tsx"), /vertical-guides/);

// ---------- No Latin text on the page (owner rule 2026-10-29) ----------
// Only URL slugs may stay Latin. Expert names, credentials, sources, credits, quotes,
// atlas names and tags, labels and metadata are printed in Russian only.
for (const shop of COFFEE_ATLAS_SHOPS) {
  assert.ok(ATLAS_CARD_NAMES_RU[shop.slug], `${shop.slug} has a Russian name for the guide banner`);
}
const withoutPaths = (text: string) => text.replace(/\/b\/[a-z0-9/-]+/g, "");
for (const text of collectArticleText(ARTICLE)) {
  assert.equal(HAS_LATIN.test(withoutPaths(text)), false, `Latin in article text: ${text}`);
}
const metadata = buildVerticalArticleMetadata(ARTICLE);
for (const text of [metadata.title, metadata.description, metadata.openGraph?.title, metadata.openGraph?.description]) {
  if (typeof text === "string") assert.equal(HAS_LATIN.test(text), false, `Latin in metadata: ${text}`);
}
// tsx loads the .tsx component as CommonJS, so from this ESM test its default export arrives wrapped.
type GuideArticleViewComponent = typeof GuideArticleViewModule.default;
const moduleDefault = GuideArticleViewModule.default as GuideArticleViewComponent | { default: GuideArticleViewComponent };
const GuideArticleView = typeof moduleDefault === "function" ? moduleDefault : moduleDefault.default;
const pageHtml = renderToStaticMarkup(createElement(GuideArticleView, { article: ARTICLE }));
assert.equal(pageHtml.includes("guide-expert__initials"), false);
assert.equal(pageHtml.includes("Оригинал"), false, "no English original under a translation");
assert.ok(pageHtml.includes("dmitry-kotov.webp"));

// Every clickable link in the article body and inserts opens in a new tab.
const mainHtml = pageHtml.slice(pageHtml.indexOf('<main id="content">'), pageHtml.indexOf("</main>"));
const bodyHtml = mainHtml.slice(mainHtml.indexOf("</nav>") + "</nav>".length);
const bodyLinks = [...bodyHtml.matchAll(/<a\s[^>]*>/g)].map((match) => match[0]);
assert.ok(bodyLinks.length >= 5, `expected body links, got ${bodyLinks.length}`);
for (const tag of bodyLinks) {
  assert.ok(/\starget="_blank"/.test(tag), `body link must open in a new tab: ${tag}`);
  assert.ok(/\srel="noopener(?: noreferrer)?"/.test(tag), `body link needs rel="noopener": ${tag}`);
}
for (const required of ['data-guide-banner="atlas-hero"', 'data-guide-banner="atlas-cards"', 'data-max-placement="final"']) {
  assert.ok(bodyLinks.some((tag) => tag.includes(required)), `new-tab link missing: ${required}`);
}
// Whole article (top strip, crumbs, body, footer): only the rubric brand link and the plain crumbs to Home / rubric
// stay in the same tab; every other link, including the atlas link in the top strip, opens in a new tab.
const articleHtml = pageHtml.slice(pageHtml.indexOf("<article"), pageHtml.lastIndexOf("</article>"));
const crumbsHtml = articleHtml.slice(articleHtml.indexOf('<nav class="guide-wrap guide-crumbs"'), articleHtml.indexOf("</nav>", articleHtml.indexOf('<nav class="guide-wrap guide-crumbs"')));
const crumbLinks = [...crumbsHtml.matchAll(/<a\s[^>]*>/g)].map((match) => match[0]);
assert.deepEqual(crumbLinks.map((tag) => tag.match(/href="([^"]*)"/)?.[1]), ["/", "/b/coffee"]);
const sameTabAllowed = new Set([...crumbLinks, ...[...articleHtml.matchAll(/<a\s[^>]*class="guide-brand"[^>]*>/g)].map((match) => match[0])]);
const articleLinks = [...articleHtml.matchAll(/<a\s[^>]*>/g)].map((match) => match[0]);
for (const tag of articleLinks) {
  if (sameTabAllowed.has(tag)) {
    assert.equal(/\starget=/.test(tag), false, `brand and crumbs stay in the same tab: ${tag}`);
    assert.ok(/href="(?:\/|\/b\/coffee)"/.test(tag), `only Home / rubric may stay in the same tab: ${tag}`);
    continue;
  }
  assert.ok(/\starget="_blank"/.test(tag), `article link must open in a new tab: ${tag}`);
  assert.ok(/\srel="noopener(?: noreferrer)?"/.test(tag), `article link needs rel="noopener": ${tag}`);
}
const headerAtlas = articleLinks.find((tag) => tag.includes('data-guide-header-link="atlas"'));
assert.ok(headerAtlas && headerAtlas.includes('href="/b/atlas-kofeen"') && headerAtlas.includes('target="_blank"'), "top-strip atlas link opens in a new tab");
// The rubric page /b/coffee has its own copy of the top strip: its atlas link opens in a new tab too,
// and the rubric title is not squeezed by a ch limit.
const indexViewSource = read("src/components/business/vertical-guides/GuideIndexView.tsx");
assert.match(indexViewSource, /<Link href=\{COFFEE_ATLAS_PATH\} target="_blank" rel="noopener"/, "rubric top-strip atlas link opens in a new tab");
const guideCss = read("src/components/business/vertical-guides/guide.css");
assert.equal(/\.guide-index h1 \{[^}]*max-width:\s*\d/.test(guideCss), false, "rubric H1 has no max-width limit");
assert.ok(pageHtml.includes("sunalini-menon.webp"));
// Mobile tables: every cell carries its column name for the stacked-card layout.
for (const column of ARTICLE.table.columns) {
  assert.ok(pageHtml.includes(`data-label="${column}"`), `table cell label missing: ${column}`);
}
const pageText = pageHtml
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;|&#\d+;/g, " ");
assert.equal(HAS_LATIN.test(withoutPaths(pageText)), false, `Latin on the page: ${withoutPaths(pageText).match(/.{0,40}[A-Za-z].{0,40}/)?.[0]}`);
for (const [, value] of pageHtml.matchAll(/\s(?:alt|title|aria-label|placeholder)="([^"]*)"/g)) {
  assert.equal(HAS_LATIN.test(value ?? ""), false, `Latin in attribute: ${value}`);
}
