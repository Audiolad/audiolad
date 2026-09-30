import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CatalogCard } from "../src/lib/catalog/dto";
import {
  LIVE_PUBLIC_CONTENT_DEBOUNCE_MS,
  LIVE_PUBLIC_CONTENT_FALLBACK_MS,
  catalogListingUnchanged,
  createLivePublicContentController,
  fingerprintPublicCatalogCards,
  mergePublicCatalogCard,
  probePublicCatalogHead,
  realtimeReconnectDelayMs,
  replaceCatalogPageOne,
  resolveNextCursorAfterPageReplace,
  restoreWindowScrollY,
  shouldResubscribeRealtime,
  signalFromRealtimePayload,
  type LiveSyncClock,
} from "../src/lib/public-content/live-sync";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function card(
  id: string,
  extras: Partial<CatalogCard> & { title?: string } = {},
): CatalogCard {
  const title = extras.title ?? id;
  const base: CatalogCard = {
    publication_id: id,
    class: "practice",
    slug: id,
    title,
    subtitle: null,
    cover: { url: `/${id}.jpg`, alt: title, updated_at: "2026-09-01T00:00:00.000Z" },
    gallery: [],
    author: { name: "Автор", slug: "author" },
    topics: [],
    display_label: "Практика",
    duration_seconds: null,
    published_at: "2026-09-01T00:00:00.000Z",
    paths: { pdp: `/p/${id}` },
    default_offer: { access: "free", claim: "free_claim", price: null },
    viewer: {
      can_listen: false,
      has_grant: false,
      is_saved: false,
    },
    badges: [],
    progress: null,
    summary: {},
  };

  return {
    ...base,
    ...extras,
    publication_id: id,
    title,
    cover: extras.cover ?? base.cover,
    viewer: {
      ...base.viewer,
      ...extras.viewer,
    },
  };
}

function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<
    number,
    { fn: () => void; at: number; interval: number | null }
  >();

  const clock: LiveSyncClock = {
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms, interval: null });
      return id;
    },
    clearTimeout(id) {
      timers.delete(Number(id));
    },
    setInterval(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms, interval: ms });
      return id;
    },
    clearInterval(id) {
      timers.delete(Number(id));
    },
  };

  return {
    clock,
    pending() {
      return timers.size;
    },
    async advance(ms: number) {
      const target = now + ms;

      for (;;) {
        let next: { id: number; at: number } | null = null;

        for (const [id, timer] of timers) {
          if (timer.at <= target && (next == null || timer.at < next.at)) {
            next = { id, at: timer.at };
          }
        }

        if (!next) {
          break;
        }

        const timer = timers.get(next.id);

        if (!timer) {
          continue;
        }

        now = timer.at;

        if (timer.interval == null) {
          timers.delete(next.id);
        } else {
          timer.at = now + timer.interval;
        }

        timer.fn();
        await Promise.resolve();
        await Promise.resolve();
      }

      now = target;
    },
  };
}

function testSignalDropsPrivatePayload() {
  const payload = {
    eventType: "UPDATE",
    new: {
      id: "secret-practice",
      title: "Только выбранным",
      catalog_visibility: "selected_users",
      allowlist_email: "hidden@example.com",
    },
    old: { catalog_visibility: "selected_users" },
  };
  const signal = signalFromRealtimePayload(payload);
  const encoded = JSON.stringify(signal);

  assert.deepEqual(signal, { source: "realtime" });
  assert.equal(encoded.includes("selected_users"), false);
  assert.equal(encoded.includes("hidden@example.com"), false);
  assert.equal(encoded.includes("Только выбранным"), false);
  assert.equal(encoded.includes("secret-practice"), false);
}

function testFingerprintIgnoresNonPublicFields() {
  const fingerprint = fingerprintPublicCatalogCards([
    {
      publication_id: "public-1",
      title: "Тишина",
      slug: "tishina",
      cover: { url: "/cover.jpg", updated_at: "2026-09-30T00:00:00.000Z" },
      catalog_visibility: "selected_users",
      allowlist_email: "hidden@example.com",
    } as CatalogCard & { catalog_visibility: string; allowlist_email: string },
  ]);

  assert.match(fingerprint, /public-1/);
  assert.match(fingerprint, /Тишина/);
  assert.match(fingerprint, /\/cover\.jpg/);
  assert.equal(fingerprint.includes("selected_users"), false);
  assert.equal(fingerprint.includes("hidden@example.com"), false);
}

function testPageOneReplaceScenarios() {
  const pageSize = 2;
  const saved = card("kept", {
    title: "Старое имя",
    viewer: { can_listen: true, has_grant: true, is_saved: true },
  });
  const second = card("second");
  const tail = card("tail");
  const published = card("new", { title: "Новый продукт" });
  const renamed = card("kept", {
    title: "Новое имя",
    cover: { url: "/new-cover.jpg", alt: "Новое имя", updated_at: "2026-09-30T00:00:00.000Z" },
    viewer: { can_listen: false, has_grant: false, is_saved: false },
  });

  const withNew = replaceCatalogPageOne([saved, second], [published, renamed], pageSize);
  assert.deepEqual(
    withNew.items.map((item) => item.publication_id),
    ["new", "kept"],
  );
  assert.equal(withNew.items[0]?.title, "Новый продукт");
  assert.equal(withNew.items[1]?.title, "Новое имя");
  assert.equal(withNew.items[1]?.cover.url, "/new-cover.jpg");
  assert.equal(withNew.items[1]?.viewer.has_grant, true);
  assert.equal(withNew.items[1]?.viewer.is_saved, true);
  assert.equal(withNew.items[1]?.viewer.can_listen, true);
  assert.equal(withNew.tailCount, 0);

  const unpublished = replaceCatalogPageOne(
    [saved, second, tail],
    [renamed],
    pageSize,
  );
  assert.deepEqual(
    unpublished.items.map((item) => item.publication_id),
    ["kept", "tail"],
  );
  assert.equal(unpublished.items.some((item) => item.publication_id === "second"), false);

  const duplicated = replaceCatalogPageOne(
    [saved, second, tail],
    [renamed, renamed, second],
    pageSize,
  );
  assert.deepEqual(
    duplicated.items.map((item) => item.publication_id),
    ["kept", "second", "tail"],
  );
  assert.equal(new Set(duplicated.items.map((item) => item.publication_id)).size, 3);

  const cursor = resolveNextCursorAfterPageReplace({
    tailCount: duplicated.tailCount,
    previousCursor: "page-2",
    freshCursor: "fresh-page-2",
  });
  assert.equal(cursor, "page-2");
  assert.equal(
    resolveNextCursorAfterPageReplace({
      tailCount: 0,
      previousCursor: "page-2",
      freshCursor: null,
    }),
    null,
  );

  const merged = mergePublicCatalogCard(saved, renamed);
  assert.equal(merged.viewer.has_grant, true);
  assert.equal(catalogListingUnchanged([merged], [merged]), true);
  assert.equal(catalogListingUnchanged([saved], [renamed]), false);
}

async function testDebounceFallbackVisibilityAndCleanup() {
  const fake = createFakeClock();
  let visible: "visible" | "hidden" = "visible";
  let fingerprint = "same";
  let probeCalls = 0;
  let refreshCalls = 0;
  let unsubscribed = false;
  const refreshGate: Array<() => void> = [];

  const controller = createLivePublicContentController({
    clock: fake.clock,
    debounceMs: 600,
    fallbackIntervalMs: 45_000,
    getVisibility: () => visible,
    subscribeVisibility: (listener) => {
      visibilityListener = listener;
      return () => {
        unsubscribed = true;
      };
    },
    probe: async () => {
      probeCalls += 1;
      return fingerprint;
    },
    refresh: () => {
      refreshCalls += 1;
      return new Promise<void>((resolve) => {
        refreshGate.push(resolve);
      });
    },
  });

  let visibilityListener = () => {};
  const stop = controller.start();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(probeCalls, 1, "visible mount records a baseline without refreshing");
  assert.equal(refreshCalls, 0);

  controller.signal("realtime");
  controller.signal("realtime");
  await fake.advance(599);
  assert.equal(refreshCalls, 0, "debounce holds a burst of realtime signals");
  await fake.advance(1);
  assert.equal(refreshCalls, 1, "two rapid events become one refresh");

  controller.signal("realtime");
  controller.signal("realtime");
  await fake.advance(600);
  assert.equal(refreshCalls, 1, "signals during an in-flight refresh do not start a series");
  refreshGate[0]?.();
  await Promise.resolve();
  await Promise.resolve();
  await fake.advance(600);
  assert.equal(refreshCalls, 2, "in-flight signals collapse into one follow-up refresh");
  refreshGate[1]?.();
  await Promise.resolve();

  const probesBeforeHidden = probeCalls;
  visible = "hidden";
  fingerprint = "changed-while-hidden";
  await fake.advance(45_000);
  assert.equal(probeCalls, probesBeforeHidden, "hidden tab does not run the fallback probe");
  assert.equal(refreshCalls, 2);

  visible = "visible";
  visibilityListener();
  await fake.advance(0);
  assert.equal(refreshCalls, 3, "returning to a tab syncs immediately");
  refreshGate.at(-1)?.();
  await Promise.resolve();
  await Promise.resolve();

  fingerprint = "scheduled-release";
  await fake.advance(45_000);
  assert.ok(probeCalls > probesBeforeHidden);
  await fake.advance(600);
  assert.equal(refreshCalls, 4, "visible fallback refreshes when the public head changes");
  refreshGate.at(-1)?.();
  await Promise.resolve();

  const refreshAfterSame = refreshCalls;
  fingerprint = "scheduled-release";
  await fake.advance(45_000);
  await fake.advance(600);
  assert.equal(refreshCalls, refreshAfterSame, "unchanged public head does not refresh again");

  controller.signal("realtime");
  stop();
  await fake.advance(1_000);
  assert.equal(refreshCalls, refreshAfterSame, "unmount drops a pending refresh");
  assert.equal(unsubscribed, true);
  assert.equal(fake.pending(), 0, "unmount clears timers");
  controller.signal("realtime");
  await fake.advance(1_000);
  assert.equal(refreshCalls, refreshAfterSame);
}

function testReconnectHelpers() {
  assert.equal(shouldResubscribeRealtime("CHANNEL_ERROR", false), true);
  assert.equal(shouldResubscribeRealtime("TIMED_OUT", false), true);
  assert.equal(shouldResubscribeRealtime("CLOSED", false), true);
  assert.equal(shouldResubscribeRealtime("CLOSED", true), false);
  assert.equal(shouldResubscribeRealtime("SUBSCRIBED", false), false);
  assert.equal(realtimeReconnectDelayMs(0), 500);
  assert.equal(realtimeReconnectDelayMs(1), 1000);
  assert.equal(realtimeReconnectDelayMs(20), 30_000);
  assert.ok(LIVE_PUBLIC_CONTENT_FALLBACK_MS >= 30_000);
  assert.ok(LIVE_PUBLIC_CONTENT_FALLBACK_MS <= 60_000);
  assert.ok(LIVE_PUBLIC_CONTENT_DEBOUNCE_MS >= 200);
}

function testScrollRestoreDoesNotJumpWhenUnchanged() {
  const calls: Array<[number, number]> = [];
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      scrollY: 240,
      scrollTo(x: number, y: number) {
        calls.push([x, y]);
      },
    },
  });

  try {
    restoreWindowScrollY(240);
    assert.equal(calls.length, 0);
    restoreWindowScrollY(240);
    Object.defineProperty(globalThis.window, "scrollY", { configurable: true, value: 0 });
    restoreWindowScrollY(240);
    assert.deepEqual(calls, [[0, 240]]);
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  }
}

async function testProbeUsesPublicCatalogApi() {
  const urls: string[] = [];
  const fingerprint = await probePublicCatalogHead(async (url) => {
    urls.push(url);
    return {
      ok: true,
      async json() {
        return {
          items: [
            {
              publication_id: "listed-1",
              title: "Открытый",
              slug: "otkrytyy",
              cover: { url: "/ok.jpg", updated_at: null },
              catalog_visibility: "selected_users",
            },
          ],
          nextCursor: null,
        };
      },
    };
  });

  assert.equal(urls.length, 1);
  assert.match(urls[0] ?? "", /^\/api\/catalog\?/);
  assert.match(urls[0] ?? "", /limit=8/);
  assert.equal(fingerprint?.includes("listed-1"), true);
  assert.equal(fingerprint?.includes("selected_users"), false);

  const failed = await probePublicCatalogHead(async () => ({
    ok: false,
    async json() {
      return { items: [] };
    },
  }));
  assert.equal(failed, null);
}

function testWiring() {
  const grid = read("src/components/products/CatalogProductGrid.tsx");
  const sync = read("src/components/public-content/LivePublicContentSync.tsx");
  const route = read("src/components/public-content/LivePublicRouteSync.tsx");
  const catalog = read("src/app/(platform)/(listener)/(catalog)/catalog/page.tsx");
  const home = read("src/app/(platform)/(listener)/(home)/layout.tsx");
  const author = read("src/app/(platform)/(listener)/authors/[slug]/layout.tsx");
  const migration = read("supabase/migrations/20261213120000_practices_realtime_publication.sql");

  assert.match(grid, /replaceCatalogPageOne/);
  assert.match(grid, /fetchCatalogListingPage/);
  assert.match(grid, /LivePublicContentSync/);
  assert.match(grid, /restoreWindowScrollY/);
  assert.doesNotMatch(grid, /router\.refresh/);
  assert.match(catalog, /emptyState=/);
  assert.match(catalog, /CatalogProductGrid/);
  assert.match(home, /LivePublicRouteSync/);
  assert.match(author, /LivePublicRouteSync/);
  assert.match(sync, /@\/lib\/supabase\/client/);
  assert.match(sync, /removeChannel/);
  assert.match(sync, /signalFromRealtimePayload/);
  assert.match(sync, /schema: "public", table: "practices"/);
  assert.match(route, /router\.refresh\(\)/);
  assert.doesNotMatch(route, /setInterval/);
  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.practices/);
  assert.match(migration, /REPLICA IDENTITY FULL/);
  const sql = migration.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(sql, /CREATE POLICY|DROP POLICY|DISABLE ROW LEVEL SECURITY|GRANT /i);
  assert.doesNotMatch(sql, /\b(DELETE|TRUNCATE|UPDATE)\b/i);
}

async function main() {
  testSignalDropsPrivatePayload();
  testFingerprintIgnoresNonPublicFields();
  testPageOneReplaceScenarios();
  await testDebounceFallbackVisibilityAndCleanup();
  testReconnectHelpers();
  testScrollRestoreDoesNotJumpWhenUnchanged();
  await testProbeUsesPublicCatalogApi();
  testWiring();
  console.log("live-public-content-sync-unit: ok");
}

await main();
