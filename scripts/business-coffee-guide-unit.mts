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
assert.equal(MUZYKA_DLYA_KOFEYNI.relatedQueries.every((item) => item.frequency === null), true);

const visible = collectArticleText(MUZYKA_DLYA_KOFEYNI).join("\n");
assert.equal(visible.includes("\u2014"), false, "visible article text uses an en dash, not an em dash");
assert.equal(visible.includes("http://") || visible.includes("https://"), false);

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
assert.match(cups, /role="tablist"/);
assert.match(cups, /Четыре чашки/);
assert.match(checklist, /localStorage/);
assert.match(checklist, /type="checkbox"/);
assert.match(track, /HomeProductPlayButton/);
assert.match(track, /Оставить впечатление о треке/);
assert.match(view, /data-coffee-guide="article"/);
assert.match(expertsView, /blockquote/);
assert.equal(expertsView.includes("sourceUrl"), false);
assert.equal(expertsView.includes("competenceUrl"), false);

assert.ok(existsSync(join(root, "src/app/(platform)/b/coffee/page.tsx")));
assert.ok(existsSync(join(root, "src/app/(platform)/b/coffee/[slug]/page.tsx")));
assert.ok(existsSync(join(root, "docs/business/coffee-guides/TEMPLATE.md")));
assert.match(read("src/app/(platform)/b/coffee/[slug]/page.tsx"), /loadGuideTrack/);
assert.doesNotMatch(read("src/app/(platform)/b/atlas-kofeen/[slug]/page.tsx"), /vertical-guides/);
