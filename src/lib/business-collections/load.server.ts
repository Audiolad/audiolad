import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { COLLECTION_COOKIE, COLLECTION_TOKEN, collectionTrackPath, resolveCollectionPermission, type CollectionTrack } from "./model";

export function collectionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
type CollectionRow = { id: string; title: string };

/** No cache: revocation applies to the next page, media request and player poll. */
export async function loadCollectionPermission(): Promise<CollectionRow | null> {
  try {
    const db = createServiceRoleClient();
    const token = (await cookies()).get(COLLECTION_COOKIE)?.value ?? null;
    const { data: { user } } = await (await createClient()).auth.getUser();
    return await resolveCollectionPermission({
      token, userId: user?.id ?? null,
      byToken: async (secret) => {
        const { data, error } = await db.from("business_personal_collections").select("id,title")
          .eq("token_hash", collectionTokenHash(secret)).is("revoked_at", null).maybeSingle();
        return error ? null : data as CollectionRow | null;
      },
      byAccount: async (userId) => {
        const { data, error } = await db.from("business_personal_collection_accounts")
          .select("collection_id").eq("user_id", userId).order("selected_at", { ascending: false }).limit(100);
        if (error || !data?.length) return null;
        // Never query all collections: use only this verified account's assigned ids.
        const rows = await db.from("business_personal_collections").select("id,title")
          .in("id", data.map((row) => row.collection_id)).is("revoked_at", null);
        if (rows.error) return null;
        for (const link of data) {
          const row = rows.data?.find((item) => item.id === link.collection_id);
          if (row) return row as CollectionRow;
        }
        return null;
      },
    });
  } catch { return null; }
}

/** Bind a browser selection to the verified account, never to an id from a URL/form.
 * Called after explicit start and at the cabinet handoff after ordinary registration.
 * The account trigger also fills empty venue assignments; gift/billing functions are never called.
 */
export async function rememberPersonalCollection(): Promise<CollectionRow | null> {
  const permission = await loadCollectionPermission();
  if (!permission) return null;
  const token = (await cookies()).get(COLLECTION_COOKIE)?.value;
  if (!token || !COLLECTION_TOKEN.test(token)) return permission;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return permission;
  const { error } = await createServiceRoleClient().from("business_personal_collection_accounts")
    .upsert({ user_id: user.id, collection_id: permission.id, selected_at: new Date().toISOString() }, { onConflict: "user_id,collection_id" });
  if (error) throw new Error("collection_account_save_failed");
  return permission;
}

export type CatalogCollectionTrack = {
  audio_item_id: string; album_id: string; title: string; album_title: string;
  duration_seconds: number | null; cover_ref: string | null;
};
export async function loadCollectionCatalog(collectionId: string | null, trackId?: string): Promise<CatalogCollectionTrack[]> {
  let query = createServiceRoleClient().rpc("business_personal_collection_tracks", { p_collection_id: collectionId });
  if (trackId) query = query.eq("audio_item_id", trackId);
  const { data, error } = await query;
  if (error || !Array.isArray(data)) throw new Error("collection_catalog_unavailable");
  return data as CatalogCollectionTrack[];
}
export async function loadPersonalCollection() {
  const permission = await loadCollectionPermission();
  if (!permission) return null;
  const db = createServiceRoleClient();
  const [catalog, items] = await Promise.all([
    loadCollectionCatalog(permission.id),
    db.from("business_personal_collection_items").select("audio_item_id,position")
      .eq("collection_id", permission.id).order("position"),
  ]);
  if (items.error) throw new Error("collection_items_unavailable");
  const byId = new Map(catalog.map((track) => [track.audio_item_id, track]));
  const tracks: CollectionTrack[] = (items.data ?? []).flatMap((item) => {
    const row = byId.get(item.audio_item_id);
    return row ? [{
      audioItemId: row.audio_item_id, albumId: row.album_id, title: row.title,
      albumTitle: row.album_title, durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      coverUrl: collectionTrackPath("cover", permission.id, row.audio_item_id),
    }] : [];
  });
  return { ...permission, tracks };
}

export async function authorizedCollectionTrack(collectionId: string, trackId: string) {
  const permission = await loadCollectionPermission();
  if (!permission || permission.id !== collectionId) return null;
  return (await loadCollectionCatalog(permission.id, trackId)).find((track) => track.audio_item_id === trackId) ?? null;
}
