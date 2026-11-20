// t1647u: cabinet covers stay in a tab-lifetime cache so a music-tab remount paints immediately.
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

const bodies = new Map<string, Uint8Array>([
  ["/api/business/workspace/cover?space=cafe&track=aaa", new Uint8Array([1, 2, 3])],
  ["https://cdn.example/practice-covers/album/xs.webp", new Uint8Array([4, 5, 6, 7])],
]);

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const body = bodies.get(url);
  if (!body) return new Response(null, { status: 404 });
  return new Response(body, { status: 200, headers: { "Content-Type": "image/webp" } });
}) as typeof fetch;

// preload() is a browser helper; Node unit tests get a stub window.
(globalThis as unknown as { window: unknown }).window = globalThis;

const cache = await import("../src/lib/business-app/cabinet-cover-cache.ts");
cache.resetCabinetCoverCacheForTests();

const privateSrc = "/api/business/workspace/cover?space=cafe&track=aaa";
const publicSrc = "https://cdn.example/practice-covers/album/xs.webp";

assert.equal(cache.resolveCabinetCoverSrc(privateSrc), privateSrc);
assert.equal(cache.isCabinetCoverCached(privateSrc), false);

const seen: string[] = [];
const stop = cache.subscribeCabinetCoverCache((src) => seen.push(src));
const first = cache.preloadCabinetCover(privateSrc);
const second = cache.preloadCabinetCover(privateSrc); // same in-flight fetch
assert.equal(first, second);
await first;

assert.equal(cache.isCabinetCoverCached(privateSrc), true);
const blobSrc = cache.resolveCabinetCoverSrc(privateSrc);
assert.ok(blobSrc && blobSrc.startsWith("blob:"));
assert.deepEqual(seen, [privateSrc]);
// A remount reads the same blob URL immediately, without another fetch.
assert.equal(cache.resolveCabinetCoverSrc(privateSrc), blobSrc);
await cache.preloadCabinetCover(privateSrc);
assert.equal(cache.resolveCabinetCoverSrc(privateSrc), blobSrc);
assert.equal(created.length, 1);

await Promise.all([
  cache.preloadCabinetCover(publicSrc),
  cache.preloadCabinetCover(privateSrc),
  cache.preloadCabinetCover(null),
  cache.preloadCabinetCover(""),
]);
assert.equal(cache.isCabinetCoverCached(publicSrc), true);
assert.notEqual(cache.resolveCabinetCoverSrc(publicSrc), publicSrc);
assert.equal(created.length, 2);

stop();
cache.resetCabinetCoverCacheForTests();
assert.equal(cache.isCabinetCoverCached(privateSrc), false);
assert.equal(cache.resolveCabinetCoverSrc(privateSrc), privateSrc);
assert.ok(revoked.includes(created[0]!));

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
assert.doesNotMatch(image, /loading="lazy"/);
assert.match(image, /useState\(\(\) => resolveCabinetCoverSrc\(src\) \?\? src\)/, "remount paints the cached blob immediately");
assert.match(preloader, /preloadCabinetCovers/);
assert.match(preloader, /accessModel\?\.tracks/);
assert.match(shell, /<CabinetCoverPreloader \/>/);
assert.match(mini, /CabinetCoverImage/);
assert.match(now, /CabinetCoverImage/);
assert.doesNotMatch(now, /loading="lazy"/);

console.log("business-cabinet-cover-cache-unit: OK");
