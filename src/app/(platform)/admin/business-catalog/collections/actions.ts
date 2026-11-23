"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { collectionTokenHash, loadCollectionCatalog } from "@/lib/business-collections/load.server";
import { COLLECTION_ADMIN_PATH, COLLECTION_UUID } from "@/lib/business-collections/model";
import {
  isVenuePaid,
  nextPositions,
  planAddAlbum,
  planDeleteCollection,
} from "@/lib/business-collections/edit-collection.mjs";

function collectionLink(token: string): string {
  return `https://coffee.audiolad.ru/api/business/collections/open?token=${token}`;
}

function asCollectionId(data: unknown): string {
  return typeof data === "string" && COLLECTION_UUID.test(data) ? data : "";
}

function asUuid(value: unknown): string {
  return typeof value === "string" && COLLECTION_UUID.test(value) ? value : "";
}

const ADD_ERRORS: Record<string, string> = {
  revoked: "Подборка отозвана, альбомы в ней менять нельзя.",
  invalid: "Укажите подборку и альбом.",
  not_admitted: "Можно добавить только альбом из закрытого каталога «АудиоЛад Кофейня», который уже допущен.",
  already_in: "Этот альбом уже есть в подборке.",
  limit: "В подборке может быть не больше 500 треков.",
};

const REMOVE_ERRORS: Record<string, string> = {
  revoked: "Подборка отозвана, альбомы в ней менять нельзя.",
  invalid: "Укажите подборку и альбом.",
  not_in: "Этого альбома нет в подборке.",
  last_album: "Нельзя убрать последний альбом. Сначала добавьте другой или удалите подборку.",
};

async function loadCollectionItems(db: ReturnType<typeof createServiceRoleClient>, collectionId: string): Promise<{ audio_item_id: string; position: number }[] | null> {
  const rows: { audio_item_id: string; position: number }[] = [];
  for (let from = 0; from <= 1000; from += 500) {
    const page = await db.from("business_personal_collection_items")
      .select("audio_item_id,position")
      .eq("collection_id", collectionId)
      .order("position", { ascending: true })
      .order("audio_item_id", { ascending: true })
      .range(from, from + 499);
    if (page.error || !page.data) return null;
    rows.push(...page.data);
    if (page.data.length < 500) break;
  }
  return rows;
}

function catalogAsPlannerTracks(rows: Awaited<ReturnType<typeof loadCollectionCatalog>>) {
  return rows.map((track) => ({
    audioItemId: track.audio_item_id,
    albumId: track.album_id,
    albumTitle: track.album_title,
  }));
}

export async function createCollection(input: { title: string; tracks: string[] }): Promise<{ ok: true; link: string; id: string; title: string; createdAt: string } | { ok: false; error: string }> {
  const admin = await requirePlatformOwnerAccess(COLLECTION_ADMIN_PATH);
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 120 ||
      !Array.isArray(input.tracks) || !input.tracks.length || input.tracks.length > 500 ||
      input.tracks.some((id) => typeof id !== "string" || !COLLECTION_UUID.test(id)) || new Set(input.tracks).size !== input.tracks.length) {
    return { ok: false, error: "Укажите название и выберите от 1 до 500 треков." };
  }
  try {
    const token = randomBytes(32).toString("hex");
    // Atomic validation + snapshot of selected ids. No storage writes of the raw token: only token_hash.
    const { data, error } = await createServiceRoleClient().rpc("create_business_personal_collection", {
      p_title: title, p_token_hash: collectionTokenHash(token), p_created_by: admin.userId, p_tracks: input.tracks,
    });
    if (error) return { ok: false, error: "Не удалось создать подборку. Проверьте актуальный допуск выбранных треков." };
    revalidatePath(COLLECTION_ADMIN_PATH);
    return { ok: true, link: collectionLink(token), id: asCollectionId(data), title, createdAt: new Date().toISOString() };
  } catch { return { ok: false, error: "Подборка не создана. Повторите попытку." }; }
}

export async function revokeCollection(id: string): Promise<{ ok: boolean }> {
  await requirePlatformOwnerAccess(COLLECTION_ADMIN_PATH);
  if (typeof id !== "string" || !COLLECTION_UUID.test(id)) return { ok: false };
  try {
    const { data, error } = await createServiceRoleClient().from("business_personal_collections")
      .update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null).select("id");
    revalidatePath(COLLECTION_ADMIN_PATH);
    return { ok: !error && Boolean(data?.length) };
  } catch { return { ok: false }; }
}

/** Rotate only the capability: attached accounts/venues and selected tracks stay intact. Raw token is not stored. */
export async function regenerateCollection(id: string): Promise<{ ok: true; link: string; title: string } | { ok: false; error: string }> {
  await requirePlatformOwnerAccess(COLLECTION_ADMIN_PATH);
  if (typeof id !== "string" || !COLLECTION_UUID.test(id)) return { ok: false, error: "Подборка не найдена." };
  try {
    const token = randomBytes(32).toString("hex");
    const { data, error } = await createServiceRoleClient().from("business_personal_collections")
      .update({ token_hash: collectionTokenHash(token), revoked_at: null }).eq("id", id).select("id,title");
    if (error || !data?.length) return { ok: false, error: "Не удалось перевыпустить ссылку." };
    revalidatePath(COLLECTION_ADMIN_PATH);
    return { ok: true, link: collectionLink(token), title: data[0]?.title ?? "" };
  } catch { return { ok: false, error: "Не удалось перевыпустить ссылку." }; }
}

export async function saveCollectionShare(input: { id: string; percent: number }): Promise<{ ok: true; percent: number } | { ok: false; error: string }> {
  await requirePlatformOwnerAccess(COLLECTION_ADMIN_PATH);
  const id = typeof input?.id === "string" ? input.id : "";
  const percent = input?.percent;
  if (!COLLECTION_UUID.test(id) || !Number.isInteger(percent) || percent < 50 || percent > 95) {
    return { ok: false, error: "Укажите долю подборки от 50 до 95." };
  }
  try {
    const { data, error } = await createServiceRoleClient().from("business_personal_collections")
      .update({ collection_share_percent: percent }).eq("id", id).select("id");
    if (error || !data?.length) return { ok: false, error: "Не удалось сохранить долю. Обновите страницу и повторите попытку." };
    revalidatePath(COLLECTION_ADMIN_PATH);
    return { ok: true, percent };
  } catch { return { ok: false, error: "Не удалось сохранить долю. Повторите попытку." }; }
}

export async function addCollectionAlbum(input: { id: string; albumId: string }): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  await requirePlatformOwnerAccess(COLLECTION_ADMIN_PATH);
  const id = asUuid(input?.id);
  const albumId = asUuid(input?.albumId);
  if (!id || !albumId) return { ok: false, error: ADD_ERRORS.invalid };
  try {
    const db = createServiceRoleClient();
    const collection = await db.from("business_personal_collections").select("id,revoked_at").eq("id", id).maybeSingle();
    if (collection.error || !collection.data) return { ok: false, error: "Подборка не найдена." };
    const items = await loadCollectionItems(db, id);
    if (!items) return { ok: false, error: "Не удалось загрузить треки подборки. Повторите попытку." };
    const plan = planAddAlbum({
      catalogTracks: catalogAsPlannerTracks(await loadCollectionCatalog(null)),
      collectionTrackIds: items.map((row) => row.audio_item_id),
      albumId,
      revoked: Boolean(collection.data.revoked_at),
    });
    if (!plan.ok) return { ok: false, error: ADD_ERRORS[plan.reason] };
    const maxPosition = items.reduce((max, row) => Math.max(max, row.position), -1);
    const positions = nextPositions(maxPosition, plan.addIds.length);
    const { error } = await db.from("business_personal_collection_items").insert(
      plan.addIds.map((audio_item_id, index) => ({ collection_id: id, audio_item_id, position: positions[index] })),
    );
    if (error) return { ok: false, error: "Не удалось добавить альбом. Обновите страницу и повторите попытку." };
    revalidatePath(COLLECTION_ADMIN_PATH);
    return { ok: true, added: plan.addIds.length };
  } catch { return { ok: false, error: "Не удалось добавить альбом. Повторите попытку." }; }
}

function asRemoveAlbumResult(data: unknown): { ok: true; removed: number } | { ok: false; reason: string } | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { ok?: unknown; removed?: unknown; reason?: unknown };
  if (row.ok === true && Number.isInteger(row.removed)) return { ok: true, removed: row.removed as number };
  if (row.ok === false && typeof row.reason === "string") return { ok: false, reason: row.reason };
  return null;
}

export async function removeCollectionAlbum(input: { id: string; albumId: string }): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  await requirePlatformOwnerAccess(COLLECTION_ADMIN_PATH);
  const id = asUuid(input?.id);
  const albumId = asUuid(input?.albumId);
  if (!id || !albumId) return { ok: false, error: REMOVE_ERRORS.invalid };
  try {
    const db = createServiceRoleClient();
    // Remaining-count check and DELETE run in one transaction, serialized per collection.
    const { data, error } = await db.rpc("remove_business_personal_collection_album", {
      p_collection_id: id, p_album_id: albumId,
    });
    const result = asRemoveAlbumResult(data);
    if (error || !result) return { ok: false, error: "Не удалось убрать альбом. Обновите страницу и повторите попытку." };
    if (!result.ok) {
      if (result.reason === "not_found") return { ok: false, error: "Подборка не найдена." };
      return { ok: false, error: REMOVE_ERRORS[result.reason] ?? "Не удалось убрать альбом. Обновите страницу и повторите попытку." };
    }
    revalidatePath(COLLECTION_ADMIN_PATH);
    return { ok: true, removed: result.removed };
  } catch { return { ok: false, error: "Не удалось убрать альбом. Повторите попытку." }; }
}

export type DeleteCollectionResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; needsPaidConfirm: true; paidVenueCount: number };

async function countPaidLinkedVenues(db: ReturnType<typeof createServiceRoleClient>, collectionId: string): Promise<number | null> {
  const locations = await db.from("business_personal_collection_locations")
    .select("location_id")
    .eq("collection_id", collectionId)
    .order("location_id", { ascending: true })
    .limit(500);
  if (locations.error || !locations.data) return null;
  if (!locations.data.length) return 0;
  const ids = locations.data.map((row) => row.location_id as string);
  const venues = await db.from("business_locations").select("id,organization_id").in("id", ids);
  if (venues.error || !venues.data) return null;
  let paid = 0;
  for (const venue of venues.data) {
    const { data: paidUntil, error } = await db.rpc("business_venue_paid_until", {
      p_organization_id: venue.organization_id, p_location_id: venue.id,
    });
    if (error) return null;
    if (isVenuePaid(paidUntil)) paid += 1;
  }
  return paid;
}

export async function deleteCollection(input: { id: string; confirmPaid?: boolean }): Promise<DeleteCollectionResult> {
  await requirePlatformOwnerAccess(COLLECTION_ADMIN_PATH);
  const id = asUuid(input?.id);
  if (!id) return { ok: false, error: "Подборка не найдена." };
  try {
    const db = createServiceRoleClient();
    const collection = await db.from("business_personal_collections").select("id").eq("id", id).maybeSingle();
    if (collection.error || !collection.data) return { ok: false, error: "Подборка не найдена." };
    const paidVenueCount = await countPaidLinkedVenues(db, id);
    if (paidVenueCount === null) return { ok: false, error: "Не удалось проверить оплату заведения. Повторите попытку." };
    const plan = planDeleteCollection({ confirmPaid: Boolean(input?.confirmPaid), paidVenueCount });
    if (!plan.ok) {
      if (plan.reason === "needs_paid_confirm") return { ok: false, needsPaidConfirm: true, paidVenueCount: plan.paidVenueCount ?? paidVenueCount };
      return { ok: false, error: "Не удалось удалить подборку. Повторите попытку." };
    }
    // Unlink only. Never delete catalog tracks, albums, paid products, venues or payments.
    // Order: items → accounts → locations → collection.
    const items = await db.from("business_personal_collection_items").delete().eq("collection_id", id).select("audio_item_id");
    if (items.error) return { ok: false, error: "Не удалось удалить подборку. Повторите попытку." };
    const accounts = await db.from("business_personal_collection_accounts").delete().eq("collection_id", id).select("user_id");
    if (accounts.error) return { ok: false, error: "Не удалось удалить подборку. Повторите попытку." };
    const places = await db.from("business_personal_collection_locations").delete().eq("collection_id", id).select("location_id");
    if (places.error) return { ok: false, error: "Не удалось удалить подборку. Повторите попытку." };
    const removed = await db.from("business_personal_collections").delete().eq("id", id).select("id");
    if (removed.error || !removed.data?.length) return { ok: false, error: "Не удалось удалить подборку. Повторите попытку." };
    revalidatePath(COLLECTION_ADMIN_PATH);
    return { ok: true };
  } catch { return { ok: false, error: "Не удалось удалить подборку. Повторите попытку." }; }
}
