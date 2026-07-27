"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AdminAuthorPayoutCandidateRow,
  AdminAuthorPayoutCandidatesBundle,
  AdminAuthorPayoutIntegrity,
  AdminAuthorPayoutListBundle,
  AdminAuthorPayoutRow,
  AdminAuthorPayoutSummary,
} from "@/lib/admin/analytics-author-payout-queries";
import { buildCsv, downloadCsv } from "@/lib/admin/analytics-csv";
import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import {
  buildAdminAnalyticsSearchParams,
  type AdminAnalyticsUrlState,
  type AdminAuthorPayoutTab,
} from "@/lib/admin/analytics-url-state";
import {
  AUTHOR_PAYOUT_STATUS_LABELS,
  type AuthorPayoutStatus,
} from "@/lib/payments/author-finance/payout-types";

export type AdminAuthorPayoutCapabilities = {
  canViewPayouts: boolean;
  canCreatePayouts: boolean;
  canApprovePayouts: boolean;
  canMarkPayoutsPaid: boolean;
  canReversePayouts: boolean;
  canManagePayouts: boolean;
};

type PayoutBundle = {
  summary: AdminAuthorPayoutSummary;
  payouts: AdminAuthorPayoutListBundle<AdminAuthorPayoutRow>;
  candidates: AdminAuthorPayoutCandidatesBundle;
  integrity: AdminAuthorPayoutIntegrity | null;
};

const SUB_TABS = [
  { id: "candidates", label: "Кандидаты" },
  { id: "drafts", label: "Черновики" },
  { id: "processing", label: "В переводе" },
  { id: "paid", label: "Выплачено" },
  { id: "review", label: "Разбор" },
  { id: "all", label: "Все" },
] as const satisfies ReadonlyArray<{ id: AdminAuthorPayoutTab; label: string }>;

/** Which payout statuses each sub-tab shows. Empty means «all». */
const TAB_STATUSES: Record<AdminAuthorPayoutTab, readonly string[]> = {
  candidates: [],
  drafts: ["draft", "approved"],
  processing: ["processing"],
  paid: ["paid", "reversed"],
  review: ["requires_review", "failed"],
  all: [],
};

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Недостаточно прав на это действие с выплатами.",
  author_not_found: "Автор не найден.",
  author_not_payout_eligible: "Автору не разрешены выплаты.",
  payout_not_found: "Выплата не найдена.",
  no_payable_balance: "У автора нет доступной суммы к выплате.",
  below_minimum_payout:
    "Сумма меньше минимума 1000 ₽. Нужен обоснованный обход минимума.",
  override_reason_required: "Укажите причину обхода минимума.",
  desired_amount_exceeds_capacity:
    "Запрошено больше, чем доступно. Сумму считает сервер.",
  invalid_payout_amount: "Сумма выплаты должна быть положительной.",
  payout_underfunded:
    "Денег больше не хватает: после черновика прошёл возврат. Выплата отправлена на разбор.",
  invalid_payout_transition: "Этот переход статуса недопустим.",
  external_reference_required: "Укажите банковскую ссылку перевода.",
  failure_code_required: "Укажите код ошибки перевода.",
  reason_required: "Укажите причину.",
  payout_not_paid: "Сторнировать можно только выплаченную выплату.",
  invalid_body: "Проверьте заполненные поля.",
};

function errorMessage(code: string | null | undefined): string {
  if (!code) return "Не удалось выполнить действие.";
  return ERROR_MESSAGES[code] ?? `Ошибка: ${code}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function statusTone(status: AuthorPayoutStatus): string {
  if (status === "paid") return "bg-[#e8f5ed] text-[#2f7d4a]";
  if (status === "requires_review" || status === "failed") {
    return "bg-[#fbecef] text-[#b34f63]";
  }
  if (status === "processing" || status === "approved") {
    return "bg-[#fff8e8] text-[#6a5310]";
  }
  return "bg-[#f4f1fa] text-[#796ba0]";
}

export default function AdminAuthorPayoutsPanel({
  urlState,
  onPatch,
}: {
  urlState: AdminAnalyticsUrlState;
  onPatch: (patch: Partial<AdminAnalyticsUrlState>) => void;
}) {
  const [bundle, setBundle] = useState<PayoutBundle | null>(null);
  const [capabilities, setCapabilities] =
    useState<AdminAuthorPayoutCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [draftFor, setDraftFor] = useState<AdminAuthorPayoutCandidateRow | null>(
    null,
  );
  const [paidFor, setPaidFor] = useState<AdminAuthorPayoutRow | null>(null);
  const [reasonFor, setReasonFor] = useState<{
    payout: AdminAuthorPayoutRow;
    action: "cancel" | "failed" | "review" | "reverse";
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const tab = urlState.payoutTab;

  const fetchKey = [
    urlState.moneyPeriod,
    urlState.includeTestPayments ? "1" : "0",
    urlState.authorEconomyAuthorId ?? "",
    urlState.authorEconomyQ,
    urlState.payoutStatus ?? "",
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
          `/api/admin/finance/payouts?${params.toString()}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        if (!response.ok) throw new Error(`payouts_${response.status}`);
        const data = (await response.json()) as PayoutBundle & {
          capabilities: AdminAuthorPayoutCapabilities;
        };
        if (!controller.signal.aborted) {
          setBundle(data);
          setCapabilities(data.capabilities);
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

  const runAction = useCallback(
    async (
      payoutId: string,
      action: string,
      body?: Record<string, unknown>,
      successMessage?: string,
    ) => {
      setBusyId(payoutId);
      setActionError(null);
      setActionNotice(null);
      try {
        const response = await fetch(
          `/api/admin/finance/payouts/${payoutId}/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {}),
          },
        );
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          outcome?: string;
        };
        if (!response.ok) {
          setActionError(errorMessage(data.error));
          return false;
        }
        setActionNotice(successMessage ?? `Готово: ${data.outcome ?? action}.`);
        reload();
        return true;
      } catch {
        setActionError("Сеть недоступна. Повторите попытку.");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  const reconcile = useCallback(
    async (apply: boolean) => {
      setBusyId("reconcile");
      setActionError(null);
      setActionNotice(null);
      try {
        const response = await fetch("/api/admin/finance/payouts/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apply,
            includeTest: urlState.includeTestPayments,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          found?: number;
          flaggedForReview?: number;
        };
        if (!response.ok) {
          setActionError(errorMessage(data.error));
          return;
        }
        setActionNotice(
          apply
            ? `Проблемных выплат: ${data.found ?? 0}, отправлено на разбор: ${data.flaggedForReview ?? 0}.`
            : `Проблемных выплат найдено: ${data.found ?? 0}. Ничего не изменено.`,
        );
        if (apply) reload();
      } catch {
        setActionError("Сеть недоступна. Повторите попытку.");
      } finally {
        setBusyId(null);
      }
    },
    [reload, urlState.includeTestPayments],
  );

  const summary = bundle?.summary ?? null;
  const allowed = TAB_STATUSES[tab];
  const payoutRows = useMemo(() => {
    const rows = bundle?.payouts.rows ?? [];
    if (allowed.length === 0) return rows;
    return rows.filter((row) => allowed.includes(row.status));
  }, [bundle?.payouts.rows, allowed]);

  /** CSV never carries payee identity or bank data: none of it is stored. */
  function exportPayouts() {
    const csv = buildCsv(
      [
        "payout_id",
        "author_id",
        "author_slug",
        "status",
        "period_label",
        "amount_minor",
        "allocated_minor",
        "minimum_override",
        "external_reference",
        "created_at",
        "paid_at",
        "is_test",
      ],
      payoutRows.map((row) => [
        row.payoutId,
        row.authorId,
        row.authorSlug,
        row.status,
        row.periodLabel,
        row.amountMinor,
        row.allocatedMinor,
        row.minimumOverride ? "1" : "0",
        row.externalReference ?? "",
        row.createdAt ?? "",
        row.paidAt ?? "",
        row.isTest ? "1" : "0",
      ]),
    );
    downloadCsv("audiolad-author-payouts.csv", csv);
  }

  function exportCandidates() {
    const rows = bundle?.candidates.rows ?? [];
    const csv = buildCsv(
      [
        "author_id",
        "slug",
        "available_balance_minor",
        "held_minor",
        "active_reserved_minor",
        "negative_offset_minor",
        "capacity_minor",
        "meets_minimum",
        "open_payout_count",
        "blocker",
      ],
      rows.map((row) => [
        row.authorId,
        row.slug,
        row.availableBalanceMinor,
        row.heldMinor,
        row.activeReservedMinor,
        row.negativeOffsetMinor,
        row.capacityMinor,
        row.meetsMinimum ? "1" : "0",
        row.openPayoutCount,
        row.blocker ?? "",
      ]),
    );
    downloadCsv("audiolad-payout-candidates.csv", csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-[#796ba0]">
          Выплаты считает сервер: доступный остаток минус уже зарезервированные
          суммы. Резерв — это только бронь по записям реестра, деньги уходят из
          реестра одной отрицательной записью и только после подтверждения
          фактического перевода. Банковские реквизиты не хранятся.
        </p>
        {capabilities?.canManagePayouts ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void reconcile(false)}
              disabled={busyId === "reconcile"}
              className="rounded-full border border-[#eadff8] bg-white px-4 py-2 text-sm font-medium text-[#7042c5] disabled:opacity-60"
            >
              Проверить резервы
            </button>
            <button
              type="button"
              onClick={() => void reconcile(true)}
              disabled={busyId === "reconcile"}
              className="rounded-full border border-[#eadff8] bg-white px-4 py-2 text-sm font-medium text-[#7042c5] disabled:opacity-60"
            >
              Отправить проблемные на разбор
            </button>
          </div>
        ) : null}
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
        <p className="text-sm text-[#796ba0]">Загрузка выплат…</p>
      ) : error ? (
        <p className="text-sm text-[#b34f63]">
          Не удалось загрузить выплаты: {error}
        </p>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              {
                key: "capacity",
                label: "Доступно к выплате",
                value: formatRubFromMinor(summary.capacityMinor),
                sub: `минимум ${formatRubFromMinor(summary.minimumMinor)}`,
              },
              {
                key: "reserved",
                label: "Зарезервировано",
                value: formatRubFromMinor(summary.reservedMinor),
                sub: "открытые выплаты",
              },
              {
                key: "paid",
                label: "Выплачено",
                value: formatRubFromMinor(summary.paidMinor),
                sub: `за период ${formatRubFromMinor(summary.paidInPeriodMinor)}`,
              },
              {
                key: "reversed",
                label: "Сторнировано",
                value: formatRubFromMinor(summary.reversedMinor),
                sub: `чисто ${formatRubFromMinor(summary.netPaidMinor)}`,
              },
              {
                key: "candidates",
                label: "Кандидаты",
                value: String(summary.candidateAuthors),
                sub: `выше минимума ${summary.candidateAuthorsAboveMinimum}`,
              },
              {
                key: "review",
                label: "Требуют разбора",
                value: String(summary.requiresReviewCount),
                sub: `период ${summary.periodLabel}`,
              },
            ].map((card) => (
              <div
                key={card.key}
                className="rounded-[18px] border border-[#eadff8] bg-white p-3 shadow-sm"
              >
                <p className="text-xs font-medium text-[#796ba0]">
                  {card.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-[#25135c] sm:text-xl">
                  {card.value}
                </p>
                <p className="mt-1 text-xs text-[#796ba0]">{card.sub}</p>
              </div>
            ))}
          </div>

          {bundle?.integrity?.hasIssues ? (
            <p className="rounded-[14px] border border-[#f0b6c2] bg-[#fbecef] px-3 py-2 text-sm text-[#b34f63]">
              Расхождения в учёте выплат:{" "}
              {Object.entries(bundle.integrity.issues)
                .filter(([, value]) => value > 0)
                .map(([key, value]) => `${key}: ${value}`)
                .join(", ")}
              .
            </p>
          ) : null}

          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Разделы выплат"
          >
            {SUB_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => onPatch({ payoutTab: item.id })}
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

          {tab === "candidates" ? (
            <CandidatesTable
              bundle={bundle?.candidates ?? null}
              canCreate={capabilities?.canCreatePayouts ?? false}
              onCreate={(row) => {
                setActionError(null);
                setActionNotice(null);
                setDraftFor(row);
              }}
              onExport={exportCandidates}
            />
          ) : (
            <PayoutsTable
              rows={payoutRows}
              total={bundle?.payouts.total ?? 0}
              busyId={busyId}
              capabilities={capabilities}
              onExport={exportPayouts}
              onApprove={(row) =>
                void runAction(
                  row.payoutId,
                  "approve",
                  {},
                  "Выплата одобрена. Деньги всё ещё зарезервированы, из реестра не списаны.",
                )
              }
              onProcessing={(row) =>
                void runAction(
                  row.payoutId,
                  "processing",
                  {},
                  "Отмечено как переданное в банк.",
                )
              }
              onPaid={(row) => {
                setActionError(null);
                setActionNotice(null);
                setPaidFor(row);
              }}
              onReason={(payout, action) => {
                setActionError(null);
                setActionNotice(null);
                setReasonFor({ payout, action });
              }}
            />
          )}
        </>
      ) : null}

      {draftFor ? (
        <CreateDraftDialog
          candidate={draftFor}
          canOverrideMinimum={capabilities?.canManagePayouts ?? false}
          onClose={() => setDraftFor(null)}
          onDone={(message) => {
            setDraftFor(null);
            setActionNotice(message);
            reload();
          }}
          onError={(message) => setActionError(message)}
        />
      ) : null}

      {paidFor ? (
        <MarkPaidDialog
          payout={paidFor}
          onClose={() => setPaidFor(null)}
          onSubmit={async (body) => {
            const ok = await runAction(
              paidFor.payoutId,
              "paid",
              body,
              "Выплата подтверждена. В реестр добавлена отрицательная запись.",
            );
            if (ok) setPaidFor(null);
          }}
        />
      ) : null}

      {reasonFor ? (
        <ReasonDialog
          payout={reasonFor.payout}
          action={reasonFor.action}
          onClose={() => setReasonFor(null)}
          onSubmit={async (body) => {
            const ok = await runAction(
              reasonFor.payout.payoutId,
              reasonFor.action,
              body,
            );
            if (ok) setReasonFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CandidatesTable({
  bundle,
  canCreate,
  onCreate,
  onExport,
}: {
  bundle: AdminAuthorPayoutCandidatesBundle | null;
  canCreate: boolean;
  onCreate: (row: AdminAuthorPayoutCandidateRow) => void;
  onExport: () => void;
}) {
  const rows = bundle?.rows ?? [];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#796ba0]">
          Кандидатов: {bundle?.total ?? 0} из {bundle?.payoutEligibleAuthors ?? 0}{" "}
          авторов с правом на выплату. Период {bundle?.periodLabel ?? "—"},
          отсечка {formatDateTime(bundle?.cutoffAt ?? null)}. Удержанные суммы в
          доступное не входят.
        </p>
        <button
          type="button"
          onClick={onExport}
          className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-xs font-medium text-[#7042c5]"
        >
          CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[16px] border border-[#eadff8] bg-white p-4 text-sm text-[#796ba0]">
          Кандидатов нет. Это ожидаемо, пока все продажи принадлежат платформе.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[#eadff8] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[#faf7ff] text-left text-xs text-[#796ba0]">
              <tr>
                <th className="px-3 py-2">Автор</th>
                <th className="px-3 py-2 text-right">Доступно</th>
                <th className="px-3 py-2 text-right">Удержано</th>
                <th className="px-3 py-2 text-right">В резерве</th>
                <th className="px-3 py-2 text-right">Минус-остаток</th>
                <th className="px-3 py-2 text-right">К выплате</th>
                <th className="px-3 py-2">Последняя выплата</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.authorId} className="border-t border-[#f3edfb]">
                  <td className="px-3 py-2">
                    <span className="font-medium text-[#25135c]">
                      {row.name}
                    </span>
                    <span className="ml-2 text-xs text-[#796ba0]">
                      {row.slug}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-[#25135c]">
                    {formatRubFromMinor(row.availableBalanceMinor)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#796ba0]">
                    {formatRubFromMinor(row.heldMinor)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#796ba0]">
                    {formatRubFromMinor(row.activeReservedMinor)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#b34f63]">
                    {row.negativeOffsetMinor > 0
                      ? `−${formatRubFromMinor(row.negativeOffsetMinor)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-[#25135c]">
                    {formatRubFromMinor(row.capacityMinor)}
                  </td>
                  <td className="px-3 py-2 text-xs text-[#796ba0]">
                    {formatDateTime(row.lastPaidAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canCreate ? (
                      <button
                        type="button"
                        onClick={() => onCreate(row)}
                        disabled={row.capacityMinor <= 0}
                        className="rounded-full bg-[#7042c5] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Создать выплату
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PayoutsTable({
  rows,
  total,
  busyId,
  capabilities,
  onExport,
  onApprove,
  onProcessing,
  onPaid,
  onReason,
}: {
  rows: AdminAuthorPayoutRow[];
  total: number;
  busyId: string | null;
  capabilities: AdminAuthorPayoutCapabilities | null;
  onExport: () => void;
  onApprove: (row: AdminAuthorPayoutRow) => void;
  onProcessing: (row: AdminAuthorPayoutRow) => void;
  onPaid: (row: AdminAuthorPayoutRow) => void;
  onReason: (
    row: AdminAuthorPayoutRow,
    action: "cancel" | "failed" | "review" | "reverse",
  ) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#796ba0]">
          Показано {rows.length} из {total} выплат за период.
        </p>
        <button
          type="button"
          onClick={onExport}
          className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-xs font-medium text-[#7042c5]"
        >
          CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[16px] border border-[#eadff8] bg-white p-4 text-sm text-[#796ba0]">
          Выплат в этом разделе нет.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[#eadff8] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[#faf7ff] text-left text-xs text-[#796ba0]">
              <tr>
                <th className="px-3 py-2">Автор</th>
                <th className="px-3 py-2">Период</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2 text-right">Сумма</th>
                <th className="px-3 py-2">Ссылка перевода</th>
                <th className="px-3 py-2">Создана</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const busy = busyId === row.payoutId;
                return (
                  <tr key={row.payoutId} className="border-t border-[#f3edfb]">
                    <td className="px-3 py-2">
                      <span className="font-medium text-[#25135c]">
                        {row.authorName}
                      </span>
                      <span className="ml-2 text-xs text-[#796ba0]">
                        {row.authorSlug}
                      </span>
                      {row.minimumOverride ? (
                        <span className="ml-2 rounded-full bg-[#fff8e8] px-2 py-0.5 text-[11px] text-[#6a5310]">
                          ниже минимума
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-[#796ba0]">
                      {row.periodLabel}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${statusTone(row.status)}`}
                      >
                        {AUTHOR_PAYOUT_STATUS_LABELS[row.status]}
                      </span>
                      {row.reviewReason ? (
                        <span className="ml-2 text-xs text-[#b34f63]">
                          {row.reviewReason}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-[#25135c]">
                      {formatRubFromMinor(row.amountMinor)}
                    </td>
                    <td className="px-3 py-2 text-xs text-[#796ba0]">
                      {row.externalReference ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[#796ba0]">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {capabilities?.canApprovePayouts &&
                        row.status === "draft" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onApprove(row)}
                            className="rounded-full border border-[#eadff8] px-3 py-1 text-xs text-[#7042c5] disabled:opacity-60"
                          >
                            Одобрить
                          </button>
                        ) : null}
                        {capabilities?.canApprovePayouts &&
                        row.status === "approved" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onProcessing(row)}
                            className="rounded-full border border-[#eadff8] px-3 py-1 text-xs text-[#7042c5] disabled:opacity-60"
                          >
                            В банк
                          </button>
                        ) : null}
                        {capabilities?.canMarkPayoutsPaid &&
                        (row.status === "approved" ||
                          row.status === "processing") ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onPaid(row)}
                            className="rounded-full bg-[#7042c5] px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                          >
                            Подтвердить перевод
                          </button>
                        ) : null}
                        {capabilities?.canManagePayouts &&
                        (row.status === "draft" ||
                          row.status === "approved" ||
                          row.status === "requires_review") ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onReason(row, "cancel")}
                            className="rounded-full border border-[#eadff8] px-3 py-1 text-xs text-[#7042c5] disabled:opacity-60"
                          >
                            Отменить
                          </button>
                        ) : null}
                        {capabilities?.canManagePayouts &&
                        (row.status === "approved" ||
                          row.status === "processing") ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onReason(row, "failed")}
                            className="rounded-full border border-[#eadff8] px-3 py-1 text-xs text-[#b34f63] disabled:opacity-60"
                          >
                            Ошибка перевода
                          </button>
                        ) : null}
                        {capabilities?.canManagePayouts &&
                        row.status !== "paid" &&
                        row.status !== "reversed" &&
                        row.status !== "requires_review" &&
                        row.status !== "cancelled" &&
                        row.status !== "failed" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onReason(row, "review")}
                            className="rounded-full border border-[#eadff8] px-3 py-1 text-xs text-[#7042c5] disabled:opacity-60"
                          >
                            На разбор
                          </button>
                        ) : null}
                        {capabilities?.canReversePayouts &&
                        row.status === "paid" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onReason(row, "reverse")}
                            className="rounded-full border border-[#f0b6c2] px-3 py-1 text-xs text-[#b34f63] disabled:opacity-60"
                          >
                            Сторнировать
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateDraftDialog({
  candidate,
  canOverrideMinimum,
  onClose,
  onDone,
  onError,
}: {
  candidate: AdminAuthorPayoutCandidateRow;
  canOverrideMinimum: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [partial, setPartial] = useState(false);
  const [amountRub, setAmountRub] = useState(
    (candidate.capacityMinor / 100).toFixed(2),
  );
  const [allowBelowMinimum, setAllowBelowMinimum] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const desiredMinor = partial ? Math.round(Number(amountRub) * 100) : null;
  const amountValid =
    desiredMinor === null ||
    (Number.isInteger(desiredMinor) &&
      desiredMinor > 0 &&
      desiredMinor <= candidate.capacityMinor);
  const effectiveMinor = desiredMinor ?? candidate.capacityMinor;
  const belowMinimum = effectiveMinor < candidate.minimumMinor;

  async function submit() {
    if (!amountValid) return;
    if (belowMinimum && (!allowBelowMinimum || overrideReason.trim() === "")) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/finance/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorId: candidate.authorId,
          idempotencyKey: `payout:${candidate.authorId}:${effectiveMinor}:${Date.now()}`,
          desiredAmountMinor: desiredMinor,
          allowBelowMinimum: belowMinimum ? allowBelowMinimum : false,
          overrideReason: belowMinimum ? overrideReason.trim() : null,
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
      onDone(
        "Черновик создан, сумма зарезервирована. Из реестра пока ничего не списано.",
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
          Выплата: {candidate.name}
        </h4>
        <p className="text-sm text-[#796ba0]">
          Сервер пересчитает сумму заново в момент создания. Сейчас доступно{" "}
          {formatRubFromMinor(candidate.capacityMinor)} (остаток{" "}
          {formatRubFromMinor(candidate.availableBalanceMinor)} минус резерв{" "}
          {formatRubFromMinor(candidate.activeReservedMinor)}).
        </p>

        <label className="flex items-center gap-2 text-sm text-[#25135c]">
          <input
            type="checkbox"
            checked={partial}
            onChange={(event) => setPartial(event.target.checked)}
          />
          Выплатить часть суммы
        </label>

        {partial ? (
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
        ) : null}

        {belowMinimum ? (
          <div className="space-y-2 rounded-[14px] border border-[#f0d9a8] bg-[#fff8e8] p-3">
            <p className="text-sm text-[#6a5310]">
              Сумма меньше минимума {formatRubFromMinor(candidate.minimumMinor)}.
              Обычно остаток просто переносится на следующий цикл.
            </p>
            {canOverrideMinimum ? (
              <>
                <label className="flex items-center gap-2 text-sm text-[#6a5310]">
                  <input
                    type="checkbox"
                    checked={allowBelowMinimum}
                    onChange={(event) =>
                      setAllowBelowMinimum(event.target.checked)
                    }
                  />
                  Выплатить всё равно
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  placeholder="Причина обхода минимума"
                  className="w-full rounded-[12px] border border-[#eadff8] px-3 py-2 text-sm"
                />
              </>
            ) : (
              <p className="text-sm text-[#6a5310]">
                Обойти минимум может только сотрудник с правом управления
                выплатами.
              </p>
            )}
          </div>
        ) : null}

        <label className="block text-sm text-[#25135c]">
          Комментарий
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
          />
        </label>

        {!amountValid ? (
          <p className="text-sm text-[#b34f63]">
            Сумма должна быть больше нуля и не больше доступной.
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
            disabled={
              submitting ||
              !amountValid ||
              (belowMinimum &&
                (!allowBelowMinimum || overrideReason.trim() === ""))
            }
            onClick={() => void submit()}
            className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Создать черновик
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkPaidDialog({
  payout,
  onClose,
  onSubmit,
}: {
  payout: AdminAuthorPayoutRow;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Typing the amount is deliberate friction: this step is irreversible
  // except through an explicit reversal.
  const expected = (payout.amountMinor / 100).toFixed(2);
  const ready = reference.trim() !== "" && confirmation.trim() === expected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg space-y-3 rounded-[20px] bg-white p-5">
        <h4 className="text-lg font-semibold text-[#25135c]">
          Подтверждение перевода
        </h4>
        <p className="text-sm text-[#796ba0]">
          Платформа не переводит деньги сама. Отмечайте выплату оплаченной
          только после фактического перевода: система спишет{" "}
          {formatRubFromMinor(payout.amountMinor)} из реестра автора{" "}
          {payout.authorName} одной отрицательной записью.
        </p>

        <label className="block text-sm text-[#25135c]">
          Ссылка перевода в банке
          <input
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
          />
        </label>

        <label className="block text-sm text-[#25135c]">
          Дата и время перевода
          <input
            type="datetime-local"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
            className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
          />
        </label>

        <label className="block text-sm text-[#25135c]">
          Введите сумму «{expected}» для подтверждения
          <input
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
          />
        </label>

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
            disabled={submitting || !ready}
            onClick={() => {
              setSubmitting(true);
              void onSubmit({
                externalReference: reference.trim(),
                paidAt: paidAt ? new Date(paidAt).toISOString() : null,
              }).finally(() => setSubmitting(false));
            }}
            className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}

const REASON_DIALOG_COPY: Record<
  "cancel" | "failed" | "review" | "reverse",
  { title: string; hint: string; submit: string }
> = {
  cancel: {
    title: "Отмена выплаты",
    hint: "Резерв вернётся автору. Отменить можно только до перевода.",
    submit: "Отменить выплату",
  },
  failed: {
    title: "Ошибка перевода",
    hint: "Если банк точно отказал — резерв освобождается. Если исход неизвестен, отправьте на разбор: резерв сохранится, чтобы не заплатить дважды.",
    submit: "Записать ошибку",
  },
  review: {
    title: "Отправить на разбор",
    hint: "Резерв сохраняется, выплата ждёт решения.",
    submit: "На разбор",
  },
  reverse: {
    title: "Сторнирование выплаты",
    hint: "Только полный возврат перевода. Частичный возврат оформляется ручной корректировкой реестра.",
    submit: "Сторнировать",
  },
};

function ReasonDialog({
  payout,
  action,
  onClose,
  onSubmit,
}: {
  payout: AdminAuthorPayoutRow;
  action: "cancel" | "failed" | "review" | "reverse";
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const copy = REASON_DIALOG_COPY[action];
  const [reason, setReason] = useState("");
  const [failureCode, setFailureCode] = useState("bank_rejected");
  const [mode, setMode] = useState<"release" | "review">("release");
  const [submitting, setSubmitting] = useState(false);

  const ready =
    action === "cancel" ||
    (action === "failed" ? failureCode.trim() !== "" : reason.trim() !== "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg space-y-3 rounded-[20px] bg-white p-5">
        <h4 className="text-lg font-semibold text-[#25135c]">{copy.title}</h4>
        <p className="text-sm text-[#796ba0]">{copy.hint}</p>
        <p className="text-sm text-[#25135c]">
          {payout.authorName}, {formatRubFromMinor(payout.amountMinor)}, период{" "}
          {payout.periodLabel}.
        </p>

        {action === "failed" ? (
          <>
            <label className="block text-sm text-[#25135c]">
              Код ошибки
              <input
                type="text"
                value={failureCode}
                onChange={(event) => setFailureCode(event.target.value)}
                className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
              />
            </label>
            <label className="block text-sm text-[#25135c]">
              Что делать с резервом
              <select
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value === "review" ? "review" : "release")
                }
                className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
              >
                <option value="release">
                  Банк точно отказал — освободить резерв
                </option>
                <option value="review">
                  Исход неизвестен — оставить резерв и разобраться
                </option>
              </select>
            </label>
          </>
        ) : null}

        <label className="block text-sm text-[#25135c]">
          {action === "failed" ? "Комментарий" : "Причина"}
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded-[12px] border border-[#eadff8] px-3 py-2"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#eadff8] px-4 py-2 text-sm text-[#7042c5]"
          >
            Закрыть
          </button>
          <button
            type="button"
            disabled={submitting || !ready}
            onClick={() => {
              setSubmitting(true);
              const body: Record<string, unknown> =
                action === "failed"
                  ? {
                      failureCode: failureCode.trim(),
                      failureReason: reason.trim() || null,
                      mode,
                    }
                  : { reason: reason.trim() };
              void onSubmit(body).finally(() => setSubmitting(false));
            }}
            className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {copy.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
