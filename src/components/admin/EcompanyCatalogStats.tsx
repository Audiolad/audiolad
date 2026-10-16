import { loadCatalogStats } from "@/lib/admin/ecompany-catalog-stats-queries";
import {
  CATALOG_METRICS,
  CATALOG_STATS_TIME_ZONE,
  formatMsk,
  formatSigned,
  type CatalogStatsModel,
} from "@/lib/admin/ecompany-catalog-stats";

/** c353a4b5: статистика каталога АудиоЛада на табло ИИ-компании. Server-rendered, no client JS. */
export function EcompanyCatalogStats({ model, error }: { model: CatalogStatsModel | null; error: string | null }) {
  return (
    <section
      aria-labelledby="ai-company-catalog-stats"
      data-section="catalog-stats"
      className="rounded-2xl border border-[#eadff8] bg-white p-3 sm:p-4"
    >
      <h3 id="ai-company-catalog-stats" className="text-xl font-semibold">
        Статистика АудиоЛада
      </h3>
      {!model ? (
        <p className="mt-2 text-sm text-[#9f1239]" role="status" data-catalog-stats-unavailable>
          {error ?? "Статистика каталога сейчас недоступна."} Нули не подставлены.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-[#796ba0]" data-catalog-stats-generated>
            Данные на {model.generatedLabel} (часовой пояс {CATALOG_STATS_TIME_ZONE}).
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-catalog-metrics>
            {CATALOG_METRICS.map((metric) => (
              <li key={metric.key} className="rounded-xl border border-[#eadff8] bg-[#fbf8ff] p-3" data-metric={metric.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{metric.label}</span>
                  <span className="text-2xl font-semibold tabular-nums" data-metric-total>
                    {model.totals[metric.key].toLocaleString("ru-RU")}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                  {model.periods.map((period) => (
                    <div key={period.key} className="rounded-lg bg-white px-1 py-1.5" data-period={period.key}>
                      <dt className="text-[#796ba0]">{period.title}</dt>
                      <dd className="text-sm font-semibold tabular-nums">{formatSigned(period.growth[metric.key])}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-[#796ba0]">{metric.hint}</p>
              </li>
            ))}
          </ul>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">Границы периодов и как считается прирост</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[#3f3f46]">
              {model.periods.map((period) => (
                <li key={period.key}>
                  <b>{period.title}:</b> {period.boundsLabel}
                </li>
              ))}
              <li>
                <b>Всё время:</b> текущий итог на {model.generatedLabel}.
              </li>
              <li>
                Прирост — сколько объектов из текущего состава впервые выполнили условие в периоде (начало
                включено, конец нет): автор — по дате появления в пространстве; продукт — по первой дате публикации;
                пространство и автор с публикацией — по первой публикации любого их продукта (снятие более раннего
                продукта не делает их «новыми»); трек — по более поздней из дат загрузки трека и последней публикации
                продукта. Это реконструкция по датам: снятые с публикации объекты в ней не участвуют, их снятие видно
                только в истории снимков как уменьшение.
              </li>
            </ul>
          </details>
          <details className="mt-2 text-sm" data-catalog-history>
            <summary className="cursor-pointer font-semibold">История снимков</summary>
            {model.historyStartedLabel ? (
              <p className="mt-2 text-[#796ba0]" data-history-started>
                Накопление снимков начато {model.historyStartedLabel}. Более ранних снимков нет — значения не досчитаны задним числом.
              </p>
            ) : model.historyStartUnknown ? (
              <p className="mt-2 text-[#9f1239]" data-history-started-unknown>
                Дату начала накопления сейчас не удалось прочитать; ниже — последние снимки.
              </p>
            ) : (
              <p className="mt-2 text-[#796ba0]">Снимков пока нет: накопление начнётся с первого открытия табло.</p>
            )}
            {model.history.length > 0 ? (
              <div className="mt-2 max-w-full overflow-x-auto">
                <table className="min-w-full text-xs tabular-nums">
                  <thead>
                    <tr className="text-left text-[#796ba0]">
                      <th className="py-1 pr-2">День (МСК)</th>
                      {CATALOG_METRICS.map((m) => (
                        <th key={m.key} className="py-1 pr-2">{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {model.history.map((row) => (
                      <tr key={row.snapshotDate} className="border-t border-[#eadff8]" data-snapshot={row.snapshotDate}>
                        <td className="py-1 pr-2 whitespace-nowrap">
                          {formatMsk(new Date(`${row.snapshotDate}T12:00:00+03:00`), false)}
                          <span className="block text-[10px] text-[#796ba0]">снимок {formatMsk(new Date(row.capturedAt))}</span>
                        </td>
                        {CATALOG_METRICS.map((m) => (
                          <td key={m.key} className="py-1 pr-2">
                            {row[m.key].toLocaleString("ru-RU")}
                            {row.change ? <span className="block text-[10px] text-[#796ba0]">{formatSigned(row.change[m.key])}</span> : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </details>
        </>
      )}
    </section>
  );
}

/** Async server section: rendered inside <Suspense> so a slow DB never blocks the board. */
export async function EcompanyCatalogStatsSection() {
  const { model, error } = await loadCatalogStats();
  return <EcompanyCatalogStats model={model} error={error} />;
}

export function EcompanyCatalogStatsFallback() {
  return (
    <section aria-labelledby="ai-company-catalog-stats" data-section="catalog-stats" className="rounded-2xl border border-[#eadff8] bg-white p-3 sm:p-4">
      <h3 id="ai-company-catalog-stats" className="text-xl font-semibold">Статистика АудиоЛада</h3>
      <p className="mt-2 text-sm text-[#796ba0]" role="status">Загружаем статистику…</p>
    </section>
  );
}
