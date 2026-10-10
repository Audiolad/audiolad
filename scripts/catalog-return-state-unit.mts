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
  CATALOG_BACK_STATE_KEY,
  CATALOG_EXIT_CLAIM_WINDOW_MS,
  claimCatalogExit,
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

// standard "Back to catalog" link: history Back only if THIS history entry was
// opened from the catalog. Tiny history simulator: entries carry their own state.
{
  type Entry = { path: string; state: Record<string, unknown> };
  const s = memoryStorage();
  const entries: Entry[] = [{ path: "/catalog?sort=price_asc", state: {} }];
  let index = 0;
  const push = (path: string) => {
    entries.splice(index + 1);
    entries.push({ path, state: {} });
    index += 1;
  };
  const here = () => entries[index];
  const leaveCatalogVia = (path: string, at: number) => {
    // grid click capture: remember where the card click goes
    writeCatalogReturnSnapshot(s, snap({ exitedTo: path, exitedAt: at, savedAt: at }));
  };
  const mountProductPage = (at: number) => {
    // PracticeBackToCatalogLink mount effect
    if (claimCatalogExit({ storage: s, pathname: here().path, now: at })) {
      here().state = { ...here().state, [CATALOG_BACK_STATE_KEY]: true };
    }
  };
  const clickBackLink = () => {
    if (shouldUseHistoryBackToCatalog({ historyState: here().state })) {
      index -= 1; // router.back()
      return "history-back";
    }
    push("/catalog");
    return "link-to-catalog";
  };

  // catalog -> product A (card click) -> back link: history Back, lands on the catalog
  leaveCatalogVia("/p/A", NOW);
  push("/p/A");
  mountProductPage(NOW + 100);
  // simulate React strict mode double mount: second claim must not untag
  mountProductPage(NOW + 110);
  assert.equal(here().state[CATALOG_BACK_STATE_KEY], true, "entry opened from catalog is tagged");

  // ... -> Home -> product A again (typed in a plain link) -> "Назад в каталог"
  push("/");
  push("/p/A");
  mountProductPage(NOW + 5000);
  assert.equal(here().state[CATALOG_BACK_STATE_KEY], undefined, "second visit to A is not tagged");
  assert.equal(clickBackLink(), "link-to-catalog", "must NOT go back to Home");
  assert.equal(here().path, "/catalog", "lands on the catalog");

  // the first, tagged entry still goes back (e.g. after reload history.state survives)
  index = 1;
  assert.equal(here().path, "/p/A");
  assert.equal(clickBackLink(), "history-back");
  assert.equal(here().path, "/catalog?sort=price_asc");
}

// claim: single use, expires, pathname must match, direct visit never tags
{
  const s = memoryStorage();
  writeCatalogReturnSnapshot(s, snap({ exitedTo: "/practice/автор/слаг", exitedAt: NOW }));
  assert.equal(claimCatalogExit({ storage: s, pathname: "/practice/%D0%B0%D0%B2%D1%82%D0%BE%D1%80/%D1%81%D0%BB%D0%B0%D0%B3", now: NOW + 50 }), true, "encoded vs decoded pathname");
  assert.equal(claimCatalogExit({ storage: s, pathname: "/practice/автор/слаг", now: NOW + 60 }), false, "single use");

  writeCatalogReturnSnapshot(s, snap({ exitedTo: "/p/A", exitedAt: NOW }));
  assert.equal(claimCatalogExit({ storage: s, pathname: "/p/B", now: NOW + 10 }), false, "other product");
  assert.equal(claimCatalogExit({ storage: s, pathname: "/p/A", now: NOW + CATALOG_EXIT_CLAIM_WINDOW_MS + 1 }), false, "late visit");
  assert.equal(claimCatalogExit({ storage: memoryStorage(), pathname: "/p/A", now: NOW }), false, "direct visit");
  writeCatalogReturnSnapshot(s, snap({ exitedTo: null }));
  assert.equal(claimCatalogExit({ storage: s, pathname: "/p/A", now: NOW }), false);
  assert.equal(shouldUseHistoryBackToCatalog({ historyState: null }), false);
  assert.equal(shouldUseHistoryBackToCatalog({ historyState: { __NA: true } }), false);
}

// sign-out / guest <-> signed-in change erases the snapshot
{
  const s = memoryStorage();
  writeCatalogReturnSnapshot(s, snap({ authenticated: true }));
  assert.equal(
    pickCatalogReturnSnapshot({ storage: s, href: HREF, authenticated: false, now: NOW, isHistoryTraversal: true }),
    null,
  );
  assert.equal(s.map.has(CATALOG_RETURN_STORAGE_KEY), false, "auth flag change erases the snapshot");
  writeCatalogReturnSnapshot(s, snap({ authenticated: false }));
  assert.equal(
    pickCatalogReturnSnapshot({ storage: s, href: HREF, authenticated: true, now: NOW, isHistoryTraversal: true }),
    null,
  );
  assert.equal(s.map.has(CATALOG_RETURN_STORAGE_KEY), false);
}

// history traversal tracker: F5 / back_forward document load on a NON-catalog
// page must not leave the "traversal" flag set for the next plain tab click.
{
  type Listener = (event: unknown) => void;
  const load = async (pathname: string, navType: string) => {
    const listeners: Record<string, Listener[]> = {};
    const add = (target: string) => (type: string, fn: Listener) =>
      void (listeners[`${target}:${type}`] ??= []).push(fn);
    const fire = (key: string, event: unknown = {}) =>
      (listeners[key] ?? []).forEach((fn) => fn(event));
    const history = { pushState: () => undefined };
    const g = globalThis as Record<string, unknown>;
    const saved = { window: g.window, document: g.document, performance: g.performance };
    const fakeWindow = {
      location: { pathname },
      history,
      addEventListener: add("window"),
    };
    g.window = fakeWindow;
    g.document = { addEventListener: add("document") };
    Object.defineProperty(globalThis, "performance", {
      value: { getEntriesByType: () => [{ type: navType }] },
      configurable: true,
      writable: true,
    });
    delete g.__audioladCatalogHistoryTraversal;
    const mod = await import(`../src/lib/catalog/history-traversal.ts?${Math.random()}`);
    mod.ensureHistoryTraversalTracking();
    const restore = () => {
      g.window = saved.window;
      g.document = saved.document;
      Object.defineProperty(globalThis, "performance", { value: saved.performance, configurable: true, writable: true });
      delete g.__audioladCatalogHistoryTraversal;
    };
    return { mod, fire, history: fakeWindow.history, restore };
  };

  // F5 on Home, then a tab click on "Каталог": fresh, not a traversal
  let t = await load("/", "reload");
  assert.equal(t.mod.consumeHistoryTraversal(), false, "reload on another page is not a traversal");
  t.restore();

  t = await load("/", "reload");
  t.fire("document:click", { button: 0, target: { closest: () => ({}) } });
  assert.equal(t.mod.consumeHistoryTraversal(), false, "click resets");
  t.restore();

  // back_forward document load on Home, then router.push('/catalog')
  t = await load("/profile", "back_forward");
  t.history.pushState();
  assert.equal(t.mod.consumeHistoryTraversal(), false, "pushState is a fresh navigation");
  t.restore();

  // F5 / back_forward ON the catalog itself still restores
  t = await load("/catalog", "reload");
  assert.equal(t.mod.consumeHistoryTraversal(), true, "reload of the catalog keeps its place");
  assert.equal(t.mod.consumeHistoryTraversal(), false, "consumed once");
  t.restore();

  // browser Back (popstate) is a traversal
  t = await load("/p/A", "navigate");
  t.fire("window:popstate");
  assert.equal(t.mod.consumeHistoryTraversal(), true);
  t.restore();
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
assert.match(grid, /pagehide/, "state flushed when the page is left");
assert.match(grid, /visibilitychange/, "state flushed when the tab is hidden");
assert.match(grid, /requestIdleCallback/, "writes are debounced into idle time");
assert.doesNotMatch(grid, /setTimeout\(\(\) => \{\s*timer = null;\s*save\(\)/, "no per-scroll synchronous JSON write");
const baseProviders = read("src/components/providers/BaseProviders.tsx");
assert.match(baseProviders, /CatalogReturnRootTracker/, "tracker installed at the app root");
const profile = read("src/components/profile/ProfileSections.tsx");
const settings = read("src/app/(platform)/settings/page.tsx");
assert.match(profile, /SignOutForm/, "profile sign-out erases the snapshot");
assert.match(settings, /SignOutForm/, "settings sign-out erases the snapshot");
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
