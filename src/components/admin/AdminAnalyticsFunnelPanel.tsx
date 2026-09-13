import type { AdminAnalyticsProductOverview } from "@/lib/admin/analytics-queries";

export default function AdminAnalyticsFunnelPanel({
  overview,
  hasProductFilter,
}: {
  overview: AdminAnalyticsProductOverview;
  hasProductFilter: boolean;
}) {
  return (
    <section aria-labelledby="admin-funnel-heading" className="space-y-4">
      <div>
        <h2 id="admin-funnel-heading" className="text-[19px] font-semibold">
          Продуктовая воронка
        </h2>
        <p className="mt-1 text-sm text-[#796ba0]">
          Уникальные люди с подтверждённым visitor_key.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {[
          { label: "Реальные посетители", value: overview.realVisitors },
          { label: "Слушатели", value: overview.listeners },
          { label: "Дослушавшие", value: overview.completers },
          { label: "Вернувшиеся", value: overview.returningListeners },
          { label: "WAL", value: overview.wal, previous: overview.previousWal },
          { label: "MAL", value: overview.mal, previous: overview.previousMal },
        ].map((metric) => (
          <article key={metric.label} className="rounded-[18px] border border-[#d9c9f4] bg-white p-4 shadow-sm">
            <p className="text-xs text-[#796ba0]">{metric.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[#25135c]">{metric.value.toLocaleString("ru-RU")}</p>
            {metric.previous !== undefined ? <p className="mt-1 text-xs text-[#9485b4]">пред. окно: {metric.previous.toLocaleString("ru-RU")}</p> : <p className="mt-1 text-xs text-[#7042c5]">люди</p>}
          </article>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {[
          { label: "Реальные посетители", value: overview.realVisitors },
          { label: "Посетители практик", value: overview.practiceVisitors },
          { label: "Начали слушать", value: overview.listeners },
          { label: "Дослушали", value: overview.completers },
        ].map((metric) => (
          <article
            key={metric.label}
            className="rounded-[22px] border border-[#d9c9f4] bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-[#796ba0]">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold text-[#25135c]">
              {metric.value.toLocaleString("ru-RU")}
            </p>
            <p className="mt-2 text-xs font-medium text-[#7042c5]">люди</p>
          </article>
        ))}
      </div>
      {hasProductFilter ? (
        <p className="text-xs text-[#796ba0]">
          «Реальные посетители» относятся ко всей платформе в выбранных периоде, источнике и устройстве; фильтр автора или практики применяется только к продуктовым действиям.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <p className="rounded-xl bg-[#f6f0ff] px-4 py-3 text-sm text-[#5d4f7d]">
          В прослушивание: <strong>{overview.conversionToListening}</strong>
        </p>
        <p className="rounded-xl bg-[#f6f0ff] px-4 py-3 text-sm text-[#5d4f7d]">
          Дослушали: <strong>{overview.completionByListeners}</strong>
        </p>
      </div>

      <section aria-labelledby="admin-retention-heading" className="space-y-3">
        <div>
          <h3 id="admin-retention-heading" className="text-[19px] font-semibold">Удержание</h3>
          <p className="mt-1 text-sm text-[#796ba0]">Новые, вернувшиеся и повторные уникальные слушатели.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: "Новые слушатели", value: overview.newListeners },
            { label: "Вернувшиеся слушатели", value: overview.returningListeners },
            { label: "Повторные слушатели", value: overview.repeatListeners },
          ].map((metric) => (
            <article key={metric.label} className="rounded-[18px] border border-[#eadff8] bg-white p-4 shadow-sm">
              <p className="text-sm text-[#796ba0]">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-[#7042c5]">{metric.value.toLocaleString("ru-RU")}</p>
              <p className="mt-2 text-xs text-[#9485b4]">люди</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="admin-activity-heading" className="space-y-3">
        <div>
          <h3 id="admin-activity-heading" className="text-[19px] font-semibold">
            Активность
          </h3>
          <p className="mt-1 text-sm text-[#796ba0]">
            События и интенсивность использования, а не уникальные люди.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Просмотры практик", value: overview.practiceViews, suffix: "события" },
            { label: "Запуски", value: overview.playStarts, suffix: "события" },
            { label: "Дослушивания", value: overview.completions, suffix: "события" },
            {
              label: "Запусков на слушателя",
              value: overview.startsPerListener,
              suffix: "события / человек",
            },
          ].map((metric) => (
            <article
              key={metric.label}
              className="rounded-[18px] border border-[#eadff8] bg-white p-4 shadow-sm"
            >
              <p className="text-sm text-[#796ba0]">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-[#7042c5]">
                {typeof metric.value === "number"
                  ? metric.value.toLocaleString("ru-RU")
                  : metric.value}
              </p>
              <p className="mt-2 text-xs text-[#9485b4]">{metric.suffix}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
