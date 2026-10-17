/**
 * 085fdfb5: guest «Атлас звучания кофеен мира» (/b/atlas-kofeen).
 * Data integrity (10 shops from the PDF), shop → catalogue track mapping,
 * no fake playback, assets/PDF present, CTA into the existing guest path only,
 * offer on every page, SEO paths and Metrika goals.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCoffeeAtlasShopPath,
  COFFEE_ATLAS_CTA_HREF,
  COFFEE_ATLAS_CTA_LABEL,
  COFFEE_ATLAS_OFFER,
  COFFEE_ATLAS_PATH,
  COFFEE_ATLAS_PDF_PATH,
} from "../src/lib/business/coffee-atlas/constants";
import {
  buildCoffeeAtlasMusic,
  COFFEE_ATLAS_MAX_TRACKS_PER_SHOP,
  COFFEE_ATLAS_MUSIC,
  getCoffeeAtlasTrackRefs,
  resolveCoffeeAtlasTracks,
} from "../src/lib/business/coffee-atlas/music";
import {
  COFFEE_ATLAS_SHOPS,
  getCoffeeAtlasNeighbours,
  getCoffeeAtlasShop,
} from "../src/lib/business/coffee-atlas/shops";
import { COFFEE_ATLAS_SITEMAP_PATHS } from "../src/lib/business/coffee-atlas/sitemap";
import {
  isYandexMetrikaGoalName,
  YANDEX_METRIKA_BUSINESS_ATLAS_GOALS,
} from "../src/lib/analytics/yandex-metrika-goals";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

// --- shops ---
assert.equal(COFFEE_ATLAS_SHOPS.length, 10, "ten coffee shops");
const slugs = COFFEE_ATLAS_SHOPS.map((shop) => shop.slug);
assert.equal(new Set(slugs).size, 10, "unique slugs");
COFFEE_ATLAS_SHOPS.forEach((shop, index) => {
  assert.equal(shop.number, index + 1, `${shop.slug}: route order`);
  assert.match(shop.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${shop.slug}: url-safe slug`);
  assert.equal(shop.pdfPage, 2 + index * 3, `${shop.slug}: PDF page of its first slide`);
  assert.equal(shop.features.length, 3);
  assert.equal(shop.takeaways.length, 3);
  assert.ok(shop.soundIdea.length > 40, `${shop.slug}: sound idea from the PDF`);
  for (const file of [`${shop.slug}-hero.webp`, `${shop.slug}-1.webp`, `${shop.slug}-2.webp`, `${shop.slug}-3.webp`]) {
    const path = join(root, "public/business/atlas-kofeen", file);
    assert.ok(existsSync(path), `asset ${file}`);
    assert.ok(statSync(path).size < 260_000, `asset ${file} is web-optimised`);
  }
  assert.equal(getCoffeeAtlasShop(shop.slug), shop);
});
assert.equal(getCoffeeAtlasShop("unknown"), null);
assert.deepEqual(
  [getCoffeeAtlasNeighbours("caffe-florian")?.previous.slug, getCoffeeAtlasNeighbours("caffe-florian")?.next.slug],
  ["la-colombe", "cafe-de-flore"],
  "route loops 10 → 1",
);
assert.equal(getCoffeeAtlasNeighbours("la-colombe")?.next.slug, "caffe-florian");

// --- PDF gift ---
const pdf = join(root, "public", COFFEE_ATLAS_PDF_PATH);
assert.ok(existsSync(pdf), "full PDF atlas is published as a static file");
assert.equal(readFileSync(pdf).subarray(0, 5).toString(), "%PDF-");

// --- music mapping: every shop configured, only catalogue refs, easy to change ---
assert.deepEqual(Object.keys(COFFEE_ATLAS_MUSIC).sort(), [...slugs].sort(), "mapping covers exactly the ten shops");
for (const slug of slugs) {
  const refs = getCoffeeAtlasTrackRefs(slug);
  assert.ok(refs.length >= 1 && refs.length <= COFFEE_ATLAS_MAX_TRACKS_PER_SHOP, `${slug}: 1..3 examples`);
  for (const ref of refs) {
    assert.match(ref.authorSlug, /^[a-z0-9-]+$/);
    assert.match(ref.productSlug, /^[a-z0-9-]+$/);
    // 17.10.2026 owner decision: start with Jazz Relax.
    assert.equal(ref.authorSlug, "jazz-relax", `${slug}: initial examples are Jazz Relax`);
  }
}
assert.deepEqual(getCoffeeAtlasTrackRefs("nope"), []);

const published = [
  { id: "a", title: "Итальянский джаз", slug: "italyanskiy-dzhaz", authorSlug: "jazz-relax", authorName: "Jazz Relax", href: "/practice/jazz-relax/italyanskiy-dzhaz", coverUrl: null },
  { id: "b", title: "Другой автор", slug: "italyanskiy-dzhaz", authorSlug: "someone", authorName: "X", href: "/x", coverUrl: null },
  { id: "c", title: "Без аудио", slug: "silent", authorSlug: "jazz-relax", authorName: "Jazz Relax", href: "/y", coverUrl: null, audioCount: 0 },
];
const resolved = resolveCoffeeAtlasTracks(
  [
    { authorSlug: "jazz-relax", productSlug: "missing-unpublished" },
    { authorSlug: "jazz-relax", productSlug: "italyanskiy-dzhaz", label: "Днём" },
    { authorSlug: "jazz-relax", productSlug: "italyanskiy-dzhaz" },
    { authorSlug: "jazz-relax", productSlug: "silent" },
  ],
  published,
);
assert.equal(resolved.length, 1, "unpublished, duplicate and silent refs are skipped (no fake playback)");
assert.equal(resolved[0].id, "a", "author slug must match too");
assert.equal(resolved[0].label, "Днём");
assert.deepEqual(resolveCoffeeAtlasTracks(getCoffeeAtlasTrackRefs("caffe-florian"), []), []);
assert.deepEqual(
  resolveCoffeeAtlasTracks([{ authorSlug: "jazz-relax", productSlug: "silent" }], published),
  [],
  "published product without audio is never shown",
);
assert.equal(
  resolveCoffeeAtlasTracks(
    [1, 2, 3, 4].map(() => ({ authorSlug: "jazz-relax", productSlug: "italyanskiy-dzhaz" })),
    published,
  ).length,
  1,
  "duplicates collapse",
);

// --- player: existing catalogue player only, honest empty state ---
const listen = read("src/components/business/coffee-atlas/CoffeeAtlasListen.tsx");
assert.match(listen, /HomeProductPlayButton/, "plays through the existing global player");
assert.doesNotMatch(listen, /<audio|new Audio\(|\.mp3/, "no own audio element or hardcoded files");
assert.match(listen, /скоро появится/, "honest empty state");
assert.doesNotMatch(listen, /ariaLabel=/, "keeps the player's dynamic «Слушать» / «Пауза» label");
const loader = read("src/lib/business/coffee-atlas/load-music.ts");
assert.match(loader, /getPublishedCatalogProducts/, "resolves against the published catalogue");
assert.match(loader, /loadCatalogPlaySession/, "checks playability with the /api/catalog/play loader");
assert.doesNotMatch(loader, /\.(insert|update|upsert|delete|rpc)\(/, "loader is read-only");

// --- loader: only playable examples, failures hide examples ---
const allPublished = Object.values(COFFEE_ATLAS_MUSIC)
  .flat()
  .map((ref) => ({
    id: `${ref.authorSlug}/${ref.productSlug}`,
    title: ref.productSlug,
    authorName: "Jazz Relax",
    authorSlug: ref.authorSlug,
    slug: ref.productSlug,
    href: `/practice/${ref.authorSlug}/${ref.productSlug}`,
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
    format: "music",
    audioCount: 1,
  }));
const checked: string[] = [];
const playableBuilt = await buildCoffeeAtlasMusic({
  loadPublishedProducts: async () => allPublished,
  isPlayable: async (track) => {
    checked.push(track.id);
    if (track.slug === "dzhaz-dlya-raboty") throw new Error("storage down");
    return track.slug !== "italyanskiy-dzhaz";
  },
});
assert.deepEqual(playableBuilt["caffe-florian"], [], "published but unplayable track is hidden");
assert.deepEqual(playableBuilt["starbucks-reserve-shanghai"], [], "play-check failure hides the example");
assert.equal(playableBuilt["fuglen-tokyo"]?.length, 2, "playable examples stay");
assert.equal(playableBuilt["la-colombe"]?.[0]?.slug, "dzhaz-launzh");
assert.equal(new Set(checked).size, checked.length, "each track is checked once");
assert.deepEqual(
  await buildCoffeeAtlasMusic({
    loadPublishedProducts: async () => {
      throw new Error("catalogue down");
    },
    isPlayable: async () => true,
  }),
  {},
  "catalogue failure → no examples",
);

// --- CTA: existing guest path only ---
assert.equal(COFFEE_ATLAS_CTA_LABEL, "Подобрать звучание моей кофейни");
assert.equal(COFFEE_ATLAS_CTA_HREF, "/b#venues");
assert.match(read("src/components/business/BusinessLandingView.tsx"), /id="venues"/, "CTA target exists on /b");

// --- offer on every page ---
assert.equal(COFFEE_ATLAS_OFFER.price, "799 ₽");
assert.match(COFFEE_ATLAS_OFFER.trial, /7 дней — бесплатно/);
assert.match(COFFEE_ATLAS_OFFER.rights, /Лицензионная музыка/);
const overview = read("src/components/business/coffee-atlas/CoffeeAtlasOverview.tsx");
const shopView = read("src/components/business/coffee-atlas/CoffeeAtlasShopView.tsx");
for (const [name, source] of [["overview", overview], ["shop", shopView]] as const) {
  assert.match(source, /<CoffeeAtlasOffer /, `${name}: offer at the bottom`);
  assert.match(source, /<CoffeeAtlasHeader/, `${name}: shop switcher`);
  assert.doesNotMatch(source, /гостев\w* панел/i, `${name}: no invented guest panel step`);
}
assert.match(shopView, /previous\.slug[\s\S]*next\.slug/, "back / next navigation");
const chrome = read("src/components/business/coffee-atlas/CoffeeAtlasChrome.tsx");

// --- PDF: exactly ONE control, in the header; page bodies have no PDF buttons ---
assert.equal(COFFEE_ATLAS_PDF_PATH, "/business/atlas-kofeen/atlas-10-kofeen-mira.pdf");
const headerStart = chrome.indexOf("export function CoffeeAtlasHeader");
assert.ok(headerStart >= 0, "header component exists");
const headerEnd = chrome.indexOf("\nexport function ", headerStart + 1);
const headerSource = chrome.slice(headerStart, headerEnd);
const restOfChrome = chrome.slice(0, headerStart) + chrome.slice(headerEnd);
assert.equal(headerSource.match(/COFFEE_ATLAS_PDF_PATH/g)?.length ?? 0, 1, "header: exactly one PDF link");
assert.equal(headerSource.match(/Скачать PDF-атлас/g)?.length ?? 0, 1, "header: one «Скачать PDF-атлас» pill");
assert.match(
  headerSource,
  /href=\{COFFEE_ATLAS_PDF_PATH\}[\s\S]{0,120}goal="business_atlas_pdf_downloaded"[\s\S]{0,120}download=\{COFFEE_ATLAS_PDF_DOWNLOAD_NAME\}[\s\S]{0,80}className="atlas-header__pdf"/,
  "header pill downloads the PDF",
);
assert.ok(
  headerSource.indexOf("Скачать PDF-атлас") < headerSource.indexOf("atlas-header__back"),
  "header pill sits next to the «АудиоЛад Бизнес» link",
);
assert.doesNotMatch(chrome, /CoffeeAtlasPdfActions/, "no shared PDF button group left");
const PDF_BUTTON = /COFFEE_ATLAS_PDF_PATH|\.pdf\b|business_atlas_pdf_|Открыть PDF|Скачать PDF|PDF-атласе|Подарок:/;
for (const [name, source] of [
  ["overview", overview],
  ["shop", shopView],
  ["listen", read("src/components/business/coffee-atlas/CoffeeAtlasListen.tsx")],
  ["chrome outside header (switcher/offer/footer)", restOfChrome.replace(/^import[\s\S]*?;\n/gm, "")],
] as const) {
  assert.doesNotMatch(source, PDF_BUTTON, `${name}: no PDF buttons in the page body`);
}
assert.match(overview, /Начать путешествие/, "overview hero keeps «Начать путешествие»");
assert.match(shopView, /href="#listen"[\s\S]{0,80}Послушать атмосферу/, "shop hero keeps «Послушать атмосферу»");
assert.match(shopView, /id="listen"/, "listen anchor exists");
assert.match(shopView, /Из PDF-атласа/, "PDF page images block stays");
assert.match(shopView, /\$\{shop\.slug\}-\$\{index \+ 1\}\.webp/, "PDF page images (WebP) stay");
const css = read("src/components/business/coffee-atlas/coffee-atlas.css");
assert.match(css, /#listen[^{]*\{[^}]*scroll-margin-top/, "#listen is not hidden under the sticky header");
assert.match(
  read("src/components/business/coffee-atlas/CoffeeAtlasSwitcherFocus.tsx"),
  /ResizeObserver[\s\S]*--atlas-sticky-offset|--atlas-sticky-offset[\s\S]*ResizeObserver/,
  "sticky header height is measured for the #listen offset",
);

// --- SEO + analytics ---
assert.equal(COFFEE_ATLAS_PATH, "/b/atlas-kofeen");
assert.equal(COFFEE_ATLAS_SITEMAP_PATHS.length, 11);
assert.ok(COFFEE_ATLAS_SITEMAP_PATHS.includes(buildCoffeeAtlasShopPath("cafe-tortoni")));
assert.match(read("src/lib/seo/sitemap-data.ts"), /COFFEE_ATLAS_SITEMAP_PATHS/);
for (const goal of YANDEX_METRIKA_BUSINESS_ATLAS_GOALS) {
  assert.ok(isYandexMetrikaGoalName(goal), `goal ${goal} registered`);
}
assert.ok(existsSync(join(root, "src/app/(platform)/b/atlas-kofeen/page.tsx")));
assert.ok(existsSync(join(root, "src/app/(platform)/b/atlas-kofeen/[slug]/page.tsx")));

console.log("business-coffee-atlas-unit: ok");
