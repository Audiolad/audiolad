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
import {
  applyExactTrackOptions,
  isExactTrackSessionActive,
} from "../src/lib/catalog/exact-track-session";
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
    assert.match(ref.audioItemId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, `${slug}: exact track id`);
  }
}
assert.deepEqual(getCoffeeAtlasTrackRefs("nope"), []);

// 30.10.2026 (Sergey): one dedicated track per coffee shop – album page + exact track.
const EXPECTED_TRACKS: Record<string, [string, string, string]> = {
  "caffe-florian": ["kofeynik", "italyanskiy-restorannyy-dzhaz", "576ac613-b9e2-465c-9ff9-2644394bf44a"],
  "cafe-de-flore": ["kofeynik", "frantsuzskiy-utrenniy-dzhaz", "b81807c0-7147-437c-937c-e963437e9352"],
  "coffee-collective": ["kofeynik", "skandinavskiy-dzhaz", "ddda47ed-f2be-468e-ac4e-226a34e78d2f"],
  "fuglen-tokyo": ["jazz-relax", "vintazhnyy-dzhaz", "1b698d19-c582-431e-b6d4-e40c24b6a1bf"],
  "starbucks-reserve-shanghai": ["djazmanov", "sovremennyy-dzhaz", "e40b5889-ce4b-4e16-b10d-808e623f6693"],
  "cafe-tortoni": ["jazz-relax", "argentinskoe-tango-muzyka", "a7dbfb7b-f9ae-485f-9f70-d72f18d790f3"],
  "cafe-san-alberto": ["kofeynik", "latinoamerikanskiy-dzhaz", "a496b83c-4d67-45e6-b669-2b9f12e7c4f3"],
  "truth-coffee-roasting": ["jazz-relax", "nuar-dzhaz", "3a9040fb-515d-4796-a892-c919e6f0a933"],
  "single-o-surry-hills": ["djazmanov", "legkiy-fank", "7ea01dd5-9e5d-458f-9641-901c587949d3"],
  "la-colombe": ["djazmanov", "fortepiannyy-dzhaz", "8a1642df-677f-4e11-8db5-af1f5230fc9f"],
};
for (const slug of slugs) {
  const [authorSlug, productSlug, audioItemId] = EXPECTED_TRACKS[slug];
  assert.deepEqual(getCoffeeAtlasTrackRefs(slug), [{ authorSlug, productSlug, audioItemId }], `${slug}: dedicated track`);
}

const published = [
  { id: "a", title: "Итальянский джаз", slug: "italyanskiy-dzhaz", authorSlug: "jazz-relax", authorName: "Jazz Relax", href: "/practice/jazz-relax/italyanskiy-dzhaz", coverUrl: null },
  { id: "b", title: "Другой автор", slug: "italyanskiy-dzhaz", authorSlug: "someone", authorName: "X", href: "/x", coverUrl: null },
  { id: "c", title: "Без аудио", slug: "silent", authorSlug: "jazz-relax", authorName: "Jazz Relax", href: "/y", coverUrl: null, audioCount: 0 },
];
const ref = (productSlug: string, audioItemId = "t1", label?: string) => ({
  authorSlug: "jazz-relax",
  productSlug,
  audioItemId,
  ...(label ? { label } : {}),
});
const resolved = resolveCoffeeAtlasTracks(
  [ref("missing-unpublished"), ref("italyanskiy-dzhaz", "t1", "Днём"), ref("italyanskiy-dzhaz"), ref("silent")],
  published,
);
assert.equal(resolved.length, 1, "unpublished, duplicate and silent refs are skipped (no fake playback)");
assert.equal(resolved[0].id, "a", "author slug must match too");
assert.equal(resolved[0].label, "Днём");
assert.equal(resolved[0].albumTitle, "Итальянский джаз", "album title comes from the catalogue product");
assert.equal(resolved[0].audioItemId, "t1");
assert.ok(!("authorName" in resolved[0]), "resolved example carries no artist name");
assert.equal(resolveCoffeeAtlasTracks([ref("italyanskiy-dzhaz", "t1"), ref("italyanskiy-dzhaz", "t2")], published).length, 2, "two tracks of one album are two examples");
assert.deepEqual(resolveCoffeeAtlasTracks([ref("italyanskiy-dzhaz", "")], published), [], "no track id → not shown");
const vocalFeature = (source: string, value: string | null = "instrumental") => ({ value, source, status: "candidate" });
const instrumental = vocalFeature("analyzer:vocal.detector:panns-voice:2");
const legacyClap = vocalFeature("analyzer:vocal.scores:conservative-v2");
assert.equal(resolveCoffeeAtlasTracks([ref("italyanskiy-dzhaz")], published, new Map([["a", instrumental]])).length, 1);
assert.deepEqual(resolveCoffeeAtlasTracks([ref("italyanskiy-dzhaz")], published, new Map([["a", legacyClap]])), []);
assert.deepEqual(resolveCoffeeAtlasTracks([ref("italyanskiy-dzhaz")], published, new Map([["a", null]])), []);
assert.deepEqual(resolveCoffeeAtlasTracks(getCoffeeAtlasTrackRefs("caffe-florian"), []), []);
assert.deepEqual(resolveCoffeeAtlasTracks([ref("silent")], published), [], "published product without audio is never shown");
assert.equal(
  resolveCoffeeAtlasTracks([1, 2, 3, 4].map(() => ref("italyanskiy-dzhaz")), published).length,
  1,
  "duplicates collapse",
);

// --- player: existing catalogue player only, exact track, no artist, honest empty state ---
const listen = read("src/components/business/coffee-atlas/CoffeeAtlasListen.tsx");
assert.match(listen, /HomeProductPlayButton/, "plays through the existing global player");
assert.match(listen, /audioItemId=\{track\.audioItemId\}/, "plays exactly the configured track");
assert.doesNotMatch(listen, /<audio|new Audio\(|\.mp3/, "no own audio element or hardcoded files");
assert.match(listen, /скоро появится/, "honest empty state");
assert.doesNotMatch(listen, /ariaLabel=/, "keeps the player's dynamic «Слушать» / «Пауза» label");
assert.doesNotMatch(listen, /track\.authorName|atlas-track__author/, "artist name is never shown");
assert.match(
  listen,
  /className="atlas-track__title">\{track\.trackTitle\}[\s\S]*className="atlas-track__album"[\s\S]*\{track\.albumTitle\}/,
  "track title first (large), album title below",
);
const playButton = read("src/components/home/HomeProductPlayButton.tsx");
assert.match(playButton, /fetchCatalogPlaySession\(\s*authorSlug,\s*productSlug,\s*audioItemId/, "requests the exact track");
assert.match(playButton, /applyExactTrackOptions\(loaded\.session, \{ audioItemId, hideAuthor \}\)/, "fresh session is narrowed / artist dropped");
assert.match(playButton, /if \(!session\) \{\s*return;/, "absent track → nothing starts");
assert.match(playButton, /isExactTrackSessionActive\(/, "toggle only the exact-track session");
assert.match(listen, /hideAuthor/, "atlas player sessions carry no artist (mini / full player)");

// --- exact-track session helpers (behaviour) ---
{
  const product = { practiceId: "album", authorSlug: "a", productSlug: "p" };
  const albumSession = { practiceId: "album", authorSlug: "a", productSlug: "p", authorName: "Artist", tracks: [{ id: "t1" }, { id: "t2" }] };
  const otherTrack = { ...albumSession, tracks: [{ id: "t2" }] };
  const exact = { ...albumSession, authorName: "", tracks: [{ id: "t1" }] };
  assert.equal(isExactTrackSessionActive(albumSession, product), true, "no options → same-product check unchanged");
  assert.equal(isExactTrackSessionActive({ ...albumSession, practiceId: "x", productSlug: "q" }, product), false);
  assert.equal(isExactTrackSessionActive(albumSession, product, { audioItemId: "t1" }), false, "whole album session is not resumed for an exact track");
  assert.equal(isExactTrackSessionActive(otherTrack, product, { audioItemId: "t1" }), false, "another track of the album is not resumed");
  assert.equal(isExactTrackSessionActive({ ...exact, authorName: "Artist" }, product, { audioItemId: "t1", hideAuthor: true }), false, "session with artist is reloaded");
  assert.equal(isExactTrackSessionActive(exact, product, { audioItemId: "t1", hideAuthor: true }), true, "own exact session toggles");
  assert.equal(isExactTrackSessionActive(null, product), false);

  const full = {
    ...albumSession,
    tracks: [{ id: "t1", title: "Первый" }, { id: "t2", title: "Второй" }],
    initialProgress: [{ audioItemId: "t1", positionSeconds: 3, completed: false }, { audioItemId: "t2", positionSeconds: 9, completed: false }],
  } as unknown as Parameters<typeof applyExactTrackOptions>[0];
  assert.equal(applyExactTrackOptions(full), full, "no options → session unchanged");
  const narrowed = applyExactTrackOptions(full, { audioItemId: "t2", hideAuthor: true });
  assert.ok(narrowed);
  assert.deepEqual(narrowed.tracks.map((t) => t.id), ["t2"], "only the requested track");
  assert.deepEqual(narrowed.initialProgress.map((e) => e.audioItemId), ["t2"]);
  assert.equal(narrowed.authorName, "", "artist dropped");
  assert.equal(full.authorName, "Artist", "input not mutated");
  assert.equal(applyExactTrackOptions(full, { audioItemId: "missing" }), null, "absent track → nothing starts");
}
const loader = read("src/lib/business/coffee-atlas/load-music.ts");
assert.match(loader, /getPublishedCatalogProducts/, "resolves against the published catalogue");
assert.match(loader, /loadCatalogPlaySession/, "checks playability with the /api/catalog/play loader");
assert.doesNotMatch(loader, /\.(insert|update|upsert|delete|rpc)\(/, "loader is read-only");

// --- loader: only playable tracks, title from the play session, failures hide examples ---
const allPublished = Object.values(COFFEE_ATLAS_MUSIC)
  .flat()
  .map((item) => ({
    id: `${item.authorSlug}/${item.productSlug}`,
    title: `Альбом ${item.productSlug}`,
    authorName: "Artist",
    authorSlug: item.authorSlug,
    slug: item.productSlug,
    href: `/practice/${item.authorSlug}/${item.productSlug}`,
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
    format: "music",
    audioCount: 1,
  }));
const checked: string[] = [];
const playableBuilt = await buildCoffeeAtlasMusic({
  loadPublishedProducts: async () => allPublished,
  loadPlayableTracks: async (track) => {
    checked.push(track.id);
    if (track.slug === "sovremennyy-dzhaz") throw new Error("storage down");
    if (track.slug === "italyanskiy-restorannyy-dzhaz") return null;
    if (track.slug === "nuar-dzhaz") return [{ id: "other-track", title: "Другой трек" }];
    return [
      { id: "first", title: "Первый трек альбома" },
      { id: track.audioItemId, title: `Трек ${track.slug}` },
    ];
  },
});
assert.deepEqual(playableBuilt["caffe-florian"], [], "published but unplayable album is hidden");
assert.deepEqual(playableBuilt["starbucks-reserve-shanghai"], [], "play-check failure hides the example");
assert.deepEqual(playableBuilt["truth-coffee-roasting"], [], "track missing from the session is hidden – never another track");
assert.equal(playableBuilt["la-colombe"]?.length, 1, "playable example stays");
assert.equal(playableBuilt["la-colombe"]?.[0]?.trackTitle, "Трек fortepiannyy-dzhaz", "track title of the exact track");
assert.equal(playableBuilt["la-colombe"]?.[0]?.albumTitle, "Альбом fortepiannyy-dzhaz", "album title below");
assert.equal(new Set(checked).size, checked.length, "each album is checked once");
assert.deepEqual(
  await buildCoffeeAtlasMusic({
    loadPublishedProducts: async () => {
      throw new Error("catalogue down");
    },
    loadPlayableTracks: async () => [],
  }),
  {},
  "catalogue failure → no examples",
);

// --- CTA: permanent guest coffee cabinet (a8240527, Sergey 17.10 15:34 MSK; URL printed in the PDF) ---
assert.equal(COFFEE_ATLAS_CTA_LABEL, "Подобрать звучание моей кофейни");
assert.equal(COFFEE_ATLAS_CTA_HREF, process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED === "1" ? "https://coffee.audiolad.ru/" : "https://business.audiolad.ru/guest/coffee");
{
  const ctaSources = [
    read("src/components/business/coffee-atlas/CoffeeAtlasChrome.tsx"),
    read("src/components/business/coffee-atlas/CoffeeAtlasOverview.tsx"),
    read("src/components/business/coffee-atlas/CoffeeAtlasShopView.tsx"),
  ].join("\n");
  // Every CTA goes through the one constant; no hard-coded old target is left anywhere.
  assert.doesNotMatch(ctaSources, /#venues/, "no CTA points to /b#venues any more");
  const labelUses = ctaSources.match(/COFFEE_ATLAS_CTA_LABEL/g)?.length ?? 0;
  assert.ok(labelUses >= 1, "CTA label rendered from the constant");
  assert.doesNotMatch(ctaSources, /Подобрать звучание моей кофейни/, "CTA label is never hard-coded (always the constant)");
  const goalLink = read("src/components/business/coffee-atlas/CoffeeAtlasGoalLink.tsx");
  assert.match(goalLink, /\^https\?:/, "absolute CTA → plain <a> (full navigation to business.audiolad.ru)");
}

// --- offer on every page ---
assert.equal(COFFEE_ATLAS_OFFER.price, "799 ₽");
assert.equal(COFFEE_ATLAS_OFFER.trial, "30 дней в подарок");
assert.equal(COFFEE_ATLAS_OFFER.afterTrial, "Далее 799 ₽ в месяц");
assert.equal(COFFEE_ATLAS_OFFER.rights, "Лицензионная музыка с соблюдением прав");
assert.doesNotMatch(COFFEE_ATLAS_OFFER.rights, /авторов/);
const overview = read("src/components/business/coffee-atlas/CoffeeAtlasOverview.tsx");
const shopView = read("src/components/business/coffee-atlas/CoffeeAtlasShopView.tsx");
for (const [name, source] of [["overview", overview], ["shop", shopView]] as const) {
  assert.match(source, /<CoffeeAtlasOffer /, `${name}: offer at the bottom`);
  assert.match(source, /<CoffeeAtlasHeader/, `${name}: shop switcher`);
  assert.doesNotMatch(source, /гостев\w* панел/i, `${name}: no invented guest panel step`);
}
assert.match(shopView, /previous\.slug[\s\S]*next\.slug/, "back / next navigation");
const chrome = read("src/components/business/coffee-atlas/CoffeeAtlasChrome.tsx");
assert.match(
  chrome,
  /COFFEE_ATLAS_OFFER\.trial[\s\S]*COFFEE_ATLAS_OFFER\.afterTrial[\s\S]*COFFEE_ATLAS_OFFER\.rightsHref[\s\S]*COFFEE_ATLAS_OFFER\.rights/,
  "offer checklist order: gift, then price, then the rights link",
);
assert.doesNotMatch(chrome, /прав авторов/);

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
