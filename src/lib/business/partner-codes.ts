/**
 * Personal partner codes for АудиоЛад Бизнес (task 8142d69a).
 * Pure helpers shared by the cabinet, the admin page and the tests. The server
 * (SQL) owns the price: nothing here decides what is charged.
 */
import { BUSINESS_PAID_PERIOD_DAYS, BUSINESS_PLAN_MONTHLY_PRICE_RUB } from "@/lib/business/plan";

/** First campaign: 399 ₽ per venue for three paid 30-day periods. */
export const PARTNER_CODE_DEFAULT_UNIT_PRICE_RUB = 399;
export const PARTNER_CODE_DEFAULT_PERIODS = 3;
export const PARTNER_CODE_MAX_PERIODS = 12;

/** 12 characters, no 0/1/I/O: easy to dictate, ~1.15e18 combinations. */
export const PARTNER_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const PARTNER_CODE_LENGTH = 12;
const PARTNER_CODE_RE = /^[2-9A-HJ-NP-Z]{12}$/;

/** Cookie with the code from a personal link, kept until the code is bound to an account. */
export const PARTNER_CODE_COOKIE = "al_biz_partner_code";
export const PARTNER_CODE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Public landing of the personal link: https://business.audiolad.ru/podarok?code=XXXX-XXXX-XXXX */
export const PARTNER_CODE_PUBLIC_PATH = "/podarok";

export const PARTNER_CODE_PURPOSES = {
  custdev: "Кастдев",
  top10: "Участник десятки",
  other: "Другое",
} as const;
export type PartnerCodePurpose = keyof typeof PARTNER_CODE_PURPOSES;

export function isPartnerCodePurpose(value: unknown): value is PartnerCodePurpose {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PARTNER_CODE_PURPOSES, value);
}

/** Uppercase, without spaces and dashes. Same rule as the SQL. Null when it cannot be a code. */
export function normalizePartnerCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const code = raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return PARTNER_CODE_RE.test(code) ? code : null;
}

/** «ABCD-EFGH-JKMN» for people. */
export function formatPartnerCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/**
 * Unpredictable code from a CSPRNG. 256 is a multiple of 32, so `byte % 32` has no bias.
 */
export function generatePartnerCode(randomBytes: (size: number) => Uint8Array): string {
  const bytes = randomBytes(PARTNER_CODE_LENGTH);
  if (bytes.length < PARTNER_CODE_LENGTH) throw new Error("partner_code_random_short");
  let code = "";
  for (let i = 0; i < PARTNER_CODE_LENGTH; i += 1) code += PARTNER_CODE_ALPHABET[bytes[i] % PARTNER_CODE_ALPHABET.length];
  return code;
}

export function partnerCodeLink(origin: string, code: string): string {
  return `${origin}${PARTNER_CODE_PUBLIC_PATH}?code=${formatPartnerCode(code)}`;
}

/** Whole rubles strictly below the standard price; no kopecks. */
export function parsePartnerUnitPriceRub(raw: unknown): number | null {
  const value = typeof raw === "string" && raw.trim() ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value < BUSINESS_PLAN_MONTHLY_PRICE_RUB ? value : null;
}

export function parsePartnerPeriods(raw: unknown): number | null {
  const value = typeof raw === "string" && raw.trim() ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= PARTNER_CODE_MAX_PERIODS ? value : null;
}

/** Marketing «скидка 50%» from the real prices: 399 of 799 rounds to 50. */
export function partnerDiscountPercent(unitRub: number, standardRub = BUSINESS_PLAN_MONTHLY_PRICE_RUB): number {
  return Math.round((1 - unitRub / standardRub) * 100);
}

export type PartnerQuoteSource = "standard" | "reserved" | "entitlement" | "finished";

/** Server quote for the signed-in owner (business_partner_quote_for_caller). Rubles, no kopecks. */
export type PartnerQuote = {
  source: PartnerQuoteSource;
  unitPriceRub: number;
  standardUnitPriceRub: number;
  venueCount: number;
  totalRub: number;
  standardTotalRub: number;
  discountPeriods: number | null;
  /** 1-based paid period the next payment is, while the personal price applies. */
  periodIndex: number | null;
  periodsUsed: number;
  codeHint: string | null;
  discountPaidUntil: string | null;
};

function minorToRub(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n % 100 !== 0) return null;
  return n / 100;
}

function intOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function parsePartnerQuote(raw: unknown): PartnerQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const source = row.source;
  if (source !== "standard" && source !== "reserved" && source !== "entitlement" && source !== "finished") return null;
  const unit = minorToRub(row.unit_price_minor);
  const standard = minorToRub(row.standard_unit_price_minor);
  const total = minorToRub(row.total_minor);
  const venueCount = intOrNull(row.venue_count);
  if (unit === null || standard === null || total === null || venueCount === null) return null;
  const billed = Math.max(venueCount, 1);
  return {
    source,
    unitPriceRub: unit,
    standardUnitPriceRub: standard,
    venueCount,
    totalRub: total,
    standardTotalRub: standard * billed,
    discountPeriods: intOrNull(row.discount_periods),
    periodIndex: intOrNull(row.period_index),
    periodsUsed: intOrNull(row.periods_used) ?? 0,
    codeHint: typeof row.code_hint === "string" ? row.code_hint : null,
    discountPaidUntil: typeof row.discount_paid_until === "string" ? row.discount_paid_until : null,
  };
}

/** The next payment is at the personal price: show 799 struck through next to it (Sergey, t1300u). */
export function partnerQuoteIsDiscounted(quote: PartnerQuote | null): quote is PartnerQuote {
  return Boolean(quote && (quote.source === "reserved" || quote.source === "entitlement") && quote.unitPriceRub < quote.standardUnitPriceRub);
}

/** Paid periods at the personal price still left, the coming one included. */
export function partnerPeriodsLeft(quote: PartnerQuote): number {
  if (!quote.discountPeriods) return 0;
  return Math.max(quote.discountPeriods - quote.periodsUsed, 0);
}

/** The per-venue price the owner confirms with «Оплатить», in kopecks for the API. */
export function partnerConfirmedUnitPriceMinor(quote: PartnerQuote | null): number {
  return (quote ? quote.unitPriceRub : BUSINESS_PLAN_MONTHLY_PRICE_RUB) * 100;
}

export function ruPeriodsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "оплаченный период";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "оплаченных периода";
  return "оплаченных периодов";
}

/** Lines under the struck-through price. Visible text: en dash only. */
export function partnerQuoteTermsLines(quote: PartnerQuote): string[] {
  const left = partnerPeriodsLeft(quote);
  const total = quote.discountPeriods ?? left;
  const lines: string[] = [];
  if (quote.source === "reserved") {
    lines.push(`Цена действует ${total} ${ruPeriodsWord(total)} по ${BUSINESS_PAID_PERIOD_DAYS} дней с первой оплаты, для всех точек аккаунта.`);
  } else if (left === 1) {
    lines.push("Это последний период по персональной цене.");
  } else {
    lines.push(`По персональной цене осталось ${left} ${ruPeriodsWord(left)} по ${BUSINESS_PAID_PERIOD_DAYS} дней, для всех точек аккаунта.`);
  }
  lines.push(`Затем – обычная цена ${quote.standardUnitPriceRub} ₽ за точку за ${BUSINESS_PAID_PERIOD_DAYS} дней.`);
  return lines;
}

/** After the last personal period: one plain notice on the payment surfaces. */
export function partnerFinishedNotice(quote: PartnerQuote | null): string | null {
  if (!quote || quote.source !== "finished") return null;
  return `Персональная цена закончилась: оплачено ${quote.periodsUsed} ${ruPeriodsWord(quote.periodsUsed)}. Сейчас действует обычная цена – ${quote.standardUnitPriceRub} ₽ за точку за ${BUSINESS_PAID_PERIOD_DAYS} дней.`;
}

export type PartnerCodeApiError =
  | "partner_code_invalid"
  | "partner_code_unavailable"
  | "partner_code_already_applied"
  | "not_organization_owner"
  | "support_mode_consent_forbidden"
  | "venue_device"
  | "unauthorized"
  | "internal_error";

export function mapPartnerCodeRpcError(message: string): { status: number; error: PartnerCodeApiError } {
  const m = message.toLowerCase();
  if (m.includes("partner_code_invalid")) return { status: 404, error: "partner_code_invalid" };
  if (m.includes("partner_code_unavailable")) return { status: 409, error: "partner_code_unavailable" };
  if (m.includes("partner_code_already_applied")) return { status: 409, error: "partner_code_already_applied" };
  if (m.includes("not_organization_owner")) return { status: 403, error: "not_organization_owner" };
  if (m.includes("support_mode_consent_forbidden")) return { status: 403, error: "support_mode_consent_forbidden" };
  if (m.includes("not_authenticated")) return { status: 401, error: "unauthorized" };
  return { status: 500, error: "internal_error" };
}

export function partnerCodeErrorText(code: PartnerCodeApiError | string): string {
  switch (code) {
    case "partner_code_invalid":
      return "Такого кода нет. Проверьте буквы и цифры.";
    case "partner_code_unavailable":
      return "Этот код уже используется другим аккаунтом.";
    case "partner_code_already_applied":
      return "К аккаунту уже применён персональный код. Второй код не добавляется.";
    case "not_organization_owner":
      return "Код может применить владелец аккаунта.";
    case "venue_device":
      return "На устройстве в зале код не применяется.";
    case "support_mode_consent_forbidden":
      return "В режиме сопровождения код не применяется.";
    default:
      return "Не удалось применить код. Попробуйте ещё раз.";
  }
}

/** Admin list status, from the code row and its account entitlement. */
export type PartnerCodeStatus = "created" | "reserved" | "in_use" | "finished" | "revoked";

export const PARTNER_CODE_STATUS_LABELS: Record<PartnerCodeStatus, string> = {
  created: "Создан",
  reserved: "Введён, ждёт первой оплаты",
  in_use: "Закреплён, действует",
  finished: "Завершён",
  revoked: "Отозван",
};

export function partnerCodeStatus(input: {
  revokedAt: string | null;
  boundOrganizationId: string | null;
  reservedUntil: string | null;
  hasOpenPayment?: boolean;
  periodsApplied: number;
  discountPeriods: number;
  now: Date;
}): PartnerCodeStatus {
  if (input.boundOrganizationId) return input.periodsApplied >= input.discountPeriods ? "finished" : "in_use";
  if (input.revokedAt) return "revoked";
  const reserved = input.reservedUntil !== null && Date.parse(input.reservedUntil) > input.now.getTime();
  return reserved || input.hasOpenPayment ? "reserved" : "created";
}

/**
 * Demo of the server rule without any payment: each successful payment is one shared
 * 30-day period for every active venue. Payments 1..periods use the personal price,
 * later ones the standard price. A venue added mid-period joins at the next renewal
 * (no mid-period charge, as in the existing billing).
 */
export function simulatePartnerBilling(input: {
  unitPriceRub: number;
  discountPeriods: number;
  standardUnitPriceRub?: number;
  /** Active venues at each successful payment, in order. */
  venuesPerPayment: number[];
}): Array<{ payment: number; venues: number; unitRub: number; totalRub: number; discounted: boolean }> {
  const standard = input.standardUnitPriceRub ?? BUSINESS_PLAN_MONTHLY_PRICE_RUB;
  return input.venuesPerPayment.map((venues, index) => {
    const discounted = index < input.discountPeriods;
    const unitRub = discounted ? input.unitPriceRub : standard;
    return { payment: index + 1, venues, unitRub, totalRub: unitRub * venues, discounted };
  });
}
