import "server-only";

import type { PublicCatalogSection } from "@/lib/catalog/catalog-sections";
import { normalizeCatalogGallery } from "@/lib/catalog/gallery";
import {
  CATALOG_ACCESS_FILTERS,
  CATALOG_CLASS_FILTERS,
  type CatalogAccessFilter,
  type CatalogClassFilter,
} from "@/lib/catalog/listing-contract";
import { buildCatalogPublicMetrics } from "@/lib/catalog/public-metrics";
import {
  CATALOG_LISTING_SEARCH_LIMIT,
  filterCatalogListingItems,
  mapCatalogProductToListingItem,
  rankCatalogListingCandidates,
} from "@/lib/catalog/listing";
import {
  parseCatalogSort,
  type CatalogSort,
} from "@/lib/catalog/listing-contract";
import {
  normalizeCatalogSearchQuery,
  searchPublishedCatalogProducts,
} from "@/lib/catalog/search";
import {
  CATALOG_TOPIC_FILTER_MAX,
  parseCatalogTopicKeyList,
  serializeCatalogTopicParam,
} from "@/lib/catalog/topic-filter";
import { GUEST_ORDINARY_CATALOG_VIEWER } from "@/lib/catalog/visibility-query";
import {
  getPublishedCatalogProducts,
  type CatalogProduct,
} from "@/lib/products/catalog";
import { releaseDueScheduledPublications } from "@/lib/products/release-due-scheduled-publications";
import type {
  MaxCatalogGallerySlide,
  MaxCatalogProduct,
} from "@/lib/max/catalog-product";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type { MaxCatalogProduct };

export type MaxCatalogResult =
  | { ok: true; items: MaxCatalogProduct[] }
  | { ok: false; reason: "storage_unavailable" };

export type ListMaxPublishedCatalogInput = {
  query?: string | null;
  section?: PublicCatalogSection | null;
  topicKey?: string | null;
  access?: CatalogAccessFilter | null;
  class?: CatalogClassFilter | null;
  sort?: CatalogSort | null;
  getCatalogProducts?: typeof getPublishedCatalogProducts;
  searchCatalogProducts?: typeof searchPublishedCatalogProducts;
  getServiceClient?: typeof createServiceRoleClient;
};

export function parseMaxCatalogTopicParam(
  value: unknown,
): { ok: true; topicKey: string | null } | { ok: false } {
  if (value == null) {
    return { ok: true, topicKey: null };
  }

  if (typeof value !== "string") {
    return { ok: false };
  }

  if (!value.trim()) {
    return { ok: true, topicKey: null };
  }

  const parts = value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);

  if (parts.length > CATALOG_TOPIC_FILTER_MAX) {
    return { ok: false };
  }

  const parsed = parseCatalogTopicKeyList(value);
  const unique = [...new Set(parts)];

  if (
    parsed.length !== unique.length ||
    parsed.some((key, index) => key !== unique[index])
  ) {
    return { ok: false };
  }

  return { ok: true, topicKey: serializeCatalogTopicParam(parsed) };
}


export function parseMaxCatalogAccessParam(
  value: unknown,
): { ok: true; access: CatalogAccessFilter } | { ok: false } {
  if (value == null) {
    return { ok: true, access: "all" };
  }

  if (typeof value !== "string") {
    return { ok: false };
  }

  const normalized = value.trim().toLowerCase();
  if (!(CATALOG_ACCESS_FILTERS as readonly string[]).includes(normalized)) {
    return { ok: false };
  }

  return { ok: true, access: normalized as CatalogAccessFilter };
}

export function parseMaxCatalogSortParam(
  value: unknown,
): { ok: true; sort: CatalogSort } | { ok: false } {
  if (value == null) {
    return { ok: true, sort: "new" };
  }

  if (typeof value !== "string") {
    return { ok: false };
  }

  return { ok: true, sort: parseCatalogSort(value) };
}

export function parseMaxCatalogClassParam(
  value: unknown,
): { ok: true; class: CatalogClassFilter } | { ok: false } {
  if (value == null) {
    return { ok: true, class: "all" };
  }

  if (typeof value !== "string") {
    return { ok: false };
  }

  const normalized = value.trim().toLowerCase();
  if (!(CATALOG_CLASS_FILTERS as readonly string[]).includes(normalized)) {
    return { ok: false };
  }

  return { ok: true, class: normalized as CatalogClassFilter };
}


export type ListMaxPublishedCatalogFn = (
  input?: ListMaxPublishedCatalogInput,
) => Promise<MaxCatalogResult>;

function toPublicCatalogGallery(
  slides: Parameters<typeof normalizeCatalogGallery>[0],
): MaxCatalogGallerySlide[] {
  return normalizeCatalogGallery(slides).flatMap((slide, index) => {
    const id = slide.id.trim();
    const imageUrl = slide.image_url.trim();
    if (!id || !imageUrl) return [];
    return [{
      id,
      image_url: imageUrl,
      alt: slide.alt,
      position: Number.isFinite(slide.position) ? slide.position : index,
    }];
  });
}

function toMaxCatalogProduct(
  product: {
    id: string;
    authorSlug: string | null;
    slug: string;
    title: string;
    subtitle: string | null;
    coverUrl: string | null;
    authorName: string | null;
    productTypeLabel: string;
    priceLabel: string;
    isFree: boolean;
    gallery?: Parameters<typeof normalizeCatalogGallery>[0];
  },
  metrics?: ReturnType<typeof buildCatalogPublicMetrics>,
): MaxCatalogProduct {
  const publicMetrics = metrics
    ? {
        qualifiedListenCount: metrics.qualified_listen_count,
        totalStars: metrics.total_stars,
      }
    : { qualifiedListenCount: 0, totalStars: 0 };

  return {
    authorSlug: product.authorSlug ?? "",
    slug: product.slug,
    title: product.title,
    subtitle: product.subtitle,
    coverUrl: product.coverUrl,
    authorName: product.authorName,
    formatLabel: product.productTypeLabel,
    priceLabel: product.priceLabel,
    isFree: product.isFree,
    publicMetrics,
    gallery: toPublicCatalogGallery(product.gallery),
  };
}

function toMaxCatalogProducts(
  products: CatalogProduct[],
  metricsById: ReadonlyMap<string, ReturnType<typeof buildCatalogPublicMetrics>>,
): MaxCatalogProduct[] {
  return products
    .filter((product) => Boolean(product.authorSlug))
    .map((product) =>
      toMaxCatalogProduct(
        product,
        metricsById.get(product.id),
      ),
    );
}

async function listMaxPublishedCatalogImpl(
  input: ListMaxPublishedCatalogInput = {},
): Promise<MaxCatalogResult> {
  try {
    const service = (input.getServiceClient ?? createServiceRoleClient)();
    await releaseDueScheduledPublications();
    const normalizedQuery = normalizeCatalogSearchQuery(input.query);
    const catalogSection = input.section ?? null;
    const topicKey = input.topicKey?.trim() ? input.topicKey.trim() : null;
    const access = input.access ?? "all";
    const publicationClass = input.class ?? "all";
    const sort = input.sort ?? "new";
    const products = normalizedQuery
      ? await (input.searchCatalogProducts ?? searchPublishedCatalogProducts)(
          service,
          {
            query: normalizedQuery,
            viewer: GUEST_ORDINARY_CATALOG_VIEWER,
            ...(catalogSection ? { catalogSection } : {}),
            ...(topicKey ? { topicKey } : {}),
            limit: CATALOG_LISTING_SEARCH_LIMIT,
          },
        )
      : await (input.getCatalogProducts ?? getPublishedCatalogProducts)(
          service,
          {
            viewer: GUEST_ORDINARY_CATALOG_VIEWER,
            throwOnStorageError: true,
            ...(catalogSection ? { catalogSection } : {}),
            ...(topicKey ? { topicKey } : {}),
          },
        );

    const candidates = products.flatMap((product) => {
      try {
        return [mapCatalogProductToListingItem(product)];
      } catch {
        return [];
      }
    });
    const filteredCandidates = filterCatalogListingItems(candidates, {
      access,
      class: publicationClass,
    });
    const ranked = await rankCatalogListingCandidates(
      service,
      filteredCandidates,
      sort,
    );
    const allowedOrder = new Map(
      ranked.map((item, index) => [item.publication_id, index]),
    );
    const filteredProducts = products
      .filter((product) => allowedOrder.has(product.id))
      .sort(
        (left, right) =>
          (allowedOrder.get(left.id) ?? 0) - (allowedOrder.get(right.id) ?? 0),
      );

    const rankedMetrics = new Map(
      ranked.map((item) => [
        item.publication_id,
        buildCatalogPublicMetrics(item.popularListenCount, item.totalStars),
      ]),
    );

    const metricsById = rankedMetrics;

    return {
      ok: true,
      items: toMaxCatalogProducts(filteredProducts, metricsById),
    };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

let listCatalogImpl: ListMaxPublishedCatalogFn = listMaxPublishedCatalogImpl;

export async function listMaxPublishedCatalog(
  input: ListMaxPublishedCatalogInput = {},
): Promise<MaxCatalogResult> {
  return listCatalogImpl(input);
}

export function setListMaxPublishedCatalogForTests(
  fn: ListMaxPublishedCatalogFn | null,
): void {
  if (fn === null) {
    listCatalogImpl = listMaxPublishedCatalogImpl;
    return;
  }

  listCatalogImpl = (input) => fn(input);
}
