import "server-only";

import type { PublicCatalogSection } from "@/lib/catalog/catalog-sections";
import {
  normalizeCatalogSearchQuery,
  searchPublishedCatalogProducts,
} from "@/lib/catalog/search";
import { GUEST_ORDINARY_CATALOG_VIEWER } from "@/lib/catalog/visibility-query";
import {
  getPublishedCatalogProducts,
  type CatalogProduct,
} from "@/lib/products/catalog";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const MAX_CATALOG_LIMIT = 24;

export type MaxCatalogProduct = {
  authorSlug: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  authorName: string | null;
  formatLabel: string;
  priceLabel: string;
  isFree: boolean;
};

export type MaxCatalogResult =
  | { ok: true; items: MaxCatalogProduct[] }
  | { ok: false; reason: "storage_unavailable" };

export type ListMaxPublishedCatalogInput = {
  query?: string | null;
  section?: PublicCatalogSection | null;
  getCatalogProducts?: typeof getPublishedCatalogProducts;
  searchCatalogProducts?: typeof searchPublishedCatalogProducts;
  getServiceClient?: typeof createServiceRoleClient;
};

export type ListMaxPublishedCatalogFn = (
  input?: ListMaxPublishedCatalogInput,
) => Promise<MaxCatalogResult>;

function toMaxCatalogProduct(product: {
  authorSlug: string | null;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  authorName: string | null;
  productTypeLabel: string;
  priceLabel: string;
  isFree: boolean;
}): MaxCatalogProduct {
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
  };
}

function toMaxCatalogProducts(products: CatalogProduct[]): MaxCatalogProduct[] {
  return products
    .filter((product) => Boolean(product.authorSlug))
    .slice(0, MAX_CATALOG_LIMIT)
    .map(toMaxCatalogProduct);
}

async function listMaxPublishedCatalogImpl(
  input: ListMaxPublishedCatalogInput = {},
): Promise<MaxCatalogResult> {
  try {
    const service = (input.getServiceClient ?? createServiceRoleClient)();
    const normalizedQuery = normalizeCatalogSearchQuery(input.query);
    const catalogSection = input.section ?? null;
    const products = normalizedQuery
      ? await (input.searchCatalogProducts ?? searchPublishedCatalogProducts)(
          service,
          {
            query: normalizedQuery,
            viewer: GUEST_ORDINARY_CATALOG_VIEWER,
            ...(catalogSection ? { catalogSection } : {}),
          },
        )
      : await (input.getCatalogProducts ?? getPublishedCatalogProducts)(
          service,
          {
            viewer: GUEST_ORDINARY_CATALOG_VIEWER,
            throwOnStorageError: true,
            ...(catalogSection ? { catalogSection } : {}),
          },
        );

    return {
      ok: true,
      items: toMaxCatalogProducts(products),
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
