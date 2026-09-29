/**
 * Safe MAX catalog card DTO shared by the catalog grid and Home shelves.
 * Internal ids, storage paths, and auth fields are not part of this shape.
 */
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

export function readMaxCatalogProductList(value: unknown): MaxCatalogProduct[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((item) => {
    const product = readMaxCatalogProduct(item);
    return product ? [product] : [];
  });
}

export function readMaxCatalogProducts(payload: unknown): MaxCatalogProduct[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return readMaxCatalogProductList((payload as { items?: unknown }).items);
}

export function readMaxCatalogProduct(value: unknown): MaxCatalogProduct | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const product = value as Partial<MaxCatalogProduct>;
  if (
    typeof product.slug !== "string" ||
    typeof product.authorSlug !== "string" ||
    product.slug.length === 0 ||
    product.authorSlug.length === 0 ||
    typeof product.title !== "string" ||
    typeof product.formatLabel !== "string" ||
    typeof product.priceLabel !== "string" ||
    typeof product.isFree !== "boolean"
  ) {
    return null;
  }

  return {
    authorSlug: product.authorSlug,
    slug: product.slug,
    title: product.title,
    subtitle: typeof product.subtitle === "string" ? product.subtitle : null,
    coverUrl: typeof product.coverUrl === "string" ? product.coverUrl : null,
    authorName: typeof product.authorName === "string" ? product.authorName : null,
    formatLabel: product.formatLabel,
    priceLabel: product.priceLabel,
    isFree: product.isFree,
  };
}
