export type CatalogPublicMetrics = {
  qualified_listen_count: number;
  total_stars: number;
};

export const EMPTY_CATALOG_PUBLIC_METRICS: CatalogPublicMetrics = {
  qualified_listen_count: 0,
  total_stars: 0,
};

const catalogMetricCountFormatter = new Intl.NumberFormat("ru-RU");

export function formatCatalogPublicMetricCount(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return catalogMetricCountFormatter.format(safe).replace(/\u00a0/g, " ");
}

export function buildCatalogPublicMetrics(
  qualifiedListenCount: number,
  totalStars: number,
): CatalogPublicMetrics {
  return {
    qualified_listen_count: Math.max(0, Math.floor(qualifiedListenCount || 0)),
    total_stars: Math.max(0, Math.floor(totalStars || 0)),
  };
}