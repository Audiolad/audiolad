/**
 * Published-product occupancy for SEO queries.
 *
 * A reservation is not the only proof that a catalog query is taken.
 * A published practice occupies the query when `primary_seo_query_id`
 * points at it. Until a separate backfill, a published practice with a
 * NULL id can still occupy a catalog row by exact normalized equality of
 * `seo_primary_query` and `seo_queries.query_text` / `normalized_query`.
 * That text path is legacy compatibility only — not fuzzy, not ILIKE,
 * and not the write path for new products.
 */

import {
  SEO_ACTIVE_RESERVATION_LIMIT,
  type SeoQueryLifecycle,
} from "@/lib/seo-queries/types";

export const SEO_QUERY_OCCUPIED_BY_PUBLISHED_PRODUCT_CODE =
  "seo_query_occupied_by_published_product" as const;

export const SEO_QUERY_OCCUPIED_BY_PUBLISHED_PRODUCT_MESSAGE =
  "Этот запрос уже используется опубликованным продуктом.";

export type SeoOccupancyMatch =
  | "primary_seo_query_id"
  | "legacy_exact_normalized_text";

export type SeoOccupancyHit = {
  queryId: string;
  practiceId: string;
  authorId: string;
  productTitle: string | null;
  match: SeoOccupancyMatch;
};

/** Shape shared with discovery hide / available decisions. */
export type PublishedSeoQueryOccupancy = {
  productId: string;
  authorId: string;
  productTitle: string | null;
  match: SeoOccupancyMatch;
};

export type PublishedPracticeSeoRow = {
  id: string;
  authorId: string;
  title: string | null;
  status: string;
  deletedAt?: string | null;
  primarySeoQueryId: string | null;
  seoPrimaryQuery: string | null;
};

export type CatalogSeoQueryRef = {
  id: string;
  queryText: string;
  normalizedQuery?: string | null;
};

/**
 * Mirrors `public.normalize_seo_query`: ё/Ё → е/Е, lower case,
 * ASCII punctuation to spaces, collapsed whitespace, trim.
 * Exact equality of this value is the only legacy text match.
 */
export function normalizeSeoQueryText(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const translated = value.replace(/Ё/g, "Е").replace(/ё/g, "е");
  const lowered = translated.toLowerCase();
  const depunctuated = lowered.replace(
    /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+/g,
    " ",
  );
  return depunctuated.replace(/\s+/g, " ").trim();
}

export function catalogQueryNormalized(query: CatalogSeoQueryRef): string {
  const stored = query.normalizedQuery?.trim();
  if (stored) return normalizeSeoQueryText(stored);
  return normalizeSeoQueryText(query.queryText);
}

export function toPublishedSeoQueryOccupancy(
  hit: SeoOccupancyHit,
): PublishedSeoQueryOccupancy {
  return {
    productId: hit.practiceId,
    authorId: hit.authorId,
    productTitle: hit.productTitle,
    match: hit.match,
  };
}

function isPublishedPractice(practice: PublishedPracticeSeoRow): boolean {
  return practice.status === "published" && !practice.deletedAt;
}

/**
 * Batch index. FK occupancy wins over legacy text for the same query.
 * Practices are matched in id order so the chosen row is stable.
 */
export function indexPublishedSeoOccupancy(input: {
  queries: readonly CatalogSeoQueryRef[];
  practices: readonly PublishedPracticeSeoRow[];
}): Map<string, SeoOccupancyHit> {
  const queryIds = new Set(input.queries.map((query) => query.id));
  const queryIdsByNormalized = new Map<string, string[]>();
  for (const query of input.queries) {
    const normalized = catalogQueryNormalized(query);
    if (!normalized) continue;
    const bucket = queryIdsByNormalized.get(normalized) ?? [];
    bucket.push(query.id);
    queryIdsByNormalized.set(normalized, bucket);
  }

  const practices = [...input.practices].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const hits = new Map<string, SeoOccupancyHit>();

  for (const practice of practices) {
    if (!isPublishedPractice(practice) || !practice.primarySeoQueryId) continue;
    if (!queryIds.has(practice.primarySeoQueryId)) continue;
    if (hits.has(practice.primarySeoQueryId)) continue;
    hits.set(practice.primarySeoQueryId, {
      queryId: practice.primarySeoQueryId,
      practiceId: practice.id,
      authorId: practice.authorId,
      productTitle: practice.title,
      match: "primary_seo_query_id",
    });
  }

  for (const practice of practices) {
    if (!isPublishedPractice(practice) || practice.primarySeoQueryId) continue;
    // Legacy compatibility until backfill fills primary_seo_query_id.
    // Exact normalized equality only.
    const normalized = normalizeSeoQueryText(practice.seoPrimaryQuery);
    if (!normalized) continue;
    const queryIdsForText = queryIdsByNormalized.get(normalized) ?? [];
    for (const queryId of queryIdsForText) {
      if (hits.has(queryId)) continue;
      hits.set(queryId, {
        queryId,
        practiceId: practice.id,
        authorId: practice.authorId,
        productTitle: practice.title,
        match: "legacy_exact_normalized_text",
      });
    }
  }

  return hits;
}

/**
 * Occupancy is applied before the reservation lifecycle.
 * A published product makes the query unavailable even when no
 * reservation row exists. Released / expired reservations are not
 * passed in by callers that already dropped ineffective rows.
 */
export function lifecycleForSeoOpportunity(input: {
  reservation?: { status: string } | null;
  product?: { status?: string | null; moderation_status?: string | null } | null;
  publishedOccupancy?: SeoOccupancyHit | PublishedSeoQueryOccupancy | null;
}): SeoQueryLifecycle {
  if (input.publishedOccupancy) return "published";
  const reservation = input.reservation;
  const product = input.product;
  if (!reservation) return "available";
  if (reservation.status === "used" || product?.status === "published") {
    return "published";
  }
  if (product?.moderation_status === "submitted") return "moderation";
  return "in_progress";
}

/**
 * Explicit catalog `query_id` persists text and the foreign key.
 * Free text that did not come from a catalog row keeps text only.
 */
export function catalogPickSeoPrimaryFields(input: {
  queryId?: string | null;
  queryText?: string | null;
}): {
  seo_primary_query: string | null;
  primary_seo_query_id: string | null;
} {
  const queryId = input.queryId?.trim() ?? "";
  const queryText = input.queryText?.trim() ?? "";
  if (queryId) {
    return {
      seo_primary_query: queryText || null,
      primary_seo_query_id: queryId,
    };
  }
  return {
    seo_primary_query: queryText || null,
    primary_seo_query_id: null,
  };
}

export type SeoReservationClaimCode =
  | "seo_query_not_analyzed"
  | "seo_query_occupied_by_published_product"
  | "seo_query_already_reserved"
  | "seo_reservation_limit_reached";

export type SeoReservationClaimPlan =
  | { action: "return_existing"; reservationId: string }
  | { action: "reject"; code: SeoReservationClaimCode }
  | { action: "insert" };

export type SeoReservationClaimRow = {
  id: string;
  queryId: string;
  authorId: string;
  status: string;
};

/**
 * Decision order matches `reserve_seo_query` after lazy expiry:
 * own active row is returned (no second insert, limit does not apply),
 * then published occupancy, then another author's active/used row,
 * then the active-slot limit, then insert.
 * `used` / `released` / expired rows do not consume the active limit;
 * pass only still-active rows in `activeReservationCount`.
 */
export function planSeoQueryReserve(input: {
  authorId: string;
  queryId: string;
  analysisStatus: string;
  activeReservationCount: number;
  reservations: readonly SeoReservationClaimRow[];
  publishedOccupancy: boolean;
  activeLimit?: number;
}): SeoReservationClaimPlan {
  if (input.analysisStatus !== "analyzed") {
    return { action: "reject", code: "seo_query_not_analyzed" };
  }

  const ownActive = input.reservations.find(
    (row) =>
      row.queryId === input.queryId &&
      row.authorId === input.authorId &&
      row.status === "active",
  );
  if (ownActive) {
    return { action: "return_existing", reservationId: ownActive.id };
  }

  if (input.publishedOccupancy) {
    return {
      action: "reject",
      code: "seo_query_occupied_by_published_product",
    };
  }

  const takenByReservation = input.reservations.some(
    (row) =>
      row.queryId === input.queryId &&
      (row.status === "active" || row.status === "used"),
  );
  if (takenByReservation) {
    return { action: "reject", code: "seo_query_already_reserved" };
  }

  const limit = input.activeLimit ?? SEO_ACTIVE_RESERVATION_LIMIT;
  if (input.activeReservationCount >= limit) {
    return { action: "reject", code: "seo_reservation_limit_reached" };
  }

  return { action: "insert" };
}
