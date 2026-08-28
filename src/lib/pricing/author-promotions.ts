import {
  MAX_PAID_PRICE_RUB,
  MIN_PAID_PRICE_RUB,
  parseIntegerRubles,
  validateSalePriceRubles,
} from "@/lib/pricing/money";
import {
  DEFAULT_PERSONAL_TIMER_ABOVE_TEXT,
  DEFAULT_PERSONAL_TIMER_BELOW_TEXT,
  PERSONAL_TIMER_COPY_MAX_LENGTH,
  resolvePersonalTimerCopy,
} from "@/lib/pricing/personal-timer-copy";
import { isPricePromotionType } from "@/lib/pricing/resolve";
import { PRICE_PROMOTION_TYPES } from "@/lib/pricing/types";

export const PROMOTION_NAME_MAX_LENGTH = 80;
export const MIN_DURATION_SECONDS = 60;
export const MAX_DURATION_SECONDS = 2_592_000;

export type PromotionDurationUnit = "minutes" | "hours" | "days";

export function durationToSeconds(
  amount: number,
  unit: PromotionDurationUnit,
): number | null {
  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  if (unit === "minutes") {
    return amount * 60;
  }

  if (unit === "hours") {
    return amount * 60 * 60;
  }

  if (unit === "days") {
    return amount * 60 * 60 * 24;
  }

  return null;
}

export function parseDurationUnit(value: unknown): PromotionDurationUnit | null {
  if (value === "minutes" || value === "hours" || value === "days") {
    return value;
  }

  return null;
}

export const PROMOTION_FULL_WRITE_KEYS = [
  "name",
  "promotion_type",
  "sale_price",
  "starts_at",
  "ends_at",
  "duration_seconds",
  "duration_amount",
  "duration_unit",
  "above_timer_text",
  "below_button_text",
] as const;

export type AuthorPromotionFormDraft = {
  name: string;
  salePrice: string;
  promotionType: "calendar" | "personal_countdown";
  startsAt: string;
  endsAt: string;
  durationAmount: string;
  durationUnit: PromotionDurationUnit;
  aboveTimerText: string;
  belowButtonText: string;
};

export const EMPTY_AUTHOR_PROMOTION_FORM: AuthorPromotionFormDraft = {
  name: "",
  salePrice: "499",
  promotionType: PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN,
  startsAt: "",
  endsAt: "",
  durationAmount: "20",
  durationUnit: "minutes",
  aboveTimerText: DEFAULT_PERSONAL_TIMER_ABOVE_TEXT,
  belowButtonText: DEFAULT_PERSONAL_TIMER_BELOW_TEXT,
};

export type AuthorPromotionFormSource = {
  name: string;
  promotion_type: "calendar" | "personal_countdown";
  sale_price: number;
  starts_at: string | null;
  ends_at: string | null;
  duration_seconds: number | null;
  above_timer_text?: string | null;
  below_button_text?: string | null;
};

export function durationSecondsToAmountUnit(
  seconds: number | null,
): { amount: number; unit: PromotionDurationUnit } {
  if (!seconds || seconds <= 0) {
    return { amount: 20, unit: "minutes" };
  }

  if (seconds % 86_400 === 0) {
    return { amount: seconds / 86_400, unit: "days" };
  }

  if (seconds % 3_600 === 0) {
    return { amount: seconds / 3_600, unit: "hours" };
  }

  const minutes = seconds % 60 === 0 ? seconds / 60 : Math.max(1, Math.round(seconds / 60));
  return { amount: minutes, unit: "minutes" };
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function promotionToFormDraft(
  row: AuthorPromotionFormSource,
): AuthorPromotionFormDraft {
  const duration = durationSecondsToAmountUnit(row.duration_seconds);
  const copy = resolvePersonalTimerCopy({
    aboveTimerText: row.above_timer_text,
    belowButtonText: row.below_button_text,
  });

  return {
    name: row.name,
    salePrice: String(row.sale_price),
    promotionType: row.promotion_type,
    startsAt: toDatetimeLocalValue(row.starts_at),
    endsAt: toDatetimeLocalValue(row.ends_at),
    durationAmount: String(duration.amount),
    durationUnit: duration.unit,
    aboveTimerText: copy.aboveTimerText,
    belowButtonText: copy.belowButtonText,
  };
}

export function buildPromotionWriteBody(
  draft: AuthorPromotionFormDraft,
  options?: { isActive?: boolean },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: draft.name.trim() || "Акция",
    promotion_type: draft.promotionType,
    sale_price: Number(draft.salePrice),
  };

  if (options && typeof options.isActive === "boolean") {
    body.is_active = options.isActive;
  }

  if (draft.promotionType === PRICE_PROMOTION_TYPES.CALENDAR) {
    body.starts_at = draft.startsAt ? new Date(draft.startsAt).toISOString() : "";
    body.ends_at = draft.endsAt ? new Date(draft.endsAt).toISOString() : "";
    return body;
  }

  body.duration_amount = Number(draft.durationAmount);
  body.duration_unit = draft.durationUnit;
  body.duration_seconds = durationToSeconds(
    Number(draft.durationAmount),
    draft.durationUnit,
  );
  body.above_timer_text = draft.aboveTimerText;
  body.below_button_text = draft.belowButtonText;
  return body;
}

/**
 * Fields written by PATCH. Never rotates start_token or reassigns
 * practice_id / ownership. Never writes practice_price_promotion_starts
 * (existing sale_price_snapshot / expires_at stay frozen). is_active is
 * only written when the body sends it explicitly, so a full edit cannot
 * silently re-enable a card.
 */
export function buildPromotionPatchUpdates(
  body: Record<string, unknown>,
  basePrice: number,
):
  | { ok: true; updates: Record<string, unknown> }
  | { ok: false; error: string } {
  const updates: Record<string, unknown> = {};

  if ("is_active" in body && typeof body.is_active === "boolean") {
    updates.is_active = body.is_active;
  }

  const hasFullWrite = PROMOTION_FULL_WRITE_KEYS.some((key) => key in body);

  if (hasFullWrite) {
    const parsed = parsePromotionWriteBody(body, basePrice);

    if (!parsed.ok) {
      return parsed;
    }

    updates.name = parsed.name;
    updates.promotion_type = parsed.promotionType;
    updates.sale_price = parsed.salePrice;
    updates.starts_at = parsed.startsAt;
    updates.ends_at = parsed.endsAt;
    updates.duration_seconds = parsed.durationSeconds;
    updates.above_timer_text = parsed.aboveTimerText;
    updates.below_button_text = parsed.belowButtonText;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: "invalid_request" };
  }

  delete updates.id;
  delete updates.practice_id;
  delete updates.start_token;

  return { ok: true, updates };
}

export function promotionMatchesPractice(
  row: { id: string; practice_id: string },
  practiceId: string,
  promotionId: string,
): boolean {
  return row.id === promotionId && row.practice_id === practiceId;
}

export function parsePromotionWriteBody(
  body: Record<string, unknown>,
  basePrice: number,
):
  | {
      ok: true;
      name: string;
      promotionType: "calendar" | "personal_countdown";
      salePrice: number;
      startsAt: string | null;
      endsAt: string | null;
      durationSeconds: number | null;
      aboveTimerText: string | null;
      belowButtonText: string | null;
      isActive: boolean;
    }
  | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name || name.length > PROMOTION_NAME_MAX_LENGTH) {
    return { ok: false, error: "invalid_promotion_name" };
  }

  if (!isPricePromotionType(body.promotion_type)) {
    return { ok: false, error: "invalid_promotion_type" };
  }

  const salePrice = parseIntegerRubles(body.sale_price);

  if (salePrice === null) {
    return { ok: false, error: "invalid_sale_price" };
  }

  const saleCheck = validateSalePriceRubles(salePrice, basePrice);

  if (!saleCheck.ok) {
    return { ok: false, error: saleCheck.code };
  }

  const isActive = body.is_active === undefined ? true : body.is_active === true;

  if (body.promotion_type === PRICE_PROMOTION_TYPES.CALENDAR) {
    const startsAt =
      typeof body.starts_at === "string" ? body.starts_at.trim() : "";
    const endsAt = typeof body.ends_at === "string" ? body.ends_at.trim() : "";
    const startMs = Date.parse(startsAt);
    const endMs = Date.parse(endsAt);

    if (!startsAt || !endsAt || Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return { ok: false, error: "invalid_calendar_window" };
    }

    if (endMs <= startMs) {
      return { ok: false, error: "invalid_calendar_window" };
    }

    return {
      ok: true,
      name,
      promotionType: PRICE_PROMOTION_TYPES.CALENDAR,
      salePrice,
      startsAt: new Date(startMs).toISOString(),
      endsAt: new Date(endMs).toISOString(),
      durationSeconds: null,
      aboveTimerText: null,
      belowButtonText: null,
      isActive,
    };
  }

  const durationSecondsDirect = parseIntegerRubles(body.duration_seconds);
  const durationAmount = parseIntegerRubles(body.duration_amount);
  const durationUnit = parseDurationUnit(body.duration_unit);
  const durationSeconds =
    durationSecondsDirect ??
    (durationAmount !== null && durationUnit
      ? durationToSeconds(durationAmount, durationUnit)
      : null);

  if (
    durationSeconds === null ||
    durationSeconds < MIN_DURATION_SECONDS ||
    durationSeconds > MAX_DURATION_SECONDS
  ) {
    return { ok: false, error: "invalid_duration" };
  }

  const aboveTimerText = parseOptionalCopyField(body.above_timer_text);
  if (!aboveTimerText.ok) {
    return aboveTimerText;
  }

  const belowButtonText = parseOptionalCopyField(body.below_button_text);
  if (!belowButtonText.ok) {
    return belowButtonText;
  }

  return {
    ok: true,
    name,
    promotionType: PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN,
    salePrice,
    startsAt: null,
    endsAt: null,
    durationSeconds,
    aboveTimerText: aboveTimerText.value,
    belowButtonText: belowButtonText.value,
    isActive,
  };
}

function parseOptionalCopyField(
  value: unknown,
):
  | { ok: true; value: string | null }
  | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false, error: "invalid_promotion_copy" };
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: true, value: null };
  }

  if (trimmed.length > PERSONAL_TIMER_COPY_MAX_LENGTH) {
    return { ok: false, error: "invalid_promotion_copy" };
  }

  return { ok: true, value: trimmed };
}

export function paidPriceRangeHint(): string {
  return `От ${MIN_PAID_PRICE_RUB} до ${MAX_PAID_PRICE_RUB.toLocaleString("ru-RU")} ₽`;
}
