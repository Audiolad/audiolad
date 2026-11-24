// t1654u: at most four cabinet covers preload at once; remount still paints from the tab cache.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const created: string[] = [];
const revoked: string[] = [];
let objectSeq = 0;
const originalFetch = globalThis.fetch;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

URL.createObjectURL = ((blob: Blob) => {
  const url = `blob:cabinet-cover-${++objectSeq}-${blob.size}`;
  created.push(url);
  return url;
}) as typeof URL.createObjectURL;
URL.revokeObjectURL = ((url: string) => {
  revoked.push(url);
}) as typeof URL.revokeObjectURL;

(globalThis as unknown as { window: unknown }).window = globalThis;

type Gate = { url: string; open: (body?: Uint8Array) => void; fail: () => void };
const gates: Gate[] = [];
const fetchLog: { url: string; priority: string | undefined }[] = [];

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  fetchLog.push({ url, priority: (init as { priority?: string } | undefined)?.priority });
  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    init?.signal?.addEventListener("abort", onAbort);
    gates.push({
      url,
      open: (body = new Uint8Array([1, 2, 3])) => {
        init?.signal?.removeEventListener("abort", onAbort);
        resolve(new Response(Buffer.from(body), { status: 200, headers: { "Content-Type": "image/webp" } }));
      },
      fail: () => reject(new Error("aborted")),
    });
  });
}) as typeof fetch;

const cache = await import("../src/lib/business-app/cabinet-cover-cache");
cache.resetCabinetCoverCacheForTests();

const tracks = [
  { coverUrl: "https://cdn.example/covers/now.webp" },
  { coverUrl: "https://cdn.example/covers/a.webp" },
  { coverUrl: "https://cdn.example/covers/b.webp" },
  { coverUrl: "https://cdn.example/covers/c.webp" },
  { coverUrl: "https://cdn.example/covers/d.webp" },
  { coverUrl: "https://cdn.example/covers/e.webp" },
];
const selected = cache.selectCabinetCoverPreloadUrls(tracks, 0, [0, 1, 2, 3, 4, 5]);
assert.deepEqual(selected, [
  "https://cdn.example/covers/now.webp",
  "https://cdn.example/covers/a.webp",
  "https://cdn.example/covers/b.webp",
  "https://cdn.example/covers/c.webp",
]);
assert.equal(selected.length, cache.CABINET_COVER_PRELOAD_LIMIT);
assert.equal(cache.selectCabinetCoverPreloadUrls(tracks, 2, [0, 1, 2, 3, 4, 5]).length, 4);
assert.deepEqual(cache.selectCabinetCoverPreloadUrls(tracks, 2, [0, 1, 2, 3, 4, 5])[0], "https://cdn.example/covers/b.webp");
const same = [
  { coverUrl: "https://cdn.example/covers/now.webp" },
  { coverUrl: "https://cdn.example/covers/now.webp" },
  { coverUrl: "https://cdn.example/covers/now.webp" },
  { coverUrl: "https://cdn.example/covers/now.webp" },
  { coverUrl: "https://cdn.example/covers/d.webp" },
  { coverUrl: "https://cdn.example/covers/e.webp" },
];
assert.deepEqual(
  cache.selectCabinetCoverPreloadUrls(same, 0, [0, 1, 2, 3, 4, 5]),
  ["https://cdn.example/covers/now.webp"],
  "the window is the current track and the next three, not four unique covers from later in the queue",
);
const sparse = [
  { coverUrl: "https://cdn.example/covers/now.webp" },
  { coverUrl: null },
  { coverUrl: "https://cdn.example/covers/b.webp" },
  { coverUrl: null },
  { coverUrl: "https://cdn.example/covers/d.webp" },
];
assert.deepEqual(
  cache.selectCabinetCoverPreloadUrls(sparse, 0, [0, 1, 2, 3, 4]),
  ["https://cdn.example/covers/now.webp", "https://cdn.example/covers/b.webp"],
  "missing covers in the window are skipped, later tracks stay out",
);


const firstSet = cache.setCabinetCoverPreloadSet(tracks.map((track) => track.coverUrl));
assert.equal(firstSet.length, 4);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(cache.cabinetCoverInflightCountForTests(), 4);
assert.equal(fetchLog.length, 4);
assert.ok(fetchLog.every((entry) => entry.priority === "low"));
assert.ok(cache.cabinetCoverQueuedCountForTests() <= 0);

// A later set of four must abort the previous inflight and not exceed the cap.
fetchLog.length = 0;
gates.length = 0;
const moved = cache.setCabinetCoverPreloadSet([
  "https://cdn.example/covers/d.webp",
  "https://cdn.example/covers/e.webp",
  "https://cdn.example/covers/now.webp",
  "https://cdn.example/covers/a.webp",
  "https://cdn.example/covers/b.webp",
]);
assert.equal(moved.length, 4);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(cache.cabinetCoverInflightCountForTests() <= cache.CABINET_COVER_MAX_CONCURRENT);
assert.ok(fetchLog.length <= 4);

// Drain and fill the LRU past the cap through successive 4-cover windows.
// An empty allowed set must not open the floodgate, so we only fetch the current window.
cache.resetCabinetCoverCacheForTests();
fetchLog.length = 0;
gates.length = 0;
void cache.preloadCabinetCover("https://cdn.example/covers/outside-empty.webp");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(fetchLog.length, 0, "an empty allowed set denies cover loads");
assert.equal(cache.cabinetCoverInflightCountForTests(), 0);

const guestAtmosphere = Array.from({ length: 12 }, (_, i) => ({
  coverUrl: `https://cdn.example/covers/guest-${i}.webp`,
}));
assert.equal(cache.GUEST_ATMOSPHERE_COVER_LIMIT, 12);
// t1674u: the guest atmosphere shows all 12 rows at once – every distinct album cover is allowed,
// the current track first, then the rest in list order (duplicates of one album counted once).
guestAtmosphere[7] = { coverUrl: guestAtmosphere[2]!.coverUrl };
const guestWindow = cache.selectCabinetCoverPreloadUrls(guestAtmosphere, 5, null, cache.GUEST_ATMOSPHERE_COVER_LIMIT);
assert.deepEqual(
  guestWindow,
  [5, 6, 2, 8, 9, 10, 11, 0, 1, 3, 4].map((i) => `https://cdn.example/covers/guest-${i}.webp`),
  "guest atmosphere: current first, then the rest, each album once",
);
const guestSet = cache.setCabinetCoverPreloadSet(guestWindow, cache.GUEST_ATMOSPHERE_COVER_LIMIT);
assert.equal(guestSet.length, 11);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(fetchLog.length, cache.CABINET_COVER_MAX_CONCURRENT, "still 4 fetches at a time");
assert.deepEqual(fetchLog.map((e) => e.url), guestWindow.slice(0, 4), "current and following rows first");
for (const track of guestAtmosphere) void cache.preloadCabinetCover(track.coverUrl);
let guard = 0;
while (gates.length > 0 && guard++ < 20) {
  const batch = gates.splice(0, gates.length);
  for (const gate of batch) gate.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
assert.deepEqual([...new Set(fetchLog.map((e) => e.url))].sort(), [...guestWindow].sort(), "every guest row cover is fetched");
for (const url of guestWindow) assert.equal(cache.isCabinetCoverCached(url), true);
// The signed-in cabinet queue keeps the 4-cover window (t1654u).
assert.equal(cache.setCabinetCoverPreloadSet(guestAtmosphere.map((t) => t.coverUrl)).length, cache.CABINET_COVER_PRELOAD_LIMIT);
while (gates.length > 0) {
  const batch = gates.splice(0, gates.length);
  for (const gate of batch) gate.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// t1677u: owner/hall «Музыка» – the playing track, the 3 listed «Дальше в очереди» rows (unique
// tracks ahead, the same indices as the list) and 2 rows of lookahead; never the whole queue.
{
  assert.equal(cache.CABINET_QUEUE_COVER_LIMIT, 6);
  const q = Array.from({ length: 25 }, (_, i) => ({ audioItemId: `a${i}`, coverUrl: `https://cdn.example/covers/q-${i}.webp` }));
  const qUrl = (i: number) => `https://cdn.example/covers/q-${i}.webp`;
  assert.deepEqual(cache.selectCabinetQueueCoverUrls(q, 0, null), [0, 1, 2, 3, 4, 5].map(qUrl));
  // A repeat of a heard track right after the playhead is not a listed row – the window skips it too.
  const order = [7, 3, 7, 9, 3, 11, 12, 13, 14];
  assert.deepEqual(cache.selectCabinetQueueCoverUrls(q, 3, order), [3, 9, 11, 12, 13, 14].map(qUrl));
  const { cafeQueuePreviewIndices } = await import("../src/lib/business-app/cafe-queue/order");
  assert.deepEqual(cafeQueuePreviewIndices(q, order, 3).slice(0, 3), [9, 11, 12], "listed rows");
  // Shared album covers are fetched once; an unknown playhead falls back to the first track.
  const shared = q.map((t, i) => ({ ...t, coverUrl: qUrl(i % 2) }));
  assert.deepEqual(cache.selectCabinetQueueCoverUrls(shared, 0, null), [qUrl(0), qUrl(1)]);
  assert.equal(cache.selectCabinetQueueCoverUrls(q, 99, null)[0], qUrl(0));
  assert.deepEqual(cache.selectCabinetQueueCoverUrls([], 0, null), []);
  cache.resetCabinetCoverCacheForTests();
  fetchLog.length = 0;
  gates.length = 0;
  const set = cache.setCabinetCoverPreloadSet(cache.selectCabinetQueueCoverUrls(q, 0, null), cache.CABINET_QUEUE_COVER_LIMIT);
  assert.equal(set.length, 6);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetchLog.length, cache.CABINET_COVER_MAX_CONCURRENT, "still 4 requests at a time (t1654u freeze guard)");
  for (const track of q.slice(6)) void cache.preloadCabinetCover(track.coverUrl);
  let guard = 0;
  while (gates.length > 0 && guard++ < 20) {
    const batch = gates.splice(0, gates.length);
    for (const gate of batch) gate.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.deepEqual([...new Set(fetchLog.map((e) => e.url))].sort(), set.slice().sort(), "nothing beyond the 6 allowed covers");
}

cache.resetCabinetCoverCacheForTests();
fetchLog.length = 0;
gates.length = 0;
const many = Array.from({ length: cache.CABINET_COVER_CACHE_LIMIT + 2 }, (_, i) => `https://cdn.example/covers/n${i}.webp`);
for (let offset = 0; offset < many.length; offset += cache.CABINET_COVER_PRELOAD_LIMIT) {
  cache.setCabinetCoverPreloadSet(many.slice(offset, offset + cache.CABINET_COVER_PRELOAD_LIMIT));
  await new Promise((resolve) => setTimeout(resolve, 0));
  while (gates.length > 0) {
    const batch = gates.splice(0, gates.length);
    for (const gate of batch) gate.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
assert.equal(cache.cabinetCoverCacheSizeForTests(), cache.CABINET_COVER_CACHE_LIMIT);
assert.ok(revoked.length >= 2);
assert.equal(cache.isCabinetCoverCached(many[0]!), false);
assert.equal(cache.isCabinetCoverCached(many[many.length - 1]!), true);
const blobSrc = cache.resolveCabinetCoverSrc(many[many.length - 1]!);
assert.ok(blobSrc && blobSrc.startsWith("blob:"));

cache.resetCabinetCoverCacheForTests();
assert.equal(cache.cabinetCoverCacheSizeForTests(), 0);
assert.equal(cache.cabinetCoverInflightCountForTests(), 0);

globalThis.fetch = originalFetch;
URL.createObjectURL = originalCreate;
URL.revokeObjectURL = originalRevoke;

const button = read("src/components/business-app/BusinessAtmosphereTrackButton.tsx");
const image = read("src/components/business-app/CabinetCoverImage.tsx");
const preloader = read("src/components/business-app/workspace/CabinetCoverPreloader.tsx");
const shell = read("src/components/business-app/BusinessAppShell.tsx");
const mini = read("src/components/business-app/workspace/BusinessCabinetMiniBar.tsx");
const now = read("src/components/business-app/workspace/BusinessWorkspace.tsx");
assert.doesNotMatch(button, /loading="lazy"/);
assert.match(button, /CabinetCoverImage/);
assert.match(image, /decoding="sync"/);
assert.match(image, /fetchPriority="low"/);
assert.doesNotMatch(image, /loading="lazy"/);
assert.match(image, /isCabinetCoverCached\(src\) \? resolveCabinetCoverSrc\(src\) : null/);
assert.match(image, /subscribeCabinetCoverCache/);
assert.match(image, /if \(!current\) return null/, "uncached covers do not start a raw <img> fetch outside the cap");
assert.match(image, /scheduleCabinetCoverPreload/);
const cacheSource = read("src/lib/business-app/cabinet-cover-cache.ts");
const guestPlayback = read("src/components/business-app/sound/BusinessGuestPlayback.tsx");
assert.match(preloader, /selectCabinetCoverPreloadUrls/);
assert.match(preloader, /setCabinetCoverPreloadSet/);
assert.match(preloader, /scheduleCabinetCoverPreload/);
assert.match(preloader, /useBusinessGuestPlaybackOptional/);
assert.match(preloader, /useCabinet \? CABINET_QUEUE_COVER_LIMIT : GUEST_ATMOSPHERE_COVER_LIMIT/);
assert.match(preloader, /selectCabinetQueueCoverUrls\(cabinetTracks \?\? \[\], index, order\)/);
assert.match(now, /cafeQueuePreviewIndices\(model\.tracks, playOrder, currentIndex\)/, "the list and the preloader share the row selection");
assert.match(guestPlayback, /export function useBusinessGuestPlaybackOptional/);
assert.doesNotMatch(cacheSource, /desired\.size > 0/, "an empty allowed set must deny loads, not open the floodgate");
assert.doesNotMatch(preloader, /preloadCabinetCovers/);
assert.doesNotMatch(preloader, /tracks\.map\(\(track\) => cabinetAlbumCoverUrl/);
assert.match(shell, /<CabinetCoverPreloader \/>/);
assert.match(mini, /CabinetCoverImage/);
assert.match(now, /CabinetCoverImage/);
assert.doesNotMatch(now, /loading="lazy"/);

console.log("business-cabinet-cover-cache-unit: OK");
