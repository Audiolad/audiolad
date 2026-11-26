import type { SupabaseClient } from "@supabase/supabase-js";

import { matchesCatalogProductType } from "@/lib/catalog/type-filter";
import { searchPublishedCatalogProducts } from "@/lib/catalog/search";
import type { CatalogCard, PublicationClass } from "@/lib/catalog/dto";
import {
  adaptLegacyCatalogSourceToCard,
  resolvePublicationClass,
  type LegacyCatalogSource,
} from "@/lib/catalog/legacy-adapter";
import { listingOfferAmountMinor } from "@/lib/catalog/offer";
import {
  createSupabaseLibrarySavesStore,
  type LibrarySavesAsyncStore,
} from "@/lib/library/saves";
import {
  getPublishedCatalogProducts,
  type CatalogProductViewer,
  type CatalogProduct,
} from "@/lib/products/catalog";
import {
  loadOrdinaryCatalogViewer,
  resolveCatalogViewerUserId,
} from "@/lib/catalog/visibility-query";

import {
  buildCatalogPublicMetrics,
  EMPTY_CATALOG_PUBLIC_METRICS,
} from "@/lib/catalog/public-metrics";
import {
  decodeCatalogCursor,
  encodeCatalogCursor,
  encodeCatalogPopularCursor,
  encodeCatalogRatingCursor,
  resolveCatalogListingCursor,
  CATALOG_CLASS_FILTERS,
  type CatalogAccessFilter,
  type CatalogClassFilter,
  type CatalogListingQuery,
  type CatalogListingResult,
  type CatalogSort,
} from "./listing-contract";

export {
  CATALOG_ACCESS_FILTERS,
  CATALOG_CLASS_FILTERS,
  CATALOG_KIND_FILTERS,
  CATALOG_LISTING_MAX_LIMIT,
  CATALOG_LISTING_PAGE_SIZE,
  CATALOG_SORTS,
  buildCatalogListingApiUrl,
  decodeCatalogCursor,
  encodeCatalogCursor,
  parseCatalogAccessFilter,
  parseCatalogClassFilter,
  parseCatalogKindFilter,
  parseCatalogListingLimit,
  parseCatalogListingQuery,
  parseCatalogSort,
} from "./listing-contract";
export type {
  CatalogAccessFilter,
  CatalogClassFilter,
  CatalogKindFilter,
  CatalogListingItem,
  CatalogListingQuery,
  CatalogListingResult,
  CatalogSort,
} from "./listing-contract";

export const CATALOG_LISTING_SEARCH_LIMIT = 200;

export type CatalogListingCandidate = CatalogCard & {
  sortTimestamp: number;
  popularListenCount: number;
  totalStars: number;
  listingTypes?: CatalogClassFilter[];
};

export function mapLegacyCatalogProductToSource(
  product: CatalogProduct,
): LegacyCatalogSource {
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    subtitle: product.subtitle,
    format: product.format,
    productKind: product.productKind,
    publicationClass: resolveCatalogListingClass(product),
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    isFree: product.isFree,
    coverUrl: product.coverUrl,
    coverImage: product.coverImage,
    updatedAt: product.updatedAt,
    authorName: product.authorName,
    authorSlug: product.authorSlug,
    href: product.href,
    publishedAt: product.publishedAt ?? null,
    durationSeconds: product.durationSeconds ?? null,
    durationMinutesFallback: product.durationMinutes ?? null,
    gallery: product.gallery ?? [],
  };
}

export function mapCatalogProductToListingItem(
  product: CatalogProduct,
): CatalogListingCandidate {
  const card = adaptLegacyCatalogSourceToCard(
    mapLegacyCatalogProductToSource(product),
  );

  if (!card) {
    throw new Error("catalog_card_adapt_failed");
  }

  return {
    ...card,
    sortTimestamp: product.sortTimestamp,
    popularListenCount: 0,
    totalStars: 0,
    listingTypes: CATALOG_CLASS_FILTERS.filter((filter) =>
      matchesCatalogProductType({
        product_kind: product.productKind,
        publication_class: product.publicationClass,
        catalog_section: product.catalogSection,
        format: product.format,
      }, filter),
    ),
  };
}

export function matchesCatalogAccessFilter(
  item: Pick<CatalogListingCandidate, "default_offer">,
  access: CatalogAccessFilter,
): boolean {
  if (access === "all") {
    return true;
  }

  return item.default_offer?.access === access;
}

export function matchesCatalogClassFilter(
  item: Pick<CatalogListingCandidate, "class" | "listingTypes">,
  publicationClass: CatalogClassFilter,
): boolean {
  return (
    publicationClass === "all" ||
    (item.listingTypes
      ? item.listingTypes.includes(publicationClass)
      : item.class === publicationClass)
  );
}

/** @deprecated Use matchesCatalogClassFilter. */
export function matchesCatalogKindFilter(
  item: Pick<CatalogListingCandidate, "class" | "listingTypes">,
  publicationClass: CatalogClassFilter,
): boolean {
  return matchesCatalogClassFilter(item, publicationClass);
}

export async function rankCatalogListingCandidates(
  _supabase: SupabaseClient,
  candidates: CatalogListingCandidate[],
  sort: CatalogSort,
): Promise<CatalogListingCandidate[]> {
  let prepared = candidates;

  if (sort === "popular" || sort === "rating") {
    try {
      const { attachCatalogListingSortMetrics, loadCatalogListingSortMetrics } =
        await import("@/lib/catalog/sort-metrics");
      const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
      const metricsClient = createServiceRoleClient();
      const metricsById = await loadCatalogListingSortMetrics(
        candidates.map((item) => item.publication_id),
        {
          popular: sort === "popular",
          rating: sort === "rating",
        },
        metricsClient,
      );
      prepared = attachCatalogListingSortMetrics(candidates, metricsById);
    } catch (error) {
      console.error(
        "catalog_listing_sort_metrics_error",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return sortCatalogListingItems(prepared, sort);
}

export function filterCatalogListingItems(
  items: CatalogListingCandidate[],
  query: Pick<CatalogListingQuery, "access" | "class">,
): CatalogListingCandidate[] {
  return items.filter(
    (item) =>
      matchesCatalogAccessFilter(item, query.access) &&
      matchesCatalogClassFilter(item, query.class),
  );
}

function compareIdsDesc(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left > right ? -1 : 1;
}

function listingPriceValue(item: CatalogListingCandidate): number {
  return listingOfferAmountMinor(item.default_offer);
}

export function sortCatalogListingItems(
  items: CatalogListingCandidate[],
  sort: CatalogSort,
): CatalogListingCandidate[] {
  return [...items].sort((left, right) => {
    if (sort === "popular") {
      if (left.popularListenCount !== right.popularListenCount) {
        return right.popularListenCount - left.popularListenCount;
      }
    }

    if (sort === "rating") {
      if (left.totalStars !== right.totalStars) {
        return right.totalStars - left.totalStars;
      }
    }

    if (sort === "price_asc" || sort === "price_desc") {
      const priceDelta = listingPriceValue(left) - listingPriceValue(right);

      if (priceDelta !== 0) {
        return sort === "price_asc" ? priceDelta : -priceDelta;
      }
    }

    if (left.sortTimestamp !== right.sortTimestamp) {
      return right.sortTimestamp - left.sortTimestamp;
    }

    return compareIdsDesc(left.publication_id, right.publication_id);
  });
}

function isAfterNewCursor(
  item: CatalogListingCandidate,
  cursor: { sortTimestamp: number; id: string },
): boolean {
  if (item.sortTimestamp < cursor.sortTimestamp) {
    return true;
  }

  if (item.sortTimestamp > cursor.sortTimestamp) {
    return false;
  }

  return item.publication_id < cursor.id;
}

function isAfterPopularCursor(
  item: CatalogListingCandidate,
  cursor: { popularListenCount: number; sortTimestamp: number; id: string },
): boolean {
  if (item.popularListenCount < cursor.popularListenCount) {
    return true;
  }

  if (item.popularListenCount > cursor.popularListenCount) {
    return false;
  }

  return isAfterNewCursor(item, cursor);
}

function isAfterRatingCursor(
  item: CatalogListingCandidate,
  cursor: { totalStars: number; sortTimestamp: number; id: string },
): boolean {
  if (item.totalStars < cursor.totalStars) {
    return true;
  }

  if (item.totalStars > cursor.totalStars) {
    return false;
  }

  return isAfterNewCursor(item, cursor);
}

export function applyCatalogListingCursor(
  items: CatalogListingCandidate[],
  cursor: string | null,
  sort: CatalogSort,
): CatalogListingCandidate[] {
  const decoded = resolveCatalogListingCursor(cursor, sort);

  if (!decoded) {
    return items;
  }

  if (decoded.sort === "popular") {
    return items.filter((item) => isAfterPopularCursor(item, decoded));
  }

  if (decoded.sort === "rating") {
    return items.filter((item) => isAfterRatingCursor(item, decoded));
  }

  if (decoded.sort === "new") {
    return items.filter((item) => isAfterNewCursor(item, decoded));
  }

  const cursorIndex = items.findIndex(
    (item) => item.publication_id === decoded.id,
  );

  if (cursorIndex === -1) {
    return items.filter((item) => isAfterNewCursor(item, decoded));
  }

  return items.slice(cursorIndex + 1);
}

export function paginateCatalogListingItems(
  items: CatalogListingCandidate[],
  query: Pick<CatalogListingQuery, "cursor" | "limit" | "sort">,
): CatalogListingResult {
  const remaining = applyCatalogListingCursor(items, query.cursor, query.sort);
  const page = remaining.slice(0, query.limit);
  const lastItem = page[page.length - 1];
  const hasMore = remaining.length > query.limit && Boolean(lastItem);

  let nextCursor: string | null = null;

  if (hasMore && lastItem) {
    if (query.sort === "popular") {
      nextCursor = encodeCatalogPopularCursor(
        lastItem.popularListenCount,
        lastItem.sortTimestamp,
        lastItem.publication_id,
      );
    } else if (query.sort === "rating") {
      nextCursor = encodeCatalogRatingCursor(
        lastItem.totalStars,
        lastItem.sortTimestamp,
        lastItem.publication_id,
      );
    } else {
      nextCursor = encodeCatalogCursor(
        lastItem.sortTimestamp,
        lastItem.publication_id,
      );
    }
  }

  return {
    items: page.map(toPublicListingCard),
    nextCursor,
  };
}

function toPublicListingCard(item: CatalogListingCandidate): CatalogCard {
  return {
    publication_id: item.publication_id,
    class: item.class,
    slug: item.slug,
    title: item.title,
    subtitle: item.subtitle,
    cover: item.cover,
    gallery: item.gallery,
    author: item.author,
    topics: item.topics,
    display_label: item.display_label,
    duration_seconds: item.duration_seconds,
    published_at: item.published_at,
    paths: item.paths,
    default_offer: item.default_offer,
    viewer: item.viewer,
    badges: item.badges,
    progress: item.progress,
    summary: item.summary,
    public_metrics: buildCatalogPublicMetrics(
      item.popularListenCount,
      item.totalStars,
    ),
  };
}

export async function attachPublicMetricsToListingResult(
  page: CatalogListingResult,
  sort: CatalogSort,
  sortedCandidates: readonly CatalogListingCandidate[],
): Promise<CatalogListingResult> {
  if (sort === "popular" || sort === "rating") {
    return page;
  }

  const publicationIds = page.items.map((item) => item.publication_id);
  if (publicationIds.length === 0) {
    return page;
  }

  try {
    const { loadCatalogListingSortMetrics } = await import("@/lib/catalog/sort-metrics");
    const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
    const metricsById = await loadCatalogListingSortMetrics(
      publicationIds,
      { popular: true, rating: true },
      createServiceRoleClient(),
    );

    return {
      ...page,
      items: page.items.map((item) => {
        const metrics = metricsById.get(item.publication_id);
        return {
          ...item,
          public_metrics: metrics
            ? buildCatalogPublicMetrics(
                metrics.popularListenCount,
                metrics.totalStars,
              )
            : EMPTY_CATALOG_PUBLIC_METRICS,
        };
      }),
    };
  } catch (error) {
    console.error(
      "catalog_listing_public_metrics_error",
      error instanceof Error ? error.message : error,
    );
    return page;
  }
}

export function applyCatalogListingSavedState(
  items: CatalogCard[],
  savedIds: ReadonlySet<string> | null,
): CatalogCard[] {
  return items.map((item) => ({
    ...item,
    viewer: {
      ...item.viewer,
      is_saved: savedIds !== null && savedIds.has(item.publication_id),
    },
  }));
}

export function applyCatalogListingGrantState(
  items: CatalogCard[],
  grantedIds: ReadonlySet<string> | null,
): CatalogCard[] {
  return items.map((item) => ({
    ...item,
    viewer: {
      ...item.viewer,
      has_grant: grantedIds !== null && grantedIds.has(item.publication_id),
    },
  }));
}

export function resolveCatalogListingClass(
  product: Pick<CatalogProduct, "productKind" | "publicationClass"> &
    Partial<Pick<CatalogProduct, "format">>,
): PublicationClass {
  const publicationClass = resolvePublicationClass(
    product.publicationClass,
    product.productKind,
  );
  // Old posts can still carry the practice shadow kind/class.
  if (publicationClass === "practice" && matchesCatalogProductType({
    publication_class: product.publicationClass,
    product_kind: product.productKind,
    format: product.format,
  }, "post")) {
    return "post";
  }

  return publicationClass;
}

export async function listPublishedCatalog(
  supabase: SupabaseClient,
  query: CatalogListingQuery,
  options: {
    userId?: string | null;
    visitorId?: string | null;
    savesStore?: LibrarySavesAsyncStore;
  } = {},
): Promise<CatalogListingResult> {
  const userId = await resolveCatalogViewerUserId(supabase, options.userId);
  const ordinaryViewer = await loadOrdinaryCatalogViewer(supabase, userId);
  const viewer: CatalogProductViewer = {
    ...ordinaryViewer,
    visitorId: options.visitorId ?? null,
    userId,
  };

  const products = query.q
    ? await searchPublishedCatalogProducts(supabase, {
        query: query.q,
        topicKey: query.topic,
        catalogSection: query.section,
        catalogType: query.class,
        limit: CATALOG_LISTING_SEARCH_LIMIT,
        viewer,
      })
    : await getPublishedCatalogProducts(supabase, {
        topicKey: query.topic,
        catalogSection: query.section,
        catalogType: query.class,
        viewer,
      });

  const candidates = filterCatalogListingItems(
    products.flatMap((product) => {
      try {
        return [mapCatalogProductToListingItem(product)];
      } catch {
        return [];
      }
    }),
    query,
  );
  const sorted = await rankCatalogListingCandidates(supabase, candidates, query.sort);
  let page = paginateCatalogListingItems(sorted, query);
  page = await attachPublicMetricsToListingResult(page, query.sort, sorted);
  const grantedIds = new Set(viewer.entitledPracticeIds);

  if (!userId) {
    return {
      ...page,
      items: applyCatalogListingGrantState(
        applyCatalogListingSavedState(page.items, null),
        null,
      ),
    };
  }

  const store = options.savesStore ?? createSupabaseLibrarySavesStore(supabase);

  try {
    const savedIds = await store.listSavedPracticeIds(
      userId,
      page.items.map((item) => item.publication_id),
    );

    return {
      ...page,
      items: applyCatalogListingGrantState(
        applyCatalogListingSavedState(page.items, new Set(savedIds)),
        grantedIds,
      ),
    };
  } catch (error) {
    console.error(
      "catalog_listing_saves_error",
      error instanceof Error ? error.message : error,
    );

    return {
      ...page,
      items: applyCatalogListingGrantState(
        applyCatalogListingSavedState(page.items, new Set()),
        grantedIds,
      ),
    };
  }
}
