/**
 * f8e19d51: pilot B2B coffee article /b/coffee/muzyka-dlya-kofeyni.
 * Route must not collide with the atlas or reserved venue landings.
 * Expert quotes and portraits come only from the checked registry.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COFFEE_ATLAS_SHOPS } from "../src/lib/business/coffee-atlas/shops";
import { MUZYKA_DLYA_KOFEYNI } from "../src/lib/business/vertical-guides/articles/muzyka-dlya-kofeyni";
import { FOUR_CUPS_MAX_HREF, FOUR_CUPS_SLIDES } from "../src/lib/business/vertical-guides/four-cups";
import {
  assertCoffeeExpertRegistry,
  COFFEE_EXPERTS,
  countExperts,
  expertQuote,
  getCoffeeExpert,
} from "../src/lib/business/vertical-guides/experts";
import { buildVerticalArticleJsonLd } from "../src/lib/business/vertical-guides/json-ld";
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

assertCoffeeExpertRegistry();
const counts = countExperts();
assert.equal(counts.foreignMen, 5);
assert.equal(counts.foreignWomen, 5);
assert.equal(counts.russianWomen, 1);
assert.equal(counts.russianMen, 0);
assert.equal(counts.total, 11);
assert.equal(counts.women, 6);
assert.equal(counts.men, 5);

for (const expert of COFFEE_EXPERTS) {
  const photo = join(root, "public", expert.photo.file);
  assert.ok(existsSync(photo), `${expert.id} photo`);
  assert.ok(statSync(photo).size > 5_000 && statSync(photo).size < 260_000, `${expert.id} photo size`);
  assert.equal(expert.photo.file.endsWith(".jpg"), true);
}

assert.equal(listVerticalArticles().length, 1, "pilot is the only article");
assert.equal(listVerticalArticles("restaurants").length, 0);
assert.equal(getVerticalArticle("coffee", "muzyka-dlya-kofeyni"), MUZYKA_DLYA_KOFEYNI);
assert.equal(articlePath(MUZYKA_DLYA_KOFEYNI), "/b/coffee/muzyka-dlya-kofeyni");
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

const atlasSlugs = new Set<string>(COFFEE_ATLAS_SHOPS.map((shop) => shop.slug));
assert.equal(atlasSlugs.has(MUZYKA_DLYA_KOFEYNI.slug), false);
const query = MUZYKA_DLYA_KOFEYNI.primaryQuery;
const hasQuery = (value: string) => value.toLocaleLowerCase("ru").includes(query);
assert.equal(hasQuery(MUZYKA_DLYA_KOFEYNI.title), true);
assert.equal(hasQuery(MUZYKA_DLYA_KOFEYNI.seoTitle), true);
assert.equal(hasQuery(MUZYKA_DLYA_KOFEYNI.description), true);
assert.equal(MUZYKA_DLYA_KOFEYNI.leadIn.includes(query), true);
assert.ok(MUZYKA_DLYA_KOFEYNI.seoTitle.length <= 70, MUZYKA_DLYA_KOFEYNI.seoTitle);
assert.ok(MUZYKA_DLYA_KOFEYNI.description.length >= 80 && MUZYKA_DLYA_KOFEYNI.description.length <= 180);
assert.equal(MUZYKA_DLYA_KOFEYNI.cups.length, 4);
assert.equal(MUZYKA_DLYA_KOFEYNI.faq.length >= 4, true);
assert.deepEqual(MUZYKA_DLYA_KOFEYNI.track, {
  authorSlug: "jazz-relax",
  productSlug: "dzhaz-launzh",
});
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
for (const item of MUZYKA_DLYA_KOFEYNI.relatedQueries) {
  assert.equal(item.frequency, frequencyOf(item.phrase), item.phrase);
}
assert.equal(candidateRows.some((row) => row.query.toLocaleLowerCase("ru").includes("отсеяно")), false);

const visible = collectArticleText(MUZYKA_DLYA_KOFEYNI).join("\n");
assert.equal(visible.includes("\u2014"), false, "visible article text uses an en dash, not an em dash");
assert.equal(visible.includes("http://") || visible.includes("https://"), false);
assert.equal(visible.includes("Лена"), false);
assert.equal(visible.includes("Сначала реши, какой разговор ты хочешь"), false);
assert.equal(visible.includes("Если кофейня уже ваша"), true);
const visibleLower = visible.toLocaleLowerCase("ru");
for (const phrase of [
  "музыка для кофеен",
  "фоновая",
  "джаз",
  "без слов",
  "без авторских прав",
  "плейлист",
  "уютн",
  "спокойн",
  "утр",
  "вечер",
  "слушать онлайн",
  "атмосферн",
]) {
  assert.equal(visibleLower.includes(phrase), true, phrase);
}

const hrefs = collectArticleHrefs(MUZYKA_DLYA_KOFEYNI);
assert.ok(hrefs.length >= 8);
for (const href of hrefs) {
  assert.equal(href.startsWith("/"), true, href);
  assert.equal(href.startsWith("//"), false, href);
}
for (const required of [
  "/b",
  "/b/prava",
  "/b/coffee",
  "/b/atlas-kofeen",
  "/b/atlas-kofeen/fuglen-tokyo",
  "/b/atlas-kofeen/cafe-tortoni",
  "/b/atlas-kofeen/la-colombe",
  "/practice/jazz-relax/dzhaz-launzh",
]) {
  assert.ok(hrefs.includes(required), required);
}

for (const slot of MUZYKA_DLYA_KOFEYNI.experts) {
  const expert = getCoffeeExpert(slot.expertId);
  assert.ok(expert, slot.expertId);
  const quote = expertQuote(expert, slot.quoteIndex);
  assert.equal(slot.bridge.includes(quote.text), false);
  assert.equal(quote.text.includes("\u2014"), false, "quote shown on the page must not contain an em dash");
  if (slot.secondQuoteIndex !== undefined) {
    const second = expertQuote(expert, slot.secondQuoteIndex);
    assert.equal(second.text.includes("\u2014"), false);
  }
}
assert.deepEqual(
  MUZYKA_DLYA_KOFEYNI.experts.map((slot) => slot.expertId),
  ["anna-tsfasman", "howard-schultz"],
);

const jsonLd = JSON.stringify(buildVerticalArticleJsonLd(MUZYKA_DLYA_KOFEYNI));
assert.match(jsonLd, /"@type":"Article"/);
assert.match(jsonLd, /"@type":"FAQPage"/);
assert.match(jsonLd, /"@type":"BreadcrumbList"/);
assert.match(jsonLd, /Музыка для кофейни: как подобрать фон и создать атмосферу/);
assert.equal(jsonLd.includes("\u2014"), false);

assert.deepEqual(listVerticalGuideSitemapPaths(), [
  "/b/coffee",
  "/b/coffee/muzyka-dlya-kofeyni",
]);
assert.match(read("src/lib/seo/sitemap-data.ts"), /listVerticalGuideSitemapPaths/);

const view = read("src/components/business/vertical-guides/GuideArticleView.tsx");
const cups = read("src/components/business/vertical-guides/GuideFourCups.tsx");
const checklist = read("src/components/business/vertical-guides/GuideChecklist.tsx");
const expertsView = read("src/components/business/vertical-guides/GuideExperts.tsx");
const track = read("src/components/business/vertical-guides/GuideTrack.tsx");
for (const source of [view, cups, checklist, expertsView, track]) {
  assert.equal(source.includes("\u2014"), false);
  assert.equal(source.includes("https://"), false);
  assert.equal(source.includes("http://"), false);
}
assert.match(cups, /aria-roledescription="carousel"/);
assert.match(cups, /Четыре чашки/);
assert.match(cups, /Предыдущий слайд/);
assert.match(cups, /Следующий слайд/);
assert.match(cups, /target="_blank"/);
assert.match(cups, /rel="noopener noreferrer"/);
assert.match(cups, /data-four-cups-max="true"/);
assert.match(cups, /\/ \{count\}/);
assert.doesNotMatch(cups, /role="tablist"/);
const slideSource = read("src/lib/business/vertical-guides/four-cups.ts");
assert.equal(slideSource.includes("\u2014"), false);
assert.equal(slideSource.includes("http://"), false);
assert.equal(slideSource.split("https://").length - 1, 1);
assert.equal(FOUR_CUPS_MAX_HREF, "https://max-potok.ru/r/gqwvf");
assert.equal(FOUR_CUPS_SLIDES.length, 7);
for (const slide of FOUR_CUPS_SLIDES) {
  assert.equal(slide.alt.includes("\u2014"), false, slide.src);
  assert.ok(slide.alt.length > 20, slide.src);
  assert.ok(existsSync(join(root, "public", slide.src)), slide.src);
}
assert.ok(existsSync(join(root, "public/school/messengers/max.png")));
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
assert.match(checklist, /localStorage/);
assert.match(checklist, /type="checkbox"/);
assert.match(track, /HomeProductPlayButton/);
assert.match(track, /Оставить впечатление о треке/);
assert.match(view, /data-coffee-guide="article"/);
assert.match(view, /PracticeComments/);
assert.match(view, /id="guide-comments"/);
assert.equal(read("src/content/business/coffee-experts.registry.json").includes("\u2014"), false);
assert.match(expertsView, /blockquote/);
assert.equal(expertsView.includes("sourceUrl"), false);
assert.equal(expertsView.includes("competenceUrl"), false);

assert.ok(existsSync(join(root, "src/app/(platform)/b/coffee/page.tsx")));
assert.ok(existsSync(join(root, "src/app/(platform)/b/coffee/[slug]/page.tsx")));
assert.ok(existsSync(join(root, "docs/business/coffee-guides/TEMPLATE.md")));
assert.match(read("src/app/(platform)/b/coffee/[slug]/page.tsx"), /loadGuideTrack/);
assert.doesNotMatch(read("src/app/(platform)/b/atlas-kofeen/[slug]/page.tsx"), /vertical-guides/);
