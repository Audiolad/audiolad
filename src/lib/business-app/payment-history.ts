/**
 * Owner «История оплат» (Sergey t1342u): what the owner paid for АудиоЛад Бизнес.
 * Pure presentation – the rows come from payment-history.server.ts. Times are Moscow (МСК).
 */

export const BUSINESS_PAYMENT_HISTORY_HREF = "/profile/payments";
export const BUSINESS_PAYMENT_HISTORY_LINK_LABEL = "История оплат";
export const BUSINESS_PAYMENT_HISTORY_EMPTY = "Оплат пока нет. Когда вы оплатите доступ, оплата появится здесь.";
export const BUSINESS_PAYMENT_HISTORY_NOTE = "Здесь только прошедшие оплаты. Время – московское (МСК).";

/** Standard price of one venue for 30 days, kopecks (business_subscription_order_scopes default). */
const STANDARD_UNIT_PRICE_MINOR = 79_900;
const MOSCOW_TIMEZONE_ID = "Europe/Moscow";

/** One fulfilled business_subscription order, already limited to the owner's organization. */
export type BusinessPaymentHistoryRow = {
  orderId: string;
  /** Bank confirmation moment (business_subscription_periods.applied_at). */
  paidAt: string;
  amountMinor: number;
  periodStart: string;
  periodEnd: string;
  /** cardinality(location_ids) of the checkout snapshot; 1 for orders before snapshots. */
  venueCount: number;
  /** Per-venue price of the checkout snapshot; 79900 without a partner code. */
  unitPriceMinor: number;
  partnerCode: boolean;
  refunded: boolean;
};

export type BusinessPaymentHistoryItem = {
  orderId: string;
  dateLabel: string;
  timeLabel: string;
  amountRub: number;
  /** The usual price for the same venues, only when a personal price was paid. */
  standardAmountRub: number | null;
  venuesLabel: string;
  periodLabel: string;
  refunded: boolean;
};

export type BusinessPaymentHistoryView = {
  items: BusinessPaymentHistoryItem[];
  /** Sum of the payments that were not refunded, rubles. */
  totalRub: number;
};

function validDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRub(rub: number): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(rub).replace(/\s/g, "\u00a0")}\u00a0₽`;
}

function moscowDate(date: Date, withYear: boolean): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE_ID, day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}),
  }).format(date).replace(/\s*г\.$/, "");
}

function moscowYear(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: MOSCOW_TIMEZONE_ID, year: "numeric" }).format(date).replace(/\D/g, "");
}

export function ruVenuesWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "точка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "точки";
  return "точек";
}

/** «10 ноября – 10 декабря 2026», or both years when the period crosses the new year. */
export function formatBusinessPaidPeriod(startIso: string, endIso: string): string {
  const start = validDate(startIso);
  const end = validDate(endIso);
  if (!start || !end) return "";
  const sameYear = moscowYear(start) === moscowYear(end);
  return `${moscowDate(start, !sameYear)} – ${moscowDate(end, true)}`;
}

export function presentBusinessPaymentHistory(rows: readonly BusinessPaymentHistoryRow[]): BusinessPaymentHistoryView {
  const items = rows
    .map((row) => ({ row, paid: validDate(row.paidAt) }))
    .filter((entry): entry is { row: BusinessPaymentHistoryRow; paid: Date } => entry.paid !== null)
    .sort((a, b) => b.paid.getTime() - a.paid.getTime() || b.row.orderId.localeCompare(a.row.orderId))
    .map(({ row, paid }) => {
      const venues = Math.max(1, Math.trunc(row.venueCount) || 1);
      const amountRub = Math.round(row.amountMinor) / 100;
      const standardRub = (STANDARD_UNIT_PRICE_MINOR * venues) / 100;
      const discounted = row.partnerCode && row.unitPriceMinor < STANDARD_UNIT_PRICE_MINOR && amountRub < standardRub;
      return {
        orderId: row.orderId,
        dateLabel: moscowDate(paid, true),
        timeLabel: `${new Intl.DateTimeFormat("ru-RU", { timeZone: MOSCOW_TIMEZONE_ID, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(paid)} МСК`,
        amountRub,
        standardAmountRub: discounted ? standardRub : null,
        venuesLabel: `${venues} ${ruVenuesWord(venues)}`,
        periodLabel: formatBusinessPaidPeriod(row.periodStart, row.periodEnd),
        refunded: row.refunded,
      };
    });
  const totalRub = items.reduce((sum, item) => (item.refunded ? sum : sum + item.amountRub), 0);
  return { items, totalRub };
}

/* ---------------------------------------------------------------------------
 * Collecting the rows. All three tables are service-role only, so the caller must
 * already be the verified owner of organizationId (see payment-history.server.ts).
 * A payment belongs to the history when its checkout snapshot names this organization,
 * or – for orders paid before snapshots existed – when it has no snapshot and was paid
 * by this owner. A snapshot of another organization never shows here.
 * Test payments (opens_access = false) did not add days and are not listed.
 * ------------------------------------------------------------------------- */

export type PaymentHistoryScopeRow = {
  order_id: string;
  organization_id: string;
  location_ids: unknown;
  unit_price_minor: number | null;
  partner_code_id: string | null;
};

export type PaymentHistoryPeriodRow = {
  order_id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  amount_minor: number;
  opens_access: boolean;
  applied_at: string;
};

export type PaymentHistoryOrderRow = {
  id: string;
  user_id: string;
  status: string;
  order_kind: string | null;
  paid_at: string | null;
};

export type PaymentHistoryReader = {
  scopesForOrganization(organizationId: string): Promise<PaymentHistoryScopeRow[]>;
  scopesForOrders(orderIds: string[]): Promise<PaymentHistoryScopeRow[]>;
  realPeriodsForOrders(orderIds: string[]): Promise<PaymentHistoryPeriodRow[]>;
  realPeriodsForUser(userId: string): Promise<PaymentHistoryPeriodRow[]>;
  ordersByIds(orderIds: string[]): Promise<PaymentHistoryOrderRow[]>;
};

export async function collectBusinessPaymentHistoryRows(
  reader: PaymentHistoryReader,
  input: { userId: string; organizationId: string },
): Promise<BusinessPaymentHistoryRow[]> {
  const { userId, organizationId } = input;
  if (!userId || !organizationId) return [];

  const orgScopes = await reader.scopesForOrganization(organizationId);
  const orgOrderIds = orgScopes.filter((s) => s.organization_id === organizationId).map((s) => s.order_id);
  const [byOrder, byUser] = await Promise.all([
    orgOrderIds.length ? reader.realPeriodsForOrders(orgOrderIds) : Promise.resolve([]),
    reader.realPeriodsForUser(userId),
  ]);
  const periods = new Map<string, PaymentHistoryPeriodRow>();
  for (const p of [...byOrder, ...byUser]) if (p.opens_access === true) periods.set(p.order_id, p);
  if (!periods.size) return [];

  const ids = [...periods.keys()];
  const [scopes, orders] = await Promise.all([reader.scopesForOrders(ids), reader.ordersByIds(ids)]);
  const scopeByOrder = new Map(scopes.map((s) => [s.order_id, s]));
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const rows: BusinessPaymentHistoryRow[] = [];
  for (const period of periods.values()) {
    const order = orderById.get(period.order_id);
    if (!order || order.order_kind !== "business_subscription") continue;
    if (order.status !== "paid" && order.status !== "refunded") continue;
    const scope = scopeByOrder.get(period.order_id) ?? null;
    if (scope ? scope.organization_id !== organizationId : period.user_id !== userId || order.user_id !== userId) continue;
    const venueCount = scope && Array.isArray(scope.location_ids) ? scope.location_ids.length : 1;
    rows.push({
      orderId: period.order_id,
      paidAt: period.applied_at || order.paid_at || "",
      amountMinor: Number(period.amount_minor),
      periodStart: period.period_start,
      periodEnd: period.period_end,
      venueCount,
      unitPriceMinor: Number(scope?.unit_price_minor ?? STANDARD_UNIT_PRICE_MINOR),
      partnerCode: Boolean(scope?.partner_code_id),
      refunded: order.status === "refunded",
    });
  }
  return rows;
}
