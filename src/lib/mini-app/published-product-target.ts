import "server-only";

import { isDirectLinkPublicVisibility } from "@/lib/products/catalog-visibility";
import {
  applyPracticePublicAvailabilityFilter,
  isPracticePubliclyAvailable,
} from "@/lib/products/scheduled-publication";
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

type PublishedDirectLinkRow = {
  slug?: string | null;
  authors?: RelationSlug;
  status?: string | null;
  deleted_at?: string | null;
  is_catalog_listed?: boolean | null;
  catalog_visibility?: string | null;
  scheduled_publish_at?: string | null;
  published_at?: string | null;
};

/**
 * Exact direct-link target. Listed and unlisted published products open.
 * selected_users, drafts, deleted rows, and future schedules stay closed.
 * Visibility uses isDirectLinkPublicVisibility — the same rule as the public PDP.
 */
export function readPublishedDirectLinkTarget(
  data: PublishedDirectLinkRow | null,
  now?: Date,
): PublishedProductTarget | null {
  if (!data || data.deleted_at) return null;
  if (
    !isPracticePubliclyAvailable({
      status: data.status,
      scheduledPublishAt: data.scheduled_publish_at,
      publishedAt: data.published_at,
      now,
    })
  ) {
    return null;
  }
  if (
    !isDirectLinkPublicVisibility(
      data.catalog_visibility,
      data.is_catalog_listed,
    )
  ) {
    return null;
  }
  return readTarget(data);
}

type DirectLinkRowLookup = (
  practiceId: string,
) => Promise<
  | { ok: true; row: PublishedDirectLinkRow | null }
  | { ok: false; reason: "storage_unavailable" }
>;

let directLinkLookupOverride: DirectLinkRowLookup | null = null;

export function setPublishedDirectLinkLookupForTests(
  lookup: DirectLinkRowLookup | null,
) {
  directLinkLookupOverride = lookup;
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
 * Used by VK launch and other listed-only opens.
 * Unpublished, scheduled-future, unlisted, and selected_users rows fail closed.
 * MAX exact `p_<uuid>` deep links use resolvePublishedDirectLinkProductById.
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

/**
 * Published product addressable by a direct link: listed and unlisted.
 * Does not admit the product into the ordinary catalog.
 * selected_users, unpublished, deleted, and future-scheduled rows fail closed.
 */
export async function resolvePublishedDirectLinkProductById(
  practiceId: string,
): Promise<PublishedProductLookupResult> {
  if (directLinkLookupOverride) {
    const found = await directLinkLookupOverride(practiceId);
    if (!found.ok) return found;
    return { ok: true, target: readPublishedDirectLinkTarget(found.row) };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await applyPracticePublicAvailabilityFilter(
    supabase
      .from("practices")
      .select(PUBLISHED_LISTED_COLUMNS)
      .eq("id", practiceId)
      .eq("status", "published")
      .is("deleted_at", null),
  ).maybeSingle();

  if (error) return { ok: false, reason: "storage_unavailable" };
  return {
    ok: true,
    target: readPublishedDirectLinkTarget(data as PublishedDirectLinkRow | null),
  };
}
