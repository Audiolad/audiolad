type Json = Record<string, unknown>;

export type ParsedGetCourseCallback = {
  dealId: string | null;
  dealNumber: string | null;
  offerId: string | null;
  offerIds: string[];
  offerFieldPresent: boolean;
  amountMinor: number | null;
  status: string | null;
  payedMoneyMinor: number | null;
  leftCostMoneyMinor: number | null;
};

export type GetCourseCallbackIgnoreReason =
  | "missing_deal_identifier"
  | "missing_amount"
  | "status_not_payed"
  | "partial_payment"
  | "unknown_deal"
  | "ambiguous_deal";

export type GetCoursePaidClass = "paid" | "partial" | "unpaid" | "void" | "unknown";

export const GETCOURSE_CANONICAL_PAID_STATUS = "payed";

const PAID_STATUS_TOKENS = new Set([
  "payed",
  "paid",
  "completed",
  "complete",
  "finished",
  "done",
  "завершен",
  "завершён",
  "завершено",
  "завершена",
  "оплачен",
  "оплачено",
  "оплачена",
]);

const PARTIAL_STATUS_TOKENS = new Set([
  "part_payed",
  "part-payed",
  "part_paid",
  "partial",
  "partially_paid",
  "частично",
  "частично оплачен",
  "частично оплачено",
  "частично оплачена",
]);

const VOID_STATUS_TOKENS = new Set([
  "cancelled",
  "canceled",
  "false",
  "отменен",
  "отменён",
  "отменено",
  "отменена",
  "ложный",
  "ложная",
]);

const UNPAID_STATUS_TOKENS = new Set([
  "new",
  "payment_waiting",
  "not_confirmed",
  "pending",
  "in_work",
  "waiting_for_return",
  "новый",
  "новая",
  "новое",
  "ожидает оплаты",
  "не подтвержден",
  "не подтверждён",
  "в работе",
  "ожидает возврата",
]);

function normalizeStatusToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function classifyGetCourseDealStatus(status: string | null): GetCoursePaidClass {
  if (!status) return "unknown";
  const token = normalizeStatusToken(status);
  if (!token || token === "{object.status}") return "unknown";
  if (PAID_STATUS_TOKENS.has(token)) return "paid";
  if (PARTIAL_STATUS_TOKENS.has(token)) return "partial";
  if (VOID_STATUS_TOKENS.has(token)) return "void";
  if (UNPAID_STATUS_TOKENS.has(token)) return "unpaid";
  return "unknown";
}

export function classifyGetCoursePaymentCompleteness(input: {
  amountMinor: number | null;
  payedMoneyMinor: number | null;
  leftCostMoneyMinor: number | null;
}): GetCoursePaidClass {
  const { amountMinor, payedMoneyMinor, leftCostMoneyMinor } = input;
  if (leftCostMoneyMinor !== null && leftCostMoneyMinor > 0) {
    return payedMoneyMinor !== null && payedMoneyMinor > 0 ? "partial" : "unpaid";
  }
  if (amountMinor !== null && payedMoneyMinor !== null && payedMoneyMinor < amountMinor) {
    return payedMoneyMinor <= 0 ? "unpaid" : "partial";
  }
  if (
    amountMinor !== null &&
    amountMinor > 0 &&
    payedMoneyMinor !== null &&
    payedMoneyMinor >= amountMinor &&
    (leftCostMoneyMinor === null || leftCostMoneyMinor === 0)
  ) {
    return "paid";
  }
  if (leftCostMoneyMinor === 0 && payedMoneyMinor !== null && payedMoneyMinor > 0) {
    return "paid";
  }
  return "unknown";
}

/**
 * Canonical fully-paid only. Official API code is `payed`; Process
 * `{object.status}` may be localized, `paid`, or `completed`. Money fields
 * are an independent provider confirmation. Void statuses never promote.
 * Partial / unpaid never promote.
 */
export function isProviderConfirmedFullyPaid(input: {
  status: string | null;
  amountMinor: number | null;
  payedMoneyMinor: number | null;
  leftCostMoneyMinor: number | null;
}): boolean {
  const money = classifyGetCoursePaymentCompleteness(input);
  if (money === "partial" || money === "unpaid") return false;
  const status = classifyGetCourseDealStatus(input.status);
  if (status === "void") return false;
  if (status === "partial" && money !== "paid") return false;
  if (status === "paid") return true;
  return money === "paid";
}

export type GetCourseCallbackApplyArgs = {
  providerDealId: string | null;
  providerDealNumber: string | null;
  offerId: string;
  amountMinor: number;
  status: string;
  payedMoneyMinor: number | null;
  leftCostMoneyMinor: number | null;
};

export type GetCourseCallbackDecision =
  | { action: "apply"; args: GetCourseCallbackApplyArgs; usedDealCorrelation: boolean }
  | { action: "ignore"; reason: GetCourseCallbackIgnoreReason };

const OFFER_ID_TOKEN = /^[A-Za-z0-9._:-]{1,64}$/;

export function record(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

export function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  }
  return null;
}

function hasFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function isOfferIdToken(value: string): boolean {
  return OFFER_ID_TOKEN.test(value);
}

export function extractOfferIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const item = record(entry);
      const found = firstString(item?.offer_id, item?.id, item?.offers, entry);
      return found ? extractOfferIds(found) : [];
    });
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return [String(value)];
  }
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(/[,;|\s]+/)
    .map((part) => part.trim())
    .filter(isOfferIdToken);
}

export function rublesToMinor(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value * 100;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    const wholeRubles = Math.round(value);
    if (Math.abs(value - wholeRubles) < 1e-9 && Number.isSafeInteger(wholeRubles)) {
      return wholeRubles * 100;
    }
    return null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value
    .trim()
    .replace(/[₽]/g, "")
    .replace(/\bруб(?:лей|ля|ль)?\b/gi, "")
    .replace(/\bRUB\b/gi, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  if (/^\d+$/.test(trimmed)) {
    const wholeRubles = Number(trimmed);
    return Number.isSafeInteger(wholeRubles) ? wholeRubles * 100 : null;
  }
  if (/^\d+\.0+$/.test(trimmed)) {
    const wholeRubles = Number(trimmed.slice(0, trimmed.indexOf(".")));
    return Number.isSafeInteger(wholeRubles) ? wholeRubles * 100 : null;
  }
  return null;
}

export function parseGetCourseCallback(payload: unknown): ParsedGetCourseCallback {
  const root = record(payload);
  const data = record(root?.data);
  const deal = record(root?.deal) ?? record(data?.deal);
  const offerSources = [
    deal?.offers,
    deal?.offer_id,
    deal?.offer_ids,
    root?.offers,
    root?.offer_id,
    root?.offer_ids,
    data?.offers,
    data?.offer_id,
    data?.offer_ids,
  ];
  const offerIds = [...new Set(offerSources.flatMap((source) => extractOfferIds(source)))];
  return {
    dealId: firstString(deal?.id, deal?.deal_id, root?.deal_id, data?.deal_id),
    dealNumber: firstString(
      deal?.number,
      deal?.deal_number,
      root?.deal_number,
      data?.deal_number,
    ),
    offerId: offerIds[0] ?? null,
    offerIds,
    offerFieldPresent: offerSources.some(hasFieldValue),
    amountMinor: rublesToMinor(
      deal?.deal_cost ?? deal?.cost ?? root?.deal_cost ?? root?.amount ?? data?.deal_cost ?? data?.amount,
    ),
    status: firstString(
      deal?.status,
      deal?.deal_status,
      root?.status,
      data?.status,
    ),
    payedMoneyMinor: rublesToMinor(
      deal?.payed_money ?? root?.payed_money ?? data?.payed_money,
    ),
    leftCostMoneyMinor: rublesToMinor(
      deal?.left_cost_money ?? root?.left_cost_money ?? data?.left_cost_money,
    ),
  };
}

export function resolveConfiguredOfferId(
  offerIds: string[],
  configuredOfferId: string,
): string | null {
  if (offerIds.includes(configuredOfferId)) return configuredOfferId;
  return offerIds[0] ?? null;
}

export function decideGetCourseCallbackApply(input: {
  callback: ParsedGetCourseCallback;
  configuredOfferId: string;
}): GetCourseCallbackDecision {
  const { callback, configuredOfferId } = input;
  if (!callback.dealId && !callback.dealNumber) {
    return { action: "ignore", reason: "missing_deal_identifier" };
  }
  if (callback.amountMinor === null) {
    return { action: "ignore", reason: "missing_amount" };
  }
  const moneyClass = classifyGetCoursePaymentCompleteness({
    amountMinor: callback.amountMinor,
    payedMoneyMinor: callback.payedMoneyMinor,
    leftCostMoneyMinor: callback.leftCostMoneyMinor,
  });
  if (moneyClass === "partial") {
    return { action: "ignore", reason: "partial_payment" };
  }
  if (
    !isProviderConfirmedFullyPaid({
      status: callback.status,
      amountMinor: callback.amountMinor,
      payedMoneyMinor: callback.payedMoneyMinor,
      leftCostMoneyMinor: callback.leftCostMoneyMinor,
    })
  ) {
    return { action: "ignore", reason: "status_not_payed" };
  }

  const numericOrTokenOfferId = resolveConfiguredOfferId(
    callback.offerIds,
    configuredOfferId,
  );
  const usedDealCorrelation = numericOrTokenOfferId === null;
  const offerId = numericOrTokenOfferId ?? configuredOfferId;

  return {
    action: "apply",
    usedDealCorrelation,
    args: {
      providerDealId: callback.dealId,
      providerDealNumber: callback.dealNumber,
      offerId,
      amountMinor: callback.amountMinor,
      status: GETCOURSE_CANONICAL_PAID_STATUS,
      payedMoneyMinor: callback.payedMoneyMinor,
      leftCostMoneyMinor: callback.leftCostMoneyMinor,
    },
  };
}

export function logGetCourseCallbackIgnored(
  reason: GetCourseCallbackIgnoreReason,
  callback: ParsedGetCourseCallback,
): void {
  console.info("author_appreciation_getcourse_callback_ignored", {
    reason,
    deal_id_present: Boolean(callback.dealId),
    deal_number_present: Boolean(callback.dealNumber),
    offer_field_present: callback.offerFieldPresent,
    amount_present: callback.amountMinor !== null,
    status_present: Boolean(callback.status),
    status_class: classifyGetCourseDealStatus(callback.status),
    money_class: classifyGetCoursePaymentCompleteness({
      amountMinor: callback.amountMinor,
      payedMoneyMinor: callback.payedMoneyMinor,
      leftCostMoneyMinor: callback.leftCostMoneyMinor,
    }),
  });
}

export function logGetCourseCallbackApplied(input: {
  outcome: string | null;
  usedDealCorrelation: boolean;
}): void {
  console.info("author_appreciation_getcourse_callback_applied", {
    outcome: input.outcome ?? "unknown",
    used_deal_correlation: input.usedDealCorrelation,
  });
}

const FINANCE_NEEDS_REVIEW_OUTCOMES = new Set([
  "needs_review",
  "paid_needs_review",
  "already_paid_needs_review",
]);

export function logGetCourseFinanceProjectionIfNeeded(outcome: string | null): void {
  if (!outcome || !FINANCE_NEEDS_REVIEW_OUTCOMES.has(outcome)) return;
  console.info("author_appreciation_finance_projection_needs_review", {
    reason: outcome,
  });
}

export function readCallbackRpcOutcome(data: unknown): string | null {
  if (Array.isArray(data)) {
    const first = record(data[0]);
    return firstString(first?.outcome);
  }
  const row = record(data);
  return firstString(row?.outcome);
}
