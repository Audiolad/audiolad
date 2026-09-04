"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AdminAuthorPayoutsPanel from "@/components/admin/AdminAuthorPayoutsPanel";
import {
  ADMIN_AUTHOR_FINANCE_BLOCKER_LABELS,
  ADMIN_AUTHOR_FINANCE_DICTIONARY,
  ADMIN_AUTHOR_FINANCE_DRY_RUN_NOTE,
  ADMIN_AUTHOR_FINANCE_ELIGIBILITY_NOTE,
  ADMIN_AUTHOR_FINANCE_ENTRY_TYPE_LABELS,
  ADMIN_AUTHOR_FINANCE_LEDGER_APPEND_ONLY_NOTE,
  ADMIN_AUTHOR_FINANCE_PAYOUTS_NOTE,
  ADMIN_AUTHOR_FINANCE_PAYOUT_CLASS_LABELS,
  ADMIN_AUTHOR_FINANCE_PRODUCT_OVERRIDE_NOTE,
  ADMIN_AUTHOR_FINANCE_TERMS_STATUS_LABELS,
} from "@/lib/admin/analytics-author-finance-dictionary";
import type {
  AdminAuthorFinanceAuthorRow,
  AdminAuthorFinanceDryRun,
  AdminAuthorFinanceLedgerRow,
  AdminAuthorFinanceListBundle,
  AdminAuthorFinanceSummary,
  AdminAuthorTermsRow,
} from "@/lib/admin/analytics-author-finance-queries";
import { buildCsv, downloadCsv } from "@/lib/admin/analytics-csv";
import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import { ADMIN_ANALYTICS_PERIOD_OPTIONS } from "@/lib/admin/analytics-period";
import {
  buildAdminAnalyticsSearchParams,
  type AdminAnalyticsUrlState,
  type AdminAuthorEconomyTab,
} from "@/lib/admin/analytics-url-state";

type Capabilities = {
  canManageTerms: boolean;
  canManageLedger: boolean;
  canManageAdjustments: boolean;
  canViewPayouts: boolean;
};

type AuthorEconomyBundle = {
  summary: AdminAuthorFinanceSummary;
  authors: AdminAuthorFinanceListBundle<AdminAuthorFinanceAuthorRow>;
  ledger: AdminAuthorFinanceListBundle<AdminAuthorFinanceLedgerRow>;
  terms: AdminAuthorFinanceListBundle<AdminAuthorTermsRow>;
  capabilities: Capabilities;
};

const TABS = [
  { id: "authors", label: "Авторы" },
  { id: "ledger", label: "Реестр" },
  { id: "terms", label: "Условия" },
  { id: "payouts", label: "Выплаты" },
  { id: "dry-run", label: "Предпросмотр истории" },
] as const satisfies ReadonlyArray<{ id: AdminAuthorEconomyTab; label: string }>;

const ENTRY_TYPE_FILTERS = [
  { id: null, label: "Все" },
  { id: "sale_accrual", label: "Начисления" },
  { id: "refund_reversal", label: "Сторно" },
  { id: "manual_credit", label: "Ручные +" },
  { id: "manual_debit", label: "Ручные −" },
  { id: "correction", label: "Корректировки" },
] as const;

const API_ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Недостаточно прав: нужно разрешение finance.terms.manage.",
  author_not_found: "Автор не найден.",
  terms_not_found: "Условия не найдены.",
  invalid_author_share_bps: "Доля автора указывается в базисных пунктах, от 0 до 10000.",
  invalid_hold_days: "Срок до доступности — целое число дней от 0 до 365.",
  invalid_validity_window: "Дата окончания должна быть позже даты начала.",
  author_commercial_terms_overlap:
    "Период пересекается с уже утверждёнными условиями. Сначала закройте текущие.",
  terms_not_approvable: "Утвердить можно только черновик.",
  terms_not_closable: "Закрыть можно только утверждённые условия.",
  amount_must_be_nonzero: "Сумма корректировки не может быть нулевой.",
  reason_code_required: "Укажите причину корректировки.",
  invalid_body: "Проверьте заполненные поля.",
};

function errorMessage(code: string | null | undefined): string {
  if (!code) return "Не удалось выполнить действие.";
  return API_ERROR_MESSAGES[code] ?? `Ошибка: ${code}`;
}

function formatBps(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)} %`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function payoutClassTone(payoutClass: string): string {
  if (payoutClass === "payout_eligible") return "bg-[#e8f5ed] text-[#2f7d4a]";
  if (payoutClass === "commercial_pending") return "bg-[#fff8e8] text-[#6a5310]";
  if (payoutClass === "platform_owned_heuristic") return "bg-[#f1e9fb] text-[#7042c5]";
  return "bg-[#f4f1fa] text-[#796ba0]";
}

function amountTone(amountMinor: number): string {
  if (amountMinor < 0) return "text-[#b34f63]";
  return "text-[#25135c]";
}

export default function AdminAuthorEconomyPanel({
  urlState,
  onPatch,
}: {
  urlState: AdminAnalyticsUrlState;
  onPatch: (patch: Partial<AdminAnalyticsUrlState>) => void;
}) {
  const [bundle, setBundle] = useState<AuthorEconomyBundle | null>(null);
  const [dryRun, setDryRun] = useState<AdminAuthorFinanceDryRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const tab = urlState.authorEconomyTab;

  const fetchKey = [
    urlState.moneyPeriod,
    urlState.includeTestPayments ? "1" : "0",
    urlState.authorEconomyAuthorId ?? "",
    urlState.authorEconomyEntryType ?? "",
    urlState.authorEconomyQ,
    reloadToken,
  ].join("|");

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      try {
        const params = buildAdminAnalyticsSearchParams(urlState);
        const response = await fetch(
          `/api/admin/finance/authors?${params.toString()}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        if (!response.ok) throw new Error(`author_economy_${response.status}`);
        const data = (await response.json()) as AuthorEconomyBundle;
        if (!controller.signal.aborted) {
          setBundle(data);
          setLoading(false);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "error");
        setLoading(false);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const loadDryRun = useCallback(async () => {
    setDryRunLoading(true);
    setActionError(null);
    try {
      const params = buildAdminAnalyticsSearchParams(urlState);
      const response = await fetch(
        `/api/admin/finance/dry-run?${params.toString()}`,
        { headers: { Accept: "application/json" } },
      );
      const data = (await response.json().catch(() => ({}))) as {
        dryRun?: AdminAuthorFinanceDryRun;
        error?: string;
      };
      if (!response.ok || !data.dryRun) {
        setActionError(errorMessage(data.error));
        return;
      }
      setDryRun(data.dryRun);
    } catch {
      setActionError("Сеть недоступна. Повторите попытку.");
    } finally {
      setDryRunLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  const runTermsAction = useCallback(
    async (termsId: string, action: "approve" | "close") => {
      setBusyId(termsId);
      setActionError(null);
      setActionNotice(null);
      try {
        const response = await fetch(
          `/api/admin/finance/terms/${termsId}/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
        );
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) {
          setActionError(errorMessage(data.error));
          return;
        }
        setActionNotice(
          action === "approve"
            ? "Условия утверждены. Новые начисления пойдут по этой ставке."
            : "Условия закрыты. Уже записанные начисления сохраняют свою ставку.",
        );
        reload();
      } catch {
        setActionError("Сеть недоступна. Повторите попытку.");
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  const drainObligations = useCallback(async () => {
    setBusyId("obligations");
    setActionError(null);
    setActionNotice(null);
    try {
      const response = await fetch("/api/admin/finance/obligations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 200 }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        batch?: { processed: number; requiresReview: number; skipped: number };
      };
      if (!response.ok || !data.batch) {
        setActionError(errorMessage(data.error));
        return;
      }
      setActionNotice(
        `Обработано: ${data.batch.processed}, пропущено: ${data.batch.skipped}, требуют проверки: ${data.batch.requiresReview}.`,
      );
      reload();
    } catch {
      setActionError("Сеть недоступна. Повторите попытку.");
    } finally {
      setBusyId(null);
    }
  }, [reload]);

  const summary = bundle?.summary ?? null;
  const capabilities = bundle?.capabilities ?? {
    canManageTerms: false,
    canManageLedger: false,
    canManageAdjustments: false,
    canViewPayouts: false,
  };

  const authorOptions = useMemo(
    () => bundle?.authors.rows ?? [],
    [bundle?.authors.rows],
  );

  function exportAuthors(rows: AdminAuthorFinanceAuthorRow[]) {
    const csv = buildCsv(
      [
        "author_id",
        "slug",
        "payout_class",
        "payout_eligible",
        "current_share_bps",
        "accrued_minor",
        "reversed_minor",
        "adjustments_minor",
        "net_entitlement_minor",
        "held_minor",
        "payable_minor",
      ],
      rows.map((row) => [
        row.authorId,
        row.slug,
        row.payoutClass,
        row.payoutEligible ? "1" : "0",
        row.currentShareBps ?? "",
        row.accruedMinor,
        row.reversedMinor,
        row.adjustmentsMinor,
        row.netEntitlementMinor,
        row.heldMinor,
        row.payableMinor,
      ]),
    );
    downloadCsv("audiolad-author-economy.csv", csv);
  }

  function exportLedger(rows: AdminAuthorFinanceLedgerRow[]) {
    const csv = buildCsv(
      [
        "entry_id",
        "author_slug",
        "entry_type",
        "amount_minor",
        "currency",
        "author_share_bps",
        "gross_basis_minor",
        "net_basis_minor",
        "effective_at",
        "available_at",
        "is_held",
        "payment_id",
        "refund_id",
        "practice_slug",
        "is_test",
      ],
      rows.map((row) => [
        row.entryId,
        row.authorSlug,
        row.entryType,
        row.amountMinor,
        row.currency,
        row.authorShareBps ?? "",
        row.grossBasisMinor ?? "",
        row.netBasisMinor ?? "",
        row.effectiveAt ?? "",
        row.availableAt ?? "",
        row.isHeld ? "1" : "0",
        row.paymentId ?? "",
        row.refundId ?? "",
        row.practiceSlug ?? "",
        row.isTest ? "1" : "0",
      ]),
    );
    downloadCsv("audiolad-author-ledger.csv", csv);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[19px] font-semibold text-[#25135c]">
            Экономика авторов
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-[#796ba0]">
            Обязательства перед авторами считаются отдельным реестром поверх
            фактов оплат. Валовая сумма P3.1 не меняется.{" "}
            {ADMIN_AUTHOR_FINANCE_PAYOUTS_NOTE}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-full border border-[#eadff8] bg-white px-3 py-2 text-sm text-[#25135c]">
            <input
              type="checkbox"
              checked={urlState.includeTestPayments}
              onChange={(event) =>
                onPatch({ includeTestPayments: event.target.checked })
              }
            />
            Включить тестовые
          </label>
          {capabilities.canManageLedger ? (
            <button
              type="button"
              onClick={() => void drainObligations()}
              disabled={busyId === "obligations"}
              className="rounded-full border border-[#eadff8] bg-white px-4 py-2 text-sm font-medium text-[#7042c5] disabled:opacity-60"
            >
              Обработать очередь
            </button>
          ) : null}
          {capabilities.canManageAdjustments ? (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setActionNotice(null);
                setAdjustmentDialogOpen(true);
              }}
              className="rounded-full border border-[#eadff8] bg-white px-4 py-2 text-sm font-medium text-[#7042c5]"
            >
              Корректировка
            </button>
          ) : null}
          {capabilities.canManageTerms ? (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setActionNotice(null);
                setTermsDialogOpen(true);
              }}
              className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white"
            >
              Новые условия
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Период экономики авторов"
      >
        {ADMIN_ANALYTICS_PERIOD_OPTIONS.map((option) => {
          const active = option.id === urlState.moneyPeriod;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onPatch({ moneyPeriod: option.id })}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                active
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#eadff8] bg-white text-[#7042c5]"
              }`}
              aria-pressed={active}
            >
              {option.id === "7d"
                ? "7"
                : option.id === "30d"
                  ? "30"
                  : option.id === "all"
                    ? "Все"
                    : option.label}
            </button>
          );
        })}
      </div>

      {actionError ? (
        <p
          className="rounded-[14px] border border-[#f0b6c2] bg-[#fbecef] px-3 py-2 text-sm text-[#b34f63]"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
      {actionNotice ? (
        <p
          className="rounded-[14px] border border-[#bfe3cd] bg-[#e8f5ed] px-3 py-2 text-sm text-[#2f7d4a]"
          role="status"
        >
          {actionNotice}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#796ba0]">Загрузка экономики авторов…</p>
      ) : error ? (
        <p className="text-sm text-[#b34f63]">
          Не удалось загрузить данные: {error}
        </p>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              {
                key: "gross",
                value: formatRubFromMinor(summary.grossMinor),
                sub: `${summary.paymentCount} оплат`,
              },
              {
                key: "accrued",
                value: formatRubFromMinor(summary.accruedMinor),
                sub: `${summary.accrualCount} начислений`,
              },
              {
                key: "reversed",
                value: formatRubFromMinor(summary.reversedMinor),
                sub: `${summary.reversalCount} сторно`,
              },
              {
                key: "netEntitlement",
                value: formatRubFromMinor(summary.netEntitlementMinor),
                sub: `${summary.authorsWithLedger} авторов`,
              },
              {
                key: "held",
                value: formatRubFromMinor(summary.heldMinor),
                sub: "на сейчас",
              },
              {
                key: "payable",
                value: formatRubFromMinor(summary.payableMinor),
                sub: "выплаты не подключены",
              },
            ].map((card) => {
              const term = ADMIN_AUTHOR_FINANCE_DICTIONARY[card.key];
              return (
                <div
                  key={card.key}
                  className="rounded-[18px] border border-[#eadff8] bg-white p-3 shadow-sm"
                  title={`${term.formula}. ${term.hint}`}
                >
                  <p className="text-xs font-medium text-[#796ba0]">
                    {term.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#25135c] sm:text-xl">
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs text-[#796ba0]">{card.sub}</p>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-[#796ba0]">
            Доля платформы: {formatRubFromMinor(summary.platformShareMinor)} (до
            комиссий и налогов). Авторов с правом на выплату:{" "}
            {summary.payoutEligibleAuthors}, с утверждёнными условиями:{" "}
            {summary.authorsWithApprovedTerms}. Очередь: в работе{" "}
            {summary.obligationsPending}, требуют проверки{" "}
            {summary.obligationsRequiresReview}, пропущено как продукты платформы{" "}
            {summary.obligationsSkippedPlatformOwned}.{" "}
            {ADMIN_AUTHOR_FINANCE_PRODUCT_OVERRIDE_NOTE}
          </p>

          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Разделы экономики авторов"
          >
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => onPatch({ authorEconomyTab: item.id })}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  tab === item.id
                    ? "bg-[#7042c5] text-white"
                    : "border border-[#eadff8] bg-white text-[#7042c5]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "authors" ? (
            <AuthorsTable
              rows={bundle?.authors.rows ?? []}
              total={bundle?.authors.total ?? 0}
              selectedAuthorId={urlState.authorEconomyAuthorId}
              onSelectAuthor={(authorId) =>
                onPatch({
                  authorEconomyAuthorId: authorId,
                  authorEconomyTab: authorId ? "ledger" : "authors",
                })
              }
              onExport={exportAuthors}
            />
          ) : null}

          {tab === "ledger" ? (
            <LedgerTable
              rows={bundle?.ledger.rows ?? []}
              total={bundle?.ledger.total ?? 0}
              entryType={urlState.authorEconomyEntryType}
              authorId={urlState.authorEconomyAuthorId}
              onPatch={onPatch}
              onExport={exportLedger}
            />
          ) : null}

          {tab === "terms" ? (
            <TermsTable
              rows={bundle?.terms.rows ?? []}
              canManage={capabilities.canManageTerms}
              busyId={busyId}
              onAction={runTermsAction}
            />
          ) : null}

          {tab === "payouts" ? (
            capabilities.canViewPayouts ? (
              <AdminAuthorPayoutsPanel urlState={urlState} onPatch={onPatch} />
            ) : (
              <p className="rounded-[16px] border border-[#eadff8] bg-white p-4 text-sm text-[#796ba0]">
                Нужно разрешение finance.payouts.view, чтобы видеть выплаты.
              </p>
            )
          ) : null}

          {tab === "dry-run" ? (
            <DryRunPanel
              dryRun={dryRun}
              loading={dryRunLoading}
              onReload={() => void loadDryRun()}
            />
          ) : null}
        </>
      ) : null}

      {termsDialogOpen ? (
        <TermsDialog
          authors={authorOptions}
          onClose={() => setTermsDialogOpen(false)}
          onDone={(message) => {
            setTermsDialogOpen(false);
            setActionNotice(message);
            reload();
          }}
          onError={(message) => setActionError(message)}
        />
      ) : null}

      {adjustmentDialogOpen ? (
        <AdjustmentDialog
          authors={authorOptions}
          onClose={() => setAdjustmentDialogOpen(false)}
          onDone={(message) => {
            setAdjustmentDialogOpen(false);
            setActionNotice(message);
            reload();
          }}
          onError={(message) => setActionError(message)}
        />
      ) : null}
    </div>
  );
}

function AuthorsTable({
  rows,
  total,
  selectedAuthorId,
  onSelectAuthor,
  onExport,
}: {
  rows: AdminAuthorFinanceAuthorRow[];
  total: number;
  selectedAuthorId: string | null;
  onSelectAuthor: (authorId: string | null) => void;
  onExport: (rows: AdminAuthorFinanceAuthorRow[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#796ba0]">
          Авторов: {total}. {ADMIN_AUTHOR_FINANCE_ELIGIBILITY_NOTE}
        </p>
        <div className="flex items-center gap-2">
          {selectedAuthorId ? (
            <button
              type="button"
              onClick={() => onSelectAuthor(null)}
              className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
            >
              Сбросить автора
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onExport(rows)}
            className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
          >
            Выгрузить CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-[#eadff8] bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#faf7fe] text-xs uppercase text-[#796ba0]">
            <tr>
              <th className="px-3 py-2">Автор</th>
              <th className="px-3 py-2">Статус выплат</th>
              <th className="px-3 py-2">Ставка</th>
              <th className="px-3 py-2 text-right">Начислено</th>
              <th className="px-3 py-2 text-right">Сторно</th>
              <th className="px-3 py-2 text-right">Обязательство</th>
              <th className="px-3 py-2 text-right">Сохраняется</th>
              <th className="px-3 py-2 text-right">К выплате</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-[#796ba0]" colSpan={8}>
                  Нет авторов за выбранный период.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.authorId} className="border-t border-[#f2ecfb]">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onSelectAuthor(row.authorId)}
                      className="text-left font-medium text-[#25135c] underline-offset-2 hover:underline"
                    >
                      {row.name}
                    </button>
                    <p className="text-xs text-[#796ba0]">{row.slug}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs ${payoutClassTone(row.payoutClass)}`}
                    >
                      {ADMIN_AUTHOR_FINANCE_PAYOUT_CLASS_LABELS[row.payoutClass] ??
                        row.payoutClass}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#25135c]">
                    {formatBps(row.currentShareBps)}
                    {row.approvedTermsCount === 0 ? (
                      <span className="ml-1 text-xs text-[#796ba0]">
                        (нет условий)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right text-[#25135c]">
                    {formatRubFromMinor(row.accruedMinor)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${amountTone(row.reversedMinor)}`}
                  >
                    {formatRubFromMinor(row.reversedMinor)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-[#25135c]">
                    {formatRubFromMinor(row.netEntitlementMinor)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#796ba0]">
                    {formatRubFromMinor(row.heldMinor)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#25135c]">
                    {formatRubFromMinor(row.payableMinor)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LedgerTable({
  rows,
  total,
  entryType,
  authorId,
  onPatch,
  onExport,
}: {
  rows: AdminAuthorFinanceLedgerRow[];
  total: number;
  entryType: string | null;
  authorId: string | null;
  onPatch: (patch: Partial<AdminAnalyticsUrlState>) => void;
  onExport: (rows: AdminAuthorFinanceLedgerRow[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {ENTRY_TYPE_FILTERS.map((filter) => {
            const active = (entryType ?? null) === filter.id;
            return (
              <button
                key={filter.label}
                type="button"
                onClick={() => onPatch({ authorEconomyEntryType: filter.id })}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  active
                    ? "bg-[#7042c5] text-white"
                    : "border border-[#eadff8] bg-white text-[#7042c5]"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
          {authorId ? (
            <button
              type="button"
              onClick={() => onPatch({ authorEconomyAuthorId: null })}
              className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
            >
              Все авторы
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onExport(rows)}
          className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
        >
          Выгрузить CSV
        </button>
      </div>

      <p className="text-xs text-[#796ba0]">
        Записей: {total}. {ADMIN_AUTHOR_FINANCE_LEDGER_APPEND_ONLY_NOTE}
      </p>

      <div className="overflow-x-auto rounded-[18px] border border-[#eadff8] bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-[#faf7fe] text-xs uppercase text-[#796ba0]">
            <tr>
              <th className="px-3 py-2">Дата</th>
              <th className="px-3 py-2">Автор</th>
              <th className="px-3 py-2">Тип</th>
              <th className="px-3 py-2">Продукт</th>
              <th className="px-3 py-2">Ставка</th>
              <th className="px-3 py-2 text-right">База</th>
              <th className="px-3 py-2 text-right">Сумма</th>
              <th className="px-3 py-2">Доступно</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-[#796ba0]" colSpan={8}>
                  Записей нет. Начисления появляются после подтверждённой оплаты
                  автора с утверждёнными условиями.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.entryId} className="border-t border-[#f2ecfb]">
                  <td className="px-3 py-2 text-[#796ba0]">
                    {formatDate(row.effectiveAt)}
                  </td>
                  <td className="px-3 py-2 text-[#25135c]">
                    {row.authorName}
                    {row.isTest ? (
                      <span className="ml-1 rounded-full bg-[#f4f1fa] px-2 py-0.5 text-xs text-[#796ba0]">
                        тест
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-[#25135c]">
                    {ADMIN_AUTHOR_FINANCE_ENTRY_TYPE_LABELS[row.entryType] ??
                      row.entryType}
                    {row.reasonCode ? (
                      <p className="text-xs text-[#796ba0]">{row.reasonCode}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-[#796ba0]">
                    {row.practiceTitle ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-[#796ba0]">
                    {formatBps(row.authorShareBps)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#796ba0]">
                    {row.netBasisMinor !== null
                      ? formatRubFromMinor(row.netBasisMinor)
                      : row.grossBasisMinor !== null
                        ? formatRubFromMinor(row.grossBasisMinor)
                        : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${amountTone(row.amountMinor)}`}
                  >
                    {formatRubFromMinor(row.amountMinor)}
                  </td>
                  <td className="px-3 py-2 text-xs text-[#796ba0]">
                    {row.isHeld
                      ? `сохраняется до ${formatDate(row.availableAt)}`
                      : formatDate(row.availableAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TermsTable({
  rows,
  canManage,
  busyId,
  onAction,
}: {
  rows: AdminAuthorTermsRow[];
  canManage: boolean;
  busyId: string | null;
  onAction: (termsId: string, action: "approve" | "close") => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#796ba0]">
        Утверждённые условия неизменяемы: ставку нельзя отредактировать, можно
        только закрыть период и утвердить новый. Записи реестра навсегда хранят
        ставку, по которой были созданы.
      </p>

      <div className="overflow-x-auto rounded-[18px] border border-[#eadff8] bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#faf7fe] text-xs uppercase text-[#796ba0]">
            <tr>
              <th className="px-3 py-2">Автор</th>
              <th className="px-3 py-2">Ставка</th>
              <th className="px-3 py-2">Срок до доступности</th>
              <th className="px-3 py-2">Период</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-[#796ba0]" colSpan={6}>
                  Условий пока нет. Ни одна ставка не создаётся автоматически.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.termsId} className="border-t border-[#f2ecfb]">
                  <td className="px-3 py-2">
                    <p className="font-medium text-[#25135c]">{row.authorName}</p>
                    <p className="text-xs text-[#796ba0]">{row.authorSlug}</p>
                  </td>
                  <td className="px-3 py-2 text-[#25135c]">
                    {formatBps(row.authorShareBps)}
                  </td>
                  <td className="px-3 py-2 text-[#796ba0]">
                    {row.holdDays} дн.
                  </td>
                  <td className="px-3 py-2 text-[#796ba0]">
                    {formatDate(row.validFrom)} —{" "}
                    {row.validTo ? formatDate(row.validTo) : "бессрочно"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded-full bg-[#f1e9fb] px-2 py-0.5 text-xs text-[#7042c5]">
                      {ADMIN_AUTHOR_FINANCE_TERMS_STATUS_LABELS[row.status] ??
                        row.status}
                    </span>
                    {row.isActiveNow ? (
                      <span className="ml-1 rounded-full bg-[#e8f5ed] px-2 py-0.5 text-xs text-[#2f7d4a]">
                        действуют
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        {row.status === "draft" ? (
                          <button
                            type="button"
                            disabled={busyId === row.termsId}
                            onClick={() => onAction(row.termsId, "approve")}
                            className="rounded-full bg-[#7042c5] px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                          >
                            Утвердить
                          </button>
                        ) : null}
                        {row.status === "approved" ? (
                          <button
                            type="button"
                            disabled={busyId === row.termsId}
                            onClick={() => onAction(row.termsId, "close")}
                            className="rounded-full border border-[#eadff8] px-3 py-1 text-xs text-[#7042c5] disabled:opacity-60"
                          >
                            Закрыть
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-[#796ba0]">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DryRunPanel({
  dryRun,
  loading,
  onReload,
}: {
  dryRun: AdminAuthorFinanceDryRun | null;
  loading: boolean;
  onReload: () => void;
}) {
  if (loading) {
    return <p className="text-sm text-[#796ba0]">Считаем предпросмотр…</p>;
  }

  if (!dryRun) {
    return (
      <button
        type="button"
        onClick={onReload}
        className="rounded-full border border-[#eadff8] bg-white px-4 py-2 text-sm text-[#7042c5]"
      >
        Показать предпросмотр
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-[14px] border border-[#eadff8] bg-[#faf7fe] px-3 py-2 text-sm text-[#796ba0]">
        {ADMIN_AUTHOR_FINANCE_DRY_RUN_NOTE} Записей изменено:{" "}
        {dryRun.writesPerformed}.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "Оплат в выборке",
            value: String(dryRun.totals.paymentCount),
            sub: formatRubFromMinor(dryRun.totals.grossMinor),
          },
          {
            label: "Продукты платформы",
            value: String(dryRun.totals.platformOwnedCount),
            sub: formatRubFromMinor(dryRun.totals.platformOwnedMinor),
          },
          {
            label: "Без привязки автора",
            value: String(
              dryRun.totals.unresolvedCount +
                dryRun.totals.historicalFallbackCount,
            ),
            sub: "снимок в заказе отсутствует",
          },
          {
            label: "Предлагается начислить",
            value: formatRubFromMinor(dryRun.totals.proposedAccrualMinor),
            sub: `${dryRun.totals.eligibleCount} оплат`,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[18px] border border-[#eadff8] bg-white p-3 shadow-sm"
          >
            <p className="text-xs font-medium text-[#796ba0]">{card.label}</p>
            <p className="mt-1 text-lg font-semibold text-[#25135c]">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-[#796ba0]">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-[#eadff8] bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#faf7fe] text-xs uppercase text-[#796ba0]">
            <tr>
              <th className="px-3 py-2">Дата</th>
              <th className="px-3 py-2">Продукт</th>
              <th className="px-3 py-2">Автор</th>
              <th className="px-3 py-2">Привязка</th>
              <th className="px-3 py-2">Блокер</th>
              <th className="px-3 py-2 text-right">Предложено</th>
            </tr>
          </thead>
          <tbody>
            {dryRun.rows.map((row) => (
              <tr key={row.paymentId} className="border-t border-[#f2ecfb]">
                <td className="px-3 py-2 text-[#796ba0]">
                  {formatDate(row.confirmedAt)}
                </td>
                <td className="px-3 py-2 text-[#25135c]">
                  {row.practiceTitle ?? "—"}
                </td>
                <td className="px-3 py-2 text-[#796ba0]">
                  {row.resolvedAuthorName ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs text-[#796ba0]">
                  {row.attributionSource === "snapshot"
                    ? "снимок заказа"
                    : row.attributionSource === "historical_fallback"
                      ? "исторический ярлык"
                      : "не определена"}
                </td>
                <td className="px-3 py-2 text-xs text-[#796ba0]">
                  {row.blocker
                    ? (ADMIN_AUTHOR_FINANCE_BLOCKER_LABELS[row.blocker] ??
                      row.blocker)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right text-[#25135c]">
                  {formatRubFromMinor(row.proposedAccrualMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TermsDialog({
  authors,
  onClose,
  onDone,
  onError,
}: {
  authors: AdminAuthorFinanceAuthorRow[];
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [authorId, setAuthorId] = useState(authors[0]?.authorId ?? "");
  const [sharePercent, setSharePercent] = useState("70");
  const [holdDays, setHoldDays] = useState("14");
  const [validFrom, setValidFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [approveImmediately, setApproveImmediately] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const shareBps = Math.round(Number(sharePercent) * 100);
  const shareValid = Number.isInteger(shareBps) && shareBps >= 0 && shareBps <= 10000;

  async function submit() {
    if (!authorId || !shareValid) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/finance/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorId,
          authorShareBps: shareBps,
          holdDays: Number(holdDays),
          validFrom: new Date(`${validFrom}T00:00:00Z`).toISOString(),
          notes: notes || null,
          approveImmediately,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        onError(errorMessage(data.error));
        return;
      }
      onDone(
        approveImmediately
          ? "Условия созданы и утверждены."
          : "Черновик условий создан. Он не влияет на начисления до утверждения.",
      );
    } catch {
      onError("Сеть недоступна. Повторите попытку.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg space-y-3 rounded-[20px] bg-white p-5">
        <h4 className="text-lg font-semibold text-[#25135c]">
          Новые коммерческие условия
        </h4>
        <p className="text-sm text-[#796ba0]">
          Ставка применяется к оплатам, подтверждённым внутри периода действия.
          Пересечение с уже утверждённым периодом запрещено.
        </p>

        <label className="block text-sm text-[#25135c]">
          Автор
          <select
            value={authorId}
            onChange={(event) => setAuthorId(event.target.value)}
            className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
          >
            <option value="">Выберите автора</option>
            {authors.map((author) => (
              <option key={author.authorId} value={author.authorId}>
                {author.name} ({author.slug})
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-[#25135c]">
            Доля автора, %
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={sharePercent}
              onChange={(event) => setSharePercent(event.target.value)}
              className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
            />
          </label>
          <label className="block text-sm text-[#25135c]">
            Срок до доступности, дней
            <input
              type="number"
              min={0}
              max={365}
              value={holdDays}
              onChange={(event) => setHoldDays(event.target.value)}
              className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
            />
          </label>
        </div>

        <label className="block text-sm text-[#25135c]">
          Действуют с
          <input
            type="date"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
            className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
          />
        </label>

        <label className="block text-sm text-[#25135c]">
          Комментарий
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-[#25135c]">
          <input
            type="checkbox"
            checked={approveImmediately}
            onChange={(event) => setApproveImmediately(event.target.checked)}
          />
          Утвердить сразу
        </label>

        {!shareValid ? (
          <p className="text-sm text-[#b34f63]">
            Доля должна быть от 0 до 100 % с точностью до сотой.
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#eadff8] px-4 py-2 text-sm text-[#7042c5]"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={submitting || !authorId || !shareValid}
            onClick={() => void submit()}
            className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}

function AdjustmentDialog({
  authors,
  onClose,
  onDone,
  onError,
}: {
  authors: AdminAuthorFinanceAuthorRow[];
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [authorId, setAuthorId] = useState(authors[0]?.authorId ?? "");
  const [amountRub, setAmountRub] = useState("");
  const [reasonCode, setReasonCode] = useState("ops_correction");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amountMinor = Math.round(Number(amountRub) * 100);
  const amountValid = Number.isInteger(amountMinor) && amountMinor !== 0;

  async function submit() {
    if (!authorId || !amountValid) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/finance/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorId,
          amountMinor,
          reasonCode,
          idempotencyKey: `adj:${authorId}:${reasonCode}:${amountMinor}:${Date.now()}`,
          notes: notes || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        onError(errorMessage(data.error));
        return;
      }
      onDone("Корректировка добавлена в реестр отдельной записью.");
    } catch {
      onError("Сеть недоступна. Повторите попытку.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg space-y-3 rounded-[20px] bg-white p-5">
        <h4 className="text-lg font-semibold text-[#25135c]">
          Ручная корректировка
        </h4>
        <p className="text-sm text-[#796ba0]">
          {ADMIN_AUTHOR_FINANCE_LEDGER_APPEND_ONLY_NOTE} Отрицательная сумма
          уменьшает обязательство перед автором.
        </p>

        <label className="block text-sm text-[#25135c]">
          Автор
          <select
            value={authorId}
            onChange={(event) => setAuthorId(event.target.value)}
            className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
          >
            <option value="">Выберите автора</option>
            {authors.map((author) => (
              <option key={author.authorId} value={author.authorId}>
                {author.name} ({author.slug})
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-[#25135c]">
            Сумма, ₽
            <input
              type="number"
              step={0.01}
              value={amountRub}
              onChange={(event) => setAmountRub(event.target.value)}
              className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
            />
          </label>
          <label className="block text-sm text-[#25135c]">
            Причина
            <select
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
              className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
            >
              <option value="ops_correction">Операционная правка</option>
              <option value="contract_settlement">Расчёт по договору</option>
              <option value="dispute_resolution">Итог спора</option>
              <option value="other">Другое</option>
            </select>
          </label>
        </div>

        <label className="block text-sm text-[#25135c]">
          Комментарий
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
          />
        </label>

        {!amountValid && amountRub !== "" ? (
          <p className="text-sm text-[#b34f63]">
            Сумма не может быть нулевой и указывается с точностью до копейки.
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#eadff8] px-4 py-2 text-sm text-[#7042c5]"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={submitting || !authorId || !amountValid}
            onClick={() => void submit()}
            className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
