import "server-only";

import {
  extractOfferIds,
  firstString,
  record,
  rublesToMinor,
} from "@/lib/author-appreciation/getcourse/callback";
import type { GetCourseConfig } from "@/lib/author-appreciation/getcourse/provider";

const GETCOURSE_CONFIRM_TIMEOUT_MS = 10_000;
const GETCOURSE_EXPORT_POLL_MS = 400;
const GETCOURSE_EXPORT_MAX_POLLS = 8;

export type ConfirmedGetCourseDeal = {
  dealId: string;
  dealNumber: string | null;
  status: string | null;
  amountMinor: number | null;
  payedMoneyMinor: number | null;
  leftCostMoneyMinor: number | null;
  offerIds: string[];
};

export type ConfirmGetCourseDealResult =
  | { confirmed: true; deal: ConfirmedGetCourseDeal }
  | {
      confirmed: false;
      reason: "provider_error" | "not_found" | "unpaid" | "ambiguous";
    };

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

export function exportDateWindow(createdAtIso: string, now: Date): { from: string; to: string } {
  const created = new Date(createdAtIso);
  const createdMs = Number.isNaN(created.getTime()) ? now.getTime() : created.getTime();
  const from = new Date(createdMs - 24 * 60 * 60 * 1000);
  const to = new Date(Math.min(now.getTime() + 24 * 60 * 60 * 1000, createdMs + 2 * 24 * 60 * 60 * 1000));
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

async function startDealExport(
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
): Promise<{ rows: unknown[] } | { empty: true } | { error: true }> {
  for (let attempt = 0; attempt < GETCOURSE_EXPORT_MAX_POLLS; attempt += 1) {
    const url = `https://${config.accountName}.getcourse.ru/pl/api/account/exports/${encodeURIComponent(exportId)}?key=${encodeURIComponent(config.apiKey)}`;
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal,
      });
      const payload = await readJson(response);
      if (!response.ok) return { error: true };
      if (isExportEmpty(payload)) return { empty: true };
      if (isExportReady(payload) || attempt === GETCOURSE_EXPORT_MAX_POLLS - 1) {
        return { rows: collectExportRows(payload) };
      }
    } catch {
      return { error: true };
    }
    await new Promise((resolve) => setTimeout(resolve, GETCOURSE_EXPORT_POLL_MS));
  }
  return { error: true };
}

export function matchExportedDeal(
  rows: unknown[],
  dealId: string,
): ConfirmGetCourseDealResult {
  const matches = rows
    .map((row) => parseExportedGetCourseDeal(row))
    .filter((deal): deal is ConfirmedGetCourseDeal => deal?.dealId === dealId);
  if (matches.length > 1) return { confirmed: false, reason: "ambiguous" };
  if (matches.length === 0) return { confirmed: false, reason: "not_found" };
  const deal = matches[0];
  if (deal.status && deal.status !== "payed") {
    return { confirmed: false, reason: "unpaid" };
  }
  return { confirmed: true, deal };
}

export async function confirmGetCourseDealPayment(
  config: GetCourseConfig,
  input: { dealId: string; createdAtIso: string },
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<ConfirmGetCourseDealResult> {
  if (!input.dealId.trim()) return { confirmed: false, reason: "not_found" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GETCOURSE_CONFIRM_TIMEOUT_MS);
  try {
    const window = exportDateWindow(input.createdAtIso, now);
    const started = await startDealExport(config, window, fetchImpl, controller.signal);
    if ("error" in started) return { confirmed: false, reason: "provider_error" };
    if ("empty" in started) return { confirmed: false, reason: "not_found" };
    const polled = await pollDealExport(config, started.exportId, fetchImpl, controller.signal);
    if ("error" in polled) return { confirmed: false, reason: "provider_error" };
    if ("empty" in polled) return { confirmed: false, reason: "not_found" };
    return matchExportedDeal(polled.rows, input.dealId);
  } catch {
    return { confirmed: false, reason: "provider_error" };
  } finally {
    clearTimeout(timeout);
  }
}
