import type { CatalogProduct } from "@/lib/products/catalog";

import type {
  ArticlePracticeSlot,
  ArticleRelatedPracticeSlot,
  PracticeArticleDefinition,
} from "./types";

/**
 * Resolve a catalog practice by stable editorial key.
 * Today the key is the public practice slug; a future DB/CMS source can keep the same key
 * or map an internal UUID onto it without changing article UI components.
 */
export function resolveCatalogPracticeByKey(
  catalogByKey: ReadonlyMap<string, CatalogProduct>,
  slot: ArticlePracticeSlot,
): CatalogProduct | null {
  const key = slot.practiceKey.trim().toLowerCase();

  if (!key) {
    return null;
  }

  return catalogByKey.get(key) ?? null;
}

export function buildCatalogPracticeKeyIndex(
  products: readonly CatalogProduct[],
): Map<string, CatalogProduct> {
  return new Map(
    products.map((product) => [product.slug.trim().toLowerCase(), product]),
  );
}

export function resolveArticlePrimaryPractice(
  article: PracticeArticleDefinition,
  catalogByKey: ReadonlyMap<string, CatalogProduct>,
): CatalogProduct | null {
  return resolveCatalogPracticeByKey(catalogByKey, article.primaryPractice);
}

export function resolveArticleRelatedPractices(
  article: PracticeArticleDefinition,
  catalogByKey: ReadonlyMap<string, CatalogProduct>,
  primaryPracticeId: string,
): Array<{ product: CatalogProduct; blurb: string; slot: ArticleRelatedPracticeSlot }> {
  const resolved: Array<{
    product: CatalogProduct;
    blurb: string;
    slot: ArticleRelatedPracticeSlot;
  }> = [];

  for (const slot of article.relatedPractices) {
    const product = resolveCatalogPracticeByKey(catalogByKey, slot);

    if (!product || product.id === primaryPracticeId) {
      continue;
    }

    resolved.push({ product, blurb: slot.blurb, slot });

    if (resolved.length >= 3) {
      break;
    }
  }

  return resolved;
}
