import type { AdminAnalyticsMetricCard } from "@/lib/admin/analytics-queries";

function formatMetricValue(card: AdminAnalyticsMetricCard): string {
  if (card.formatted) {
    return card.formatted;
  }

  return card.value.toLocaleString("ru-RU");
}

function DeltaBadge({ card }: { card: AdminAnalyticsMetricCard }) {
  const delta = card.delta;

  if (!delta) {
    return null;
  }

  const tone =
    delta.direction === "up"
      ? "text-[#2f7d4a]"
      : delta.direction === "down"
        ? "text-[#b34f63]"
        : "text-[#796ba0]";

  return (
    <p
      className={`mt-2 text-xs font-medium ${tone}`}
      title={`Предыдущий период: ${delta.previous.toLocaleString("ru-RU")}`}
    >
      <span aria-hidden>{delta.compactLabel}</span>
      <span className="sr-only">
        {delta.direction === "up"
          ? "рост"
          : delta.direction === "down"
            ? "падение"
            : "без существенного изменения"}
        , предыдущее значение {delta.previous.toLocaleString("ru-RU")}
      </span>
    </p>
  );
}

export default function AdminAnalyticsMetricCards({
  metrics,
}: {
  metrics: AdminAnalyticsMetricCard[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article
          key={metric.key}
          className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm"
          title={metric.hint}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-[#796ba0]">{metric.label}</p>
            {metric.kindLabel ? (
              <span className="shrink-0 rounded-full bg-[#f6f0ff] px-2 py-0.5 text-[11px] font-medium text-[#7042c5]">
                {metric.kindLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-3xl font-semibold text-[#7042c5]">
            {formatMetricValue(metric)}
          </p>
          <DeltaBadge card={metric} />
          <p className="mt-2 text-xs leading-5 text-[#9485b4]">{metric.hint}</p>
        </article>
      ))}
    </div>
  );
}
