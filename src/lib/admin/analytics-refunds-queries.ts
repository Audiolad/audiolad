/**
 * Admin refund read models (P3.3.1).
 * Gross always comes from the P3.1 methodology; this layer only adds refund facts.
 */

import {
  resolveAdminAnalyticsPeriodRange,
  type AdminAnalyticsPeriod,
} from "@/lib/admin/analytics-period";
import {
  mapRefundSettlement,
  type RefundSettlement,
} from "@/lib/payments/refunds/settlement";
import type { RefundStatus } from "@/lib/payments/refunds/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminRefundSummary = {
  currency: string;
  includeTest: boolean;
  paymentCount: number;
  grossMinor: number;
  refundCount: number;
  refundedMinor: number;
  refundedPayments: number;
  netMinor: number;
  partiallyRefundedPayments: number;
  fullyRefundedPayments: number;
  pendingCount: number;
  pendingMinor: number;
  requiresReviewCount: number;
  requiresReviewMinor: number;
  failedCount: number;
  notes: {
    methodology: string;
    gross: string;
    refunds: string;
    net: string;
    providerFees: string;
    authorPayout: string;
    settlementCounts: string;
    queues: string;
  };
};

export type AdminRefundRow = {
  refundId: string;
  paymentId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  status: RefundStatus;
  kind: "partial" | "full" | null;
  reasonCode: string;
  reasonText: string | null;
  accessEffect: string;
  providerRefundId: string | null;
  providerStatus: string | null;
  failureCode: string | null;
  failureMessageSafe: string | null;
  isTest: boolean;
  requestedAt: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  practiceTitle: string;
  practiceSlug: string | null;
  paymentAmountMinor: number;
};

export type AdminRefundListBundle = {
  total: number;
  limit: number;
  offset: number;
  rows: AdminRefundRow[];
  error: string | null;
};

export const EMPTY_ADMIN_REFUND_SUMMARY: AdminRefundSummary = {
  currency: "RUB",
  includeTest: false,
  paymentCount: 0,
  grossMinor: 0,
  refundCount: 0,
  refundedMinor: 0,
  refundedPayments: 0,
  netMinor: 0,
  partiallyRefundedPayments: 0,
  fullyRefundedPayments: 0,
  pendingCount: 0,
  pendingMinor: 0,
  requiresReviewCount: 0,
  requiresReviewMinor: 0,
  failedCount: 0,
  notes: {
    methodology: "cash_activity_in_period",
    gross: "p31_succeeded_confirmed_at_in_period",
    refunds: "refund_succeeded_confirmed_at_in_period",
    net: "gross_minus_refunds_before_fees",
    providerFees: "not_connected",
    authorPayout: "not_connected",
    settlementCounts: "lifetime_settlement_of_payments_refunded_in_period",
    queues: "pending_and_requires_review_are_as_of_now",
  },
};

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function mapSummary(raw: unknown): AdminRefundSummary {
  const row = (raw ?? {}) as Record<string, unknown>;
  const notes = (row.notes ?? {}) as Record<string, unknown>;

  return {
    currency: typeof row.currency === "string" ? row.currency : "RUB",
    includeTest: row.include_test === true,
    paymentCount: asNumber(row.payment_count),
    grossMinor: asNumber(row.gross_minor),
    refundCount: asNumber(row.refund_count),
    refundedMinor: asNumber(row.refunded_minor),
    refundedPayments: asNumber(row.refunded_payments),
    netMinor: asNumber(row.net_minor),
    partiallyRefundedPayments: asNumber(row.partially_refunded_payments),
    fullyRefundedPayments: asNumber(row.fully_refunded_payments),
    pendingCount: asNumber(row.pending_count),
    pendingMinor: asNumber(row.pending_minor),
    requiresReviewCount: asNumber(row.requires_review_count),
    requiresReviewMinor: asNumber(row.requires_review_minor),
    failedCount: asNumber(row.failed_count),
    notes: {
      methodology: String(notes.methodology ?? "cash_activity_in_period"),
      gross: String(notes.gross ?? ""),
      refunds: String(notes.refunds ?? ""),
      net: String(notes.net ?? ""),
      providerFees: String(notes.provider_fees ?? "not_connected"),
      authorPayout: String(notes.author_payout ?? "not_connected"),
      settlementCounts: String(notes.settlement_counts ?? ""),
      queues: String(notes.queues ?? ""),
    },
  };
}

function mapRow(raw: unknown): AdminRefundRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.refund_id !== "string") return null;

  return {
    refundId: row.refund_id,
    paymentId: String(row.payment_id ?? ""),
    orderId: String(row.order_id ?? ""),
    amountMinor: asNumber(row.amount_minor),
    currency: typeof row.currency === "string" ? row.currency : "RUB",
    status: String(row.status ?? "requested") as RefundStatus,
    kind: row.kind === "partial" || row.kind === "full" ? row.kind : null,
    reasonCode: String(row.reason_code ?? ""),
    reasonText: asText(row.reason_text),
    accessEffect: String(row.access_effect ?? "keep"),
    providerRefundId: asText(row.provider_refund_id),
    providerStatus: asText(row.provider_status),
    failureCode: asText(row.failure_code),
    failureMessageSafe: asText(row.failure_message_safe),
    isTest: row.is_test === true,
    requestedAt: asText(row.requested_at),
    submittedAt: asText(row.submitted_at),
    confirmedAt: asText(row.confirmed_at),
    practiceTitle: String(row.practice_title ?? "Без названия"),
    practiceSlug: asText(row.practice_slug),
    paymentAmountMinor: asNumber(row.payment_amount_minor),
  };
}

export async function getAdminRefundSummary(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
}): Promise<AdminRefundSummary> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("admin_refund_p331_summary", {
    p_from: range.from,
    p_to: range.to,
    p_include_test: input.includeTest,
  });

  if (error) {
    console.error("admin_refund_p331_summary_error", error.message);
    return { ...EMPTY_ADMIN_REFUND_SUMMARY, includeTest: input.includeTest };
  }

  return mapSummary(data);
}

export async function getAdminRefundList(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  status?: string | null;
  paymentId?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminRefundListBundle> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("admin_refund_p331_list", {
    p_from: range.from,
    p_to: range.to,
    p_include_test: input.includeTest,
    p_status: input.status ?? null,
    p_payment_id: input.paymentId ?? null,
    p_search: input.search?.trim() || null,
    p_limit: input.limit ?? 25,
    p_offset: input.offset ?? 0,
  });

  if (error) {
    console.error("admin_refund_p331_list_error", error.message);
    return { total: 0, limit: input.limit ?? 25, offset: 0, rows: [], error: "list_failed" };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.rows)
    ? raw.rows.map(mapRow).filter((row): row is AdminRefundRow => row !== null)
    : [];

  return {
    total: asNumber(raw.total),
    limit: asNumber(raw.limit, 25),
    offset: asNumber(raw.offset),
    rows,
    error: null,
  };
}

export async function getAdminPaymentSettlement(
  paymentId: string,
): Promise<RefundSettlement | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "payment_refund_settlement_snapshot",
    { p_payment_id: paymentId },
  );

  if (error) {
    console.error("admin_payment_settlement_error", error.message);
    return null;
  }

  return mapRefundSettlement(data, paymentId);
}
