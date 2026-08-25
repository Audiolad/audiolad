import type { SupabaseClient } from "@supabase/supabase-js";

import { PRODUCT_KIND, type ProductKind } from "@/lib/author-products/product-kind";
import { searchPublishedCatalogProducts } from "@/lib/catalog/search";
import type { CatalogCard, PublicationClass } from "@/lib/catalog/dto";
import {
  adaptLegacyCatalogSourceToCard,
  mapLegacyProductKindToClass,
  type LegacyCatalogSource,
} from "@/lib/catalog/legacy-adapter";
import { listingOfferAmountMinor } from "@/lib/catalog/offer";
import {
  createSupabaseLibrarySavesStore,
  type LibrarySavesAsyncStore,
} from "@/lib/library/saves";
import {
  getPublishedCatalogProducts,
  type CatalogProduct,
} from "@/lib/products/catalog";

import {
  decodeCatalogCursor,
  encodeCatalogCursor,
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
};

export function mapLegacyCatalogProductToSource(
  product: CatalogProduct,
): LegacyCatalogSource {
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    subtitle: product.subtitle,
    productKind: product.productKind,
    price: product.price,
    isFree: product.isFree,
    coverUrl: product.coverUrl,
    coverImage: product.coverImage,
    updatedAt: product.updatedAt,
    authorName: product.authorName,
    authorSlug: product.authorSlug,
    href: product.href,
    publishedAt: product.publishedAt ?? null,
    durationSeconds: product.durationSeconds ?? null,
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
  item: Pick<CatalogListingCandidate, "class">,
  publicationClass: CatalogClassFilter,
): boolean {
  return publicationClass === "all" || item.class === publicationClass;
}

/** @deprecated Use matchesCatalogClassFilter. */
export function matchesCatalogKindFilter(
  item: Pick<CatalogListingCandidate, "class">,
  publicationClass: CatalogClassFilter,
): boolean {
  return matchesCatalogClassFilter(item, publicationClass);
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

export function applyCatalogListingCursor(
  items: CatalogListingCandidate[],
  cursor: string | null,
  sort: CatalogSort,
): CatalogListingCandidate[] {
  const decoded = decodeCatalogCursor(cursor);

  if (!decoded) {
    return items;
  }

  if (sort === "new") {
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

  return {
    items: page.map(toPublicListingCard),
    nextCursor:
      hasMore && lastItem
        ? encodeCatalogCursor(lastItem.sortTimestamp, lastItem.publication_id)
        : null,
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
  };
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

async function resolveCatalogListingUserId(
  supabase: SupabaseClient,
  explicitUserId?: string | null,
): Promise<string | null> {
  if (explicitUserId !== undefined) {
    return explicitUserId;
  }

  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function listingProductKindHint(
  publicationClass: CatalogClassFilter,
): ProductKind | null {
  if (publicationClass === "release") {
    return PRODUCT_KIND.MUSIC;
  }

  if (publicationClass === "post") {
    return PRODUCT_KIND.AUDIO_POST;
  }

  if (publicationClass === "practice") {
    return PRODUCT_KIND.PRACTICE;
  }

  return null;
}

export function resolveCatalogListingClass(
  product: Pick<CatalogProduct, "productKind">,
): PublicationClass {
  return mapLegacyProductKindToClass(product.productKind);
}

export async function listPublishedCatalog(
  supabase: SupabaseClient,
  query: CatalogListingQuery,
  options: {
    userId?: string | null;
    savesStore?: LibrarySavesAsyncStore;
  } = {},
): Promise<CatalogListingResult> {
  if (query.class === "course" || query.class === "audiobook") {
    return { items: [], nextCursor: null };
  }

  const productKindHint = listingProductKindHint(query.class);

  const products = query.q
    ? await searchPublishedCatalogProducts(supabase, {
        query: query.q,
        topicKey: query.topic,
        limit: CATALOG_LISTING_SEARCH_LIMIT,
      })
    : await getPublishedCatalogProducts(supabase, {
        topicKey: query.topic,
        productKind: productKindHint,
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
  const sorted = sortCatalogListingItems(candidates, query.sort);
  const page = paginateCatalogListingItems(sorted, query);
  const userId = await resolveCatalogListingUserId(supabase, options.userId);

  if (!userId) {
    return {
      ...page,
      items: applyCatalogListingSavedState(page.items, null),
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
      items: applyCatalogListingSavedState(page.items, new Set(savedIds)),
    };
  } catch (error) {
    console.error(
      "catalog_listing_saves_error",
      error instanceof Error ? error.message : error,
    );

    return {
      ...page,
      items: applyCatalogListingSavedState(page.items, new Set()),
    };
  }
}
