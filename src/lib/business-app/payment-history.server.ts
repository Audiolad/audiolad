import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  collectBusinessPaymentHistoryRows,
  presentBusinessPaymentHistory,
  type BusinessPaymentHistoryView,
  type PaymentHistoryOrderRow,
  type PaymentHistoryPeriodRow,
  type PaymentHistoryReader,
  type PaymentHistoryScopeRow,
} from "./payment-history";

type Db = ReturnType<typeof createServiceRoleClient>;

const SCOPE_COLUMNS = "order_id, organization_id, location_ids, unit_price_minor, partner_code_id";
const PERIOD_COLUMNS = "order_id, user_id, period_start, period_end, amount_minor, opens_access, applied_at";
const ID_CHUNK = 200;
const PAGE = 1000;

function chunks(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(ids.slice(i, i + ID_CHUNK));
  return out;
}

function must<T>(result: { data: unknown; error: unknown }): T[] {
  if (result.error) throw new Error("business_payment_history_unavailable");
  return (result.data ?? []) as T[];
}

async function byIdChunks<T>(ids: string[], read: (part: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const parts = await Promise.all(chunks(ids).map((part) => read(part)));
  return parts.flatMap((result) => must<T>(result));
}

/** Read-only, service role: orders, business_subscription_periods, business_subscription_order_scopes. */
export function createPaymentHistoryReader(db: Db): PaymentHistoryReader {
  return {
    scopesForOrders(orderIds) {
      return byIdChunks<PaymentHistoryScopeRow>(orderIds, (part) =>
        db.from("business_subscription_order_scopes").select(SCOPE_COLUMNS).in("order_id", part));
    },
    async realPeriodsForUser(userId) {
      // Paged, newest first: a long history is never cut silently.
      const rows: PaymentHistoryPeriodRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const page = must<PaymentHistoryPeriodRow>(await db.from("business_subscription_periods")
          .select(PERIOD_COLUMNS).eq("user_id", userId).eq("opens_access", true)
          .order("applied_at", { ascending: false }).order("order_id", { ascending: false })
          .range(from, from + PAGE - 1));
        rows.push(...page);
        if (page.length < PAGE) return rows;
      }
    },
    ordersByIds(orderIds) {
      return byIdChunks<PaymentHistoryOrderRow>(orderIds, (part) =>
        db.from("orders").select("id, user_id, status, order_kind, paid_at").in("id", part)
          .eq("order_kind", "business_subscription"));
    },
  };
}

/**
 * The caller must be the verified owner (role = owner) of organizationId; the page checks
 * that with the caller's own session (RLS) before calling this.
 */
export async function loadBusinessPaymentHistory(input: { userId: string; organizationId: string }): Promise<BusinessPaymentHistoryView> {
  const rows = await collectBusinessPaymentHistoryRows(createPaymentHistoryReader(createServiceRoleClient()), input);
  return presentBusinessPaymentHistory(rows);
}
