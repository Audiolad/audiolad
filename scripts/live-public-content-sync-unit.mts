import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CatalogCard } from "../src/lib/catalog/dto";
import type { CatalogListingQuery } from "../src/lib/catalog/listing-contract";
import {
  LIVE_PUBLIC_CONTENT_DEBOUNCE_MS,
  LIVE_PUBLIC_CONTENT_FALLBACK_MS,
  PUBLIC_CONTENT_REVISION_SCOPE,
  PUBLIC_CONTENT_REVISION_TABLE,
  applyLocalLibrarySave,
  PUBLIC_CONTENT_REVISION_API_PATH,
  PUBLIC_REVISION_CHILD_TABLES,
  PUBLIC_REVISION_EXCLUDED_TABLES,
  PUBLIC_REVISION_PARENT_TABLES,
  catalogListingUnchanged,
  catalogLiveRefreshPageCap,
  clientVisibleRevisionRow,
  createLivePublicContentController,
  createSerialTaskQueue,
  fetchCatalogListingToLoadedDepth,
  fingerprintPublicCatalogCards,
  mergeLoadedCatalogWindow,
  nextRevisionAction,
  practiceAffectsPublicSurface,
  probePublicContentRevision,
  relatedChangeBumpsPublicRevision,
  revisionProbeToken,
  realtimeReconnectDelayMs,
  restoreWindowScrollY,
  revisionRowFromRealtimePayload,
  shouldBumpPublicContentRevision,
  shouldResubscribeRealtime,
  signalFromRealtimePayload,
  type LiveSyncClock,
  type PracticeSurfaceSnapshot,
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

const NOW_MS = Date.parse("2026-09-30T12:00:00.000Z");
const PAST = "2026-09-01T00:00:00.000Z";
const FUTURE = "2026-10-30T00:00:00.000Z";

function surface(overrides: Partial<PracticeSurfaceSnapshot> = {}): PracticeSurfaceSnapshot {
  return {
    status: "published",
    scheduledPublishAt: null,
    publishedAt: PAST,
    deletedAt: null,
    catalogVisibility: "listed",
    ...overrides,
  };
}

function listingQuery(limit: number): Omit<CatalogListingQuery, "cursor"> {
  return {
    q: "",
    topic: null,
    section: null,
    access: "all",
    class: "all",
    sort: "new",
    limit,
  };
}

function paginatedCatalogFetch(server: () => string[], limit: number) {
  return async (url: string) => {
    const cursor = new URL(url, "https://audiolad.test").searchParams.get("cursor");
    const start = cursor ? Number(cursor) : 0;
    const ids = server();
    const slice = ids.slice(start, start + limit);
    const next = start + limit < ids.length ? String(start + limit) : null;

    return {
      ok: true,
      async json() {
        return {
          items: slice.map((id) => card(id)),
          nextCursor: next,
        };
      },
    };
  };
}

async function testLoadedWindowRefresh() {
  const limit = 2;
  const loaded = ["A", "B", "C", "D"];

  const published = await fetchCatalogListingToLoadedDepth(
    listingQuery(limit),
    loaded,
    paginatedCatalogFetch(() => ["X", "A", "B", "C", "D"], limit),
  );
  assert.ok(published);
  assert.deepEqual(
    published.items.map((item) => item.publication_id),
    ["X", "A", "B", "C", "D"],
  );
  assert.equal(published.nextCursor, null);

  const unpublished = await fetchCatalogListingToLoadedDepth(
    listingQuery(limit),
    loaded,
    paginatedCatalogFetch(() => ["A", "C", "D"], limit),
  );
  assert.ok(unpublished);
  assert.deepEqual(
    unpublished.items.map((item) => item.publication_id),
    ["A", "C", "D"],
  );
  assert.equal(unpublished.items.some((item) => item.publication_id === "B"), false);

  const merged = mergeLoadedCatalogWindow([
    card("kept", { title: "Новое имя", viewer: { can_listen: false, has_grant: false, is_saved: false } }),
    card("kept"),
  ]);
  assert.deepEqual(
    merged.map((item) => item.publication_id),
    ["kept"],
  );
  assert.equal(merged[0]?.viewer.has_grant, false);
  assert.equal(merged[0]?.viewer.can_listen, false);
  assert.equal(catalogListingUnchanged(merged, merged), true);
}

function testViewerMergeKeepsOnlyLocalSave() {
  const server = card("kept", {
    title: "Новое имя",
    viewer: { can_listen: false, has_grant: false, is_saved: false },
  });
  const withoutLocal = applyLocalLibrarySave(server, null);
  assert.equal(withoutLocal.viewer.has_grant, false);
  assert.equal(withoutLocal.viewer.is_saved, false);
  assert.equal(withoutLocal.viewer.can_listen, false);

  const withLocal = applyLocalLibrarySave(server, true);
  assert.equal(withLocal.viewer.is_saved, true);
  assert.equal(withLocal.viewer.has_grant, false);
  assert.equal(withLocal.viewer.can_listen, false);
  assert.equal(catalogListingUnchanged([server], [withLocal]), false);
  assert.match(read("src/lib/public-content/live-sync.ts"), /peekLibrarySave\(next\.publication_id\)/);
}

async function testLiveRefreshConcurrentWithLoadMore() {
  const limit = 2;
  const enqueue = createSerialTaskQueue();
  let items = ["A", "B"];
  let cursor: string | null = "2";
  let server = ["A", "B", "C", "D"];
  let releaseLoadMore: () => void = () => {};
  const loadMoreGate = new Promise<void>((resolve) => {
    releaseLoadMore = resolve;
  });
  let refreshStarted = false;

  const loadMore = () =>
    enqueue(async () => {
      const startCursor = cursor;

      if (!startCursor) {
        return;
      }

      const snapshot = server.slice();
      await loadMoreGate;
      const start = Number(startCursor);
      const nextIds = snapshot.slice(start, start + limit);
      const seen = new Set(items);
      items = [...items, ...nextIds.filter((id) => !seen.has(id))];
      cursor = start + limit < snapshot.length ? String(start + limit) : null;
    });

  const refresh = () =>
    enqueue(async () => {
      refreshStarted = true;
      const page = await fetchCatalogListingToLoadedDepth(
        listingQuery(limit),
        items,
        paginatedCatalogFetch(() => server, limit),
      );
      assert.ok(page);
      items = mergeLoadedCatalogWindow(page.items).map((item) => item.publication_id);
      cursor = page.nextCursor;
    });

  const loadMorePromise = loadMore();
  await Promise.resolve();
  server = ["X", "A", "B", "C", "D"];
  const refreshPromise = refresh();
  await Promise.resolve();
  assert.equal(refreshStarted, false, "live refresh waits for the in-flight loadMore");
  releaseLoadMore();
  await loadMorePromise;
  await refreshPromise;
  assert.deepEqual(items, ["X", "A", "B", "C", "D"]);
  assert.equal(new Set(items).size, items.length);

  items = ["A", "B"];
  cursor = "2";
  server = ["A", "B", "C", "D"];
  let releaseRefresh: () => void = () => {};
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let loadMoreApplied = false;

  const blockedRefresh = enqueue(async () => {
    await refreshGate;
    server = ["X", "A", "B", "C", "D"];
    const page = await fetchCatalogListingToLoadedDepth(
      listingQuery(limit),
      items,
      paginatedCatalogFetch(() => server, limit),
    );
    assert.ok(page);
    items = mergeLoadedCatalogWindow(page.items).map((item) => item.publication_id);
    cursor = page.nextCursor;
  });
  const queuedLoadMore = enqueue(async () => {
    loadMoreApplied = true;
    const startCursor = cursor;

    if (!startCursor) {
      return;
    }

    const start = Number(startCursor);
    const nextIds = server.slice(start, start + limit);
    const seen = new Set(items);
    items = [...items, ...nextIds.filter((id) => !seen.has(id))];
    cursor = start + limit < server.length ? String(start + limit) : null;
  });

  await Promise.resolve();
  assert.equal(loadMoreApplied, false);
  releaseRefresh();
  await blockedRefresh;
  await queuedLoadMore;
  assert.deepEqual(items, ["X", "A", "B", "C", "D"]);
  assert.equal(new Set(items).size, items.length);
  assert.equal(items.filter((id) => id === "B").length, 1);
  assert.equal(items.filter((id) => id === "X").length, 1);
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

async function testRevisionProbeIgnoresProductFields() {
  const urls: string[] = [];
  const init: RequestInit[] = [];
  const token = await probePublicContentRevision(async (url, options) => {
    urls.push(url);
    init.push(options ?? {});
    return {
      ok: true,
      async json() {
        return {
          revision: 12,
          publication_id: "outside-top-8",
          title: "Далеко в каталоге",
          slug: "daleko",
          catalog_visibility: "selected_users",
        };
      },
    };
  });

  assert.deepEqual(urls, [PUBLIC_CONTENT_REVISION_API_PATH]);
  assert.equal(init[0]?.cache, "no-store");
  assert.equal(token, "12");
  assert.equal(token?.includes("outside-top-8"), false);
  assert.equal(token?.includes("selected_users"), false);
  assert.equal(
    revisionProbeToken({
      revision: 12,
      publication_id: "secret-practice",
      title: "Только выбранным",
    }),
    "12",
  );

  const failed = await probePublicContentRevision(async () => ({
    ok: false,
    async json() {
      return { revision: 1, items: [] };
    },
  }));
  assert.equal(failed, null);
}

function testMissedRevisionOnReconnectRefreshes() {
  let lastSeen: number | null = null;
  const first = nextRevisionAction(lastSeen, 10);
  lastSeen = first.lastSeen;
  assert.equal(first.refresh, false, "the first sample is a baseline");
  assert.equal(lastSeen, 10);

  const same = nextRevisionAction(lastSeen, 10);
  lastSeen = same.lastSeen;
  assert.equal(same.refresh, false);

  const missed = nextRevisionAction(lastSeen, 12);
  lastSeen = missed.lastSeen;
  assert.equal(missed.refresh, true, "revision 12 after a gap from 10 refreshes without a replayed event");
  assert.equal(lastSeen, 12);

  const stale = nextRevisionAction(lastSeen, 11);
  assert.equal(stale.refresh, false);
  assert.equal(stale.lastSeen, 12);
}

async function testFallbackSeesRevisionOutsideFirstPage() {
  const fake = createFakeClock();
  let revision = "4";
  let refreshCalls = 0;
  const controller = createLivePublicContentController({
    clock: fake.clock,
    debounceMs: 600,
    fallbackIntervalMs: 45_000,
    getVisibility: () => "visible",
    subscribeVisibility: () => () => {},
    probe: async () => revision,
    refresh: async () => {
      refreshCalls += 1;
    },
  });
  const stop = controller.start();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(refreshCalls, 0);

  revision = "5";
  await fake.advance(45_000);
  await fake.advance(600);
  assert.equal(refreshCalls, 1, "a revision change outside the first cards still refreshes");
  stop();
}

async function testDeletedAnchorDoesNotCrawlCatalog() {
  const pageSize = 20;
  const loaded = Array.from({ length: 80 }, (_, index) => `loaded-${index}`);
  let calls = 0;
  const page = await fetchCatalogListingToLoadedDepth(
    listingQuery(pageSize),
    loaded,
    async () => {
      calls += 1;
      const start = (calls - 1) * pageSize;
      return {
        ok: true,
        async json() {
          return {
            items: Array.from({ length: pageSize }, (_, index) => card(`other-${start + index}`)),
            nextCursor: String(start + pageSize),
          };
        },
      };
    },
  );

  const cap = catalogLiveRefreshPageCap(loaded.length, pageSize);
  assert.equal(cap, 6);
  assert.equal(calls, cap);
  assert.ok(calls < 20, "a missing anchor does not walk tens of pages");
  assert.equal(page?.items.length, cap * pageSize);
  assert.equal(page?.items.some((item) => item.publication_id === "loaded-79"), false);
}

function testRelatedTablesBumpOnlyForPublicSurface() {
  for (const table of PUBLIC_REVISION_CHILD_TABLES) {
    assert.equal(relatedChangeBumpsPublicRevision({ table, publicSurface: true }), true, table);
    assert.equal(relatedChangeBumpsPublicRevision({ table, publicSurface: false }), false, table);
  }

  for (const table of PUBLIC_REVISION_PARENT_TABLES) {
    assert.equal(relatedChangeBumpsPublicRevision({ table, publicSurface: true }), true, table);
    assert.equal(relatedChangeBumpsPublicRevision({ table, publicSurface: false }), false, table);
  }

  for (const table of PUBLIC_REVISION_EXCLUDED_TABLES) {
    assert.equal(relatedChangeBumpsPublicRevision({ table, publicSurface: true }), false, table);
  }

  const privatePayload = clientVisibleRevisionRow(
    revisionRowFromRealtimePayload({
      new: {
        scope: "practices",
        revision: 9,
        updated_at: PAST,
        practice_id: "secret-practice",
        publication_id: "secret-practice",
        author_id: "secret-author",
        topic_id: "secret-topic",
      },
    }),
  );
  const encoded = JSON.stringify(privatePayload);
  assert.equal(encoded.includes("secret-practice"), false);
  assert.equal(encoded.includes("secret-author"), false);
  assert.equal(encoded.includes("secret-topic"), false);
}

function testRevisionSignalDoesNotCarryProducts() {
  const atMs = NOW_MS;
  const publicRow = surface();
  const unpublished = surface({ status: "unpublished" });
  const privateRow = surface({ catalogVisibility: "selected_users" });
  const scheduledBefore = surface({
    publishedAt: null,
    scheduledPublishAt: FUTURE,
  });
  const scheduledAfter = surface({
    publishedAt: PAST,
    scheduledPublishAt: PAST,
  });

  assert.equal(
    shouldBumpPublicContentRevision({
      operation: "UPDATE",
      previous: publicRow,
      next: unpublished,
      atMs,
    }),
    true,
    "unpublish still bumps after the row leaves the public surface",
  );
  assert.equal(practiceAffectsPublicSurface(unpublished, atMs), false);
  assert.equal(
    shouldBumpPublicContentRevision({
      operation: "INSERT",
      previous: null,
      next: publicRow,
      atMs,
    }),
    true,
  );
  assert.equal(
    shouldBumpPublicContentRevision({
      operation: "UPDATE",
      previous: publicRow,
      next: publicRow,
      atMs,
    }),
    true,
    "title, cover, price, and other edits on a public product bump",
  );
  assert.equal(
    shouldBumpPublicContentRevision({
      operation: "UPDATE",
      previous: publicRow,
      next: surface({ catalogVisibility: "unlisted" }),
      atMs,
    }),
    true,
  );
  assert.equal(
    shouldBumpPublicContentRevision({
      operation: "UPDATE",
      previous: scheduledBefore,
      next: scheduledAfter,
      atMs,
    }),
    true,
  );
  assert.equal(
    shouldBumpPublicContentRevision({
      operation: "DELETE",
      previous: publicRow,
      next: null,
      atMs,
    }),
    true,
  );
  assert.equal(
    shouldBumpPublicContentRevision({
      operation: "DELETE",
      previous: privateRow,
      next: null,
      atMs,
    }),
    false,
  );
  assert.equal(
    shouldBumpPublicContentRevision({
      operation: "DELETE",
      previous: surface({ status: "draft", publishedAt: null }),
      next: null,
      atMs,
    }),
    false,
  );

  const payload = {
    eventType: "DELETE",
    old: {
      id: "secret-practice",
      publication_id: "secret-practice",
      title: "Только выбранным",
      slug: "secret",
      catalog_visibility: "selected_users",
    },
    new: {
      scope: PUBLIC_CONTENT_REVISION_SCOPE,
      revision: 4,
      updated_at: PAST,
      publication_id: "secret-practice",
      title: "Только выбранным",
      catalog_visibility: "selected_users",
    },
  };
  const visible = clientVisibleRevisionRow(revisionRowFromRealtimePayload(payload));
  const signal = signalFromRealtimePayload(visible);
  const encoded = JSON.stringify({ visible, signal });

  assert.deepEqual(visible, {
    scope: "practices",
    revision: 4,
    updated_at: PAST,
  });
  assert.deepEqual(signal, { source: "realtime" });
  assert.equal(encoded.includes("secret-practice"), false);
  assert.equal(encoded.includes("selected_users"), false);
  assert.equal(encoded.includes("Только выбранным"), false);
  assert.equal(encoded.includes("secret"), false);
}

async function testScheduledReleaseFallbackRefreshesSurfaces() {
  const fake = createFakeClock();
  let fingerprint = "before-release";
  let refreshCalls = 0;
  const controller = createLivePublicContentController({
    clock: fake.clock,
    debounceMs: 600,
    fallbackIntervalMs: 45_000,
    getVisibility: () => "visible",
    subscribeVisibility: () => () => {},
    probe: async () => fingerprint,
    refresh: async () => {
      refreshCalls += 1;
    },
  });
  const stop = controller.start();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(refreshCalls, 0);

  fingerprint = "12";
  await fake.advance(45_000);
  await fake.advance(600);
  assert.equal(refreshCalls, 1, "visible fallback refreshes after the scheduled claim changes the revision");
  const revisionRoute = read("src/app/api/public-content/revision/route.ts");
  const claimAt = revisionRoute.indexOf("releaseDueScheduledPublications");
  const readAt = revisionRoute.indexOf('.select("revision")');
  assert.ok(claimAt >= 0 && readAt > claimAt, "the revision probe claims due schedules before reading the row");
  assert.match(revisionRoute, /cache: "no-store"|no-store/);
  assert.doesNotMatch(revisionRoute, /publication_id|title|slug/);

  const claimBumps = shouldBumpPublicContentRevision({
    operation: "UPDATE",
    previous: surface({ publishedAt: null, scheduledPublishAt: PAST }),
    next: surface({ publishedAt: PAST, scheduledPublishAt: PAST }),
    atMs: NOW_MS,
  });
  assert.equal(claimBumps, true, "scheduled claim changes the revision row");
  controller.signal("realtime");
  await fake.advance(600);
  assert.equal(refreshCalls, 2, "revision signal refreshes open surfaces");
  stop();
}

function testWiring() {
  const grid = read("src/components/products/CatalogProductGrid.tsx");
  const sync = read("src/components/public-content/LivePublicContentSync.tsx");
  const route = read("src/components/public-content/LivePublicRouteSync.tsx");
  const catalog = read("src/app/(platform)/(listener)/(catalog)/catalog/page.tsx");
  const home = read("src/app/(platform)/(listener)/(home)/layout.tsx");
  const author = read("src/app/(platform)/(listener)/authors/[slug]/layout.tsx");
  const migration = read("supabase/migrations/20261213120000_public_content_revision.sql");

  assert.match(grid, /fetchCatalogListingToLoadedDepth/);
  assert.match(grid, /fetchCatalogListingPage/);
  assert.match(grid, /createSerialTaskQueue/);
  assert.match(grid, /LivePublicContentSync/);
  assert.match(grid, /restoreWindowScrollY/);
  assert.doesNotMatch(grid, /replaceCatalogPageOne/);
  assert.doesNotMatch(grid, /router\.refresh/);
  assert.match(catalog, /emptyState=/);
  assert.match(catalog, /CatalogProductGrid/);
  assert.match(home, /LivePublicRouteSync/);
  assert.match(author, /LivePublicRouteSync/);
  assert.match(sync, /@\/lib\/supabase\/client/);
  assert.match(sync, /removeChannel/);
  assert.match(sync, /signalFromRealtimePayload/);
  assert.match(sync, /clientVisibleRevisionRow/);
  assert.match(sync, /nextRevisionAction/);
  assert.match(sync, /catchUpRevision/);
  assert.match(sync, /probePublicContentRevision/);
  assert.match(sync, /\.select\("revision"\)/);
  assert.doesNotMatch(sync, /probePublicCatalogHead/);
  assert.match(sync, /PUBLIC_CONTENT_REVISION_TABLE/);
  assert.equal(PUBLIC_CONTENT_REVISION_TABLE, "public_content_revision");
  assert.equal(PUBLIC_CONTENT_REVISION_SCOPE, "practices");
  assert.doesNotMatch(sync, /table: "practices"/);
  assert.match(route, /router\.refresh\(\)/);
  assert.doesNotMatch(route, /setInterval/);
  assert.match(migration, /public\.public_content_revision/);
  assert.doesNotMatch(migration, /ADD TABLE public\.practices/);
  assert.doesNotMatch(migration, /REPLICA IDENTITY FULL/);
}

async function main() {
  testSignalDropsPrivatePayload();
  testFingerprintIgnoresNonPublicFields();
  await testLoadedWindowRefresh();
  testViewerMergeKeepsOnlyLocalSave();
  await testLiveRefreshConcurrentWithLoadMore();
  await testDeletedAnchorDoesNotCrawlCatalog();
  testRevisionSignalDoesNotCarryProducts();
  testMissedRevisionOnReconnectRefreshes();
  testRelatedTablesBumpOnlyForPublicSurface();
  await testFallbackSeesRevisionOutsideFirstPage();
  await testScheduledReleaseFallbackRefreshesSurfaces();
  await testDebounceFallbackVisibilityAndCleanup();
  testReconnectHelpers();
  testScrollRestoreDoesNotJumpWhenUnchanged();
  await testRevisionProbeIgnoresProductFields();
  testWiring();
  console.log("live-public-content-sync-unit: ok");
}

await main();
