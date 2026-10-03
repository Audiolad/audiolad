import "server-only";

import { applyPracticePublicAvailabilityFilter } from "@/lib/products/scheduled-publication";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type PublishedProductTarget = {
  authorSlug: string;
  productSlug: string;
};

export type PublishedProductLookupResult =
  | { ok: true; target: PublishedProductTarget | null }
  | { ok: false; reason: "storage_unavailable" };

type RelationSlug = { slug?: string | null } | Array<{ slug?: string | null }> | null;

type PublishedProductLookup = {
  byId: (practiceId: string) => Promise<PublishedProductLookupResult>;
  bySlug: (
    authorSlug: string,
    productSlug: string,
  ) => Promise<PublishedProductLookupResult>;
};

let lookupOverride: PublishedProductLookup | null = null;

export function setPublishedProductLookupForTests(
  lookup: PublishedProductLookup | null,
) {
  lookupOverride = lookup;
}

function relationSlug(value: RelationSlug): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  const slug = row?.slug?.trim();
  return slug || null;
}

function readTarget(data: {
  slug?: string | null;
  authors?: RelationSlug;
} | null): PublishedProductTarget | null {
  if (!data || typeof data.slug !== "string") return null;
  const authorSlug = relationSlug(data.authors ?? null);
  const productSlug = data.slug.trim();
  if (!authorSlug || !productSlug) return null;
  return { authorSlug, productSlug };
}

const PUBLISHED_LISTED_COLUMNS = `
  id,
  slug,
  status,
  deleted_at,
  is_catalog_listed,
  catalog_visibility,
  scheduled_publish_at,
  published_at,
  authors!practices_author_id_fkey!inner(slug)
`;

/**
 * Published, publicly available, catalog-listed product.
 * Unpublished, scheduled-future, unlisted, and selected_users rows fail closed.
 */
export async function resolvePublishedListedProductById(
  practiceId: string,
): Promise<PublishedProductLookupResult> {
  if (lookupOverride) return lookupOverride.byId(practiceId);

  const supabase = createServiceRoleClient();
  const { data, error } = await applyPracticePublicAvailabilityFilter(
    supabase
      .from("practices")
      .select(PUBLISHED_LISTED_COLUMNS)
      .eq("id", practiceId)
      .eq("status", "published")
      .is("deleted_at", null)
      .eq("is_catalog_listed", true)
      .eq("catalog_visibility", "listed"),
  ).maybeSingle();

  if (error) return { ok: false, reason: "storage_unavailable" };
  return { ok: true, target: readTarget(data) };
}

export async function resolvePublishedListedProductBySlug(
  authorSlug: string,
  productSlug: string,
): Promise<PublishedProductLookupResult> {
  const author = authorSlug.trim();
  const product = productSlug.trim();
  if (!author || !product) return { ok: true, target: null };
  if (lookupOverride) return lookupOverride.bySlug(author, product);

  const supabase = createServiceRoleClient();
  const { data, error } = await applyPracticePublicAvailabilityFilter(
    supabase
      .from("practices")
      .select(PUBLISHED_LISTED_COLUMNS)
      .eq("slug", product)
      .eq("authors.slug", author)
      .eq("status", "published")
      .is("deleted_at", null)
      .eq("is_catalog_listed", true)
      .eq("catalog_visibility", "listed"),
  ).maybeSingle();

  if (error) return { ok: false, reason: "storage_unavailable" };
  return { ok: true, target: readTarget(data) };
}
