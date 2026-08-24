import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canShowLibraryPaidSaveOffer,
  canUseLibraryFullListen,
  resolveLibraryCardBadge,
} from "../src/lib/library/card-ui";
import {
  getLibraryFilterEmptyCta,
  getLibraryFilterEmptyMessage,
} from "../src/lib/library/filters";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function testChips() {
  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");

  assert.match(library, /id: "all", label: "Все"/);
  assert.match(library, /id: "saved", label: "Сохранённые"/);
  assert.match(library, /id: "gifts", label: "Подарки"/);
  assert.match(library, /id: "purchased", label: "Купленные"/);
  assert.match(library, /id: "uploads", label: "Мои записи"/);
  assert.doesNotMatch(library, /id: "downloaded"/);
  assert.doesNotMatch(library, /Скачанные/);
  assert.match(library, /params.set\("filter", filter\)/);
}

function testBadges() {
  const saveOnly = resolveLibraryCardBadge({
    isSaved: true,
    canListen: false,
    accessSource: null,
    practice: { isFree: false, price: 990 },
  });
  assert.deepEqual(saveOnly, { id: "saved", label: "Сохранено" });

  const purchase = resolveLibraryCardBadge({
    isSaved: false,
    canListen: true,
    accessSource: "purchase",
    practice: { isFree: false, price: 990 },
  });
  assert.deepEqual(purchase, { id: "available", label: "Доступно" });

  const gift = resolveLibraryCardBadge({
    isSaved: false,
    canListen: true,
    accessSource: "gift",
    practice: { isFree: true, price: 0 },
  });
  assert.deepEqual(gift, { id: "gift", label: "Подарок" });

  const savePlusPurchase = resolveLibraryCardBadge({
    isSaved: true,
    canListen: true,
    accessSource: "purchase",
    practice: { isFree: false, price: 990 },
  });
  assert.deepEqual(savePlusPurchase, { id: "available", label: "Доступно" });
}

function testLockedPaidHasNoFullListen() {
  const item = {
    isSaved: true,
    canListen: false,
    practice: { isFree: false, price: 990 },
  };

  assert.equal(canUseLibraryFullListen(item), false);
  assert.equal(canShowLibraryPaidSaveOffer(item), true);

  const card = read("src/components/my-practices/LibraryCard.tsx");
  const preview = read(
    "src/components/my-practices/LibraryCardPreviewPlayButton.tsx",
  );
  const play = read("src/components/my-practices/LibraryCardPlayButton.tsx");

  assert.match(card, /canUseLibraryFullListen\(item\)/);
  assert.match(card, /LibraryCardPreviewPlayButton/);
  assert.match(card, /canPreviewPlay && authorSlug && practice/);
  assert.doesNotMatch(
    preview,
    /buildListenPath|href=.*\/listen/,
    "preview play has no /listen link",
  );
  assert.match(preview, /variant="preview"/);
  assert.match(preview, /LibraryCardPlayButton/);
  assert.match(play, /entrySurface: "library"/);
  assert.match(play, /suppressListenUrlSync: true/);
  assert.match(play, /fetchCatalogPlaySession/);
  assert.match(play, /loadSession/);
  assert.match(play, /data-library-preview-play/);
}

function testEmptySaved() {
  assert.equal(
    getLibraryFilterEmptyMessage("saved"),
    "Листайте каталог и нажимайте сердце — здесь соберётся ваше.",
  );
  assert.deepEqual(getLibraryFilterEmptyCta("saved"), {
    href: "/catalog",
    label: "Перейти в каталог",
  });
  assert.equal(
    getLibraryFilterEmptyMessage("purchased"),
    "Здесь появятся купленные материалы.",
  );
  assert.deepEqual(getLibraryFilterEmptyCta("purchased"), {
    href: "/catalog",
    label: "Перейти в каталог",
  });
  assert.equal(
    getLibraryFilterEmptyMessage("gifts"),
    "Подарки появятся здесь, когда вы сохраните или откроете бесплатное.",
  );
  assert.deepEqual(getLibraryFilterEmptyCta("gifts"), {
    href: "/catalog?access=free",
    label: "Перейти в каталог",
  });
  assert.match(
    getLibraryFilterEmptyMessage("all"),
    /В Аудиотеке пока пусто/,
  );

  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  assert.match(library, /getLibraryFilterEmptyMessage\(filter\)/);
  assert.match(library, /getLibraryFilterEmptyCta\(filter\)/);
}

function testSourceBoundaries() {
  const card = read("src/components/my-practices/LibraryCard.tsx");
  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  const play = read("src/components/products/CatalogProductPlayButton.tsx");
  const collection = read("src/lib/library/collection.ts");
  const catalogPlay = read("src/lib/catalog/fetch-catalog-play-session.ts");

  assert.match(card, /relative flex gap-4/);
  assert.match(card, /aspect-square w-\[116px\]/);
  assert.match(card, /CatalogProductHeartButton/);
  assert.match(card, /BuyPracticeButton/);
  assert.doesNotMatch(card, /CatalogProductGridCard/);
  assert.doesNotMatch(card, /Избранн|Favorites/);
  assert.doesNotMatch(library, /Избранн|Favorites/);

  assert.match(play, /entrySurface: "catalog"/);
  assert.doesNotMatch(play, /entrySurface: "library"/);
  assert.doesNotMatch(play, /LibraryCard|my-practices/);

  assert.doesNotMatch(collection, /Сохранено|Доступно|Сохранённые/);
  assert.doesNotMatch(catalogPlay, /my-practices|LibraryCard/);
}

testChips();
testBadges();
testLockedPaidHasNoFullListen();
testEmptySaved();
testSourceBoundaries();

console.log("library-audioteka-ui-unit: ok");
