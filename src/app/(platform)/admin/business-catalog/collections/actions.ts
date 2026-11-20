"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { collectionTokenHash } from "@/lib/business-collections/load.server";
import { COLLECTION_ADMIN_PATH, COLLECTION_UUID } from "@/lib/business-collections/model";

function collectionLink(token: string): string {
  return `https://coffee.audiolad.ru/api/business/collections/open?token=${token}`;
}

function asCollectionId(data: unknown): string {
  return typeof data === "string" && COLLECTION_UUID.test(data) ? data : "";
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
