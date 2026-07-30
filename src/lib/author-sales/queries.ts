/**
 * Server-only reads for canonical author sales.
 * Caller must already prove membership via requireAuthorFinanceAccess.
 */

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  isAuthorSaleAccrualStatus,
  isAuthorSalePayoutStatus,
  type AuthorSaleCounts,
  type AuthorSaleDetail,
  type AuthorSaleList,
  type AuthorSaleProductOption,
  type AuthorSaleRow,
} from "./types";

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function mapSaleRow(raw: unknown): AuthorSaleRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.sale_id !== "string") return null;

  const accrual = String(row.accrual_status ?? "requires_review");
  const payoutRaw = row.payout_status;
  const payout =
    payoutRaw === null || payoutRaw === undefined
      ? null
      : String(payoutRaw);

  return {
    saleId: row.sale_id,
    paidAt: asText(row.paid_at),
    productTitle: asText(row.product_title) ?? "Продукт",
    buyerFirstName: asText(row.buyer_first_name),
    buyerLastName: asText(row.buyer_last_name),
    amountMinor: asNumber(row.amount_minor),
    refundedAmountMinor: asNumber(row.refunded_amount_minor),
    netAmountMinor: asNumber(row.net_amount_minor),
    refundStatus:
      row.refund_status === "partial" || row.refund_status === "full"
        ? row.refund_status
        : "none",
    currency: String(row.currency ?? "RUB"),
    authorAmountMinor: asNullableNumber(row.author_amount_minor),
    accrualStatus: isAuthorSaleAccrualStatus(accrual)
      ? accrual
      : accrual,
    payoutStatus:
      payout === null
        ? null
        : isAuthorSalePayoutStatus(payout)
          ? payout
          : payout,
  };
}

export type AuthorSalesListQuery = {
  authorId: string;
  from?: string | null;
  to?: string | null;
  productSlug?: string | null;
  accrualStatus?: string | null;
  payoutStatus?: string | null;
  limit?: number;
  offset?: number;
};

export async function getAuthorSalesList(
  input: AuthorSalesListQuery,
): Promise<AuthorSaleList> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("author_canonical_sales_list", {
    p_author_id: input.authorId,
    p_from: input.from ?? null,
    p_to: input.to ?? null,
    p_product_slug: input.productSlug ?? null,
    p_accrual_status: input.accrualStatus ?? null,
    p_payout_status: input.payoutStatus ?? null,
    p_include_test: false,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
  });

  if (error) {
    console.error("author_canonical_sales_list_error");
    throw new Error("author_sales_list_failed");
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const rowsRaw = Array.isArray(payload.rows) ? payload.rows : [];
  const rows = rowsRaw
    .map(mapSaleRow)
    .filter((row): row is AuthorSaleRow => row !== null);

  return {
    total: asNumber(payload.total),
    limit: asNumber(payload.limit, input.limit ?? 50),
    offset: asNumber(payload.offset, input.offset ?? 0),
    rows,
  };
}

export async function getAuthorSaleDetail(input: {
  authorId: string;
  saleId: string;
}): Promise<AuthorSaleDetail | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("author_canonical_sales_detail", {
    p_author_id: input.authorId,
    p_sale_id: input.saleId,
    p_include_test: false,
  });

  if (error) {
    console.error("author_canonical_sales_detail_error");
    throw new Error("author_sales_detail_failed");
  }

  if (!data || typeof data !== "object") return null;
  const base = mapSaleRow(data);
  if (!base) return null;

  return base;
}

export async function getAuthorSalesCounts(input: {
  authorId: string;
  from?: string | null;
  to?: string | null;
}): Promise<AuthorSaleCounts> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("author_canonical_sales_counts", {
    p_author_id: input.authorId,
    p_from: input.from ?? null,
    p_to: input.to ?? null,
    p_include_test: false,
    p_exclude_author_members: true,
  });

  if (error) {
    console.error("author_canonical_sales_counts_error");
    throw new Error("author_sales_counts_failed");
  }

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    grossPurchases: asNumber(row.gross_purchases),
    refundSales: asNumber(row.refund_sales),
    partialRefunds: asNumber(row.partial_refunds),
    fullRefunds: asNumber(row.full_refunds),
    netSales: asNumber(row.net_sales),
    grossRevenueMinor: asNumber(row.gross_revenue_minor),
    refundedAmountMinor: asNumber(row.refunded_amount_minor),
    netRevenueMinor: asNumber(row.net_revenue_minor),
    accrued: asNumber(row.accrued),
    pendingAccrual: asNumber(row.pending_accrual),
  };
}

export async function getAuthorSalesProductOptions(
  authorId: string,
): Promise<AuthorSaleProductOption[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("author_canonical_sales_products", {
    p_author_id: authorId,
    p_include_test: false,
  });

  if (error) {
    console.error("author_canonical_sales_products_error");
    throw new Error("author_sales_products_failed");
  }

  if (!Array.isArray(data)) return [];
  return data
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Record<string, unknown>;
      if (typeof row.product_slug !== "string") return null;
      return {
        productSlug: row.product_slug,
        productTitle: asText(row.product_title) ?? "Продукт",
      };
    })
    .filter((row): row is AuthorSaleProductOption => row !== null);
}

export async function getOrderSaleAccrualReady(orderId: string): Promise<{
  ready: boolean;
  code: string;
}> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("order_sale_accrual_ready", {
    p_order_id: orderId,
  });

  if (error) {
    console.error("order_sale_accrual_ready_error", error.message);
    // Until the canonical-sales migration is applied, do not freeze checkout.
    if (
      /order_sale_accrual_ready/i.test(error.message) ||
      error.code === "PGRST202"
    ) {
      return { ready: true, code: "gate_unavailable" };
    }
    return { ready: false, code: "internal_error" };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ready: row.ready === true,
    code: typeof row.code === "string" ? row.code : "unknown",
  };
}
