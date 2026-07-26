"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildCsv, downloadCsv } from "@/lib/admin/analytics-csv";
import {
  ADMIN_MONEY_PROVIDER_FEES_NOTE,
  ADMIN_REFUND_ACCESS_NOTE,
  ADMIN_REFUND_REAL_MONEY_WARNING,
  ADMIN_REFUND_REASON_LABELS,
  ADMIN_REFUND_STATUS_LABELS,
} from "@/lib/admin/analytics-money-dictionary";
import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import type {
  AdminRefundListBundle,
  AdminRefundRow,
  AdminRefundSummary,
} from "@/lib/admin/analytics-refunds-queries";
import { ADMIN_ANALYTICS_PERIOD_OPTIONS } from "@/lib/admin/analytics-period";
import {
  buildAdminAnalyticsSearchParams,
  type AdminAnalyticsUrlState,
} from "@/lib/admin/analytics-url-state";
import type { RefundSettlement } from "@/lib/payments/refunds/settlement";
import {
  classifyRefundKind,
  predictRefundAccessEffect,
  validateRefundAmount,
} from "@/lib/payments/refunds/settlement";
import { REFUND_REASON_CODES } from "@/lib/payments/refunds/types";

type RefundsBundle = {
  summary: AdminRefundSummary;
  list: AdminRefundListBundle;
  paymentSettlement: RefundSettlement | null;
  canManage: boolean;
};

const STATUS_FILTERS = [
  { id: null, label: "Все" },
  { id: "requested", label: "Запрошены" },
  { id: "submitted", label: "Отправлены" },
  { id: "pending", label: "В обработке" },
  { id: "succeeded", label: "Подтверждены" },
  { id: "requires_review", label: "Требуют проверки" },
  { id: "failed", label: "Отклонены" },
  { id: "cancelled", label: "Отменены" },
] as const;

const AMOUNT_VALIDATION_MESSAGES: Record<string, string> = {
  amount_must_be_positive: "Сумма должна быть больше нуля.",
  amount_must_be_integer: "Сумма указывается в копейках, без дробной части.",
  no_refundable_amount: "По этой оплате возвращать нечего.",
  refund_amount_exceeds_refundable: "Сумма больше доступного остатка.",
};

const API_ERROR_MESSAGES: Record<string, string> = {
  payment_not_found: "Оплата не найдена.",
  payment_not_succeeded: "Вернуть можно только успешную оплату.",
  payment_not_confirmed: "Оплата ещё не подтверждена провайдером.",
  test_payment_refund_not_allowed:
    "Это тестовая оплата. Включите тестовый режим, чтобы продолжить.",
  refund_amount_exceeds_refundable: "Сумма больше доступного остатка.",
  no_refundable_amount: "По этой оплате возвращать нечего.",
  reason_text_required: "Для причины «Другое» нужен комментарий.",
  invalid_reason_code: "Выберите причину возврата.",
  refund_not_cancellable: "Возврат уже отправлен провайдеру и не отменяется.",
  provider_status_unavailable: "Точка не ответила. Повторите сверку позже.",
  forbidden: "Недостаточно прав: нужно разрешение refunds.manage.",
};

function statusTone(status: string): string {
  if (status === "succeeded") return "bg-[#e8f5ed] text-[#2f7d4a]";
  if (status === "failed" || status === "cancelled") return "bg-[#fbecef] text-[#b34f63]";
  if (status === "requires_review") return "bg-[#fff8e8] text-[#6a5310]";
  return "bg-[#f1e9fb] text-[#7042c5]";
}

function errorMessage(code: string | null | undefined): string {
  if (!code) return "Не удалось выполнить действие.";
  return API_ERROR_MESSAGES[code] ?? `Ошибка: ${code}`;
}

export default function AdminRefundsPanel({
  urlState,
  onPatch,
}: {
  urlState: AdminAnalyticsUrlState;
  onPatch: (patch: Partial<AdminAnalyticsUrlState>) => void;
}) {
  const [bundle, setBundle] = useState<RefundsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busyRefundId, setBusyRefundId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchKey = [
    urlState.moneyPeriod,
    urlState.includeTestPayments ? "1" : "0",
    urlState.refundsStatus ?? "",
    urlState.refundsQ,
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
        const response = await fetch(`/api/admin/refunds?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`refunds_${response.status}`);
        const data = (await response.json()) as RefundsBundle;
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

  const runAction = useCallback(
    async (refundId: string, action: "reconcile" | "cancel") => {
      setBusyRefundId(refundId);
      setActionError(null);
      setActionNotice(null);
      try {
        const response = await fetch(`/api/admin/refunds/${refundId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          outcome?: string;
        };
        if (!response.ok) {
          setActionError(errorMessage(data.error));
          return;
        }
        setActionNotice(
          action === "cancel"
            ? "Возврат отменён, резерв освобождён."
            : `Сверка выполнена: ${data.outcome ?? "готово"}.`,
        );
        reload();
      } catch {
        setActionError("Сеть недоступна. Повторите попытку.");
      } finally {
        setBusyRefundId(null);
      }
    },
    [reload],
  );

  function exportRows(rows: AdminRefundRow[]) {
    const csv = buildCsv(
      [
        "refund_id",
        "payment_id",
        "status",
        "kind",
        "amount_minor",
        "formatted_amount",
        "currency",
        "reason_code",
        "access_effect",
        "practice_slug",
        "requested_at",
        "confirmed_at",
        "is_test",
      ],
      rows.map((row) => [
        row.refundId,
        row.paymentId,
        row.status,
        row.kind ?? "",
        row.amountMinor,
        formatRubFromMinor(row.amountMinor),
        row.currency,
        row.reasonCode,
        row.accessEffect,
        row.practiceSlug ?? "",
        row.requestedAt ?? "",
        row.confirmedAt ?? "",
        row.isTest ? "1" : "0",
      ]),
    );
    downloadCsv("audiolad-refunds.csv", csv);
  }

  const summary = bundle?.summary ?? null;
  const rows = bundle?.list.rows ?? [];
  const canManage = bundle?.canManage ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[19px] font-semibold text-[#25135c]">Возвраты</h3>
          <p className="mt-1 max-w-3xl text-sm text-[#796ba0]">
            Отдельный слой фактов. Валовая сумма оплат (P3.1) не меняется после
            возврата, статус платежа остаётся «успешно». {ADMIN_REFUND_ACCESS_NOTE}
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
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setActionNotice(null);
                setDialogOpen(true);
              }}
              className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white"
            >
              Создать возврат
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Период возвратов">
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
        <p className="text-sm text-[#796ba0]">Загрузка возвратов…</p>
      ) : error ? (
        <p className="text-sm text-[#b34f63]">Не удалось загрузить возвраты: {error}</p>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              {
                label: "Получено оплат (P3.1)",
                value: formatRubFromMinor(summary.grossMinor),
                sub: `${summary.paymentCount} оплат`,
              },
              {
                label: "Возвраты подтверждённые",
                value: formatRubFromMinor(summary.refundedMinor),
                sub: `${summary.refundCount} шт.`,
              },
              {
                label: "Чистые поступления",
                value: formatRubFromMinor(summary.netMinor),
                sub: "до комиссий",
              },
              {
                label: "Комиссия провайдера",
                value: ADMIN_MONEY_PROVIDER_FEES_NOTE,
                sub: "—",
              },
              {
                label: "В процессе",
                value: String(summary.pendingCount),
                sub: formatRubFromMinor(summary.pendingMinor),
              },
              {
                label: "Требуют проверки",
                value: String(summary.requiresReviewCount),
                sub: formatRubFromMinor(summary.requiresReviewMinor),
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-[18px] border border-[#eadff8] bg-white p-3 shadow-sm"
              >
                <p className="text-xs font-medium text-[#796ba0]">{card.label}</p>
                <p className="mt-1 text-lg font-semibold text-[#25135c] sm:text-xl">
                  {card.value}
                </p>
                <p className="mt-1 text-xs text-[#796ba0]">{card.sub}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-[#796ba0]">
            Полностью возвращено оплат: {summary.fullyRefundedPayments}. Частично:{" "}
            {summary.partiallyRefundedPayments}. Счётчики «в процессе» и «требуют
            проверки» показаны на текущий момент, а не за период.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((filter) => {
              const active = (urlState.refundsStatus ?? null) === filter.id;
              return (
                <button
                  key={filter.label}
                  type="button"
                  onClick={() => onPatch({ refundsStatus: filter.id })}
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
            <button
              type="button"
              className="rounded-full border border-[#eadff8] bg-white px-3 py-1.5 text-sm text-[#7042c5]"
              onClick={() => exportRows(rows)}
            >
              CSV возвраты
            </button>
          </div>

          <input
            value={urlState.refundsQ}
            onChange={(event) => onPatch({ refundsQ: event.target.value })}
            placeholder="Поиск по продукту, slug или причине"
            className="w-full rounded-[14px] border border-[#eadff8] bg-white px-3 py-2 text-sm text-[#25135c]"
          />

          {rows.length === 0 ? (
            <p className="rounded-[16px] border border-[#eadff8] bg-white px-4 py-6 text-sm text-[#796ba0]">
              За выбранный период возвратов не было.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-[16px] border border-[#eadff8] bg-white">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-[#faf7ff] text-[#796ba0]">
                  <tr>
                    <th className="px-3 py-2">Продукт</th>
                    <th className="px-3 py-2">Сумма</th>
                    <th className="px-3 py-2">Из оплаты</th>
                    <th className="px-3 py-2">Тип</th>
                    <th className="px-3 py-2">Статус</th>
                    <th className="px-3 py-2">Причина</th>
                    <th className="px-3 py-2">Доступ</th>
                    <th className="px-3 py-2">Запрошен</th>
                    <th className="px-3 py-2">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.refundId} className="border-t border-[#f1e9fb]">
                      <td className="px-3 py-2 text-[#25135c]">
                        {row.practiceTitle}
                        {row.isTest ? (
                          <span className="ml-2 rounded-full bg-[#fff8e8] px-2 py-0.5 text-xs text-[#6a5310]">
                            test
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium">
                        {formatRubFromMinor(row.amountMinor)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-[#796ba0]">
                        {formatRubFromMinor(row.paymentAmountMinor)}
                      </td>
                      <td className="px-3 py-2">
                        {row.kind === "full" ? "Полный" : "Частичный"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(row.status)}`}
                          title={row.failureMessageSafe ?? row.providerStatus ?? undefined}
                        >
                          {ADMIN_REFUND_STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[#796ba0]">
                        {ADMIN_REFUND_REASON_LABELS[row.reasonCode] ?? row.reasonCode}
                      </td>
                      <td className="px-3 py-2 text-[#796ba0]">
                        {row.accessEffect === "manual_review"
                          ? "Нужно решение"
                          : "Сохранён"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-[#796ba0]">
                        {row.requestedAt
                          ? new Date(row.requestedAt).toLocaleString("ru-RU")
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {canManage ? (
                          <div className="flex flex-wrap gap-1">
                            {row.status === "requested" ? (
                              <button
                                type="button"
                                disabled={busyRefundId === row.refundId}
                                onClick={() => runAction(row.refundId, "cancel")}
                                className="rounded-full border border-[#eadff8] px-2 py-1 text-xs text-[#7042c5] disabled:opacity-50"
                              >
                                Отменить
                              </button>
                            ) : null}
                            {row.status === "submitted" ||
                            row.status === "pending" ||
                            row.status === "requires_review" ? (
                              <button
                                type="button"
                                disabled={busyRefundId === row.refundId}
                                onClick={() => runAction(row.refundId, "reconcile")}
                                className="rounded-full border border-[#eadff8] px-2 py-1 text-xs text-[#7042c5] disabled:opacity-50"
                              >
                                Сверить
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-[#796ba0]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-[#796ba0]">
            Показано {rows.length} из {bundle?.list.total ?? 0}. Возвраты по тестовым
            оплатам скрыты по умолчанию.
          </p>
        </>
      ) : null}

      {dialogOpen ? (
        <CreateRefundDialog
          includeTest={urlState.includeTestPayments}
          onClose={() => setDialogOpen(false)}
          onCreated={(message) => {
            setDialogOpen(false);
            setActionNotice(message);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateRefundDialog({
  includeTest,
  onClose,
  onCreated,
}: {
  includeTest: boolean;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [paymentId, setPaymentId] = useState("");
  const [settlement, setSettlement] = useState<RefundSettlement | null>(null);
  const [loadingSettlement, setLoadingSettlement] = useState(false);
  const [amountRubles, setAmountRubles] = useState("");
  const [reasonCode, setReasonCode] = useState<string>("customer_request");
  const [reasonText, setReasonText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const amountMinor = useMemo(() => {
    const normalized = amountRubles.replace(",", ".").trim();
    if (normalized === "") return Number.NaN;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return Number.NaN;
    return Math.round(parsed * 100);
  }, [amountRubles]);

  const validation = useMemo(() => {
    if (!settlement) return null;
    if (Number.isNaN(amountMinor)) return null;
    return validateRefundAmount(amountMinor, settlement.refundableMinor);
  }, [amountMinor, settlement]);

  const preview = useMemo(() => {
    if (!settlement || Number.isNaN(amountMinor) || amountMinor <= 0) return null;
    return {
      kind: classifyRefundKind(amountMinor, settlement.refundableMinor),
      accessEffect: predictRefundAccessEffect({
        amountMinor,
        grossMinor: settlement.grossMinor,
        confirmedRefundedMinor: settlement.confirmedRefundedMinor,
      }),
    };
  }, [amountMinor, settlement]);

  async function loadSettlement() {
    const trimmed = paymentId.trim();
    if (trimmed === "") return;
    setLoadingSettlement(true);
    setDialogError(null);
    setSettlement(null);
    try {
      const response = await fetch(
        `/api/admin/payments/${encodeURIComponent(trimmed)}/refunds`,
        { headers: { Accept: "application/json" } },
      );
      const data = (await response.json().catch(() => ({}))) as {
        settlement?: RefundSettlement;
        error?: string;
      };
      if (!response.ok || !data.settlement) {
        setDialogError(errorMessage(data.error ?? "payment_not_found"));
        return;
      }
      setSettlement(data.settlement);
      setAmountRubles((data.settlement.refundableMinor / 100).toFixed(2));
    } catch {
      setDialogError("Не удалось загрузить данные оплаты.");
    } finally {
      setLoadingSettlement(false);
    }
  }

  async function submit() {
    if (!settlement) return;
    setSubmitting(true);
    setDialogError(null);
    try {
      const response = await fetch(
        `/api/admin/payments/${encodeURIComponent(settlement.paymentId)}/refunds`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountMinor,
            reasonCode,
            reasonText: reasonText.trim() || null,
            allowTest: settlement.isTest && includeTest,
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        outcome?: string;
      };
      if (!response.ok) {
        setDialogError(errorMessage(data.error));
        setConfirming(false);
        return;
      }
      onCreated(`Возврат создан: ${data.outcome ?? "отправлен"}.`);
    } catch {
      setDialogError("Сеть недоступна. Проверьте статус возврата перед повтором.");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  const blockedByTest = settlement?.isTest === true && !includeTest;
  const reasonTextRequired = reasonCode === "other" && reasonText.trim() === "";
  const canSubmit =
    settlement !== null &&
    validation?.ok === true &&
    !reasonTextRequired &&
    !blockedByTest &&
    !submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Создать возврат"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 sm:items-center"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[20px] bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-lg font-semibold text-[#25135c]">Создать возврат</h4>
          <button
            type="button"
            className="rounded-full border border-[#eadff8] px-3 py-1 text-sm"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm text-[#25135c]">
            ID платежа
            <div className="mt-1 flex gap-2">
              <input
                value={paymentId}
                onChange={(event) => setPaymentId(event.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="w-full rounded-[14px] border border-[#eadff8] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={loadSettlement}
                disabled={loadingSettlement || paymentId.trim() === ""}
                className="whitespace-nowrap rounded-[14px] border border-[#eadff8] px-3 py-2 text-sm text-[#7042c5] disabled:opacity-50"
              >
                {loadingSettlement ? "Загрузка…" : "Проверить"}
              </button>
            </div>
          </label>

          {dialogError ? (
            <p
              className="rounded-[14px] border border-[#f0b6c2] bg-[#fbecef] px-3 py-2 text-sm text-[#b34f63]"
              role="alert"
            >
              {dialogError}
            </p>
          ) : null}

          {settlement ? (
            <>
              <div className="rounded-[16px] border border-[#eadff8] bg-[#faf7ff] p-3 text-sm">
                <p className="text-[#25135c]">
                  Оплата: {formatRubFromMinor(settlement.grossMinor)} ·{" "}
                  {settlement.paymentStatus}
                </p>
                <p className="mt-1 text-[#796ba0]">
                  Уже возвращено: {formatRubFromMinor(settlement.confirmedRefundedMinor)} ·
                  Зарезервировано: {formatRubFromMinor(settlement.reservedMinor)}
                </p>
                <p className="mt-1 font-medium text-[#25135c]">
                  Доступно к возврату: {formatRubFromMinor(settlement.refundableMinor)}
                </p>
                {settlement.isTest ? (
                  <p className="mt-1 text-[#6a5310]">
                    Тестовая оплата.{" "}
                    {includeTest
                      ? "Тестовый режим включён — возврат разрешён."
                      : "Включите «Тестовые» в фильтрах, чтобы разрешить возврат."}
                  </p>
                ) : null}
              </div>

              <label className="block text-sm text-[#25135c]">
                Сумма возврата, ₽
                <div className="mt-1 flex gap-2">
                  <input
                    value={amountRubles}
                    onChange={(event) => setAmountRubles(event.target.value)}
                    inputMode="decimal"
                    className="w-full rounded-[14px] border border-[#eadff8] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAmountRubles((settlement.refundableMinor / 100).toFixed(2))
                    }
                    className="whitespace-nowrap rounded-[14px] border border-[#eadff8] px-3 py-2 text-sm text-[#7042c5]"
                  >
                    Весь остаток
                  </button>
                </div>
              </label>

              {validation && !validation.ok ? (
                <p className="text-sm text-[#b34f63]" role="alert">
                  {AMOUNT_VALIDATION_MESSAGES[validation.error] ?? validation.error}
                </p>
              ) : null}

              <label className="block text-sm text-[#25135c]">
                Причина
                <select
                  value={reasonCode}
                  onChange={(event) => setReasonCode(event.target.value)}
                  className="mt-1 w-full rounded-[14px] border border-[#eadff8] px-3 py-2 text-sm"
                >
                  {REFUND_REASON_CODES.map((code) => (
                    <option key={code} value={code}>
                      {ADMIN_REFUND_REASON_LABELS[code] ?? code}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-[#25135c]">
                Комментарий{reasonCode === "other" ? " (обязательно)" : ""}
                <textarea
                  value={reasonText}
                  onChange={(event) => setReasonText(event.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-[14px] border border-[#eadff8] px-3 py-2 text-sm"
                />
              </label>

              {preview ? (
                <div className="rounded-[16px] border border-[#eadff8] bg-white p-3 text-sm">
                  <p className="text-[#25135c]">
                    Тип: {preview.kind === "full" ? "полный" : "частичный"}
                  </p>
                  <p className="mt-1 text-[#796ba0]">
                    Доступ:{" "}
                    {preview.accessEffect === "manual_review"
                      ? "оплата будет закрыта полностью — потребуется отдельное решение по доступу"
                      : "остаётся у покупателя"}
                  </p>
                  <p className="mt-1 text-xs text-[#796ba0]">{ADMIN_REFUND_ACCESS_NOTE}</p>
                </div>
              ) : null}

              {confirming ? (
                <div
                  className="rounded-[16px] border border-[#f0d48a] bg-[#fff8e8] p-3 text-sm text-[#6a5310]"
                  role="alert"
                >
                  <p className="font-medium">{ADMIN_REFUND_REAL_MONEY_WARNING}</p>
                  <p className="mt-1">
                    {formatRubFromMinor(amountMinor)} по оплате{" "}
                    {formatRubFromMinor(settlement.grossMinor)}. Действие необратимо.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={!canSubmit}
                      className="rounded-full bg-[#b34f63] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {submitting ? "Отправка…" : "Подтвердить возврат"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={submitting}
                      className="rounded-full border border-[#eadff8] bg-white px-4 py-2 text-sm"
                    >
                      Назад
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={!canSubmit}
                  className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Продолжить
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
