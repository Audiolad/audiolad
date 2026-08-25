#!/usr/bin/env node
/**
 * Catalog Listing Freeze v2 — DTO + legacy adapter (no DB).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { adaptLegacyCatalogSourceToCard } from "../src/lib/catalog/legacy-adapter.ts";
import { normalizeCatalogGallery } from "../src/lib/catalog/gallery.ts";
import { catalogMoneyFromRubles } from "../src/lib/catalog/offer.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function source(overrides = {}) {
  return {
    id: "pub-1",
    slug: "morning",
    title: "Утро",
    subtitle: "Коротко",
    productKind: "practice",
    price: 490,
    isFree: false,
    coverUrl: "/cover.jpg",
    authorName: "Анна",
    authorSlug: "anna",
    href: "/practice/anna/morning",
    publishedAt: "2026-08-01T00:00:00.000Z",
    durationSeconds: 600,
    ...overrides,
  };
}

const FORBIDDEN_DISPLAY_LABELS = ["Релиз", "Практика", "Пост", "Курс"];

function assertStorefrontDisplayLabel(card, expected) {
  assert.equal(card?.display_label, expected);
  assert.ok(
    !FORBIDDEN_DISPLAY_LABELS.includes(card?.display_label),
    `display_label must not be a class name: ${card?.display_label}`,
  );
}

const practice = adaptLegacyCatalogSourceToCard(source());
assert.equal(practice?.class, "practice");
assertStorefrontDisplayLabel(practice, "Аудиопрактика");
assert.equal(practice?.default_offer?.access, "paid");
assert.equal(practice?.default_offer?.price?.amount_minor, 49000);
assert.equal(practice?.default_offer?.price?.currency, "RUB");
assert.equal(practice?.gallery.length, 0);
assert.equal(practice?.progress, null);
assert.deepEqual(practice?.summary, {});
assert.equal(practice?.viewer.can_listen, false);
assert.equal(practice?.viewer.has_grant, false);

const meditation = adaptLegacyCatalogSourceToCard(
  source({ format: "  Медитация  " }),
);
assert.equal(meditation?.class, "practice");
assertStorefrontDisplayLabel(meditation, "Медитация");

const customFormat = adaptLegacyCatalogSourceToCard(
  source({ format: "Голос для сна" }),
);
assertStorefrontDisplayLabel(customFormat, "Голос для сна");

const sevenSessions = adaptLegacyCatalogSourceToCard(
  source({ durationSeconds: 7 * 600 }),
);
assert.equal(sevenSessions?.class, "practice", "seven sessions stay practice");
assertStorefrontDisplayLabel(sevenSessions, "Аудиопрактика");

const release = adaptLegacyCatalogSourceToCard(source({ productKind: "music" }));
assert.equal(release?.class, "release");
assertStorefrontDisplayLabel(release, "Музыка");
assert.equal(release?.default_offer?.access, "paid");

const storedMusicFormat = adaptLegacyCatalogSourceToCard(
  source({ productKind: "music", format: "Музыка" }),
);
assert.equal(storedMusicFormat?.class, "release");
assertStorefrontDisplayLabel(storedMusicFormat, "Музыка");

const post = adaptLegacyCatalogSourceToCard(
  source({ productKind: "audio_post", isFree: true, price: 0 }),
);
assert.equal(post?.class, "post");
assertStorefrontDisplayLabel(post, "Аудиопост");
assert.equal(post?.default_offer, null);
assert.equal(post?.viewer.can_listen, true);
assert.equal(post?.viewer.has_grant, false);

const storedPostFormat = adaptLegacyCatalogSourceToCard(
  source({
    productKind: "audio_post",
    isFree: true,
    price: 0,
    format: "Аудиопост",
  }),
);
assertStorefrontDisplayLabel(storedPostFormat, "Аудиопост");

const gift = adaptLegacyCatalogSourceToCard(
  source({ isFree: true, price: 0 }),
);
assert.equal(gift?.default_offer?.access, "free");
assert.equal(gift?.default_offer?.claim, "free_claim");
assert.equal(gift?.default_offer?.price, null);
assert.equal(gift?.viewer.can_listen, true);

assert.equal(catalogMoneyFromRubles(490)?.amount_minor, 49000);

const slides = normalizeCatalogGallery([
  { id: "b", image_url: "/b.jpg", position: 2, alt: "B" },
  { id: "a", image_url: "/a.jpg", position: 1, alt: "A" },
  { id: "empty", image_url: "  ", position: 0, alt: "skip" },
]);
assert.equal(slides.length, 2);
assert.equal(slides[0].id, "a");
assert.deepEqual(
  normalizeCatalogGallery([]),
  [],
  "empty gallery is valid",
);

const thirtyPlus = normalizeCatalogGallery(
  Array.from({ length: 35 }, (_, index) => ({
    id: `s-${index}`,
    image_url: `/s-${index}.jpg`,
    position: index,
    alt: `Slide ${index}`,
  })),
);
assert.equal(thirtyPlus.length, 30, "gallery caps at 30");

const withGallery = adaptLegacyCatalogSourceToCard(
  source({
    gallery: [
      { id: "inside", image_url: "/inside.jpg", position: 1, alt: "Что внутри" },
    ],
  }),
);
assert.equal(withGallery?.class, "practice");
assert.equal(withGallery?.gallery.length, 1);
assert.equal(withGallery?.default_offer?.price?.amount_minor, 49000);

const frontendFiles = [
  "src/app/(platform)/(listener)/(catalog)/catalog/page.tsx",
  "src/components/products/CatalogProductGrid.tsx",
  "src/components/products/CatalogProductGridCard.tsx",
  "src/components/catalog/cards/CatalogCardView.tsx",
  "src/components/catalog/cards/CatalogCardShell.tsx",
  "src/components/catalog/cards/CatalogCardGallery.tsx",
  "src/lib/catalog/catalog-filter-ui.ts",
];

for (const file of frontendFiles) {
  const sourceText = read(file);
  assert.doesNotMatch(sourceText, /product_kind/, `${file} has no product_kind`);
  assert.doesNotMatch(sourceText, /PracticeRow/, `${file} has no PracticeRow`);
  assert.doesNotMatch(sourceText, /\bis_free\b/, `${file} has no is_free`);
  assert.doesNotMatch(sourceText, /audio_items/, `${file} has no audio_items`);
}

const adapterSource = read("src/lib/catalog/legacy-adapter.ts");
assert.match(adapterSource, /productKind/, "adapter may read legacy kind");
assert.match(adapterSource, /source\.format/, "adapter maps display_label from format");
assert.doesNotMatch(
  adapterSource,
  /display_label:\s*getCatalogClassLabel/,
  "adapter does not map display_label from class labels",
);
assert.doesNotMatch(
  read("src/components/catalog/cards/CatalogCardShell.tsx"),
  /getCatalogClassLabel/,
  "card chip does not fall back to class labels",
);
assert.match(
  read("src/components/catalog/cards/CatalogCardView.tsx"),
  /case "course"/,
  "course layout exists",
);
assert.match(
  read("src/components/catalog/cards/CatalogCardView.tsx"),
  /case "audiobook"/,
  "audiobook layout exists",
);

console.log("catalog-dto-adapter-unit: ok");
