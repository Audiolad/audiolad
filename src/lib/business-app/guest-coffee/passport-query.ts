/**
 * a8240527 (passport stage) – the batched read of the shelf tracks' verified passports.
 * Takes the Supabase client as a parameter so it can be unit-tested with a fake; the real
 * service-role client is created only in passport.server.ts (server-only).
 *
 * Read-only SELECTs, two tables, chunked `.in(...)` filters: ⌈tracks / 50⌉ + ⌈passports / 50⌉
 * requests in total – never one request per album or per track.
 */
import { chunkIds } from "@/lib/supabase/chunk";

import {
  guestCoffeeFeaturesFromPassport,
  type GuestCoffeePassportAttributeRow,
  type GuestCoffeePassportVersionRow,
  type GuestCoffeeSoundFeatures,
} from "./passport-features";

export const GUEST_COFFEE_PASSPORT_VERSION_COLUMNS = "id, audio_item_id, status, sealed_at, ceased_at, structured_fields";
export const GUEST_COFFEE_PASSPORT_ATTRIBUTE_COLUMNS = "passport_id, attribute_key, origin, value_numeric, value_text, confidence";

type QueryResult = PromiseLike<{ data: unknown; error: unknown }>;
/** The minimal PostgREST surface used here (a subset of the Supabase client). */
export type GuestCoffeePassportClient = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: readonly string[]) => QueryResult & {
        eq: (column: string, value: string) => {
          is: (column: string, value: null) => {
            not: (column: string, operator: string, value: null) => QueryResult;
          };
        };
      };
    };
  };
};

export async function queryGuestCoffeePassportFeatures(
  client: GuestCoffeePassportClient,
  trackIds: readonly string[],
): Promise<Map<string, GuestCoffeeSoundFeatures>> {
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
    chunkIds(versions.map((v) => v.id)).map(async (chunk) => {
      const { data, error } = await client.from("music_passport_attributes").select(GUEST_COFFEE_PASSPORT_ATTRIBUTE_COLUMNS).in("passport_id", chunk);
      if (error || !Array.isArray(data)) throw new Error("guest_coffee_passport_attributes_unavailable");
      return data as GuestCoffeePassportAttributeRow[];
    }),
  );
  const attributesByPassport = new Map<string, GuestCoffeePassportAttributeRow[]>();
  for (const row of attributeChunks.flat()) {
    const list = attributesByPassport.get(row.passport_id) ?? [];
    list.push(row);
    attributesByPassport.set(row.passport_id, list);
  }
  const features = new Map<string, GuestCoffeeSoundFeatures>();
  for (const version of versions) {
    if (features.has(version.audio_item_id)) continue; // one active version per track (unique index)
    const f = guestCoffeeFeaturesFromPassport(version, attributesByPassport.get(version.id) ?? []);
    if (f) features.set(version.audio_item_id, f);
  }
  return features;
}
