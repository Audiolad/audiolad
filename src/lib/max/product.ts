import "server-only";

import { GUEST_ORDINARY_CATALOG_VIEWER } from "@/lib/catalog/visibility-query";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { loadPublicAudioItems } from "@/lib/products/public-audio-items";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type MaxProductDetail = {
  authorSlug: string;
  productSlug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  authorName: string | null;
  formatLabel: string;
  coverUrl: string | null;
  priceLabel: string;
  isFree: boolean;
  statsLabel: string | null;
  contents: Array<{ title: string; position: number; durationSeconds: number | null }>;
};
export type GetMaxPublishedProductFn = (
  authorSlug: string,
  productSlug: string,
) => ReturnType<typeof getMaxPublishedProduct>;

let productImpl: GetMaxPublishedProductFn | null = null;

export async function getMaxPublishedProduct(
  authorSlug: string,
  productSlug: string,
): Promise<{ ok: true; product: MaxProductDetail | null } | { ok: false }> {
  if (productImpl) return productImpl(authorSlug, productSlug);
  try {
    const normalizedAuthor = authorSlug.trim();
    const normalizedProduct = productSlug.trim();
    if (!normalizedAuthor || !normalizedProduct) return { ok: true, product: null };
    const service = createServiceRoleClient();
    const products = await getPublishedCatalogProducts(service, {
      viewer: GUEST_ORDINARY_CATALOG_VIEWER,
      throwOnStorageError: true,
    });
    const product = products.find(
      (item) =>
        item.authorSlug === normalizedAuthor && item.slug === normalizedProduct,
    );
    if (!product) return { ok: true, product: null };
    const tracks = await loadPublicAudioItems(service, {
      practiceId: product.id,
      practiceStatus: "published",
      authorPreview: false,
      publicationClass: product.publicationClass,
      productKind: product.productKind,
    });
    return {
      ok: true,
      product: {
        authorSlug: normalizedAuthor,
        productSlug: product.slug,
        title: product.title,
        subtitle: product.subtitle,
        description: product.description,
        authorName: product.authorName,
        formatLabel: product.productTypeLabel,
        coverUrl: product.coverUrl,
        priceLabel: product.priceLabel,
        isFree: product.isFree,
        statsLabel: product.statsLabel,
        contents: tracks.map((track) => ({
          title: track.title,
          position: track.position,
          durationSeconds: track.durationSeconds,
        })),
      },
    };
  } catch {
    return { ok: false };
  }
}

export function setGetMaxPublishedProductForTests(fn: GetMaxPublishedProductFn | null) {
  productImpl = fn;
}
