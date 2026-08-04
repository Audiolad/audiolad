import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared eligibility for first commercial-application submit.
 * Keep in sync with SQL `author_has_published_free_product_for_commercial_gate`.
 */

export const COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_CODE =
  "commercial_application_free_product_required";

export const COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_MESSAGE =
  "Чтобы подать заявку на коммерческий статус, сначала опубликуйте хотя бы один бесплатный продукт";

export type CommercialGateProduct = {
  status: string;
  is_free: boolean;
  price: number;
  deleted_at?: string | null;
};

/**
 * A product unlocks first commercial submit when it is a live published free
 * zero-price product of the current author project. Product kind is ignored.
 */
export function isPublishedFreeProductForCommercialGate(
  product: CommercialGateProduct,
): boolean {
  if (product.deleted_at) {
    return false;
  }

  if (product.status !== "published") {
    return false;
  }

  if (product.is_free !== true) {
    return false;
  }

  if (typeof product.price !== "number" || product.price !== 0) {
    return false;
  }

  return true;
}

export function hasPublishedFreeProductForCommercialGate(
  products: readonly CommercialGateProduct[],
): boolean {
  return products.some(isPublishedFreeProductForCommercialGate);
}

/**
 * First submit (new application or draft → submitted) requires a published free
 * product. Resubmit after needs_changes does not — legacy applications may
 * predate the gate.
 */
export function commercialApplicationSubmitRequiresPublishedFree(
  applicationStatus: string | null | undefined,
): boolean {
  return applicationStatus !== "needs_changes";
}

export function canSubmitCommercialApplicationWithProducts(input: {
  applicationStatus: string | null | undefined;
  products: readonly CommercialGateProduct[];
}): boolean {
  if (!commercialApplicationSubmitRequiresPublishedFree(input.applicationStatus)) {
    return true;
  }

  return hasPublishedFreeProductForCommercialGate(input.products);
}

export async function authorHasPublishedFreeProductForCommercialGate(
  supabase: SupabaseClient,
  authorId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("practices")
    .select("id", { count: "exact", head: true })
    .eq("author_id", authorId)
    .is("deleted_at", null)
    .eq("status", "published")
    .eq("is_free", true)
    .eq("price", 0);

  if (error) {
    throw new Error(
      `commercial_free_product_gate_lookup_failed:${error.message}`,
    );
  }

  return (count ?? 0) > 0;
}
