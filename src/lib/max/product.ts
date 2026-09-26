import "server-only";

import { GUEST_ORDINARY_CATALOG_VIEWER } from "@/lib/catalog/visibility-query";
import {
  getPublishedCatalogProducts,
  type CatalogProduct,
} from "@/lib/products/catalog";
import { loadPublicAudioItems } from "@/lib/products/public-audio-items";
import { loadPublicPracticeTopicsSafe } from "@/lib/products/practice-topics";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const MAX_AUTHOR_RECOMMENDATIONS_LIMIT = 5;

export type MaxProductRecommendation = {
  authorSlug: string;
  slug: string;
  title: string;
  subtitle: string | null;
  authorName: string | null;
  formatLabel: string;
  coverUrl: string | null;
  priceLabel: string;
  isFree: boolean;
};

export type MaxProductDetail = {
  authorSlug: string;
  productSlug: string;
  title: string;
  subtitle: string | null;
  authorName: string | null;
  formatLabel: string;
  coverUrl: string | null;
  priceLabel: string;
  isFree: boolean;
  statsLabel: string | null;
  topics: Array<{ key: string; title: string }>;
  contents: Array<{ title: string; position: number; durationSeconds: number | null }>;
  recommendations: MaxProductRecommendation[];
};
export type GetMaxPublishedProductFn = (
  authorSlug: string,
  productSlug: string,
) => ReturnType<typeof getMaxPublishedProduct>;


function toMaxProductRecommendation(
  product: CatalogProduct,
): MaxProductRecommendation | null {
  const recommendationAuthorSlug = product.authorSlug?.trim() || "";
  if (!recommendationAuthorSlug) {
    return null;
  }

  return {
    authorSlug: recommendationAuthorSlug,
    slug: product.slug,
    title: product.title,
    subtitle: product.subtitle,
    authorName: product.authorName,
    formatLabel: product.productTypeLabel,
    coverUrl: product.coverUrl,
    priceLabel: product.priceLabel,
    isFree: product.isFree,
  };
}

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
    const [tracks, topics] = await Promise.all([
      loadPublicAudioItems(service, {
        practiceId: product.id,
        practiceStatus: "published",
        authorPreview: false,
        publicationClass: product.publicationClass,
        productKind: product.productKind,
      }),
      loadPublicPracticeTopicsSafe(service, product.id),
    ]);
    const recommendations = products
      .filter(
        (item) =>
          item.id !== product.id &&
          item.authorSlug === normalizedAuthor,
      )
      .flatMap((item) => {
        const mapped = toMaxProductRecommendation(item);
        return mapped ? [mapped] : [];
      })
      .slice(0, MAX_AUTHOR_RECOMMENDATIONS_LIMIT);
    return {
      ok: true,
      product: {
        authorSlug: normalizedAuthor,
        productSlug: product.slug,
        title: product.title,
        subtitle: product.subtitle,
        authorName: product.authorName,
        formatLabel: product.productTypeLabel,
        coverUrl: product.coverUrl,
        priceLabel: product.priceLabel,
        isFree: product.isFree,
        statsLabel: product.statsLabel,
        topics,
        contents: tracks.map((track) => ({
          title: track.title,
          position: track.position,
          durationSeconds: track.durationSeconds,
        })),
        recommendations,
      },
    };
  } catch {
    return { ok: false };
  }
}

export function setGetMaxPublishedProductForTests(fn: GetMaxPublishedProductFn | null) {
  productImpl = fn;
}
