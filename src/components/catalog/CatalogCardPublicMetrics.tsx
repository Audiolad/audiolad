import {
  formatCatalogPublicMetricCount,
  type CatalogPublicMetrics,
} from "@/lib/catalog/public-metrics";

type CatalogCardPublicMetricsProps = {
  metrics: CatalogPublicMetrics;
  className?: string;
};

export default function CatalogCardPublicMetrics({
  metrics,
  className = "",
}: CatalogCardPublicMetricsProps) {
  return (
    <span
      data-catalog-card-public-metrics=""
      className={`shrink-0 whitespace-nowrap text-xs tabular-nums leading-4 text-[#9485b4] ${className}`.trim()}
      aria-label={`Прослушиваний: ${metrics.qualified_listen_count}, звёзд: ${metrics.total_stars}`}
    >
      <span aria-hidden="true">
        ▶ {formatCatalogPublicMetricCount(metrics.qualified_listen_count)}
        {"  "}
        ★ {formatCatalogPublicMetricCount(metrics.total_stars)}
      </span>
    </span>
  );
}