/** Business SPA PR3 client manifest contract (task 0e05333f). */
import assert from "node:assert/strict";
import {
  SpaManifestError,
  canStartTrack,
  manifestNeedsRefresh,
  offlineCacheDeadline,
  parseSpaManifest,
} from "../src/lib/business-app/spa-manifest";

const DAY = 24 * 60 * 60 * 1000;
const gen = new Date("2026-10-12T08:00:00Z");
const at = (days: number) => new Date(gen.getTime() + days * DAY).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = () => ({
  manifest_version: "business_spa_manifest_v1",
  program_id: id(100),
  location_id: id(200),
  generated_at: gen.toISOString(),
  expires_at: at(2),
  offline_cache_max_seconds: 604800,
  withheld_count: 5,
  content_hash: "abc",
  items: [
    { position: 2, audio_item_id: id(2), title: "short", gain_db: null, playable_until: null, offline_allowed: true, offline_cache_until: at(3) },
    { position: 1, audio_item_id: id(1), title: "full", gain_db: -7.5, playable_until: null, offline_allowed: true, offline_cache_until: at(7) },
    { position: 3, audio_item_id: id(3), title: "online", gain_db: null, playable_until: null, offline_allowed: false, offline_cache_until: null },
    { position: 4, audio_item_id: id(4), title: "2d", gain_db: null, playable_until: at(2), offline_allowed: true, offline_cache_until: at(2) },
  ],
});

const m = parseSpaManifest(base());
assert.deepEqual(m.items.map((i) => i.position), [1, 2, 3, 4], "ordered");
assert.equal(m.withheldCount, 5);
const [full, short, online, twoDays] = m.items;
assert.equal(full.offlineCacheUntil?.toISOString(), at(7));
assert.equal(short.offlineCacheUntil?.toISOString(), at(3));
assert.equal(online.offlineCacheUntil, null);

// Server value beyond 7 days is clamped (universal cap, no per-holder exceptions).
const greedy = base();
greedy.items[1].offline_cache_until = at(30);
greedy.offline_cache_max_seconds = 30 * 86400;
const g = parseSpaManifest(greedy);
assert.equal(g.items[0].offlineCacheUntil?.toISOString(), at(7), "7-day cap");
assert.equal(g.offlineCacheMaxMs, 7 * DAY);

// Cache deadline is relative to download time too.
const cachedLate = new Date(gen.getTime() + 1 * DAY);
assert.equal(offlineCacheDeadline(full, cachedLate)?.toISOString(), at(7));
assert.equal(offlineCacheDeadline(short, cachedLate)?.toISOString(), at(3));
assert.equal(offlineCacheDeadline(online, gen), null, "online-only never cached");

// Offline start rules.
assert.equal(canStartTrack(full, new Date(gen.getTime() + 6.9 * DAY), gen, false), true);
assert.equal(canStartTrack(full, new Date(gen.getTime() + 7 * DAY), gen, false), false, "expires at 7d");
assert.equal(canStartTrack(short, new Date(gen.getTime() + 3.1 * DAY), gen, false), false, "grant end");
assert.equal(canStartTrack(online, gen, null, false), false, "no cache, offline");
assert.equal(canStartTrack(online, gen, null, true), true);
assert.equal(canStartTrack(twoDays, new Date(gen.getTime() + 2 * DAY), gen, true), false, "playback grant ended even online");

// Manifest refresh.
assert.equal(manifestNeedsRefresh(m, new Date(gen.getTime() + 1.9 * DAY)), false);
assert.equal(manifestNeedsRefresh(m, new Date(gen.getTime() + 2 * DAY)), true);
const late = base();
late.expires_at = at(10);
assert.equal(parseSpaManifest(late).expiresAt.toISOString(), at(7), "expiry clamped to 7d");

// Fail-closed parsing.
const bad = (mutate: (x: ReturnType<typeof base>) => void) => {
  const x = base();
  mutate(x);
  assert.throws(() => parseSpaManifest(x), SpaManifestError);
};
bad((x) => { (x as Record<string, unknown>).manifest_version = "v2"; });
bad((x) => { x.items[0].audio_item_id = "nope"; });
bad((x) => { x.items[1].audio_item_id = x.items[0].audio_item_id; });
bad((x) => { x.items[0].gain_db = 12 as unknown as null; });
bad((x) => { x.generated_at = "garbage"; });
bad((x) => { (x as Record<string, unknown>).items = null; });
// offline_allowed without deadline is treated as not cacheable.
const noDeadline = base();
noDeadline.items[1].offline_cache_until = null;
assert.equal(parseSpaManifest(noDeadline).items[0].offlineAllowed, false);

console.log("business-spa-manifest-client-unit: ok");
