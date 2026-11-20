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

// Drain and fill the LRU past the cap: evicted blob URLs are revoked.
cache.resetCabinetCoverCacheForTests();
fetchLog.length = 0;
gates.length = 0;
const many = Array.from({ length: cache.CABINET_COVER_CACHE_LIMIT + 2 }, (_, i) => `https://cdn.example/covers/n${i}.webp`);
for (const url of many) void cache.preloadCabinetCover(url);
await new Promise((resolve) => setTimeout(resolve, 0));
while (gates.length > 0) {
  const batch = gates.splice(0, gates.length);
  for (const gate of batch) gate.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
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
assert.match(image, /const current = resolveCabinetCoverSrc\(src\) \?\? src/, "remount and track change both use the cached blob or the new src");
assert.doesNotMatch(image, /useState\(/, "must not freeze the first src for the life of a mounted mini-player");
assert.match(image, /scheduleCabinetCoverPreload/);
assert.match(preloader, /selectCabinetCoverPreloadUrls/);
assert.match(preloader, /setCabinetCoverPreloadSet/);
assert.match(preloader, /scheduleCabinetCoverPreload/);
assert.doesNotMatch(preloader, /preloadCabinetCovers/);
assert.doesNotMatch(preloader, /tracks\.map\(\(track\) => cabinetAlbumCoverUrl/);
assert.match(shell, /<CabinetCoverPreloader \/>/);
assert.match(mini, /CabinetCoverImage/);
assert.match(now, /CabinetCoverImage/);
assert.doesNotMatch(now, /loading="lazy"/);

console.log("business-cabinet-cover-cache-unit: OK");
