/**
 * Personal partner codes for АудиоЛад Бизнес (task 8142d69a).
 * Pure helpers shared by the cabinet, the admin page and the tests. The server
 * (SQL) owns the price: nothing here decides what is charged.
 */
import { BUSINESS_GIFT_DAYS, BUSINESS_PAID_PERIOD_DAYS, BUSINESS_PLAN_MONTHLY_PRICE_RUB } from "@/lib/business/plan";

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

/**
 * Public landing of the personal link (t1321u): https://coffee.audiolad.ru/podarok?code=XXXX-XXXX-XXXX.
 * business.audiolad.ru/podarok stays rewritten the same way for links already issued.
 */
export const PARTNER_CODE_PUBLIC_PATH = "/podarok";
/** Canonical host for newly issued personal links. */
export const PARTNER_CODE_PUBLIC_ORIGIN = "https://coffee.audiolad.ru";

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

/** Personal link for new codes – always on the coffee host. */
export function partnerCodePublicLink(code: string): string {
  return partnerCodeLink(PARTNER_CODE_PUBLIC_ORIGIN, code);
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
  /** A payment that still arrived on a link the cabinet no longer offered (replaced or revoked code). */
  latePayment: PartnerLatePayment | null;
  /** While the code is held for this owner before the first payment (72 hours, renewed by an open link). */
  reservedUntil: string | null;
};

export type PartnerLatePayment = {
  reason: "partner_code_applied" | "partner_code_revoked";
  paidAt: string;
  periodEnd: string;
};

function parseLatePayment(raw: unknown): PartnerLatePayment | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.reason !== "partner_code_applied" && row.reason !== "partner_code_revoked") return null;
  if (typeof row.paid_at !== "string" || typeof row.period_end !== "string") return null;
  return { reason: row.reason, paidAt: row.paid_at, periodEnd: row.period_end };
}

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
    latePayment: parseLatePayment(row.late_payment),
    reservedUntil: source === "reserved" && typeof row.reserved_until === "string" ? row.reserved_until : null,
  };
}

/**
 * The quote as /api/business/partner-code sends it to the browser: the same snake_case
 * row in kopecks that parsePartnerQuote reads. The route validates the RPC row with
 * parsePartnerQuote and must send it back in this shape – sending the parsed camelCase
 * object made every browser parse return null, so a reserved 399 ₽ never showed (t1335u).
 */
export function partnerQuoteToWire(quote: PartnerQuote): Record<string, unknown> {
  return {
    source: quote.source,
    unit_price_minor: quote.unitPriceRub * 100,
    standard_unit_price_minor: quote.standardUnitPriceRub * 100,
    venue_count: quote.venueCount,
    total_minor: quote.totalRub * 100,
    discount_periods: quote.discountPeriods,
    period_index: quote.periodIndex,
    periods_used: quote.periodsUsed,
    code_hint: quote.codeHint,
    discount_paid_until: quote.discountPaidUntil,
    late_payment: quote.latePayment
      ? { reason: quote.latePayment.reason, paid_at: quote.latePayment.paidAt, period_end: quote.latePayment.periodEnd }
      : null,
    reserved_until: quote.reservedUntil,
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

/** Reservation length, the same as reserve_business_partner_code. */
export const PARTNER_CODE_RESERVATION_HOURS = 72;

/** «12 ноября, 10:05» in Moscow time. */
export function ruMoscowDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Moscow" });
  return `${day}, ${time}`;
}

/**
 * Soft hold note before the struck price (t1328u/t1329u): no pressure wording.
 * Null when the code is not held or the hold is already over.
 */
export function partnerReservationNoteLead(quote: PartnerQuote | null, now: Date = new Date()): string | null {
  if (!quote || quote.source !== "reserved" || !quote.reservedUntil) return null;
  const until = new Date(quote.reservedUntil);
  if (Number.isNaN(until.getTime()) || until.getTime() <= now.getTime()) return null;
  return `Код закреплён за вами на ${PARTNER_CODE_RESERVATION_HOURS} часа, до ${ruMoscowDateTime(quote.reservedUntil)} по московскому времени – цена`;
}

/** Live «Код действует ещё ЧЧ:ММ:СС» while the 72h reservation is open (t1328u / t1337u). */
export function partnerReservationCountdownLabel(quote: PartnerQuote | null, now: Date = new Date()): string | null {
  if (!quote || quote.source !== "reserved" || !quote.reservedUntil) return null;
  const until = new Date(quote.reservedUntil).getTime();
  if (!Number.isFinite(until)) return null;
  const ms = until - now.getTime();
  if (ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `Код действует ещё ${hh}:${mm}:${ss}`;
}

/**
 * After the first payment: «Скидка на оплату N из M». Before payment (reserved): null –
 * the countdown covers that state (t1330u).
 */
export function partnerDiscountProgressLine(quote: PartnerQuote | null): string | null {
  if (!quote || quote.source !== "entitlement") return null;
  const total = quote.discountPeriods;
  const index = quote.periodIndex;
  if (!total || !index) return null;
  return `Скидка на оплату ${index} из ${total}`;
}

/** Days the personal-link cookie is kept in this browser (same as PARTNER_CODE_COOKIE_MAX_AGE_SECONDS). */
export const PARTNER_CODE_COOKIE_DAYS = PARTNER_CODE_COOKIE_MAX_AGE_SECONDS / (60 * 60 * 24);

/**
 * Before payment: the code stays in this browser; the personal price applies on the first
 * payment even if the owner starts with the free gift days (t1322u). No pressure to pay now.
 */
export const PARTNER_CODE_RESERVATION_HINT =
  `Код сохранён в этом браузере на ${PARTNER_CODE_COOKIE_DAYS} дней – цена ${PARTNER_CODE_DEFAULT_UNIT_PRICE_RUB} ₽ применится при оплате, даже если сначала вы пройдёте ${BUSINESS_GIFT_DAYS} бесплатных дней.`;

function ruMoscowDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
}

/**
 * The bank still confirmed a link the cabinet had replaced: the money is never lost, it buys
 * exactly the 30 days that were paid. For a revoked code no personal price follows.
 */
export function partnerLatePaymentNotice(quote: PartnerQuote | null): string | null {
  const late = quote?.latePayment;
  if (!late) return null;
  const paid = ruMoscowDate(late.paidAt);
  const until = ruMoscowDate(late.periodEnd);
  if (!paid || !until) return null;
  if (late.reason === "partner_code_revoked") {
    return `Персональный код отозван до первой оплаты. Оплата от ${paid} засчитана полностью: доступ продлён до ${until}. Скидка по коду больше не действует, следующая оплата – по обычной цене ${quote.standardUnitPriceRub} ₽ за точку.`;
  }
  return `Прежняя ссылка на оплату всё же была оплачена ${paid}. Оплата засчитана полностью: доступ продлён до ${until}.`;
}

export type PartnerCodeApiError =
  | "partner_code_invalid"
  | "partner_code_unavailable"
  | "partner_code_already_applied"
  | "not_organization_owner"
  | "support_mode_consent_forbidden"
  | "venue_device"
  | "rate_limited"
  | "unauthorized"
  | "internal_error";

/**
 * Rate-limit key for /api/business/partner-code. nginx sets X-Real-IP to $remote_addr, so it
 * comes first; X-Forwarded-For is appended by nginx, so only its last hop is trusted (the
 * first values are whatever the client sent).
 */
export function partnerCodeClientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((hop) => hop.trim()).filter(Boolean);
  return hops.at(-1) ?? "unknown";
}

/** Only these mean the code itself can never work for this account: the link cookie is dropped. */
export function partnerCodeErrorIsFinal(code: PartnerCodeApiError | string): boolean {
  return code === "partner_code_invalid" || code === "partner_code_unavailable" || code === "partner_code_already_applied";
}

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
    case "rate_limited":
      return "Слишком много попыток. Подождите минуту и попробуйте снова.";
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
