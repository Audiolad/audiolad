import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { GuestCoffeePlaylist } from "./catalog";
import type { GuestCoffeeSoundFeatures } from "./passport-features";
import { queryGuestCoffeePassportFeatures, type GuestCoffeePassportClient } from "./passport-query";
import {
  buildGuestCoffeeAlbumRankings,
  buildGuestCoffeeRecommendationPlan,
  guestCoffeePassportCoverage,
  type GuestCoffeeRecommendationPlan,
} from "./recommend";

/**
 * a8240527 (passport stage) – SERVER-ONLY data adapter: reads the verified track passports of
 * the shelf tracks (active, sealed Music Passport Basic versions + their attributes) with the
 * service role and turns them into the client-safe recommendation plan. The passport rows,
 * labels, scores and coverage never leave this module; the browser receives only the plan
 * (album ids, track positions, yes / no matches).
 *
 * Read-only: no RPC that writes, no analysis, no backfill. Loading is batched per table
 * (chunked `.in(...)`, no per-album or per-track queries). A short cache (same 5 minutes as
 * the shelf) lets a newly completed passport take effect without any catalogue republish.
 * Any failure falls back to the editorial reserve basis – the shelf never breaks.
 */

const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; key: string; value: Promise<Map<string, GuestCoffeeSoundFeatures>> } | null = null;

/** Usable passport features of the given shelf tracks (empty map on any source error). */
export async function loadGuestCoffeePassportFeatures(trackIds: readonly string[]): Promise<Map<string, GuestCoffeeSoundFeatures>> {
  const ids = [...new Set(trackIds)].sort();
  if (ids.length === 0) return new Map();
  const key = ids.join(",");
  const now = Date.now();
  if (cache && cache.key === key && now - cache.at < CACHE_MS) return cache.value;
  const value = Promise.resolve()
    .then(() => queryGuestCoffeePassportFeatures(createServiceRoleClient() as unknown as GuestCoffeePassportClient, ids))
    .catch((error) => {
      console.error("[business-guest-coffee] passports unavailable, editorial basis", error instanceof Error ? error.message : "unknown");
      return null;
    });
  const entry = { at: now, key, value: value.then((v) => v ?? new Map<string, GuestCoffeeSoundFeatures>()) };
  cache = entry;
  // A failed load is not cached, so the next request retries.
  if ((await value) === null && cache === entry) cache = null;
  return entry.value;
}

/**
 * The client-safe recommendation plan for the shelf. Passport basis where verified passports
 * cover an album well enough, editorial reserve basis everywhere else.
 */
export async function loadGuestCoffeeRecommendationPlan(playlists: readonly GuestCoffeePlaylist[]): Promise<GuestCoffeeRecommendationPlan> {
  const features = await loadGuestCoffeePassportFeatures(playlists.flatMap((p) => p.tracks.map((t) => t.audioItemId)));
  if (features.size > 0) {
    const coverage = guestCoffeePassportCoverage(buildGuestCoffeeAlbumRankings(playlists, features));
    const albums = coverage.filter((c) => c.basis === "passport").length;
    const tracks = coverage.reduce((sum, c) => sum + c.covered, 0);
    const total = coverage.reduce((sum, c) => sum + c.total, 0);
    console.info(`[business-guest-coffee] passport basis albums=${albums}/${coverage.length} tracks=${tracks}/${total}`);
  }
  return buildGuestCoffeeRecommendationPlan(playlists, features);
}
