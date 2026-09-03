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

export type ExportSchemaObservation = {
  row_count: number;
  field_names: string[];
  deal_id_present: boolean;
  deal_number_present: boolean;
  status_present: boolean;
  cost_present: boolean;
  paid_amount_present: boolean;
  offer_present: boolean;
};

export type ExportEnvelopeObservation = {
  top_level_keys: string[];
  result_keys: string[];
  info_keys: string[];
  array_field_names: string[];
  array_lengths: Record<string, number>;
  provider_status: string | null;
  provider_message_present: boolean;
};

export type ExportPaidGetCourseDealsResult =
  | {
      ok: true;
      exportId: string;
      deals: ConfirmedGetCourseDeal[];
      pollCount: number;
      schema: ExportSchemaObservation;
      envelope?: ExportEnvelopeObservation;
    }
  | {
      ok: false;
      reason: "provider_error" | "empty";
      exportId: string | null;
      pollCount: number;
      envelope?: ExportEnvelopeObservation;
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
      pick(
        row,
        "deal_cost",
        "cost",
        "cost_money_value",
        "cost_money",
        "Стоимость",
        "стоимость",
        "Стоимость, RUB",
      ),
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
        "Осталось оплатить",
      ),
    ),
    offerIds: extractOfferIds(
      pick(row, "offers", "offer_id", "offer_ids", "offer", "Состав заказа"),
    ),
  };
}

const ROW_CONTAINER_KEYS = ["info", "items", "deals", "data", "rows", "result"] as const;
const NESTED_ROW_KEYS = ["info", "items", "deals", "data", "rows"] as const;
const MAX_ENVELOPE_KEYS = 40;

function readFieldNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const names: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) {
      names.push(entry.trim());
      continue;
    }
    if (typeof entry === "number" && Number.isFinite(entry)) {
      names.push(String(entry));
      continue;
    }
    return null;
  }
  return names;
}

function zipColumnarExportRows(
  fields: string[],
  items: unknown[],
): Record<string, unknown>[] {
  return items.map((item) => {
    const existing = record(item);
    if (existing) return existing;
    const row: Record<string, unknown> = {};
    if (Array.isArray(item)) {
      fields.forEach((name, index) => {
        row[name] = item[index];
      });
    }
    return row;
  });
}

function rowsFromFieldsItems(container: Record<string, unknown> | null): unknown[] | null {
  if (!container) return null;
  const fields = readFieldNames(container.fields);
  if (!fields || !Array.isArray(container.items)) return null;
  return zipColumnarExportRows(fields, container.items);
}

/**
 * Official GetCourse Export result is `{ info: { fields, items } }` where
 * `items` is an array of columnar value arrays. Also accepts the older
 * object-row containers already used by local tests (`info: Deal[]`).
 */
export function collectExportRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = record(payload);
  if (!root) return [];
  const official =
    rowsFromFieldsItems(record(root.info)) ??
    rowsFromFieldsItems(record(root.result)) ??
    rowsFromFieldsItems(record(record(root.result)?.info)) ??
    rowsFromFieldsItems(record(root.data)) ??
    rowsFromFieldsItems(root);
  if (official) return official;

  for (const key of ROW_CONTAINER_KEYS) {
    const value = root[key];
    if (Array.isArray(value)) return value;
    const nested = record(value);
    if (!nested) continue;
    const nestedOfficial = rowsFromFieldsItems(nested);
    if (nestedOfficial) return nestedOfficial;
    for (const nestedKey of NESTED_ROW_KEYS) {
      if (!Array.isArray(nested[nestedKey])) continue;
      return nested[nestedKey] as unknown[];
    }
  }
  return [];
}

function objectKeys(value: unknown): string[] {
  const obj = record(value);
  return obj ? Object.keys(obj).sort().slice(0, MAX_ENVELOPE_KEYS) : [];
}

function safeProviderStatus(value: string | null): string | null {
  if (!value) return null;
  if (value.length > 40) return null;
  if (/@|https?:|[?&]key=/i.test(value)) return null;
  return value;
}

function collectArrayFacts(
  value: unknown,
  prefix: string,
  into: { names: string[]; lengths: Record<string, number> },
  depth = 0,
): void {
  if (depth > 2) return;
  if (Array.isArray(value)) {
    const name = prefix || "root";
    into.names.push(name);
    into.lengths[name] = value.length;
    return;
  }
  const obj = record(value);
  if (!obj) return;
  for (const [key, child] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(child)) {
      into.names.push(path);
      into.lengths[path] = child.length;
    } else if (record(child)) {
      collectArrayFacts(child, path, into, depth + 1);
    }
  }
}

export function summarizeExportEnvelope(payload: unknown): ExportEnvelopeObservation {
  const root = record(payload);
  const result = record(root?.result);
  const infoObject = record(root?.info) ?? record(result?.info);
  const arrays = { names: [] as string[], lengths: {} as Record<string, number> };
  collectArrayFacts(payload, "", arrays);
  return {
    top_level_keys: objectKeys(payload),
    result_keys: objectKeys(result),
    info_keys: objectKeys(root?.info) || objectKeys(infoObject),
    array_field_names: [...new Set(arrays.names)].sort().slice(0, MAX_ENVELOPE_KEYS),
    array_lengths: Object.fromEntries(
      Object.entries(arrays.lengths).slice(0, MAX_ENVELOPE_KEYS),
    ),
    provider_status: safeProviderStatus(
      firstString(root?.status, result?.status, infoObject?.status),
    ),
    provider_message_present: Boolean(
      firstString(
        root?.error_message,
        root?.message,
        result?.error_message,
        result?.message,
        infoObject?.error_message,
      ),
    ),
  };
}

const EXPORT_DEAL_ID_KEYS = ["id", "deal_id", "ID", "Id", "ID заказа"];
const EXPORT_DEAL_NUMBER_KEYS = ["number", "deal_number", "Номер", "номер"];
const EXPORT_STATUS_KEYS = ["status", "deal_status", "Статус", "статус"];
const EXPORT_COST_KEYS = [
  "deal_cost",
  "cost",
  "cost_money_value",
  "cost_money",
  "Стоимость",
  "стоимость",
  "Стоимость, RUB",
];
const EXPORT_PAID_KEYS = ["payed_money", "paid_money", "payed", "Оплачено", "оплачено"];
const EXPORT_OFFER_KEYS = ["offers", "offer_id", "offer_ids", "offer", "Состав заказа"];

function rowHasAnyKey(row: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return true;
  }
  return false;
}

export function summarizeExportSchema(rows: unknown[]): ExportSchemaObservation {
  const fieldNames = new Set<string>();
  let dealIdPresent = false;
  let dealNumberPresent = false;
  let statusPresent = false;
  let costPresent = false;
  let paidPresent = false;
  let offerPresent = false;

  for (const value of rows) {
    const row = record(value);
    if (!row) continue;
    for (const key of Object.keys(row)) fieldNames.add(key);
    dealIdPresent ||= rowHasAnyKey(row, EXPORT_DEAL_ID_KEYS);
    dealNumberPresent ||= rowHasAnyKey(row, EXPORT_DEAL_NUMBER_KEYS);
    statusPresent ||= rowHasAnyKey(row, EXPORT_STATUS_KEYS);
    costPresent ||= rowHasAnyKey(row, EXPORT_COST_KEYS);
    paidPresent ||= rowHasAnyKey(row, EXPORT_PAID_KEYS);
    offerPresent ||= rowHasAnyKey(row, EXPORT_OFFER_KEYS);
  }

  return {
    row_count: rows.length,
    field_names: [...fieldNames].sort(),
    deal_id_present: dealIdPresent,
    deal_number_present: dealNumberPresent,
    status_present: statusPresent,
    cost_present: costPresent,
    paid_amount_present: paidPresent,
    offer_present: offerPresent,
  };
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

async function startCreatedAtDealsExport(
  config: GetCourseConfig,
  window: { from: string; to: string },
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<
  | { exportId: string; payload: unknown }
  | { empty: true; payload: unknown }
  | { error: true; payload?: unknown }
> {
  const url = new URL(`https://${config.accountName}.getcourse.ru/pl/api/account/deals`);
  url.searchParams.set("key", config.apiKey);
  url.searchParams.set("created_at[from]", window.from);
  url.searchParams.set("created_at[to]", window.to);
  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      signal,
    });
    const payload = await readJson(response);
    if (!response.ok) return { error: true, payload };
    if (isExportEmpty(payload)) return { empty: true, payload };
    const exportId = readExportId(payload);
    if (!exportId) return { error: true, payload };
    return { exportId, payload };
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
): Promise<
  | { rows: unknown[]; pollCount: number; payload: unknown }
  | { empty: true; pollCount: number; payload: unknown }
  | { error: true; pollCount: number; payload?: unknown }
> {
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
      if (!response.ok) return { error: true, pollCount, payload };
      if (isExportEmpty(payload)) return { empty: true, pollCount, payload };
      if (isExportReady(payload) || attempt === maxPolls - 1) {
        return { rows: collectExportRows(payload), pollCount, payload };
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

export function indexExportedDealsByNumber(
  deals: ConfirmedGetCourseDeal[],
): Map<string, ConfirmedGetCourseDeal | "ambiguous"> {
  const index = new Map<string, ConfirmedGetCourseDeal | "ambiguous">();
  for (const deal of deals) {
    if (!deal.dealNumber) continue;
    const existing = index.get(deal.dealNumber);
    if (existing) {
      index.set(deal.dealNumber, "ambiguous");
    } else {
      index.set(deal.dealNumber, deal);
    }
  }
  return index;
}

export function lookupExportedDealForIntent(input: {
  providerDealId: string | null;
  providerDealNumber: string | null;
  byId: Map<string, ConfirmedGetCourseDeal | "ambiguous">;
  byNumber: Map<string, ConfirmedGetCourseDeal | "ambiguous">;
}): ConfirmedGetCourseDeal | "ambiguous" | undefined {
  if (input.providerDealId) {
    const byId = input.byId.get(input.providerDealId);
    if (byId) return byId;
  }
  if (input.providerDealNumber) {
    return input.byNumber.get(input.providerDealNumber);
  }
  return undefined;
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
  const statusClass = classifyGetCourseDealStatus(deal.status);
  if (statusClass === "void") {
    return { matched: false, reason: "unpaid" };
  }
  if (moneyClass === "partial") {
    return { matched: false, reason: "partial_payment" };
  }
  if (
    !isProviderConfirmedFullyPaid({
      status: deal.status,
      amountMinor: input.amountMinor,
      payedMoneyMinor: deal.payedMoneyMinor,
      leftCostMoneyMinor: deal.leftCostMoneyMinor,
    })
  ) {
    return {
      matched: false,
      reason: statusClass === "partial" ? "partial_payment" : "unpaid",
    };
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
    const started = await startCreatedAtDealsExport(config, window, fetchImpl, controller.signal);
    if ("error" in started) {
      return {
        ok: false,
        reason: "provider_error",
        exportId: null,
        pollCount: 0,
        envelope: started.payload !== undefined ? summarizeExportEnvelope(started.payload) : undefined,
      };
    }
    if ("empty" in started) {
      return {
        ok: false,
        reason: "empty",
        exportId: null,
        pollCount: 0,
        envelope: summarizeExportEnvelope(started.payload),
      };
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
        envelope: polled.payload !== undefined ? summarizeExportEnvelope(polled.payload) : undefined,
      };
    }
    if ("empty" in polled) {
      return {
        ok: false,
        reason: "empty",
        exportId: started.exportId,
        pollCount: polled.pollCount,
        envelope: summarizeExportEnvelope(polled.payload),
      };
    }
    const deals = polled.rows
      .map((row) => parseExportedGetCourseDeal(row))
      .filter((deal): deal is ConfirmedGetCourseDeal => deal !== null);
    const schema = summarizeExportSchema(polled.rows);
    return {
      ok: true,
      exportId: started.exportId,
      deals,
      pollCount: polled.pollCount,
      schema,
      envelope: schema.row_count === 0 ? summarizeExportEnvelope(polled.payload) : undefined,
    };
  } catch {
    return { ok: false, reason: "provider_error", exportId: null, pollCount: 0 };
  } finally {
    clearTimeout(timeout);
  }
}
