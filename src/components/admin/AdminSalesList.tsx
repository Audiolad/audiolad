import Link from "next/link";

import {
  formatAdminSaleAmount,
  getAdminSaleBuyerKindLabel,
  getAdminSaleStatusLabel,
  type AdminSalesPageData,
} from "@/lib/admin/sales";

type AdminSalesListProps = {
  data: AdminSalesPageData;
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildPageHref(page: number): string {
  return page > 1 ? `/admin/sales?page=${page}` : "/admin/sales";
}

function BuyerKindBadge({
  kind,
}: {
  kind: AdminSalesPageData["sales"][number]["buyerKind"];
}) {
  const label = getAdminSaleBuyerKindLabel(kind);

  if (!label) {
    return null;
  }

  const isSelf = kind === "self_purchase";

  return (
    <span
      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        isSelf
          ? "bg-[#fff1d6] text-[#8a5a12]"
          : "bg-[#ede4fb] text-[#7042c5]"
      }`}
    >
      {label}
    </span>
  );
}

export default function AdminSalesList({ data }: AdminSalesListProps) {
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  if (data.sales.length === 0) {
    return (
      <div className="rounded-[22px] border border-[#eadff8] bg-white p-8 text-center">
        <p className="text-base font-medium text-[#25135c]">Продаж пока нет</p>
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          Подтверждённые оплаты появятся здесь после успешного платежа.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="hidden overflow-hidden rounded-[22px] border border-[#eadff8] bg-white md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#eee6f7] bg-[#faf6ff] text-[#796ba0]">
              <tr>
                <th className="px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3 font-medium">Покупатель</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Продукт</th>
                <th className="px-4 py-3 font-medium">Автор</th>
                <th className="px-4 py-3 font-medium">Сумма</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.sales.map((sale) => (
                <tr
                  key={sale.paymentId}
                  className="border-b border-[#f3edf9] last:border-b-0"
                >
                  <td className="px-4 py-4 text-[#796ba0]">
                    {formatDateTime(sale.paidAt)}
                  </td>
                  <td className="px-4 py-4 font-medium text-[#25135c]">
                    <div className="flex flex-col">
                      <span>{sale.buyerName}</span>
                      <BuyerKindBadge kind={sale.buyerKind} />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-[#796ba0]">
                    {sale.buyerEmail ?? "—"}
                  </td>
                  <td className="px-4 py-4 text-[#25135c]">{sale.productTitle}</td>
                  <td className="px-4 py-4 text-[#796ba0]">{sale.authorName}</td>
                  <td className="px-4 py-4 text-[#25135c]">
                    {formatAdminSaleAmount(sale.amountMinor, sale.currency)}
                  </td>
                  <td className="px-4 py-4 text-[#796ba0]">
                    {getAdminSaleStatusLabel({
                      paymentStatus: sale.paymentStatus,
                      orderStatus: sale.orderStatus,
                    })}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/admin/sales/${sale.paymentId}`}
                      className="inline-flex min-h-10 items-center rounded-full border border-[#bda6e1] px-4 text-sm font-medium text-[#7042c5]"
                    >
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {data.sales.map((sale) => (
          <article
            key={sale.paymentId}
            className="rounded-[22px] border border-[#eadff8] bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#25135c]">
                  {sale.productTitle}
                </h3>
                <p className="mt-1 text-sm text-[#796ba0]">{sale.authorName}</p>
              </div>
              <BuyerKindBadge kind={sale.buyerKind} />
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-[#9485b4]">Дата</dt>
                <dd className="text-[#25135c]">{formatDateTime(sale.paidAt)}</dd>
              </div>
              <div>
                <dt className="text-[#9485b4]">Покупатель</dt>
                <dd className="text-[#25135c]">{sale.buyerName}</dd>
              </div>
              <div>
                <dt className="text-[#9485b4]">Email</dt>
                <dd className="text-[#25135c]">{sale.buyerEmail ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[#9485b4]">Сумма</dt>
                <dd className="text-[#25135c]">
                  {formatAdminSaleAmount(sale.amountMinor, sale.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-[#9485b4]">Статус</dt>
                <dd className="text-[#25135c]">
                  {getAdminSaleStatusLabel({
                    paymentStatus: sale.paymentStatus,
                    orderStatus: sale.orderStatus,
                  })}
                </dd>
              </div>
            </dl>

            <Link
              href={`/admin/sales/${sale.paymentId}`}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-medium text-white"
            >
              Открыть продажу
            </Link>
          </article>
        ))}
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          {data.page > 1 ? (
            <Link
              href={buildPageHref(data.page - 1)}
              className="inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
            >
              Назад
            </Link>
          ) : (
            <span />
          )}

          <p className="text-sm text-[#796ba0]">
            Страница {data.page} из {totalPages}
          </p>

          {data.page < totalPages ? (
            <Link
              href={buildPageHref(data.page + 1)}
              className="inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
            >
              Далее
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
