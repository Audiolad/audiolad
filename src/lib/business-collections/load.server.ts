import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { COLLECTION_ACCOUNT_LIMIT, COLLECTION_COOKIE, COLLECTION_TOKEN, resolveCollectionPermission } from "./model";

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
  return await bindPersonalCollection(permission.id, user.id) ? permission : null;
}

/**
 * Bind a collection to a verified account id (from the session or the start's own sign-in, never
 * from a URL/form). At most COLLECTION_ACCOUNT_LIMIT accounts per link: a full link binds nothing
 * and returns false. The cap is checked by the app (no migration, owner decision 19.11.2026), so two
 * clicks on the very last place at the same moment may both pass. The account trigger fills empty
 * venue assignments; venues created later inherit the collection. No gift/billing call here.
 */
export async function bindPersonalCollection(collectionId: string, userId: string): Promise<boolean> {
  if (!await collectionHasRoom(collectionId, userId)) return false;
  const { error } = await createServiceRoleClient().from("business_personal_collection_accounts")
    .upsert({ user_id: userId, collection_id: collectionId, selected_at: new Date().toISOString() }, { onConflict: "user_id,collection_id" });
  if (error) throw new Error("collection_account_save_failed");
  return true;
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

/** True when this account is already on the link, or the link has fewer than the limit. */
export async function collectionHasRoom(collectionId: string, userId: string | null): Promise<boolean> {
  const db = createServiceRoleClient();
  if (userId) {
    const own = await db.from("business_personal_collection_accounts").select("collection_id")
      .eq("collection_id", collectionId).eq("user_id", userId).maybeSingle();
    if (own.error) throw new Error("collection_accounts_unavailable");
    if (own.data) return true;
  }
  const { count, error } = await db.from("business_personal_collection_accounts")
    .select("user_id", { count: "exact", head: true }).eq("collection_id", collectionId);
  if (error || typeof count !== "number") throw new Error("collection_accounts_unavailable");
  return count < COLLECTION_ACCOUNT_LIMIT;
}

/** Whether the verified account is already bound to this collection. */
export async function collectionBoundToUser(collectionId: string, userId: string): Promise<boolean> {
  const { data, error } = await createServiceRoleClient().from("business_personal_collection_accounts")
    .select("collection_id").eq("collection_id", collectionId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("collection_accounts_unavailable");
  return Boolean(data);
}

/**
 * Quiet cabinet (t1617u/t1618u): a visitor who came by a personal link – the link cookie in this
 * browser, or an account bound to any collection (also after a revoke). Paid access is checked by
 * the caller. Read-only; a lookup error keeps the ordinary cabinet.
 */
export async function loadCollectionVisitor(userId: string | null): Promise<boolean> {
  try {
    const token = (await cookies()).get(COLLECTION_COOKIE)?.value ?? null;
    if (token && COLLECTION_TOKEN.test(token)) return true;
    if (!userId) return false;
    const { data, error } = await createServiceRoleClient().from("business_personal_collection_accounts")
      .select("collection_id").eq("user_id", userId).limit(1);
    return !error && Array.isArray(data) && data.length > 0;
  } catch { return false; }
}

/** A collection cookie of valid shape is present in this browser (live or revoked). */
export async function hasCollectionCookie(): Promise<boolean> {
  const token = (await cookies()).get(COLLECTION_COOKIE)?.value ?? null;
  return Boolean(token && COLLECTION_TOKEN.test(token));
}

/**
 * Collection assignment of every cafe venue the account owns (ids come from the verified
 * session/start, never from the request). Used to fail a personal-link start closed: no venue of
 * the account may play another collection or, after the start, the whole catalog.
 */
export async function ownerCafeVenueCollections(userId: string): Promise<{ locationId: string; collectionId: string | null }[]> {
  const db = createServiceRoleClient();
  const members = await db.from("business_organization_members").select("organization_id").eq("user_id", userId).eq("role", "owner");
  if (members.error) throw new Error("collection_owner_unavailable");
  const orgs = (members.data ?? []).map((row) => row.organization_id as string);
  if (orgs.length === 0) return [];
  const [locations, categories] = await Promise.all([
    db.from("business_locations").select("id,business_category").in("organization_id", orgs),
    db.from("business_content_categories").select("category").eq("direction_key", "cafe"),
  ]);
  if (locations.error || categories.error) throw new Error("collection_owner_unavailable");
  const cafe = new Set((categories.data ?? []).map((row) => String(row.category)));
  const ids = (locations.data ?? [])
    .filter((row) => cafe.has(String(row.business_category ?? "").trim().toLowerCase()))
    .map((row) => row.id as string);
  if (ids.length === 0) return [];
  const assigned = await db.from("business_personal_collection_locations").select("location_id,collection_id").in("location_id", ids);
  if (assigned.error) throw new Error("collection_owner_unavailable");
  const byLocation = new Map((assigned.data ?? []).map((row) => [row.location_id as string, row.collection_id as string]));
  return ids.map((locationId) => ({ locationId, collectionId: byLocation.get(locationId) ?? null }));
}
