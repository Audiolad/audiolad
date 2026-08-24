import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isAudioPostProductKind,
  isMusicProductKind,
  normalizeProductKind,
  PRODUCT_KIND,
  type ProductKind,
} from "@/lib/author-products/product-kind";
import { searchPublishedCatalogProducts } from "@/lib/catalog/search";
import {
  createSupabaseLibrarySavesStore,
  type LibrarySavesAsyncStore,
} from "@/lib/library/saves";
import {
  getPublishedCatalogProducts,
  isComputedProgramProduct,
  type CatalogProduct,
} from "@/lib/products/catalog";

import {
  decodeCatalogCursor,
  encodeCatalogCursor,
  type CatalogAccessFilter,
  type CatalogKindFilter,
  type CatalogListingItem,
  type CatalogListingQuery,
  type CatalogListingResult,
  type CatalogListingKind,
  type CatalogSort,
} from "./listing-contract";

export {
  CATALOG_ACCESS_FILTERS,
  CATALOG_KIND_FILTERS,
  CATALOG_LISTING_MAX_LIMIT,
  CATALOG_LISTING_PAGE_SIZE,
  CATALOG_SORTS,
  buildCatalogListingApiUrl,
  decodeCatalogCursor,
  encodeCatalogCursor,
  parseCatalogAccessFilter,
  parseCatalogKindFilter,
  parseCatalogListingLimit,
  parseCatalogListingQuery,
  parseCatalogSort,
} from "./listing-contract";
export type {
  CatalogAccessFilter,
  CatalogKindFilter,
  CatalogListingItem,
  CatalogListingKind,
  CatalogListingQuery,
  CatalogListingResult,
  CatalogSort,
} from "./listing-contract";

export const CATALOG_LISTING_SEARCH_LIMIT = 200;

export type CatalogListingCandidate = CatalogListingItem & {
  sortTimestamp: number;
  price: number | null;
  isFree: boolean;
};

const CATALOG_KIND_LABEL: Record<CatalogListingKind, string> = {
  practice: "Аудиопрактика",
  music: "Музыка",
  audio_post: "Аудиопост",
  program: "Программа",
};

export function resolveCatalogListingKind(
  product: Pick<CatalogProduct, "productKind" | "format" | "audioCount">,
): CatalogListingKind {
  const productKind = normalizeProductKind(product.productKind);

  if (productKind === PRODUCT_KIND.MUSIC || isMusicProductKind(productKind)) {
    return "music";
  }

  if (
    productKind === PRODUCT_KIND.AUDIO_POST ||
    isAudioPostProductKind(productKind)
  ) {
    return "audio_post";
  }

  if (
    isComputedProgramProduct(
      product.audioCount ?? 0,
      product.format,
      productKind,
    )
  ) {
    return "program";
  }

  return "practice";
}

export function resolveCatalogListingKindLabel(
  kind: CatalogListingKind,
  productTypeLabel?: string | null,
): string {
  const trimmed = productTypeLabel?.trim();

  if (trimmed) {
    return trimmed;
  }

  return CATALOG_KIND_LABEL[kind];
}

export function mapCatalogProductToListingItem(
  product: CatalogProduct,
): CatalogListingCandidate {
  const kind = resolveCatalogListingKind(product);

  return {
    id: product.id,
    slug: product.slug,
    href: product.href,
    title: product.title,
    author: product.authorName?.trim() || "",
    coverUrl: product.coverUrl,
    coverImage: product.coverImage,
    updatedAt: product.updatedAt,
    kind,
    kindLabel: resolveCatalogListingKindLabel(kind, product.productTypeLabel),
    durationLabel: product.statsLabel,
    priceLabel: product.priceLabel,
    accessState: product.isFree ? "free" : "paid",
    isSaved: false,
    sortTimestamp: product.sortTimestamp,
    price: product.price,
    isFree: product.isFree,
  };
}

export function matchesCatalogAccessFilter(
  item: Pick<CatalogListingCandidate, "isFree" | "price" | "accessState">,
  access: CatalogAccessFilter,
): boolean {
  if (access === "all") {
    return true;
  }

  if (access === "free") {
    return item.isFree || item.accessState === "free";
  }

  return !item.isFree && typeof item.price === "number" && item.price > 0;
}

export function matchesCatalogKindFilter(
  item: Pick<CatalogListingCandidate, "kind">,
  kind: CatalogKindFilter,
): boolean {
  return kind === "all" || item.kind === kind;
}

export function filterCatalogListingItems(
  items: CatalogListingCandidate[],
  query: Pick<CatalogListingQuery, "access" | "kind">,
): CatalogListingCandidate[] {
  return items.filter(
    (item) =>
      matchesCatalogAccessFilter(item, query.access) &&
      matchesCatalogKindFilter(item, query.kind),
  );
}

function compareIdsDesc(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left > right ? -1 : 1;
}

function listingPriceValue(item: CatalogListingCandidate): number {
  if (item.isFree) {
    return 0;
  }

  if (typeof item.price === "number" && Number.isFinite(item.price)) {
    return item.price;
  }

  return Number.POSITIVE_INFINITY;
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

    return compareIdsDesc(left.id, right.id);
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

  return item.id < cursor.id;
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

  const cursorIndex = items.findIndex((item) => item.id === decoded.id);

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
    items: page.map(toPublicListingItem),
    nextCursor: hasMore && lastItem
      ? encodeCatalogCursor(lastItem.sortTimestamp, lastItem.id)
      : null,
  };
}

function toPublicListingItem(
  item: CatalogListingCandidate,
): CatalogListingItem {
  return {
    id: item.id,
    slug: item.slug,
    href: item.href,
    title: item.title,
    author: item.author,
    coverUrl: item.coverUrl,
    coverImage: item.coverImage,
    updatedAt: item.updatedAt,
    kind: item.kind,
    kindLabel: item.kindLabel,
    durationLabel: item.durationLabel,
    priceLabel: item.priceLabel,
    accessState: item.accessState,
    isSaved: item.isSaved,
  };
}

export function applyCatalogListingSavedState(
  items: CatalogListingItem[],
  savedIds: ReadonlySet<string> | null,
): CatalogListingItem[] {
  return items.map((item) => ({
    ...item,
    isSaved: savedIds !== null && savedIds.has(item.id),
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
  kind: CatalogKindFilter,
): ProductKind | null {
  if (kind === "music") {
    return PRODUCT_KIND.MUSIC;
  }

  if (kind === "audio_post") {
    return PRODUCT_KIND.AUDIO_POST;
  }

  return null;
}

export async function listPublishedCatalog(
  supabase: SupabaseClient,
  query: CatalogListingQuery,
  options: {
    userId?: string | null;
    savesStore?: LibrarySavesAsyncStore;
  } = {},
): Promise<CatalogListingResult> {
  const productKindHint = listingProductKindHint(query.kind);

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
    products.map(mapCatalogProductToListingItem),
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
      page.items.map((item) => item.id),
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
