import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  loadGuestCoffeePassportBundle,
  type GuestCoffeePassportClient,
} from "@/lib/business-app/guest-coffee/passport-query";

import { cafeSignalsFromPassport, type CafeTrackSignals } from "./signals";

const CACHE_MS = 2 * 60 * 1000;

let cache: { at: number; key: string; value: Map<string, CafeTrackSignals> } | null = null;

/**
 * Passport tags and analyzer energy for the ids the cabinet already allows.
 * Read-only. A failure is the caller's cue to keep catalog order.
 * Energy comes from the analyzer result attached to each sealed passport.
 */
export async function loadCafeQueueSignals(
  trackIds: readonly string[],
): Promise<Map<string, CafeTrackSignals>> {
  const ids = [...new Set(trackIds)].sort();
  if (ids.length === 0) return new Map();
  const key = ids.join(",");
  const now = Date.now();
  if (cache && cache.key === key && now - cache.at < CACHE_MS) return cache.value;
  const bundle = await loadGuestCoffeePassportBundle(
    createServiceRoleClient() as unknown as GuestCoffeePassportClient,
    ids,
  );
  const signals = new Map<string, CafeTrackSignals>();
  for (const version of bundle.versions) {
    if (signals.has(version.audio_item_id)) continue;
    const runId = bundle.runIdFor(version);
    signals.set(
      version.audio_item_id,
      cafeSignalsFromPassport(
        version,
        bundle.attributesByPassport.get(version.id) ?? [],
        runId ? bundle.normalizedByRun.get(runId) : undefined,
      ),
    );
  }
  const ranked = [...signals.values()].filter((row) => row.hasPassport && row.energy !== null).length;
  console.info(`[business-cafe-queue] passports=${signals.size} with-energy=${ranked} tracks=${ids.length}`);
  cache = { at: now, key, value: signals };
  return signals;
}
