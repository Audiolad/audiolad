/**
 * a8240527 (passport stage) – the batched read of the shelf tracks' verified passports.
 * Takes the Supabase client as a parameter so it can be unit-tested with a fake; the real
 * service-role client is created only in passport.server.ts (server-only).
 *
 * Read-only SELECTs, batched tables, chunked `.in(...)` filters: ⌈tracks / 50⌉ version requests
 * (at most one active version per track) and ⌈passports / 25⌉ attribute requests, each paged
 * by a stable order so no row is lost under the PostgREST row ceiling (1000 here; a passport
 * has at most 32 attributes, so a chunk is ≤ 800 rows and normally one page) – never one
 * request per album or per track.
 */
import { chunkIds } from "@/lib/supabase/chunk";

import {
  guestCoffeeFeaturesFromPassport,
  type GuestCoffeePassportAttributeRow,
  type GuestCoffeePassportVersionRow,
  type GuestCoffeeSoundFeatures,
} from "./passport-features";

export const GUEST_COFFEE_PASSPORT_VERSION_COLUMNS = "id, audio_item_id, status, sealed_at, ceased_at, structured_fields, analyzer_run_id";
export const GUEST_COFFEE_PASSPORT_ATTRIBUTE_COLUMNS = "id, passport_id, attribute_key, origin, value_numeric, value_text, confidence, source_ref";
/** Passports per attribute request. */
export const GUEST_COFFEE_ATTRIBUTE_CHUNK = 25;
/** Rows per attribute page (below the PostgREST max-rows ceiling). */
export const GUEST_COFFEE_ATTRIBUTE_PAGE = 500;

type QueryResult = PromiseLike<{ data: unknown; error: unknown }>;
/** The minimal PostgREST surface used here (a subset of the Supabase client). */
export type GuestCoffeePassportClient = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: readonly string[]) => QueryResult & {
        order: (column: string, options: { ascending: boolean }) => {
          range: (from: number, to: number) => QueryResult;
        };
        eq: (column: string, value: string) => {
          is: (column: string, value: null) => {
            not: (column: string, operator: string, value: null) => QueryResult;
          };
        };
      };
    };
  };
};

export type GuestCoffeePassportBundle = {
  versions: GuestCoffeePassportVersionRow[];
  attributesByPassport: Map<string, GuestCoffeePassportAttributeRow[]>;
  /** music_analyzer_runs.normalized_json, keyed by run id. */
  normalizedByRun: Map<string, unknown>;
  runIdFor: (version: GuestCoffeePassportVersionRow) => string | null;
};

/**
 * Batched read of sealed passports and the analyzer result they were sealed from.
 * Shared by the guest coffee plan and the cafe queue. The cafe queue reads energy
 * from `normalizedByRun` (`analysis_features_v1`); this function does not rank.
 */
export async function loadGuestCoffeePassportBundle(
  client: GuestCoffeePassportClient,
  trackIds: readonly string[],
): Promise<GuestCoffeePassportBundle> {
  const ids = [...new Set(trackIds)];
  const versionChunks = await Promise.all(
    chunkIds(ids).map(async (chunk) => {
      const { data, error } = await client
        .from("music_passport_versions")
        .select(GUEST_COFFEE_PASSPORT_VERSION_COLUMNS)
        .in("audio_item_id", chunk)
        .eq("status", "active")
        .is("ceased_at", null)
        .not("sealed_at", "is", null);
      if (error || !Array.isArray(data)) throw new Error("guest_coffee_passport_versions_unavailable");
      return data as GuestCoffeePassportVersionRow[];
    }),
  );
  const wanted = new Set(ids);
  const versions = versionChunks.flat().filter((v) => wanted.has(v.audio_item_id));
  const attributeChunks = await Promise.all(
    chunkIds(versions.map((v) => v.id), GUEST_COFFEE_ATTRIBUTE_CHUNK).map(async (chunk) => {
      const rows: GuestCoffeePassportAttributeRow[] = [];
      for (let from = 0; ; ) {
        const { data, error } = await client
          .from("music_passport_attributes")
          .select(GUEST_COFFEE_PASSPORT_ATTRIBUTE_COLUMNS)
          .in("passport_id", chunk)
          .order("id", { ascending: true })
          .range(from, from + GUEST_COFFEE_ATTRIBUTE_PAGE - 1);
        if (error || !Array.isArray(data)) throw new Error("guest_coffee_passport_attributes_unavailable");
        rows.push(...(data as GuestCoffeePassportAttributeRow[]));
        if (data.length < GUEST_COFFEE_ATTRIBUTE_PAGE) break;
        from += data.length;
      }
      return rows;
    }),
  );
  const attributesByPassport = new Map<string, GuestCoffeePassportAttributeRow[]>();
  for (const row of attributeChunks.flat()) {
    const list = attributesByPassport.get(row.passport_id) ?? [];
    list.push(row);
    attributesByPassport.set(row.passport_id, list);
  }
  // Prefer the immutable version binding. Old attribute-only passports also retain source_ref.
  const runForVersion = (version: GuestCoffeePassportVersionRow): string | null => {
    if (version.analyzer_run_id) return version.analyzer_run_id;
    const refs = new Set((attributesByPassport.get(version.id) ?? []).flatMap((a) => {
      const match = /^analyzer-run:([0-9a-f-]{36})$/i.exec(a.source_ref ?? "");
      return match ? [match[1]] : [];
    }));
    return refs.size === 1 ? [...refs][0] : null;
  };
  const runIds = [...new Set(versions.flatMap((v) => { const id = runForVersion(v); return id ? [id] : []; }))];
  const runs = new Map<string, unknown>();
  await Promise.all(chunkIds(runIds).map(async (chunk) => {
    // An unavailable/deleted original must not re-enable known research-only labels.
    try {
      const { data, error } = await client.from("music_analyzer_runs")
        .select("id, normalized_json").in("id", chunk);
      if (!error && Array.isArray(data)) {
        for (const row of data as Array<{ id: string; normalized_json: unknown }>) runs.set(row.id, row.normalized_json);
      }
    } catch { /* conservative sourceTagDecision fallback */ }
  }));
  return {
    versions,
    attributesByPassport,
    normalizedByRun: runs,
    runIdFor: runForVersion,
  };
}

export async function queryGuestCoffeePassportFeatures(
  client: GuestCoffeePassportClient,
  trackIds: readonly string[],
): Promise<Map<string, GuestCoffeeSoundFeatures>> {
  const bundle = await loadGuestCoffeePassportBundle(client, trackIds);
  const features = new Map<string, GuestCoffeeSoundFeatures>();
  for (const version of bundle.versions) {
    if (features.has(version.audio_item_id)) continue; // one active version per track (unique index)
    const f = guestCoffeeFeaturesFromPassport(
      version,
      bundle.attributesByPassport.get(version.id) ?? [],
      bundle.normalizedByRun.get(bundle.runIdFor(version) ?? ""),
    );
    if (f) features.set(version.audio_item_id, f);
  }
  return features;
}
