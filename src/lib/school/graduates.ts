import type { CatalogProduct } from "@/lib/products/catalog";

export type SchoolGraduate = {
  author_id: string;
  cohort: string;
  enabled: boolean;
  position: number;
  product_1_id: string | null;
  product_2_id: string | null;
};

export function graduateProductIds(graduate: SchoolGraduate): string[] {
  return [graduate.product_1_id, graduate.product_2_id].filter((id): id is string => Boolean(id));
}

export function validateGraduateProductIds(ids: string[]): boolean {
  return ids.length <= 2 && new Set(ids).size === ids.length;
}

/** The input catalog must be the canonical published, listed guest catalog. */
export function selectGraduateProducts(
  graduates: SchoolGraduate[],
  publishedProducts: CatalogProduct[],
): CatalogProduct[] {
  const byId = new Map(publishedProducts.map((product) => [product.id, product]));
  const seen = new Set<string>();
  return [...graduates]
    .filter((graduate) => graduate.enabled)
    .sort((a, b) => a.position - b.position || a.author_id.localeCompare(b.author_id))
    .flatMap((graduate) => graduateProductIds(graduate).flatMap((id) => {
      const product = byId.get(id);
      if (!product || product.authorId !== graduate.author_id || seen.has(id)) return [];
      seen.add(id);
      return [product];
    }));
}

export function graduateText(text: string, limit?: number): string {
  const normalized = text.replaceAll(String.fromCharCode(0x2014), "\u2013");
  return limit && normalized.length > limit ? `${normalized.slice(0, limit - 1).trimEnd()}…` : normalized;
}
