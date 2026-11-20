import "server-only";

import { passportSimilarity } from "@/lib/business-app/cafe-queue/rank";
import { cafeSignalsFromPassport, type CafeTrackSignals } from "@/lib/business-app/cafe-queue/signals";
import {
  loadGuestCoffeePassportBundle,
  type GuestCoffeePassportClient,
} from "@/lib/business-app/guest-coffee/passport-query";
import { chunkIds } from "@/lib/supabase/chunk";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  normalizeCollectionSharePercent,
  pickSimilarTracks,
  readClapVector,
  takeAnalyzerRuns,
} from "./similar-mix.mjs";

const CACHE_MS = 2 * 60 * 1000;

type MixTrack = { audioItemId: string };

type MixSignals = {
  vectors: Map<string, Float64Array>;
  energy: Map<string, number | null>;
  tags: Map<string, CafeTrackSignals>;
};

let signalCache: { at: number; key: string; value: MixSignals } | null = null;
let mixCache: { at: number; key: string; value: string[] } | null = null;

function cacheKey(ids: readonly string[]): string {
  return [...new Set(ids)].sort().join(",");
}

export async function loadMixSignals(trackIds: readonly string[]): Promise<MixSignals> {
  const key = cacheKey(trackIds);
  const now = Date.now();
  if (signalCache && signalCache.key === key && now - signalCache.at < CACHE_MS) return signalCache.value;
  const empty: MixSignals = { vectors: new Map(), energy: new Map(), tags: new Map() };
  if (key.length === 0) return empty;
  const db = createServiceRoleClient();
  const bundle = await loadGuestCoffeePassportBundle(
    db as unknown as GuestCoffeePassportClient,
    [...new Set(trackIds)],
  );
  const runIds = [...new Set(bundle.versions.flatMap((version) => {
    const runId = bundle.runIdFor(version);
    return runId ? [runId] : [];
  }))];
  const normalizedByRun = new Map<string, unknown>();
  for (const chunk of chunkIds(runIds)) {
    const result = await db.from("music_analyzer_runs").select("id, normalized_json").in("id", chunk);
    for (const [id, json] of takeAnalyzerRuns(result)) normalizedByRun.set(id, json);
  }
  const vectors = new Map<string, Float64Array>();
  const energy = new Map<string, number | null>();
  const tags = new Map<string, CafeTrackSignals>();
  for (const version of bundle.versions) {
    if (tags.has(version.audio_item_id)) continue;
    const runId = bundle.runIdFor(version);
    const normalized = runId ? normalizedByRun.get(runId) : undefined;
    const signals = cafeSignalsFromPassport(
      version,
      bundle.attributesByPassport.get(version.id) ?? [],
      normalized,
    );
    tags.set(version.audio_item_id, signals);
    energy.set(version.audio_item_id, signals.energy);
    const vector = readClapVector(normalized);
    if (vector) vectors.set(version.audio_item_id, vector);
  }
  const value = { vectors, energy, tags };
  signalCache = { at: now, key, value };
  return value;
}

export async function pickSimilarFromSignals<T extends MixTrack>(input: {
  collectionId: string;
  sharePercent: unknown;
  selected: readonly T[];
  pool: readonly T[];
  signals: MixSignals;
}): Promise<T[]> {
  const share = normalizeCollectionSharePercent(input.sharePercent);
  const selectedIds = input.selected.map((track) => track.audioItemId).sort().join(",");
  const poolIds = input.pool.map((track) => track.audioItemId).sort().join(",");
  const key = `${input.collectionId}|${share}|${selectedIds}|${poolIds}`;
  const now = Date.now();
  if (mixCache && mixCache.key === key && now - mixCache.at < CACHE_MS) {
    const byId = new Map(input.pool.map((track) => [track.audioItemId, track]));
    return mixCache.value.flatMap((id) => {
      const track = byId.get(id);
      return track ? [track] : [];
    });
  }
  const tags = input.signals.tags;
  const picked = pickSimilarTracks({
    collection: input.selected,
    candidates: input.pool,
    sharePercent: share,
    vectors: input.signals.vectors,
    energy: input.signals.energy,
    tagSimilarity: (left, right) => passportSimilarity(tags.get(left), tags.get(right)),
  });
  mixCache = { at: now, key, value: picked.map((track) => track.audioItemId) };
  return picked;
}

type ServiceDb = ReturnType<typeof createServiceRoleClient>;

/**
 * Similar tracks for a paid live collection. On any lookup error returns [] so the
 * caller keeps the collection itself and never opens the whole catalog.
 */
export async function loadPaidSimilarMix<T extends MixTrack>(
  db: ServiceDb,
  locationId: string,
  selected: readonly T[],
  pool: readonly T[],
): Promise<T[]> {
  try {
    const assigned = await db.from("business_personal_collection_locations")
      .select("collection_id").eq("location_id", locationId).maybeSingle();
    if (assigned.error || !assigned.data?.collection_id) return [];
    const collection = await db.from("business_personal_collections")
      .select("id, collection_share_percent, revoked_at")
      .eq("id", assigned.data.collection_id).maybeSingle();
    if (collection.error || !collection.data || collection.data.revoked_at) return [];
    const ids = [...new Set([...selected, ...pool].map((track) => track.audioItemId))];
    const signals = await loadMixSignals(ids);
    return await pickSimilarFromSignals({
      collectionId: collection.data.id,
      sharePercent: collection.data.collection_share_percent,
      selected,
      pool,
      signals,
    });
  } catch (error) {
    console.info("[business-collection-mix] similar lookup failed; keeping collection only", error);
    return [];
  }
}

export type CollectionSimilarPreview = {
  collectionId: string;
  sharePercent: number;
  similar: { audioItemId: string; title: string; albumTitle: string }[];
};

/** Admin preview: same picker as the paid venue pool, against the admitted cafe catalog. */
export async function loadCollectionSimilarPreviews<T extends MixTrack & { title: string; albumTitle: string }>(
  rows: readonly { id: string; collection_share_percent?: unknown }[],
  catalog: readonly T[],
  itemsByCollection: ReadonlyMap<string, string[]>,
): Promise<Map<string, CollectionSimilarPreview>> {
  const out = new Map<string, CollectionSimilarPreview>();
  if (!rows.length || !catalog.length) return out;
  const needed = new Set<string>(catalog.map((track) => track.audioItemId));
  for (const ids of itemsByCollection.values()) for (const id of ids) needed.add(id);
  const signals = await loadMixSignals([...needed]);
  const byId = new Map(catalog.map((track) => [track.audioItemId, track]));
  for (const row of rows) {
    const share = normalizeCollectionSharePercent(row.collection_share_percent);
    const selected = (itemsByCollection.get(row.id) ?? []).flatMap((id) => {
      const track = byId.get(id);
      return track ? [track] : [];
    });
    const similar = selected.length
      ? await pickSimilarFromSignals({
        collectionId: row.id,
        sharePercent: share,
        selected,
        pool: catalog,
        signals,
      })
      : [];
    out.set(row.id, {
      collectionId: row.id,
      sharePercent: share,
      similar: similar.map((track) => ({
        audioItemId: track.audioItemId,
        title: track.title,
        albumTitle: track.albumTitle,
      })),
    });
  }
  return out;
}
