import {
  ADMIN_APPRECIATION_OPERATION_LABEL,
  appreciationStatusLabel,
  appreciationSurfaceLabel,
  type AppreciationAnalyticsProjection,
} from "@/lib/admin/appreciation-analytics";
import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminAppreciationBlock({
  data,
}: {
  data: AppreciationAnalyticsProjection;
}) {
  const { summary, rows } = data;

  return (
    <section
      aria-labelledby="admin-appreciation-heading"
      className="rounded-[22px] border border-[#eadff8] bg-white p-5"
    >
      <h3 id="admin-appreciation-heading" className="text-[18px] font-semibold">
        {ADMIN_APPRECIATION_OPERATION_LABEL}
      </h3>
      <p className="mt-1 text-sm text-[#796ba0]">
        Отдельный учёт. Это не продажа продукта и не создаёт заказ.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[#796ba0]">Всего</dt>
          <dd className="font-semibold">{summary.count}</dd>
        </div>
        <div>
          <dt className="text-[#796ba0]">Оплачено / ожидает / проверка</dt>
          <dd className="font-semibold">
            {summary.paidCount} / {summary.pendingCount} / {summary.needsReviewCount}
          </dd>
        </div>
        <div>
          <dt className="text-[#796ba0]">Сумма оплаченных</dt>
          <dd className="font-semibold">{formatRubFromMinor(summary.grossMinor)}</dd>
        </div>
        <div>
          <dt className="text-[#796ba0]">Авторам / платформе</dt>
          <dd className="font-semibold">
            {formatRubFromMinor(summary.authorAccruedMinor)} /{" "}
            {formatRubFromMinor(summary.platformShareMinor)}
          </dd>
        </div>
      </dl>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#796ba0]">Пока нет благодарностей.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#eee6f7] text-[#796ba0]">
              <tr>
                <th className="py-2 pr-3 font-medium">Дата</th>
                <th className="py-2 pr-3 font-medium">Автор</th>
                <th className="py-2 pr-3 font-medium">Источник</th>
                <th className="py-2 pr-3 font-medium">Сумма</th>
                <th className="py-2 pr-3 font-medium">Автору</th>
                <th className="py-2 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.intentId} className="border-b border-[#f6f1fc] last:border-0">
                  <td className="py-2 pr-3">{formatDateTime(row.paidAt ?? row.createdAt)}</td>
                  <td className="py-2 pr-3">{row.authorName}</td>
                  <td className="py-2 pr-3">
                    {appreciationSurfaceLabel(row.surface)}
                    {row.productTitle ? ` · ${row.productTitle}` : ""}
                  </td>
                  <td className="py-2 pr-3">{formatRubFromMinor(row.amountMinor)}</td>
                  <td className="py-2 pr-3">
                    {row.authorAccruedMinor === null
                      ? "—"
                      : formatRubFromMinor(row.authorAccruedMinor)}
                  </td>
                  <td className="py-2">{appreciationStatusLabel(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
