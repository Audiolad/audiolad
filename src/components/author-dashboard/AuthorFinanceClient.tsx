"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import AuthorAppreciationSection from "@/components/author-dashboard/AuthorAppreciationSection";
import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorSalesSection from "@/components/author-dashboard/AuthorSalesSection";
import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import {
  AUTHOR_FINANCE_BALANCE_AS_OF_TEXT,
  AUTHOR_FINANCE_HOLD_DAYS_LABEL,
  AUTHOR_FINANCE_KPI_HINTS,
  AUTHOR_FINANCE_KPI_LABELS,
  AUTHOR_FINANCE_NEXT_AVAILABLE_PREFIX,
  formatAuthorFinanceHoldDays,
  AUTHOR_FINANCE_METHODOLOGY,
  AUTHOR_FINANCE_MINIMUM_PAYOUT_TEXT,
  AUTHOR_FINANCE_NEGATIVE_WARNING,
  AUTHOR_FINANCE_PRIVACY_NOTE,
  getAuthorFinanceAmountStateLabel,
  getAuthorFinanceEmptyStateCopy,
  getAuthorFinanceIntegrityMessage,
  getAuthorFinancePayoutStatusLabel,
  getAuthorFinancePayoutStatusMessage,
  getAuthorFinancePeriodLabel,
  getAuthorFinanceTypeLabel,
} from "@/lib/author-finance/labels";
import {
  AUTHOR_FINANCE_PAYOUT_PROFILE_MISSING_COPY,
  buildPayoutDetailsHref,
  shouldShowFinancePayoutProfileBanner,
} from "@/lib/author-finance/payout-profile-banner";
import {
  AUTHOR_FINANCE_PERIODS,
  AUTHOR_FINANCE_TYPE_KEYS,
  isAuthorFinancePeriod,
  resolveAuthorFinanceAuthorTermsUi,
  type AuthorFinanceIntegrityStatus,
  type AuthorFinanceLedgerDetail,
  type AuthorFinanceLedgerRow,
  type AuthorFinancePayoutDetail,
  type AuthorFinancePayoutRow,
  type AuthorFinancePeriod,
  type AuthorFinanceSummary,
  type AuthorFinanceTermsRow,
} from "@/lib/author-finance/types";
import {
  DEFAULT_COMMERCIAL_SHARE,
  formatShareBpsAsPercent,
} from "@/lib/author-commercial/economics";
import type { AuthorPayoutProfileStatus } from "@/lib/author-payout-profiles/types";
import type { AuthorWorkspace } from "@/lib/author-products/types";

type AuthorFinanceClientProps = {
  authors: AuthorWorkspace[];
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatShare(bps: number | null): string {
  if (bps === null || !Number.isFinite(bps)) return "—";
  return `${(bps / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

function Card({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={`rounded-[20px] border px-4 py-3 ${
        tone === "accent"
          ? "border-[#c6afe6] bg-[#faf6ff]"
          : "border-[#eadff8] bg-white"
      }`}
    >
      <p className="text-xs text-[#7d70a2]">{label}</p>
      <p className="mt-1 text-[20px] font-semibold leading-tight">{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-[#9a8fbf]">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-white px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StateBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-[#f3ecfd] px-2.5 py-1 text-[11px] font-semibold text-[#7042c5]">
      {label}
    </span>
  );
}

export default function AuthorFinanceClient({
  authors,
}: AuthorFinanceClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedAuthor = useMemo(() => {
    const slug = searchParams.get("author");
    return authors.find((author) => author.slug === slug) ?? authors[0] ?? null;
  }, [authors, searchParams]);

  const periodParam = searchParams.get("period");
  const period: AuthorFinancePeriod = isAuthorFinancePeriod(periodParam)
    ? periodParam
    : "all";
  const customFrom = searchParams.get("from") ?? "";
  const customTo = searchParams.get("to") ?? "";
  const typeFilter = searchParams.get("type") ?? "";

  const [summary, setSummary] = useState<AuthorFinanceSummary | null>(null);
  const [integrityStatus, setIntegrityStatus] =
    useState<AuthorFinanceIntegrityStatus>("ok");
  const [terms, setTerms] = useState<AuthorFinanceTermsRow[]>([]);
  const [ledger, setLedger] = useState<AuthorFinanceLedgerRow[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [payouts, setPayouts] = useState<AuthorFinancePayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payoutProfileStatus, setPayoutProfileStatus] = useState<
    AuthorPayoutProfileStatus | null
  >(null);
  const [payoutProfilesFeatureEnabled, setPayoutProfilesFeatureEnabled] =
    useState(false);

  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [entryDetail, setEntryDetail] =
    useState<AuthorFinanceLedgerDetail | null>(null);
  const [openPayoutId, setOpenPayoutId] = useState<string | null>(null);
  const [payoutDetail, setPayoutDetail] =
    useState<AuthorFinancePayoutDetail | null>(null);

  const activityQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("period", period);
    if (period === "custom") {
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
    }
    if (typeFilter) params.set("type", typeFilter);
    return params.toString();
  }, [period, customFrom, customTo, typeFilter]);

  function updateUrl(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.replace(`/author-dashboard/finance?${params.toString()}`);
  }

  useEffect(() => {
    if (!selectedAuthor) return;

    let cancelled = false;
    const authorParam = `author_id=${encodeURIComponent(selectedAuthor.id)}`;

    async function load() {
      setLoading(true);
      setError(null);
      setOpenEntryId(null);
      setOpenPayoutId(null);

      try {
        const [
          summaryResponse,
          termsResponse,
          ledgerResponse,
          payoutsResponse,
          payoutProfileResponse,
        ] = await Promise.all([
          fetch(`/api/author/finance/summary?${authorParam}`, {
            cache: "no-store",
          }),
          fetch(`/api/author/finance/terms?${authorParam}`, {
            cache: "no-store",
          }),
          fetch(
            `/api/author/finance/ledger?${authorParam}&${activityQuery}&limit=100`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/author/finance/payouts?${authorParam}&${activityQuery}&limit=100`,
            { cache: "no-store" },
          ),
          fetch(`/api/author/payout-profile?${authorParam}`, {
            cache: "no-store",
          }),
        ]);

        if (cancelled) return;

        if (!summaryResponse.ok) {
          setError("Не удалось загрузить финансовые данные.");
          return;
        }

        const summaryPayload = (await summaryResponse.json()) as {
          summary: AuthorFinanceSummary;
          integrityStatus: AuthorFinanceIntegrityStatus;
        };
        const termsPayload = termsResponse.ok
          ? ((await termsResponse.json()) as { history: AuthorFinanceTermsRow[] })
          : { history: [] };
        const ledgerPayload = ledgerResponse.ok
          ? ((await ledgerResponse.json()) as {
              rows: AuthorFinanceLedgerRow[];
              total: number;
            })
          : { rows: [], total: 0 };
        const payoutsPayload = payoutsResponse.ok
          ? ((await payoutsResponse.json()) as { rows: AuthorFinancePayoutRow[] })
          : { rows: [] };
        const payoutProfilePayload = payoutProfileResponse.ok
          ? ((await payoutProfileResponse.json()) as {
              featureEnabled?: boolean;
              profile?: { status?: AuthorPayoutProfileStatus | null } | null;
            })
          : { featureEnabled: false, profile: null };

        if (cancelled) return;

        setSummary(summaryPayload.summary);
        setIntegrityStatus(summaryPayload.integrityStatus);
        setTerms(termsPayload.history ?? []);
        setLedger(ledgerPayload.rows ?? []);
        setLedgerTotal(ledgerPayload.total ?? 0);
        setPayouts(payoutsPayload.rows ?? []);
        setPayoutProfilesFeatureEnabled(
          payoutProfilePayload.featureEnabled === true,
        );
        setPayoutProfileStatus(payoutProfilePayload.profile?.status ?? null);
      } catch {
        if (!cancelled) setError("Не удалось загрузить финансовые данные.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedAuthor, activityQuery]);

  const toggleEntry = useCallback(
    async (entryId: string) => {
      if (!selectedAuthor) return;

      if (openEntryId === entryId) {
        setOpenEntryId(null);
        setEntryDetail(null);
        return;
      }

      setOpenEntryId(entryId);
      setEntryDetail(null);

      const response = await fetch(
        `/api/author/finance/ledger/${encodeURIComponent(entryId)}?author_id=${encodeURIComponent(selectedAuthor.id)}`,
        { cache: "no-store" },
      );

      if (!response.ok) return;

      const payload = (await response.json()) as {
        detail: AuthorFinanceLedgerDetail;
      };
      setEntryDetail(payload.detail);
    },
    [openEntryId, selectedAuthor],
  );

  const togglePayout = useCallback(
    async (payoutId: string) => {
      if (!selectedAuthor) return;

      if (openPayoutId === payoutId) {
        setOpenPayoutId(null);
        setPayoutDetail(null);
        return;
      }

      setOpenPayoutId(payoutId);
      setPayoutDetail(null);

      const response = await fetch(
        `/api/author/finance/payouts/${encodeURIComponent(payoutId)}?author_id=${encodeURIComponent(selectedAuthor.id)}`,
        { cache: "no-store" },
      );

      if (!response.ok) return;

      const payload = (await response.json()) as {
        detail: AuthorFinancePayoutDetail;
      };
      setPayoutDetail(payload.detail);
    },
    [openPayoutId, selectedAuthor],
  );

  if (!selectedAuthor) return null;

  const exportHref = (kind: "ledger" | "payouts") =>
    `/api/author/finance/export?author_id=${encodeURIComponent(selectedAuthor.id)}&kind=${kind}&${activityQuery}`;

  const emptyState = summary
    ? getAuthorFinanceEmptyStateCopy(summary.emptyStateCode)
    : null;
  const integrityMessage = getAuthorFinanceIntegrityMessage(integrityStatus);
  const activeTerms = terms.find((row) => row.isActiveNow) ?? null;
  const authorTermsUi = summary
    ? resolveAuthorFinanceAuthorTermsUi({
        accessStatus: summary.accessStatus,
        authorTermsAccepted: summary.authorTermsAccepted,
      })
    : null;
  const displayShareBps =
    activeTerms?.authorShareBps ??
    summary?.activeTermsSummary?.authorShareBps ??
    DEFAULT_COMMERCIAL_SHARE.authorShareBps;
  const displayHoldDays = activeTerms?.holdDays ?? null;
  const showPayoutProfileBanner = shouldShowFinancePayoutProfileBanner({
    featureEnabled: payoutProfilesFeatureEnabled,
    payoutProfileStatus,
  });
  const termsHref = `/author-dashboard/commercial/terms?author=${encodeURIComponent(selectedAuthor.slug)}`;

  return (
    <div className="min-w-0">
      <AuthorDashboardNav authorSlug={selectedAuthor.slug} />

      {error ? (
        <p className="mt-6 rounded-[20px] border border-[#f0d2d2] bg-[#fdf6f6] px-4 py-3 text-sm text-[#a24a4a]">
          {error}
        </p>
      ) : null}

      {loading && !summary ? (
        <p className="mt-6 text-sm text-[#7d70a2]">Загрузка…</p>
      ) : null}

      {summary ? (
        <>
          {integrityMessage ? (
            <p className="mt-5 rounded-[20px] border border-[#e6ddc0] bg-[#fdfaf0] px-4 py-3 text-sm text-[#7a6a3c]">
              {integrityMessage}
            </p>
          ) : null}

          {showPayoutProfileBanner ? (
            <div className="mt-5 rounded-[20px] border border-[#eadff8] bg-[#fcfbfe] px-4 py-3">
              <p className="text-sm font-semibold text-[#25135c]">
                {AUTHOR_FINANCE_PAYOUT_PROFILE_MISSING_COPY.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-[#4c3d78]">
                {AUTHOR_FINANCE_PAYOUT_PROFILE_MISSING_COPY.description}
              </p>
              <Link
                href={buildPayoutDetailsHref(selectedAuthor.slug)}
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full border border-[#bda6e1] px-5 text-sm font-semibold text-[#7042c5]"
              >
                {AUTHOR_FINANCE_PAYOUT_PROFILE_MISSING_COPY.ctaLabel}
              </Link>
            </div>
          ) : null}

          {summary.negative ? (
            <p className="mt-4 rounded-[20px] border border-[#f0d2d2] bg-[#fdf6f6] px-4 py-3 text-sm text-[#a24a4a]">
              {AUTHOR_FINANCE_NEGATIVE_WARNING}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Card
              label={AUTHOR_FINANCE_KPI_LABELS.accrued}
              value={formatRubFromMinor(summary.accruedMinor)}
              hint={AUTHOR_FINANCE_KPI_HINTS.accrued}
            />
            <Card
              label={AUTHOR_FINANCE_KPI_LABELS.held}
              value={formatRubFromMinor(summary.heldMinor)}
              hint={
                summary.nextHoldReleaseAt
                  ? `${AUTHOR_FINANCE_NEXT_AVAILABLE_PREFIX}: ${formatDate(summary.nextHoldReleaseAt)}`
                  : AUTHOR_FINANCE_KPI_HINTS.held
              }
            />
            <Card
              label={AUTHOR_FINANCE_KPI_LABELS.payable}
              value={formatRubFromMinor(summary.payableMinor)}
              hint={AUTHOR_FINANCE_KPI_HINTS.payable}
              tone="accent"
            />
            <Card
              label={AUTHOR_FINANCE_KPI_LABELS.reserved}
              value={formatRubFromMinor(summary.reservedMinor)}
              hint={AUTHOR_FINANCE_KPI_HINTS.reserved}
            />
            <Card
              label={AUTHOR_FINANCE_KPI_LABELS.paid}
              value={formatRubFromMinor(summary.paidMinor)}
              hint={AUTHOR_FINANCE_KPI_HINTS.paid}
            />
          </div>

          <p className="mt-3 text-[11px] leading-snug text-[#9a8fbf]">
            {AUTHOR_FINANCE_BALANCE_AS_OF_TEXT}
          </p>

          {emptyState ? (
            <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-4 py-4 sm:px-5">
              <p className="text-[16px] font-semibold">{emptyState.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-[#7d70a2]">
                {emptyState.body}
              </p>
              {!summary.thresholdReached && summary.payoutEligible ? (
                <p className="mt-3 text-sm leading-relaxed text-[#7d70a2]">
                  {AUTHOR_FINANCE_MINIMUM_PAYOUT_TEXT}
                </p>
              ) : null}
            </div>
          ) : null}

          <Section
            title="Условия"
            actions={
              authorTermsUi ? (
                <StateBadge label={authorTermsUi.badge} />
              ) : null
            }
          >
            {authorTermsUi ? (
              <p className="text-sm leading-relaxed text-[#7d70a2]">
                {authorTermsUi.body}
                {summary.authorTermsAccepted && summary.authorTermsVersion
                  ? ` Версия ${summary.authorTermsVersion}.`
                  : null}
              </p>
            ) : null}

            {authorTermsUi?.showAcceptCta ? (
              <Link
                href={termsHref}
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white"
              >
                Принять Авторские условия
              </Link>
            ) : null}

            {summary.authorTermsAccepted ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card
                  label="Ваша доля"
                  value={formatShareBpsAsPercent(displayShareBps)}
                />
                <Card
                  label={AUTHOR_FINANCE_HOLD_DAYS_LABEL}
                  value={
                    displayHoldDays === null
                      ? "По условиям платформы"
                      : formatAuthorFinanceHoldDays(displayHoldDays)
                  }
                />
                <Card
                  label="Действуют с"
                  value={
                    activeTerms
                      ? formatDate(activeTerms.validFrom)
                      : "С принятия Авторских условий"
                  }
                />
              </div>
            ) : null}

            {terms.length > 1 ? (
              <ul className="mt-4 space-y-2">
                {terms
                  .filter((row) => !row.isActiveNow)
                  .map((row) => (
                    <li
                      key={`${row.validFrom}-${row.authorShareBps}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[16px] bg-[#faf6ff] px-3 py-2 text-sm text-[#7d70a2]"
                    >
                      <span>
                        {formatDate(row.validFrom)} — {formatDate(row.validTo)}
                      </span>
                      <span>
                        {formatShare(row.authorShareBps)} ·{" "}
                        {formatAuthorFinanceHoldDays(row.holdDays)}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </Section>

          {selectedAuthor ? (
            <AuthorSalesSection
              authorId={selectedAuthor.id}
              period={period}
              customFrom={customFrom}
              customTo={customTo}
            />
          ) : null}

          {selectedAuthor ? (
            <AuthorAppreciationSection
              authorId={selectedAuthor.id}
              period={period}
              customFrom={customFrom}
              customTo={customTo}
            />
          ) : null}

          <Section title="Операции">
            <div className="flex flex-wrap items-center gap-2">
              {AUTHOR_FINANCE_PERIODS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() =>
                    updateUrl((params) => {
                      params.set("period", item);
                      if (item !== "custom") {
                        params.delete("from");
                        params.delete("to");
                      }
                    })
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    period === item
                      ? "bg-[#7042c5] text-white"
                      : "border border-[#e4d7f4] bg-white text-[#7042c5]"
                  }`}
                >
                  {getAuthorFinancePeriodLabel(item)}
                </button>
              ))}
            </div>

            {period === "custom" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) =>
                    updateUrl((params) => params.set("from", event.target.value))
                  }
                  className="rounded-[14px] border border-[#e4d7f4] px-3 py-2 text-sm"
                  aria-label="Начало периода"
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) =>
                    updateUrl((params) => params.set("to", event.target.value))
                  }
                  className="rounded-[14px] border border-[#e4d7f4] px-3 py-2 text-sm"
                  aria-label="Конец периода"
                />
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={typeFilter}
                onChange={(event) =>
                  updateUrl((params) => {
                    if (event.target.value) {
                      params.set("type", event.target.value);
                    } else {
                      params.delete("type");
                    }
                  })
                }
                className="rounded-[14px] border border-[#e4d7f4] px-3 py-2 text-sm"
                aria-label="Тип операции"
              >
                <option value="">Все операции</option>
                {AUTHOR_FINANCE_TYPE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {getAuthorFinanceTypeLabel(key)}
                  </option>
                ))}
              </select>

              <a
                href={exportHref("ledger")}
                className="rounded-full border border-[#e4d7f4] bg-white px-4 py-2 text-xs font-semibold text-[#7042c5]"
              >
                Скачать CSV
              </a>
            </div>

            {ledger.length === 0 ? (
              <p className="mt-4 text-sm text-[#7d70a2]">
                За выбранный период операций нет.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {ledger.map((row) => (
                  <li
                    key={row.entryId}
                    className="rounded-[18px] border border-[#f0e8fb] bg-[#fdfbff] px-3 py-3"
                  >
                    <button
                      type="button"
                      onClick={() => void toggleEntry(row.entryId)}
                      className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
                      aria-expanded={openEntryId === row.entryId}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {getAuthorFinanceTypeLabel(row.typeKey)}
                          {row.productTitle ? ` · ${row.productTitle}` : ""}
                        </span>
                        <span className="mt-1 block text-xs text-[#9a8fbf]">
                          {formatDate(row.effectiveAt)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold">
                          {formatRubFromMinor(row.amountMinor)}
                        </span>
                        <span className="mt-1 block">
                          <StateBadge
                            label={getAuthorFinanceAmountStateLabel(
                              row.amountState,
                            )}
                          />
                        </span>
                      </span>
                    </button>

                    {openEntryId === row.entryId ? (
                      <div className="mt-3 border-t border-[#f0e8fb] pt-3 text-xs text-[#7d70a2]">
                        {entryDetail && entryDetail.entry.entryId === row.entryId ? (
                          <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            <div className="flex justify-between gap-3">
                              <dt>Сумма покупки</dt>
                              <dd>
                                {formatRubFromMinor(
                                  entryDetail.formula.grossBasisMinor,
                                )}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>Основание расчёта</dt>
                              <dd>
                                {formatRubFromMinor(
                                  entryDetail.formula.netBasisMinor,
                                )}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>Ваша доля</dt>
                              <dd>{formatShare(entryDetail.formula.authorShareBps)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>{AUTHOR_FINANCE_HOLD_DAYS_LABEL}</dt>
                              <dd>{formatAuthorFinanceHoldDays(entryDetail.formula.holdDays)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>Доступно с</dt>
                              <dd>{formatDate(row.availableAt)}</dd>
                            </div>
                            {row.payoutSafeRef ? (
                              <div className="flex justify-between gap-3">
                                <dt>Вошло в выплату</dt>
                                <dd>{row.payoutSafeRef}</dd>
                              </div>
                            ) : null}
                          </dl>
                        ) : (
                          <p>Загрузка…</p>
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {ledgerTotal > ledger.length ? (
              <p className="mt-3 text-xs text-[#9a8fbf]">
                Показаны последние {ledger.length} из {ledgerTotal} операций.
                Полная история — в CSV.
              </p>
            ) : null}
          </Section>

          <Section
            title="Выплаты"
            actions={
              <a
                href={exportHref("payouts")}
                className="rounded-full border border-[#e4d7f4] bg-white px-4 py-2 text-xs font-semibold text-[#7042c5]"
              >
                Скачать CSV
              </a>
            }
          >
            {payouts.length === 0 ? (
              <p className="text-sm text-[#7d70a2]">
                Выплат пока не было. {AUTHOR_FINANCE_MINIMUM_PAYOUT_TEXT}
              </p>
            ) : (
              <ul className="space-y-2">
                {payouts.map((row) => {
                  const statusMessage = getAuthorFinancePayoutStatusMessage(
                    row.statusKey,
                  );

                  return (
                    <li
                      key={row.payoutId}
                      className="rounded-[18px] border border-[#f0e8fb] bg-[#fdfbff] px-3 py-3"
                    >
                      <button
                        type="button"
                        onClick={() => void togglePayout(row.payoutId)}
                        className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
                        aria-expanded={openPayoutId === row.payoutId}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            Период {row.periodLabel}
                          </span>
                          <span className="mt-1 block text-xs text-[#9a8fbf]">
                            {formatDate(row.paidAt ?? row.createdAt)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold">
                            {formatRubFromMinor(row.amountMinor)}
                          </span>
                          <span className="mt-1 block">
                            <StateBadge
                              label={getAuthorFinancePayoutStatusLabel(
                                row.statusKey,
                              )}
                            />
                          </span>
                        </span>
                      </button>

                      {statusMessage ? (
                        <p className="mt-2 text-xs leading-snug text-[#7d70a2]">
                          {statusMessage}
                        </p>
                      ) : null}

                      {openPayoutId === row.payoutId ? (
                        <div className="mt-3 border-t border-[#f0e8fb] pt-3 text-xs text-[#7d70a2]">
                          {payoutDetail &&
                          payoutDetail.payout.payoutId === row.payoutId ? (
                            <>
                              <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                <div className="flex justify-between gap-3">
                                  <dt>Расчёт по состоянию на</dt>
                                  <dd>{formatDate(payoutDetail.payout.cutoffAt)}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                  <dt>Дата выплаты</dt>
                                  <dd>{formatDate(payoutDetail.payout.paidAt)}</dd>
                                </div>
                                {payoutDetail.payout.referenceMasked ? (
                                  <div className="flex justify-between gap-3">
                                    <dt>Референс перевода</dt>
                                    <dd>{payoutDetail.payout.referenceMasked}</dd>
                                  </div>
                                ) : null}
                              </dl>

                              {payoutDetail.entries.length > 0 ? (
                                <ul className="mt-3 space-y-1">
                                  {payoutDetail.entries.map((entry) => (
                                    <li
                                      key={entry.entryId}
                                      className="flex flex-wrap justify-between gap-2"
                                    >
                                      <span>
                                        {formatDate(entry.effectiveAt)}
                                        {entry.productTitle
                                          ? ` · ${entry.productTitle}`
                                          : ""}
                                      </span>
                                      <span>
                                        {formatRubFromMinor(entry.allocatedMinor)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </>
                          ) : (
                            <p>Загрузка…</p>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Как считаются деньги">
            <ul className="space-y-3">
              {AUTHOR_FINANCE_METHODOLOGY.map((item) => (
                <li key={item.title}>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#7d70a2]">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-snug text-[#9a8fbf]">
              {AUTHOR_FINANCE_PRIVACY_NOTE}
            </p>
          </Section>
        </>
      ) : null}
    </div>
  );
}
