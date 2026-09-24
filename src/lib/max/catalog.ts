import "server-only";

import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { GUEST_ORDINARY_CATALOG_VIEWER } from "@/lib/catalog/visibility-query";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const MAX_CATALOG_LIMIT = 24;

export type MaxCatalogProduct = {
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

export type ListMaxPublishedCatalogFn = () => Promise<MaxCatalogResult>;

function toMaxCatalogProduct(product: {
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

async function listMaxPublishedCatalogImpl(
  deps: {
    getCatalogProducts?: typeof getPublishedCatalogProducts;
    getServiceClient?: typeof createServiceRoleClient;
  } = {},
): Promise<MaxCatalogResult> {
  try {
    const getCatalogProducts =
      deps.getCatalogProducts ?? getPublishedCatalogProducts;
    const service = (deps.getServiceClient ?? createServiceRoleClient)();
    const products = await getCatalogProducts(service, {
      viewer: GUEST_ORDINARY_CATALOG_VIEWER,
      throwOnStorageError: true,
    });

    return {
      ok: true,
      items: products.slice(0, MAX_CATALOG_LIMIT).map(toMaxCatalogProduct),
    };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

let listCatalogImpl: (
  deps?: {
    getCatalogProducts?: typeof getPublishedCatalogProducts;
    getServiceClient?: typeof createServiceRoleClient;
  },
) => Promise<MaxCatalogResult> = listMaxPublishedCatalogImpl;

export async function listMaxPublishedCatalog(
  deps: {
    getCatalogProducts?: typeof getPublishedCatalogProducts;
    getServiceClient?: typeof createServiceRoleClient;
  } = {},
): Promise<MaxCatalogResult> {
  return listCatalogImpl(deps);
}

export function setListMaxPublishedCatalogForTests(
  fn: ListMaxPublishedCatalogFn | null,
): void {
  if (fn === null) {
    listCatalogImpl = listMaxPublishedCatalogImpl;
    return;
  }

  listCatalogImpl = () => fn();
}
