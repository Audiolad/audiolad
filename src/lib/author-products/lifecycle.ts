import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PRODUCT_DELETE_LOCKED_AFTER_PAID_PURCHASE_MESSAGE,
  PRODUCT_PAID_PURCHASE_DELETE_LOCK,
  getPracticeDeleteLock,
} from "@/lib/author-products/delete-lock";
import { softDeletePractice } from "@/lib/author-products/lifecycle-actions";
import {
  PRODUCT_CONTENT_LOCKED_AFTER_SALE,
} from "@/lib/author-products/sale-lock";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const STARTER_BUNDLE_BLOCKER_MESSAGE =
  "Этот продукт входит в стартовый набор для новых слушателей. Сначала замените или исключите его из стартового набора, после чего продукт можно будет снять с публикации.";

export type ProductDeleteBlocker = typeof PRODUCT_PAID_PURCHASE_DELETE_LOCK;

export type ProductLifecycleBlocker =
  | ProductDeleteBlocker
  | "active_starter_bundle"
  | typeof PRODUCT_CONTENT_LOCKED_AFTER_SALE;

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
    .select("id, status, deleted_at")
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError) {
    throw new Error("practice_lookup_failed");
  }

  if (!practice?.id) {
    throw new Error("practice_not_found");
  }

  if (practice.deleted_at) {
    return blockers;
  }

  if (await isActiveStarterPractice(supabase, practiceId)) {
    blockers.push("active_starter_bundle");
  }

  const deleteLock = await getPracticeDeleteLock(supabase, practiceId);
  if (deleteLock.locked) {
    blockers.push(PRODUCT_PAID_PURCHASE_DELETE_LOCK);
  }

  return [...new Set(blockers)];
}

export function getDeleteBlockers(
  blockers: ProductLifecycleBlocker[],
): ProductDeleteBlocker[] {
  return blockers.filter(
    (blocker): blocker is ProductDeleteBlocker =>
      blocker === PRODUCT_PAID_PURCHASE_DELETE_LOCK,
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
  if (blockers.includes(PRODUCT_PAID_PURCHASE_DELETE_LOCK)) {
    return PRODUCT_DELETE_LOCKED_AFTER_PAID_PURCHASE_MESSAGE;
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

/**
 * Soft-delete author product. Does not remove storage objects in this commit.
 * Delete-lock: paid orders only. Content/sale-lock remains separate.
 */
export async function deletePracticeProduct(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<void> {
  const serviceSupabase = createServiceRoleClient();
  const deleteLock = await getPracticeDeleteLock(serviceSupabase, practiceId);
  if (deleteLock.locked) {
    throw new Error(PRODUCT_PAID_PURCHASE_DELETE_LOCK);
  }

  // Content lock is intentionally not a delete blocker. It still protects
  // destructive audio mutations via sale-lock helpers / DB triggers.
  await softDeletePractice(supabase, practiceId, "author_soft_delete");
}
