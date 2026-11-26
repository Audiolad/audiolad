import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PRODUCT_CONTENT_LIMITS } from "../src/lib/author-products/limits";
import { PRODUCT_KIND } from "../src/lib/author-products/product-kind";
import {
  applyBulkTrackTitlesToItems,
  bulkTrackTitleApplyState,
  formatBulkTrackTitlesSuccessMessage,
  isMusicAlbumBulkTrackTitlesEnabled,
  parseBulkTrackTitleLines,
  restoreBulkTrackTitlesFromSnapshot,
  snapshotBulkTrackTitles,
} from "../src/lib/author-products/music-album-bulk-track-titles";

const names10 = [
  "Бежевые перчатки",
  "Мягкий свинг",
  "Тёплый аккорд",
  "Кленовый лист",
  "Изящный оборот",
  "Шелест",
  "Полдень",
  "Сезон",
  "Линия",
  "Финал",
];
const tracks10 = names10.map((title, index) => ({ id: `t${index + 1}`, title: `Аудио ${index + 1}` }));

assert.deepEqual(parseBulkTrackTitleLines(names10.join("\n")), names10);
assert.deepEqual(parseBulkTrackTitleLines("  One  \n\n\nTwo\r\n  "), ["One", "Two"]);

assert.deepEqual(bulkTrackTitleApplyState(10, 10), {
  canApply: true,
  overflow: false,
  empty: false,
});
assert.deepEqual(bulkTrackTitleApplyState(7, 7), {
  canApply: true,
  overflow: false,
  empty: false,
});
assert.deepEqual(bulkTrackTitleApplyState(7, 10), {
  canApply: true,
  overflow: false,
  empty: false,
});
assert.deepEqual(bulkTrackTitleApplyState(10, 7), {
  canApply: false,
  overflow: true,
  empty: false,
});
assert.deepEqual(bulkTrackTitleApplyState(0, 7), {
  canApply: false,
  overflow: false,
  empty: true,
});

const applied7 = applyBulkTrackTitlesToItems(tracks10.slice(0, 7), names10.slice(0, 7));
assert.equal(applied7.appliedCount, 7);
assert.deepEqual(
  applied7.items.map((item) => item.title),
  names10.slice(0, 7),
);
assert.deepEqual(
  applyBulkTrackTitlesToItems(tracks10, names10.slice(0, 7)).items.slice(7).map((item) => item.title),
  ["Аудио 8", "Аудио 9", "Аудио 10"],
);

const applied10 = applyBulkTrackTitlesToItems(tracks10, names10);
assert.equal(applied10.appliedCount, 10);
assert.equal(formatBulkTrackTitlesSuccessMessage(10), "Обновлено названий: 10");

const longTitle = "Я".repeat(PRODUCT_CONTENT_LIMITS.audioTitle + 20);
assert.equal(
  applyBulkTrackTitlesToItems([{ id: "a", title: "x" }], [longTitle]).items[0]!.title.length,
  PRODUCT_CONTENT_LIMITS.audioTitle,
);

const snapshot = snapshotBulkTrackTitles(tracks10);
const renamed = applyBulkTrackTitlesToItems(tracks10, names10).items;
assert.notDeepEqual(
  renamed.map((item) => item.title),
  tracks10.map((item) => item.title),
);
assert.deepEqual(
  restoreBulkTrackTitlesFromSnapshot(renamed, snapshot).map((item) => item.title),
  tracks10.map((item) => item.title),
);

assert.equal(
  isMusicAlbumBulkTrackTitlesEnabled({
    productKind: PRODUCT_KIND.MUSIC,
    scope: "closed",
    closedCatalogOnly: true,
  }),
  true,
);
assert.equal(
  isMusicAlbumBulkTrackTitlesEnabled({
    productKind: PRODUCT_KIND.MUSIC,
    scope: "closed",
    closedCatalogOnly: false,
  }),
  false,
);
assert.equal(
  isMusicAlbumBulkTrackTitlesEnabled({
    productKind: PRODUCT_KIND.MUSIC,
    scope: "all",
    closedCatalogOnly: false,
  }),
  true,
);
assert.equal(
  isMusicAlbumBulkTrackTitlesEnabled({
    productKind: PRODUCT_KIND.MUSIC,
    scope: "all",
    closedCatalogOnly: true,
  }),
  true,
);
assert.equal(
  isMusicAlbumBulkTrackTitlesEnabled({
    productKind: PRODUCT_KIND.PRACTICE,
    scope: "closed",
    closedCatalogOnly: true,
  }),
  false,
);

const form = readFileSync(new URL("../src/components/author-dashboard/AuthorProductForm.tsx", import.meta.url), "utf8");
const panel = readFileSync(
  new URL(
    "../src/components/author-dashboard/product-form-sections/MusicAlbumBulkTrackTitlesPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

assert.match(panel, /Массовое заполнение названий треков/);
assert.match(panel, /Заполнить названия треков/);
assert.match(panel, /Отменить последнее заполнение/);
assert.match(form, /MusicAlbumBulkTrackTitlesPanel/);
assert.match(form, /showBulkTrackTitlesPanel/);
assert.match(form, /scope: "all"/);

console.log("music-album-bulk-track-titles-unit: PASS");