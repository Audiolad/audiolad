import type { AdminAnalyticsMetricCard } from "@/lib/admin/analytics-queries";

function formatMetricValue(card: AdminAnalyticsMetricCard): string {
  if (card.formatted) {
    return card.formatted;
  }

  return card.value.toLocaleString("ru-RU");
}

export default function AdminAnalyticsMetrics({
  metrics,
}: {
  metrics: AdminAnalyticsMetricCard[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => (
        <article
          key={metric.key}
          className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm"
          title={metric.hint}
        >
          <p className="text-sm text-[#796ba0]">{metric.label}</p>
          <p className="mt-2 text-3xl font-semibold text-[#7042c5]">
            {formatMetricValue(metric)}
          </p>
          <p className="mt-2 text-xs leading-5 text-[#9485b4]">{metric.hint}</p>
        </article>
      ))}
    </div>
  );
}
