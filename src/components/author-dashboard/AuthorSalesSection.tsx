"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import {
  AUTHOR_SALES_EMPTY,
  AUTHOR_SALES_PRIVACY_NOTE,
  AUTHOR_SALES_SECTION_SUBTITLE,
  AUTHOR_SALES_SECTION_TITLE,
  getAuthorSaleAccrualStatusLabel,
  getAuthorSalePayoutStatusLabel,
  getAuthorSaleRefundStatusLabel,
  getAuthorSaleStatusDisplay,
} from "@/lib/author-sales/labels";
import {
  AUTHOR_SALE_ACCRUAL_STATUSES,
  AUTHOR_SALE_PAYOUT_STATUSES,
  formatBuyerDisplayName,
  type AuthorSaleDetail,
  type AuthorSaleProductOption,
  type AuthorSaleRow,
} from "@/lib/author-sales/types";
import type { AuthorFinancePeriod } from "@/lib/author-finance/types";

type AuthorSalesSectionProps = {
  authorId: string;
  period: AuthorFinancePeriod;
  customFrom: string;
  customTo: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

export default function AuthorSalesSection({
  authorId,
  period,
  customFrom,
  customTo,
}: AuthorSalesSectionProps) {
  const [rows, setRows] = useState<AuthorSaleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [products, setProducts] = useState<AuthorSaleProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productSlug, setProductSlug] = useState("");
  const [accrualStatus, setAccrualStatus] = useState("");
  const [payoutStatus, setPayoutStatus] = useState("");
  const [openSaleId, setOpenSaleId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuthorSaleDetail | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("author_id", authorId);
    params.set("period", period);
    if (period === "custom") {
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
    }
    if (productSlug) params.set("product_slug", productSlug);
    if (accrualStatus) params.set("accrual_status", accrualStatus);
    if (payoutStatus) params.set("payout_status", payoutStatus);
    params.set("limit", "100");
    return params.toString();
  }, [
    authorId,
    period,
    customFrom,
    customTo,
    productSlug,
    accrualStatus,
    payoutStatus,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/author/finance/sales?${query}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) setError("Не удалось загрузить продажи.");
          return;
        }
        const payload = (await response.json()) as {
          rows: AuthorSaleRow[];
          total: number;
          products: AuthorSaleProductOption[];
        };
        if (cancelled) return;
        setRows(payload.rows ?? []);
        setTotal(payload.total ?? 0);
        setProducts(payload.products ?? []);
      } catch {
        if (!cancelled) setError("Не удалось загрузить продажи.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const toggleSale = useCallback(
    async (saleId: string) => {
      if (openSaleId === saleId) {
        setOpenSaleId(null);
        setDetail(null);
        return;
      }
      setOpenSaleId(saleId);
      setDetail(null);
      try {
        const response = await fetch(
          `/api/author/finance/sales/${encodeURIComponent(saleId)}?author_id=${encodeURIComponent(authorId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          setOpenSaleId(null);
          setError("Не удалось загрузить детали продажи.");
          return;
        }
        const payload = (await response.json()) as { detail: AuthorSaleDetail };
        setDetail(payload.detail);
      } catch {
        setOpenSaleId(null);
        setError("Не удалось загрузить детали продажи.");
      }
    },
    [authorId, openSaleId],
  );

  const exportHref = `/api/author/finance/export?${query}&kind=sales`;

  return (
    <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-white px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#2f2740]">
            {AUTHOR_SALES_SECTION_TITLE}
          </h2>
          <p className="mt-1 text-sm text-[#7d70a2]">
            {AUTHOR_SALES_SECTION_SUBTITLE}
          </p>
        </div>
        <a
          href={exportHref}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#d7c7f0] px-4 text-sm font-semibold text-[#7042c5]"
        >
          Скачать CSV
        </a>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={productSlug}
          onChange={(event) => setProductSlug(event.target.value)}
          className="min-h-10 rounded-full border border-[#eadff8] bg-[#faf6ff] px-3 text-sm text-[#2f2740]"
        >
          <option value="">Все продукты</option>
          {products.map((product) => (
            <option key={product.productSlug} value={product.productSlug}>
              {product.productTitle}
            </option>
          ))}
        </select>
        <select
          value={accrualStatus}
          onChange={(event) => setAccrualStatus(event.target.value)}
          className="min-h-10 rounded-full border border-[#eadff8] bg-[#faf6ff] px-3 text-sm text-[#2f2740]"
        >
          <option value="">Все статусы начисления</option>
          {AUTHOR_SALE_ACCRUAL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getAuthorSaleAccrualStatusLabel(status)}
            </option>
          ))}
        </select>
        <select
          value={payoutStatus}
          onChange={(event) => setPayoutStatus(event.target.value)}
          className="min-h-10 rounded-full border border-[#eadff8] bg-[#faf6ff] px-3 text-sm text-[#2f2740]"
        >
          <option value="">Все статусы выплаты</option>
          {AUTHOR_SALE_PAYOUT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getAuthorSalePayoutStatusLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-3 text-xs text-[#9a8fb8]">{AUTHOR_SALES_PRIVACY_NOTE}</p>

      {loading ? (
        <p className="mt-4 text-sm text-[#7d70a2]">Загрузка продаж…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-[#b42318]">{error}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#7d70a2]">{AUTHOR_SALES_EMPTY}</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-[#7d70a2]">
            Найдено: {total.toLocaleString("ru-RU")}
          </p>
          <ul className="mt-3 divide-y divide-[#f0e8fb]">
            {rows.map((row) => {
              const open = openSaleId === row.saleId;
              const statusDisplay = getAuthorSaleStatusDisplay({
                accrualStatus: row.accrualStatus,
                payoutStatus: row.payoutStatus,
                refundStatus: row.refundStatus,
              });
              return (
                <li key={row.saleId} className="py-3">
                  <button
                    type="button"
                    onClick={() => void toggleSale(row.saleId)}
                    className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#2f2740]">
                        {row.productTitle}
                      </p>
                      <p className="text-xs text-[#7d70a2]">
                        {formatDateTime(row.paidAt)} ·{" "}
                        {formatBuyerDisplayName(
                          row.buyerFirstName,
                          row.buyerLastName,
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex flex-col text-right text-sm font-semibold text-[#2f2740]">
                        <span>{formatRubFromMinor(row.amountMinor)}</span>
                        {row.refundStatus !== "none" ? (
                          <span className="text-xs font-normal text-[#9a8fb8]">
                            Итог: {formatRubFromMinor(row.netAmountMinor)}
                          </span>
                        ) : null}
                      </span>
                      {statusDisplay.refundLabel ? (
                        <span className="inline-flex rounded-full bg-[#f3ecfd] px-2.5 py-1 text-[11px] font-semibold text-[#7042c5]">
                          {statusDisplay.refundLabel}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#f3ecfd] px-2.5 py-1 text-[11px] font-semibold text-[#7042c5]">
                        <span className="font-medium text-[#9a8fb8]">
                          Начисление
                        </span>
                        {statusDisplay.accrualLabel}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#f3ecfd] px-2.5 py-1 text-[11px] font-semibold text-[#7042c5]">
                        <span className="font-medium text-[#9a8fb8]">
                          Выплата
                        </span>
                        {statusDisplay.payoutLabel}
                      </span>
                    </div>
                  </button>

                  {open ? (
                    <div className="mt-3 rounded-[16px] bg-[#faf6ff] px-3 py-3 text-sm text-[#4a3f66]">
                      {detail && detail.saleId === row.saleId ? (
                        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <dt className="text-xs text-[#9a8fb8]">Дата и время</dt>
                            <dd>{formatDateTime(detail.paidAt)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#9a8fb8]">Покупатель</dt>
                            <dd>
                              {formatBuyerDisplayName(
                                detail.buyerFirstName,
                                detail.buyerLastName,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#9a8fb8]">Продукт</dt>
                            <dd>{detail.productTitle}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#9a8fb8]">Стоимость</dt>
                            <dd>{formatRubFromMinor(detail.amountMinor)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#9a8fb8]">Возвращено</dt>
                            <dd>{formatRubFromMinor(detail.refundedAmountMinor)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#9a8fb8]">Итоговая сумма</dt>
                            <dd>{formatRubFromMinor(detail.netAmountMinor)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#9a8fb8]">Доля автора</dt>
                            <dd>
                              {detail.authorAmountMinor === null
                                ? "Расчёт выполняется"
                                : formatRubFromMinor(detail.authorAmountMinor)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#9a8fb8]">
                              Статус начисления
                            </dt>
                            <dd>
                              {getAuthorSaleAccrualStatusLabel(
                                detail.accrualStatus,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#9a8fb8]">
                              Статус выплаты
                            </dt>
                            <dd>
                              {getAuthorSalePayoutStatusLabel(
                                detail.payoutStatus,
                              )}
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-[#9a8fb8]">
                              Идентификатор продажи
                            </dt>
                            <dd className="break-all font-mono text-xs">
                              {detail.saleId}
                            </dd>
                          </div>
                          {detail.refundStatus !== "none" ? (
                            <div className="sm:col-span-2">
                              <dt className="text-xs text-[#9a8fb8]">Возврат</dt>
                              <dd>{getAuthorSaleRefundStatusLabel(detail.refundStatus)}</dd>
                            </div>
                          ) : null}
                        </dl>
                      ) : (
                        <p className="text-sm text-[#7d70a2]">Загрузка…</p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {total > rows.length ? (
            <p className="mt-3 text-xs text-[#9a8fb8]">
              Показаны первые {rows.length} из {total}. Полный список — в CSV.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
