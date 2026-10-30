/**
 * Desktop product hero must show the author once: as the purple link.
 * The grey meta line keeps only duration/stats («Зоя Петрова · 10 мин» → «10 мин»).
 * Mobile audio-post layout is intentionally unchanged.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPracticeHeroLightMeta,
  resolvePracticeHeroLightMetaRest,
} from "../src/lib/catalog/product-hero-gallery";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

const author = "Зоя Петрова";
const meta = buildPracticeHeroLightMeta({
  gallerySlides: [],
  productTypeLabel: "Аудиопост",
  formatMeta: "10 мин",
  authorName: author,
});
assert.equal(meta, "Зоя Петрова · 10 мин", "server meta starts with the author");
assert.equal(resolvePracticeHeroLightMetaRest(meta, author), "10 мин");
assert.equal(resolvePracticeHeroLightMetaRest("Сергей Петров · 3 мин", "Сергей Петров"), "3 мин");
assert.equal(resolvePracticeHeroLightMetaRest(author, author), null, "author-only meta → no grey line");
assert.equal(resolvePracticeHeroLightMetaRest("10 мин", null), "10 мин", "no author → meta as is");

// Audio post page: desktop block uses the de-duplicated meta, mobile untouched.
const page = read("src/components/products/audio-post/AudioPostPage.tsx");
const mobileStart = page.indexOf('<div className="xl:hidden">');
const desktopStart = page.indexOf('<div className="hidden xl:block">');
assert.ok(mobileStart > 0 && desktopStart > mobileStart, "mobile and desktop blocks exist");
const mobile = page.slice(mobileStart, desktopStart);
const desktop = page.slice(desktopStart);
assert.match(
  page,
  /const desktopMetaLine = resolvePracticeHeroLightMetaRest\(\s*viewModel\.meta,\s*authorName,\s*\)/,
);
assert.match(desktop, /<AuthorLink[\s\S]*?authorName=\{authorName\}/, "desktop keeps the author link");
assert.match(desktop, /\{desktopMetaLine\}/, "desktop grey line is the de-duplicated meta");
assert.doesNotMatch(desktop, /\{viewModel\.meta\}/, "desktop must not print raw meta with the author");
assert.match(mobile, /\{durationLabel\}/, "mobile still shows duration only");
assert.doesNotMatch(mobile, /desktopMetaLine/, "mobile layout is unchanged");

// Other product types: hero renders the linked author + rest of meta once.
const hero = read("src/components/products/practice-page/PracticeProductHero.tsx");
assert.match(hero, /resolvePracticeHeroLightMetaRest\(viewModel\.meta, authorName\)/);
const parts = read("src/components/products/practice-page/PracticePageParts.tsx");
assert.match(
  parts,
  /const meta = resolvePracticeHeroLightMetaRest\(viewModel\.meta, authorName\);/,
  "PracticeMetaSection does not repeat the author next to the link",
);

console.log("product-hero-author-dedupe-unit: ok");
