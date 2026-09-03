import "server-only";

import {
  classifyGetCourseDealStatus,
  classifyGetCoursePaymentCompleteness,
  extractOfferIds,
  firstString,
  isProviderConfirmedFullyPaid,
  record,
  rublesToMinor,
} from "@/lib/author-appreciation/getcourse/callback";
import type { GetCourseConfig } from "@/lib/author-appreciation/getcourse/provider";

const GETCOURSE_EXPORT_TIMEOUT_MS = 25_000;
export const GETCOURSE_EXPORT_POLL_MS = 1_500;
export const GETCOURSE_EXPORT_MAX_POLLS = 8;

export type ConfirmedGetCourseDeal = {
  dealId: string;
  dealNumber: string | null;
  status: string | null;
  amountMinor: number | null;
  payedMoneyMinor: number | null;
  leftCostMoneyMinor: number | null;
  offerIds: string[];
};

export type ExportPaidGetCourseDealsResult =
  | {
      ok: true;
      exportId: string;
      deals: ConfirmedGetCourseDeal[];
      pollCount: number;
    }
  | {
      ok: false;
      reason: "provider_error" | "empty";
      exportId: string | null;
      pollCount: number;
    };

export type IntentExportMatchReason =
  | "matched"
  | "not_found"
  | "ambiguous"
  | "unpaid"
  | "amount_mismatch"
  | "export_offer_mismatch"
  | "partial_payment";

function idField(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return firstString(value);
}

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in row && row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return undefined;
}

export function parseExportedGetCourseDeal(value: unknown): ConfirmedGetCourseDeal | null {
  const row = record(value);
  if (!row) return null;
  const dealId = idField(
    pick(row, "id", "deal_id", "ID", "Id", "ID заказа"),
  );
  if (!dealId) return null;
  return {
    dealId,
    dealNumber: idField(
      pick(row, "number", "deal_number", "Номер", "номер"),
    ),
    status: firstString(
      pick(row, "status", "deal_status", "Статус", "статус"),
    ),
    amountMinor: rublesToMinor(
      pick(row, "deal_cost", "cost", "cost_money_value", "cost_money", "Стоимость", "стоимость"),
    ),
    payedMoneyMinor: rublesToMinor(
      pick(row, "payed_money", "paid_money", "payed", "Оплачено", "оплачено"),
    ),
    leftCostMoneyMinor: rublesToMinor(
      pick(
        row,
        "left_cost_money",
        "left_cost",
        "Осталось",
        "осталось",
      ),
    ),
    offerIds: extractOfferIds(
      pick(row, "offers", "offer_id", "offer_ids", "offer"),
    ),
  };
}

function collectExportRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = record(payload);
  if (!root) return [];
  for (const key of ["info", "items", "deals", "data", "rows", "result"]) {
    const value = root[key];
    if (Array.isArray(value)) return value;
    const nested = record(value);
    if (nested) {
      for (const nestedKey of ["info", "items", "deals", "data", "rows"]) {
        if (Array.isArray(nested[nestedKey])) return nested[nestedKey] as unknown[];
      }
    }
  }
  return [];
}

export function readExportId(payload: unknown): string | null {
  const root = record(payload);
  if (!root) return null;
  const result = record(root.result);
  const info = record(root.info);
  return (
    idField(root.export_id) ??
    idField(result?.export_id) ??
    idField(info?.export_id) ??
    idField(root.id)
  );
}

function isExportReady(payload: unknown): boolean {
  const root = record(payload);
  if (!root) return false;
  const status = firstString(root.status, record(root.result)?.status);
  if (status && /^(finished|success|done|ready|complete|completed)$/i.test(status)) {
    return true;
  }
  return collectExportRows(payload).length > 0;
}

function isExportEmpty(payload: unknown): boolean {
  const root = record(payload);
  const message = firstString(root?.error_message, root?.message, record(root?.result)?.error_message);
  if (message && /file not created|try another filter|нет данных/i.test(message)) {
    return true;
  }
  return false;
}

function utcDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function coveringExportDateWindow(
  createdAtIsos: string[],
  now: Date,
): { from: string; to: string } {
  const times = createdAtIsos
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  const min = times.length > 0 ? Math.min(...times) : now.getTime();
  const max = times.length > 0 ? Math.max(...times) : now.getTime();
  const from = new Date(min - 24 * 60 * 60 * 1000);
  const to = new Date(Math.max(now.getTime(), max) + 24 * 60 * 60 * 1000);
  return { from: utcDateOnly(from), to: utcDateOnly(to) };
}

async function readJson(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export type ExportPaidGetCourseDealsOptions = {
  pollMs?: number;
  maxPolls?: number;
  timeoutMs?: number;
};

async function startPaidDealsExport(
  config: GetCourseConfig,
  window: { from: string; to: string },
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<{ exportId: string } | { empty: true } | { error: true }> {
  const url = new URL(`https://${config.accountName}.getcourse.ru/pl/api/account/deals`);
  url.searchParams.set("key", config.apiKey);
  url.searchParams.set("status", "payed");
  url.searchParams.set("created_at[from]", window.from);
  url.searchParams.set("created_at[to]", window.to);
  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      signal,
    });
    const payload = await readJson(response);
    if (!response.ok) return { error: true };
    if (isExportEmpty(payload)) return { empty: true };
    const exportId = readExportId(payload);
    if (!exportId) return { error: true };
    return { exportId };
  } catch {
    return { error: true };
  }
}

async function pollDealExport(
  config: GetCourseConfig,
  exportId: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  pollMs: number,
  maxPolls: number,
): Promise<{ rows: unknown[]; pollCount: number } | { empty: true; pollCount: number } | { error: true; pollCount: number }> {
  let pollCount = 0;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    pollCount += 1;
    const url = `https://${config.accountName}.getcourse.ru/pl/api/account/exports/${encodeURIComponent(exportId)}?key=${encodeURIComponent(config.apiKey)}`;
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal,
      });
      const payload = await readJson(response);
      if (!response.ok) return { error: true, pollCount };
      if (isExportEmpty(payload)) return { empty: true, pollCount };
      if (isExportReady(payload) || attempt === maxPolls - 1) {
        return { rows: collectExportRows(payload), pollCount };
      }
    } catch {
      return { error: true, pollCount };
    }
    if (pollMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
  return { error: true, pollCount };
}

export function indexExportedDealsById(
  deals: ConfirmedGetCourseDeal[],
): Map<string, ConfirmedGetCourseDeal | "ambiguous"> {
  const index = new Map<string, ConfirmedGetCourseDeal | "ambiguous">();
  for (const deal of deals) {
    const existing = index.get(deal.dealId);
    if (existing) {
      index.set(deal.dealId, "ambiguous");
    } else {
      index.set(deal.dealId, deal);
    }
  }
  return index;
}

export function matchIntentToExportedDeal(input: {
  deal: ConfirmedGetCourseDeal | "ambiguous" | undefined;
  configuredOfferId: string;
  amountMinor: number;
}): { matched: true; deal: ConfirmedGetCourseDeal } | { matched: false; reason: IntentExportMatchReason } {
  if (!input.deal) return { matched: false, reason: "not_found" };
  if (input.deal === "ambiguous") return { matched: false, reason: "ambiguous" };
  const deal = input.deal;
  if (deal.amountMinor !== null && deal.amountMinor !== input.amountMinor) {
    return { matched: false, reason: "amount_mismatch" };
  }
  if (deal.offerIds.length > 0 && !deal.offerIds.includes(input.configuredOfferId)) {
    return { matched: false, reason: "export_offer_mismatch" };
  }
  const moneyClass = classifyGetCoursePaymentCompleteness({
    amountMinor: input.amountMinor,
    payedMoneyMinor: deal.payedMoneyMinor,
    leftCostMoneyMinor: deal.leftCostMoneyMinor,
  });
  if (moneyClass === "partial") {
    return { matched: false, reason: "partial_payment" };
  }
  if (moneyClass === "unpaid") {
    return { matched: false, reason: "unpaid" };
  }
  const statusClass = classifyGetCourseDealStatus(deal.status);
  if (statusClass === "void") {
    return { matched: false, reason: "unpaid" };
  }
  if (
    deal.status &&
    !isProviderConfirmedFullyPaid({
      status: deal.status,
      amountMinor: input.amountMinor,
      payedMoneyMinor: deal.payedMoneyMinor,
      leftCostMoneyMinor: deal.leftCostMoneyMinor,
    })
  ) {
    return { matched: false, reason: statusClass === "partial" ? "partial_payment" : "unpaid" };
  }
  return { matched: true, deal };
}

export async function exportPaidGetCourseDealsOnce(
  config: GetCourseConfig,
  window: { from: string; to: string },
  fetchImpl: typeof fetch = fetch,
  options: ExportPaidGetCourseDealsOptions = {},
): Promise<ExportPaidGetCourseDealsResult> {
  const pollMs = options.pollMs ?? GETCOURSE_EXPORT_POLL_MS;
  const maxPolls = options.maxPolls ?? GETCOURSE_EXPORT_MAX_POLLS;
  const timeoutMs = options.timeoutMs ?? GETCOURSE_EXPORT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const started = await startPaidDealsExport(config, window, fetchImpl, controller.signal);
    if ("error" in started) {
      return { ok: false, reason: "provider_error", exportId: null, pollCount: 0 };
    }
    if ("empty" in started) {
      return { ok: false, reason: "empty", exportId: null, pollCount: 0 };
    }
    const polled = await pollDealExport(
      config,
      started.exportId,
      fetchImpl,
      controller.signal,
      pollMs,
      maxPolls,
    );
    if ("error" in polled) {
      return {
        ok: false,
        reason: "provider_error",
        exportId: started.exportId,
        pollCount: polled.pollCount,
      };
    }
    if ("empty" in polled) {
      return {
        ok: false,
        reason: "empty",
        exportId: started.exportId,
        pollCount: polled.pollCount,
      };
    }
    const deals = polled.rows
      .map((row) => parseExportedGetCourseDeal(row))
      .filter((deal): deal is ConfirmedGetCourseDeal => deal !== null);
    return {
      ok: true,
      exportId: started.exportId,
      deals,
      pollCount: polled.pollCount,
    };
  } catch {
    return { ok: false, reason: "provider_error", exportId: null, pollCount: 0 };
  } finally {
    clearTimeout(timeout);
  }
}
