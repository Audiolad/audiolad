import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PRODUCT_CONTENT_LOCKED_AFTER_SALE,
  PRODUCT_DELETE_LOCKED_AFTER_SALE_MESSAGE,
  getPracticeSaleLock,
} from "@/lib/author-products/sale-lock";
import {
  removePracticeCoverFiles,
  removeTrackCoverFiles,
} from "@/lib/author-products/utils";

export const STARTER_BUNDLE_BLOCKER_MESSAGE =
  "Этот продукт входит в стартовый набор для новых слушателей. Сначала замените или исключите его из стартового набора, после чего продукт можно будет снять с публикации или архивировать.";

export type ProductDeleteBlocker =
  | "published"
  | "starter_bundle"
  | typeof PRODUCT_CONTENT_LOCKED_AFTER_SALE
  | "has_orders";

export type ProductLifecycleBlocker =
  | ProductDeleteBlocker
  | "active_starter_bundle";

export type ProductLifecycleAction =
  | "unpublish"
  | "archive"
  | "restore_from_archive"
  | "delete";

export async function isActiveStarterPractice(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<boolean> {
  const { data: starter, error } = await supabase
    .from("starter_practices")
    .select("is_active")
    .eq("practice_id", practiceId)
    .maybeSingle();

  if (error) {
    throw new Error("starter_lookup_failed");
  }

  return starter?.is_active === true;
}

export async function getProductLifecycleBlockers(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<ProductLifecycleBlocker[]> {
  const blockers: ProductLifecycleBlocker[] = [];

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("id, status")
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError) {
    throw new Error("practice_lookup_failed");
  }

  if (!practice?.id) {
    throw new Error("practice_not_found");
  }

  if (practice.status === "published") {
    blockers.push("published");
  }

  if (await isActiveStarterPractice(supabase, practiceId)) {
    blockers.push("starter_bundle", "active_starter_bundle");
  }

  const saleLock = await getPracticeSaleLock(supabase, practiceId);

  if (saleLock.locked) {
    blockers.push(PRODUCT_CONTENT_LOCKED_AFTER_SALE);
  }

  // Any order (including unpaid) blocks hard delete so storage cleanup cannot
  // run before the orders FK RESTRICT rejects the practice delete.
  const { count: orderCount, error: orderError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("practice_id", practiceId);

  if (orderError) {
    throw new Error("orders_lookup_failed");
  }

  if ((orderCount ?? 0) > 0 && !saleLock.locked) {
    blockers.push("has_orders");
  }

  return [...new Set(blockers)];
}

export function getDeleteBlockers(
  blockers: ProductLifecycleBlocker[],
): ProductDeleteBlocker[] {
  return blockers.filter(
    (blocker): blocker is ProductDeleteBlocker =>
      blocker !== "active_starter_bundle",
  );
}

export function getStarterBundleBlockerMessage(): string {
  return STARTER_BUNDLE_BLOCKER_MESSAGE;
}

export function getUnpublishBlockerMessage(
  blockers: ProductLifecycleBlocker[],
): string | null {
  if (blockers.includes("active_starter_bundle")) {
    return STARTER_BUNDLE_BLOCKER_MESSAGE;
  }

  return null;
}

export function getArchiveBlockerMessage(
  blockers: ProductLifecycleBlocker[],
): string | null {
  if (blockers.includes("active_starter_bundle")) {
    return STARTER_BUNDLE_BLOCKER_MESSAGE;
  }

  return null;
}

export function getDeleteBlockerMessage(
  blockers: ProductDeleteBlocker[],
): string {
  if (blockers.includes("starter_bundle")) {
    return STARTER_BUNDLE_BLOCKER_MESSAGE;
  }

  if (blockers.includes(PRODUCT_CONTENT_LOCKED_AFTER_SALE)) {
    return PRODUCT_DELETE_LOCKED_AFTER_SALE_MESSAGE;
  }

  if (blockers.includes("has_orders")) {
    return "Нельзя удалить продукт: по нему есть заказы.";
  }

  if (blockers.includes("published")) {
    return "Сначала снимите продукт с публикации.";
  }

  return "Нельзя удалить этот аудиопродукт.";
}

export async function restorePracticeFromArchive(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<void> {
  const { error } = await supabase.rpc("restore_archived_audio_product", {
    p_practice_id: practiceId,
  });

  if (error) {
    throw new Error("practice_restore_from_archive_failed");
  }
}

export async function deletePracticeProduct(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<void> {
  const blockers = getDeleteBlockers(
    await getProductLifecycleBlockers(supabase, practiceId),
  );

  if (blockers.length > 0) {
    throw new Error(blockers[0]);
  }

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("id, cover_url")
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError) {
    throw new Error("practice_lookup_failed");
  }

  if (!practice?.id) {
    throw new Error("practice_not_found");
  }

  const { data: audioItems, error: audioError } = await supabase
    .from("audio_items")
    .select("id, audio_path")
    .eq("practice_id", practiceId);

  if (audioError) {
    throw new Error("audio_items_lookup_failed");
  }

  const audioPaths = (audioItems ?? [])
    .map((item) => item.audio_path?.trim())
    .filter((path): path is string => Boolean(path));

  if (audioPaths.length > 0) {
    await supabase.storage.from("practice-audio").remove(audioPaths);
  }

  for (const item of audioItems ?? []) {
    if (item.id) {
      await removeTrackCoverFiles(supabase, practiceId, item.id);
    }
  }

  await removePracticeCoverFiles(supabase, practiceId);

  const { data: deletedPractice, error: deleteError } = await supabase
    .from("practices")
    .delete()
    .eq("id", practiceId)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    if (
      typeof deleteError.message === "string" &&
      deleteError.message.includes(PRODUCT_CONTENT_LOCKED_AFTER_SALE)
    ) {
      throw new Error(PRODUCT_CONTENT_LOCKED_AFTER_SALE);
    }

    throw new Error("practice_delete_failed");
  }

  if (!deletedPractice?.id) {
    throw new Error("practice_not_found");
  }
}
