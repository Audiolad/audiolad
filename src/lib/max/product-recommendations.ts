import { limitPublicRelatedProducts } from "@/lib/seo/related-product-search";

import type { MaxProductRecommendationView } from "@/lib/max/product-view";

export type CuratedRelatedProduct = {
  practiceId: string;
  title: string;
  authorName: string | null;
  formatLabel: string | null;
  durationLabel: string | null;
  coverUrl: string | null;
};

export type CuratedCatalogMatch = {
  id: string;
  authorSlug: string | null;
  slug: string;
  subtitle: string | null;
  authorName: string | null;
  productTypeLabel: string;
  coverUrl: string | null;
  priceLabel: string;
  isFree: boolean;
};

/**
 * Ordinary «Рекомендации автора»: curated practice_related_products only,
 * published/listed catalog matches, current product excluded, max 5, no padding.
 */
export function mapCuratedMaxRecommendations(input: {
  currentPracticeId: string;
  related: readonly CuratedRelatedProduct[];
  catalogById: ReadonlyMap<string, CuratedCatalogMatch>;
}): MaxProductRecommendationView[] {
  const rows = input.related.flatMap((item) => {
    if (!item.practiceId || item.practiceId === input.currentPracticeId) {
      return [];
    }
    const catalogItem = input.catalogById.get(item.practiceId);
    const authorSlug = catalogItem?.authorSlug?.trim() || "";
    if (!catalogItem || !authorSlug || !catalogItem.slug.trim()) {
      return [];
    }
    const formatLabel = item.formatLabel?.trim() || catalogItem.productTypeLabel;
    return [{
      authorSlug,
      slug: catalogItem.slug,
      title: item.title,
      subtitle: catalogItem.subtitle,
      authorName: item.authorName ?? catalogItem.authorName,
      formatLabel,
      coverUrl: item.coverUrl ?? catalogItem.coverUrl,
      priceLabel: catalogItem.priceLabel,
      isFree: catalogItem.isFree,
      durationLabel: item.durationLabel,
    }];
  });

  return limitPublicRelatedProducts(rows);
}
