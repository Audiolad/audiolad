/**
 * Exact MAX product target.
 *
 * Ordinary catalog discovery stays listed-only. An exact author/product
 * link follows the public product page: published listed and unlisted are
 * visible, selected_users and unpublished rows only for the linked user
 * when canonical access allows it. Visibility is not listen access.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCatalogStorefrontPreviewEligible } from "@/lib/listen/preview-access";
import {
  resolveProductAccess,
  type ProductAccessResult,
} from "@/lib/products/access";
import { isDirectLinkPublicVisibility } from "@/lib/products/catalog-visibility";
import {
  getPracticeAuthorSlug,
  getPracticeByAuthorAndSlug,
  type PublicPracticeRow,
} from "@/lib/products/lookup";
import { canRevealPublicProductPage } from "@/lib/products/publish-preview";
import { isPracticePubliclyAvailable } from "@/lib/products/scheduled-publication";

export type MaxExactPracticeResult =
  | { ok: true; practice: PublicPracticeRow }
  | { ok: false; reason: "not_found" | "storage_unavailable" };

export type MaxExactPracticeDeps = {
  getPractice?: typeof getPracticeByAuthorAndSlug;
  resolveAccess?: (
    supabase: SupabaseClient,
    practice: PublicPracticeRow,
    userId: string | null,
  ) => Promise<
    Pick<ProductAccessResult, "isAuthorMember" | "hasEntitlement" | "canSeeSelectedUsers">
  >;
};

export function practiceDeclaresMaxVisibility(practice: PublicPracticeRow): boolean {
  return (
    practice.status != null ||
    practice.catalog_visibility != null ||
    practice.is_catalog_listed != null
  );
}

function slugsMatch(
  practice: PublicPracticeRow,
  authorSlug: string,
  productSlug: string,
): boolean {
  if (practice.slug && practice.slug !== productSlug) {
    return false;
  }

  const author = getPracticeAuthorSlug(practice);
  if (author && author !== authorSlug) {
    return false;
  }

  return true;
}

export async function evaluateLoadedMaxExactPractice(
  supabase: SupabaseClient,
  practice: PublicPracticeRow,
  userId: string | null,
  deps?: MaxExactPracticeDeps,
): Promise<MaxExactPracticeResult> {
  if (practice.deleted_at || !practiceDeclaresMaxVisibility(practice)) {
    return { ok: false, reason: "not_found" };
  }

  const publiclyAvailable = isPracticePubliclyAvailable({
    status: practice.status,
    scheduledPublishAt: practice.scheduled_publish_at,
    publishedAt: practice.published_at,
  });
  const directLink = isDirectLinkPublicVisibility(
    practice.catalog_visibility,
    practice.is_catalog_listed,
  );
  if (publiclyAvailable && directLink) {
    return { ok: true, practice };
  }

  if (!userId) {
    return { ok: false, reason: "not_found" };
  }

  const resolveAccess = deps?.resolveAccess ?? resolveProductAccess;
  const access = await resolveAccess(supabase, practice, userId);
  if (
    !canRevealPublicProductPage({
      practiceStatus: practice.status,
      access,
      catalogVisibility: practice.catalog_visibility,
      isCatalogListed: practice.is_catalog_listed,
      scheduledPublishAt: practice.scheduled_publish_at,
      publishedAt: practice.published_at,
    })
  ) {
    return { ok: false, reason: "not_found" };
  }

  return { ok: true, practice };
}

export async function resolveMaxExactPractice(
  supabase: SupabaseClient,
  authorSlug: string,
  productSlug: string,
  userId: string | null,
  deps?: MaxExactPracticeDeps,
): Promise<MaxExactPracticeResult> {
  const normalizedAuthor = authorSlug.trim();
  const normalizedProduct = productSlug.trim();
  if (!normalizedAuthor || !normalizedProduct) {
    return { ok: false, reason: "not_found" };
  }

  const getPractice = deps?.getPractice ?? getPracticeByAuthorAndSlug;
  const loaded = await getPractice(supabase, normalizedAuthor, normalizedProduct);
  if (loaded.error) {
    return { ok: false, reason: "storage_unavailable" };
  }
  if (!loaded.practice || !slugsMatch(loaded.practice, normalizedAuthor, normalizedProduct)) {
    return { ok: false, reason: "not_found" };
  }

  return evaluateLoadedMaxExactPractice(supabase, loaded.practice, userId, deps);
}

export function canUseMaxStorefrontPreview(practice: PublicPracticeRow): boolean {
  return isCatalogStorefrontPreviewEligible(practice);
}
