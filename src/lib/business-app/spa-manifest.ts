/**
 * Business SPA PR3: client-side contract for the player manifest returned by
 * public.business_spa_program_manifest (business_spa_manifest_v1).
 *
 * The server already delivers only tracks with an ELIGIBLE business_background_playback
 * decision. The client re-checks the time bounds fail-closed and never extends them:
 *  - a track may be cached offline only if offline_allowed is true;
 *  - a cached copy must be dropped at min(offline_cache_until, cachedAt + 7 days, playable_until);
 *  - after expires_at the manifest must be refreshed before new tracks are started.
 * One rule for every rightsholder; no per-holder exceptions.
 */

export const SPA_MANIFEST_VERSION = "business_spa_manifest_v1";
export const SPA_OFFLINE_CACHE_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export type SpaManifestItem = {
  position: number;
  audioItemId: string;
  trackCode: string | null;
  title: string;
  durationSeconds: number | null;
  gainDb: number | null;
  playableUntil: Date | null;
  offlineAllowed: boolean;
  offlineCacheUntil: Date | null;
};

export type SpaManifest = {
  programId: string;
  locationId: string;
  generatedAt: Date;
  expiresAt: Date;
  offlineCacheMaxMs: number;
  withheldCount: number;
  contentHash: string;
  items: SpaManifestItem[];
};

export class SpaManifestError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  throw new SpaManifestError(message);
}

function date(value: unknown, field: string, nullable: true): Date | null;
function date(value: unknown, field: string, nullable?: false): Date;
function date(value: unknown, field: string, nullable = false): Date | null {
  if (value === null || value === undefined) {
    if (nullable) return null;
    fail(`${field}: required`);
  }
  if (typeof value !== "string") fail(`${field}: not a timestamp`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) fail(`${field}: invalid timestamp`);
  return parsed;
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) fail(`${field}: not a uuid`);
  return value;
}

function minDate(...values: (Date | null)[]): Date | null {
  const present = values.filter((v): v is Date => v !== null);
  if (present.length === 0) return null;
  return new Date(Math.min(...present.map((v) => v.getTime())));
}

/** Parses and validates a manifest; anything unexpected is rejected (fail-closed). */
export function parseSpaManifest(raw: unknown): SpaManifest {
  if (!raw || typeof raw !== "object") fail("manifest: not an object");
  const m = raw as Record<string, unknown>;
  if (m.manifest_version !== SPA_MANIFEST_VERSION) fail("manifest_version: unsupported");
  const generatedAt = date(m.generated_at, "generated_at");
  const expiresAt = date(m.expires_at, "expires_at");
  const offlineCacheMaxMs = Number(m.offline_cache_max_seconds) * 1000;
  if (!Number.isFinite(offlineCacheMaxMs) || offlineCacheMaxMs <= 0) fail("offline_cache_max_seconds: invalid");
  const capMs = Math.min(offlineCacheMaxMs, SPA_OFFLINE_CACHE_MAX_MS);
  const cap = new Date(generatedAt.getTime() + capMs);
  if (!Array.isArray(m.items)) fail("items: not an array");
  const seen = new Set<string>();
  const items = m.items.map((rawItem, index): SpaManifestItem => {
    if (!rawItem || typeof rawItem !== "object") fail(`items[${index}]: not an object`);
    const i = rawItem as Record<string, unknown>;
    const audioItemId = uuid(i.audio_item_id, `items[${index}].audio_item_id`);
    if (seen.has(audioItemId)) fail(`items[${index}]: duplicate track`);
    seen.add(audioItemId);
    const playableUntil = date(i.playable_until, `items[${index}].playable_until`, true);
    const rawCacheUntil = date(i.offline_cache_until, `items[${index}].offline_cache_until`, true);
    const offlineAllowed = i.offline_allowed === true && rawCacheUntil !== null;
    const gain = i.gain_db === null || i.gain_db === undefined ? null : Number(i.gain_db);
    if (gain !== null && (!Number.isFinite(gain) || gain < -30 || gain > 6)) fail(`items[${index}].gain_db: out of range`);
    return {
      position: Number(i.position),
      audioItemId,
      trackCode: typeof i.track_code === "string" ? i.track_code : null,
      title: typeof i.title === "string" ? i.title : "",
      durationSeconds: typeof i.duration_seconds === "number" ? i.duration_seconds : null,
      gainDb: gain,
      playableUntil,
      offlineAllowed,
      // Never trust a server value beyond the universal 7-day cap or the playback bound.
      offlineCacheUntil: offlineAllowed ? minDate(rawCacheUntil, cap, playableUntil) : null,
    };
  });
  return {
    programId: uuid(m.program_id, "program_id"),
    locationId: uuid(m.location_id, "location_id"),
    generatedAt,
    expiresAt: minDate(expiresAt, cap) as Date,
    offlineCacheMaxMs: capMs,
    withheldCount: Number(m.withheld_count) || 0,
    contentHash: typeof m.content_hash === "string" ? m.content_hash : fail("content_hash: required"),
    items: items.sort((a, b) => a.position - b.position),
  };
}

/** Deadline for a copy cached at `cachedAt`; null = must not be cached at all. */
export function offlineCacheDeadline(item: SpaManifestItem, cachedAt: Date): Date | null {
  if (!item.offlineAllowed || !item.offlineCacheUntil) return null;
  return minDate(item.offlineCacheUntil, new Date(cachedAt.getTime() + SPA_OFFLINE_CACHE_MAX_MS), item.playableUntil);
}

/** Whether a track may be started at `now` (online or from a still-valid cache). */
export function canStartTrack(item: SpaManifestItem, now: Date, cachedAt: Date | null, online: boolean): boolean {
  if (item.playableUntil && now >= item.playableUntil) return false;
  if (online) return true;
  if (!cachedAt) return false;
  const deadline = offlineCacheDeadline(item, cachedAt);
  return deadline !== null && now < deadline;
}

/** Manifest must be refreshed (online) before starting new tracks once expired. */
export function manifestNeedsRefresh(manifest: SpaManifest, now: Date): boolean {
  return now >= manifest.expiresAt;
}
