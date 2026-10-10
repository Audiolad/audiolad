/**
 * Catalog return state (Back from a product card): storage rules, freshness,
 * restore-only-on-traversal, and source contracts (MAX / VK untouched).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CATALOG_RETURN_MAX_ITEMS,
  CATALOG_RETURN_STORAGE_KEY,
  CATALOG_RETURN_TTL_MS,
  clearCatalogReturnSnapshot,
  isCatalogPath,
  pickCatalogReturnSnapshot,
  readCatalogReturnSnapshot,
  shouldUseHistoryBackToCatalog,
  writeCatalogReturnSnapshot,
  type CatalogReturnSnapshot,
} from "../src/lib/catalog/return-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function memoryStorage(failWrites = false) {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failWrites) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  };
}

const card = (id: string) => ({ publication_id: id }) as never;
const cards = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => card(`p${from + i}`));

const NOW = 1_800_000_000_000;
const HREF = "/catalog?q=%D1%81%D0%BE%D0%BD&access=free&sort=price_asc";

function snap(over: Partial<CatalogReturnSnapshot> = {}): CatalogReturnSnapshot {
  return {
    v: 1,
    href: HREF,
    authenticated: false,
    items: cards(60),
    nextCursor: "cursor-3",
    scrollY: 4321,
    savedAt: NOW,
    exitedTo: "/practice/author/slug",
    ...over,
  };
}

// round trip: search + filters + sort live in href, pages in items, place in scrollY
{
  const s = memoryStorage();
  assert.equal(writeCatalogReturnSnapshot(s, snap()), true);
  const back = pickCatalogReturnSnapshot({
    storage: s, href: HREF, authenticated: false, now: NOW + 1000, isHistoryTraversal: true,
  });
  assert.ok(back);
  if (!back) throw new Error("no snapshot");
  assert.equal(back.items.length, 60, "all loaded pages come back");
  assert.deepEqual(back.items.map((i: { publication_id: string }) => i.publication_id), (cards(60) as { publication_id: string }[]).map((i) => i.publication_id), "same order");
  assert.equal(back.scrollY, 4321, "same place");
  assert.equal(back.nextCursor, "cursor-3", "infinite scroll continues from the same cursor");
}

// fresh entry (not a history traversal) never restores and drops old state
{
  const s = memoryStorage();
  writeCatalogReturnSnapshot(s, snap());
  assert.equal(
    pickCatalogReturnSnapshot({ storage: s, href: HREF, authenticated: false, now: NOW, isHistoryTraversal: false }),
    null,
  );
  assert.equal(s.map.has(CATALOG_RETURN_STORAGE_KEY), false, "stale snapshot cleared on fresh entry");
}

// different URL (other search / filter / sort) does not restore
for (const other of [
  "/catalog",
  "/catalog?q=%D1%81%D0%BE%D0%BD",
  "/catalog?q=%D1%81%D0%BE%D0%BD&access=free&sort=price_desc",
  "/catalog?q=%D1%81%D0%BE%D0%BD&access=paid&sort=price_asc",
  "/catalog?topic=sleep",
]) {
  const s = memoryStorage();
  writeCatalogReturnSnapshot(s, snap());
  assert.equal(
    pickCatalogReturnSnapshot({ storage: s, href: other, authenticated: false, now: NOW, isHistoryTraversal: true }),
    null,
    `no restore for ${other}`,
  );
}

// TTL
{
  const s = memoryStorage();
  writeCatalogReturnSnapshot(s, snap());
  assert.ok(readCatalogReturnSnapshot(s, NOW + CATALOG_RETURN_TTL_MS));
  assert.equal(readCatalogReturnSnapshot(s, NOW + CATALOG_RETURN_TTL_MS + 1), null, "expired");
  assert.equal(s.map.has(CATALOG_RETURN_STORAGE_KEY), false, "expired snapshot removed");
  writeCatalogReturnSnapshot(s, snap({ savedAt: NOW + 5000 }));
  assert.equal(readCatalogReturnSnapshot(s, NOW), null, "snapshot from the future is rejected");
}

// guest vs signed-in
{
  const s = memoryStorage();
  writeCatalogReturnSnapshot(s, snap({ authenticated: false }));
  assert.equal(
    pickCatalogReturnSnapshot({ storage: s, href: HREF, authenticated: true, now: NOW, isHistoryTraversal: true }),
    null,
  );
}

// robustness: corrupt JSON, wrong shape, no storage, quota
{
  const s = memoryStorage();
  s.map.set(CATALOG_RETURN_STORAGE_KEY, "{not json");
  assert.equal(readCatalogReturnSnapshot(s, NOW), null);
  s.map.set(CATALOG_RETURN_STORAGE_KEY, JSON.stringify({ v: 2, href: HREF }));
  assert.equal(readCatalogReturnSnapshot(s, NOW), null);
  assert.equal(readCatalogReturnSnapshot(null, NOW), null);
  assert.equal(writeCatalogReturnSnapshot(null, snap()), false);
  assert.equal(writeCatalogReturnSnapshot(memoryStorage(true), snap()), false, "quota never throws");
  assert.doesNotThrow(() => clearCatalogReturnSnapshot(null));
}

// oversized window is not saved partially (a cut list + old cursor would skip cards)
{
  const s = memoryStorage();
  writeCatalogReturnSnapshot(s, snap());
  assert.equal(writeCatalogReturnSnapshot(s, snap({ items: cards(CATALOG_RETURN_MAX_ITEMS + 1) })), false);
  assert.equal(readCatalogReturnSnapshot(s, NOW), null);
  assert.equal(writeCatalogReturnSnapshot(s, snap({ items: cards(CATALOG_RETURN_MAX_ITEMS) })), true);
}

// repeated catalog <-> product trips: every Back restores the latest window
{
  const s = memoryStorage();
  let items = cards(24);
  for (let trip = 1; trip <= 3; trip += 1) {
    items = [...items, ...cards(24, items.length)];
    writeCatalogReturnSnapshot(s, snap({ items, scrollY: trip * 1000, savedAt: NOW + trip }));
    const back = pickCatalogReturnSnapshot({
      storage: s, href: HREF, authenticated: false, now: NOW + trip + 1, isHistoryTraversal: true,
    });
    assert.equal(back?.items.length, items.length);
    assert.equal(back?.scrollY, trip * 1000);
  }
}

// standard "Back to catalog" link: history Back only if we came from this catalog
{
  const s = memoryStorage();
  writeCatalogReturnSnapshot(s, snap({ exitedTo: "/practice/автор/слаг" }));
  assert.equal(
    shouldUseHistoryBackToCatalog({ storage: s, pathname: "/practice/%D0%B0%D0%B2%D1%82%D0%BE%D1%80/%D1%81%D0%BB%D0%B0%D0%B3", now: NOW }),
    true,
    "encoded vs decoded pathname still match",
  );
  assert.equal(shouldUseHistoryBackToCatalog({ storage: s, pathname: "/practice/other/slug", now: NOW }), false);
  assert.equal(shouldUseHistoryBackToCatalog({ storage: s, pathname: "/practice/автор/слаг", now: NOW + CATALOG_RETURN_TTL_MS + 1 }), false);
  assert.equal(shouldUseHistoryBackToCatalog({ storage: memoryStorage(), pathname: "/practice/a/b", now: NOW }), false, "direct visit -> plain link");
  writeCatalogReturnSnapshot(s, snap({ exitedTo: null }));
  assert.equal(shouldUseHistoryBackToCatalog({ storage: s, pathname: "/practice/a/b", now: NOW }), false);
}

assert.equal(isCatalogPath("/catalog"), true);
assert.equal(isCatalogPath("/catalog/"), true);
assert.equal(isCatalogPath("/catalog/x"), false);
assert.equal(isCatalogPath("/practice/a"), false);

// ---- source contracts ----
const read = (p: string) => readFileSync(join(root, p), "utf8");
const grid = read("src/components/products/CatalogProductGrid.tsx");
assert.match(grid, /pickCatalogReturnSnapshot/, "grid restores through the tested helper");
assert.match(grid, /consumeHistoryTraversal\(\)/, "restore only on history traversal");
assert.match(grid, /restoreCatalogScroll/, "scroll restored");
assert.match(grid, /leavingRef/, "position frozen when leaving via a link");
const back = read("src/components/products/practice-page/PracticePageParts.tsx");
assert.match(back, /PracticeBackToCatalogLink/, "product back link uses history-aware link");

// MAX / VK mini apps must not touch or import the new state.
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const miniAppFiles = [
  ...walk(join(root, "src/components/max")),
  ...walk(join(root, "src/components/vk")),
  ...walk(join(root, "src/app/api/max")),
  ...walk(join(root, "src/app/api/vk")),
];
assert.ok(miniAppFiles.length > 10, "mini app sources found");
for (const file of miniAppFiles) {
  const text = readFileSync(file, "utf8");
  assert.doesNotMatch(
    text,
    /catalog\/(return-state|history-traversal|return-scroll)|CatalogProductGrid\b|PracticeBackToCatalogLink/,
    `${file} must not use the web catalog return state`,
  );
}

console.log("catalog-return-state-unit: ok");
