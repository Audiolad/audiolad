"use client";

import { useEffect, useMemo, useState } from "react";

import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import {
  AUTHOR_APPRECIATION_EMPTY,
  AUTHOR_APPRECIATION_PRIVACY_NOTE,
  AUTHOR_APPRECIATION_ROW_LABEL,
  AUTHOR_APPRECIATION_SECTION_SUBTITLE,
  AUTHOR_APPRECIATION_SECTION_TITLE,
  getAuthorAppreciationFinanceStatusLabel,
  type AuthorAppreciationFinanceRow,
  type AuthorAppreciationFinanceSummary,
  emptyAuthorAppreciationFinanceSummary,
} from "@/lib/author-finance/appreciation-cabinet";
import { AUTHOR_APPRECIATION_SUMMARY_LABELS } from "@/lib/author-finance/labels";
import type { AuthorFinancePeriod } from "@/lib/author-finance/types";

type AuthorAppreciationSectionProps = {
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

export default function AuthorAppreciationSection({
  authorId,
  period,
  customFrom,
  customTo,
}: AuthorAppreciationSectionProps) {
  const [rows, setRows] = useState<AuthorAppreciationFinanceRow[]>([]);
  const [summary, setSummary] = useState<AuthorAppreciationFinanceSummary>(
    emptyAuthorAppreciationFinanceSummary(),
  );
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("author_id", authorId);
    params.set("period", period);
    if (period === "custom") {
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
    }
    params.set("limit", "100");
    return params.toString();
  }, [authorId, period, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/author/finance/appreciation?${query}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          if (!cancelled) setError("Не удалось загрузить благодарности.");
          return;
        }
        const payload = (await response.json()) as {
          rows: AuthorAppreciationFinanceRow[];
          total: number;
          summary: AuthorAppreciationFinanceSummary;
        };
        if (cancelled) return;
        setRows(payload.rows ?? []);
        setTotal(payload.total ?? 0);
        setSummary(payload.summary ?? emptyAuthorAppreciationFinanceSummary());
      } catch {
        if (!cancelled) setError("Не удалось загрузить благодарности.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const exportHref = `/api/author/finance/export?${query}&kind=appreciation`;

  return (
    <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-white px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#2f2740]">
            {AUTHOR_APPRECIATION_SECTION_TITLE}
          </h2>
          <p className="mt-1 text-sm text-[#7d70a2]">
            {AUTHOR_APPRECIATION_SECTION_SUBTITLE}
          </p>
        </div>
        <a
          href={exportHref}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#d7c7f0] px-4 text-sm font-semibold text-[#7042c5]"
        >
          Скачать CSV
        </a>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[16px] bg-[#faf6ff] px-3 py-3">
          <p className="text-xs text-[#7d70a2]">
            {AUTHOR_APPRECIATION_SUMMARY_LABELS.confirmedCount}
          </p>
          <p className="mt-1 text-lg font-semibold text-[#2f2740]">
            {summary.confirmedCount.toLocaleString("ru-RU")}
          </p>
        </div>
        <div className="rounded-[16px] bg-[#faf6ff] px-3 py-3">
          <p className="text-xs text-[#7d70a2]">
            {AUTHOR_APPRECIATION_SUMMARY_LABELS.gross}
          </p>
          <p className="mt-1 text-lg font-semibold text-[#2f2740]">
            {formatRubFromMinor(summary.grossAmountMinor)}
          </p>
        </div>
        <div className="rounded-[16px] bg-[#faf6ff] px-3 py-3">
          <p className="text-xs text-[#7d70a2]">
            {AUTHOR_APPRECIATION_SUMMARY_LABELS.authorAccrued}
          </p>
          <p className="mt-1 text-lg font-semibold text-[#2f2740]">
            {formatRubFromMinor(summary.authorAccruedMinor)}
          </p>
        </div>
        <div className="rounded-[16px] bg-[#faf6ff] px-3 py-3">
          <p className="text-xs text-[#7d70a2]">
            {AUTHOR_APPRECIATION_SUMMARY_LABELS.held}
          </p>
          <p className="mt-1 text-lg font-semibold text-[#2f2740]">
            {formatRubFromMinor(summary.heldMinor)}
          </p>
        </div>
        <div className="rounded-[16px] bg-[#faf6ff] px-3 py-3">
          <p className="text-xs text-[#7d70a2]">
            {AUTHOR_APPRECIATION_SUMMARY_LABELS.available}
          </p>
          <p className="mt-1 text-lg font-semibold text-[#2f2740]">
            {formatRubFromMinor(summary.availableMinor)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-[#9a8fb8]">{AUTHOR_APPRECIATION_PRIVACY_NOTE}</p>

      {loading ? (
        <p className="mt-4 text-sm text-[#7d70a2]">Загрузка благодарностей…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-[#b42318]">{error}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#7d70a2]">{AUTHOR_APPRECIATION_EMPTY}</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-[#7d70a2]">
            Найдено: {total.toLocaleString("ru-RU")}
          </p>
          <ul className="mt-3 divide-y divide-[#f0e8fb]">
            {rows.map((row) => (
              <li key={row.id} className="py-3">
                <div className="flex w-full flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#2f2740]">
                      {AUTHOR_APPRECIATION_ROW_LABEL}
                    </p>
                    <p className="text-xs text-[#7d70a2]">
                      {formatDateTime(row.paidAt ?? row.createdAt)} · {row.sourceTitle}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex flex-col text-right text-sm font-semibold text-[#2f2740]">
                      <span>{formatRubFromMinor(row.grossAmountMinor)}</span>
                      <span className="text-xs font-normal text-[#9a8fb8]">
                        {AUTHOR_APPRECIATION_SUMMARY_LABELS.authorAccrued}:{" "}
                        {row.authorAccruedMinor === null
                          ? "—"
                          : formatRubFromMinor(row.authorAccruedMinor)}
                      </span>
                    </span>
                    <span className="inline-flex rounded-full bg-[#f3ecfd] px-2.5 py-1 text-[11px] font-semibold text-[#7042c5]">
                      {getAuthorAppreciationFinanceStatusLabel(row.financeStatus)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
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
