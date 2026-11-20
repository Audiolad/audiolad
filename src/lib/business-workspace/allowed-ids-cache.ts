/**
 * t1654u: loadWorkspaceAllowedIds builds the whole venue catalog (eligibility,
 * personal collection, similar mix). That must not run once per cover image.
 * Coalesce in-flight lookups and reuse a short-lived result per session/space.
 */

export const WORKSPACE_ALLOWED_IDS_CACHE_TTL_MS = 30_000;

type Entry = { ids: string[]; expiresAt: number };

export function createAllowedIdsCache(ttlMs = WORKSPACE_ALLOWED_IDS_CACHE_TTL_MS) {
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<string[] | null>>();

  return {
    async get(key: string, load: () => Promise<string[] | null>): Promise<string[] | null> {
      const now = Date.now();
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now) return hit.ids;
      const pending = inflight.get(key);
      if (pending) return pending;
      const request = Promise.resolve()
        .then(load)
        .then((ids) => {
          if (ids) cache.set(key, { ids, expiresAt: Date.now() + ttlMs });
          else cache.delete(key);
          return ids;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, request);
      return request;
    },
    reset() {
      cache.clear();
      inflight.clear();
    },
  };
}

export const workspaceAllowedIdsCache = createAllowedIdsCache();

export function workspaceAllowedIdsCacheKey(actor: {
  device: boolean;
  userId?: string | null;
  locationId: string | null;
  space: { id: string };
}): string {
  const who = actor.device ? "device" : `user:${actor.userId ?? ""}`;
  return `${who}:${actor.locationId ?? ""}:${actor.space.id}`;
}

export function resetWorkspaceAllowedIdsCacheForTests() {
  workspaceAllowedIdsCache.reset();
}
