import { slugifyTitle } from "@/lib/author-products/utils";
import {
  QUICK_OFFER_DEFAULT_CTA_TEXT,
  QUICK_OFFER_DEFAULT_TIMER_SECONDS,
  QUICK_OFFER_FORMAT_PRESETS,
  QUICK_OFFER_MAX_MATERIALS,
  QUICK_OFFER_TEMPLATE_KEY,
  QUICK_OFFER_TIMER_PRESETS_SECONDS,
} from "@/lib/quick-offers/types";

export const QUICK_OFFER_SLUG_PATTERN = /^[a-z0-9-]{2,64}$/;
export const QUICK_OFFER_SLUG_MAX_LENGTH = 64;
export const QUICK_OFFER_TITLE_MAX_LENGTH = 160;
export const QUICK_OFFER_DESCRIPTION_MAX_LENGTH = 500;
export const QUICK_OFFER_CTA_MAX_LENGTH = 80;
export const QUICK_OFFER_FORMAT_LABEL_MAX_LENGTH = 6;
export const QUICK_OFFER_PROMO_PRICE_MAX = 999_999;
export const QUICK_OFFER_TIMER_MIN_SECONDS = 60;
export const QUICK_OFFER_TIMER_MAX_SECONDS = 24 * 60 * 60;

export function normalizeQuickOfferSlug(value: string): string {
  return slugifyTitle(value).slice(0, QUICK_OFFER_SLUG_MAX_LENGTH);
}

export function validateQuickOfferSlug(value: string): string | null {
  const normalized = normalizeQuickOfferSlug(value);

  if (!normalized) {
    return "quick_offer_slug_required";
  }

  if (normalized.length < 2) {
    return "quick_offer_slug_too_short";
  }

  if (!QUICK_OFFER_SLUG_PATTERN.test(normalized)) {
    return "quick_offer_slug_invalid";
  }

  return null;
}

export function validateQuickOfferTitle(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "quick_offer_title_required";
  }

  if (trimmed.length > QUICK_OFFER_TITLE_MAX_LENGTH) {
    return "quick_offer_title_too_long";
  }

  return null;
}

export function validateQuickOfferDescription(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "quick_offer_description_required";
  }

  if (trimmed.length > QUICK_OFFER_DESCRIPTION_MAX_LENGTH) {
    return "quick_offer_description_too_long";
  }

  return null;
}

export function validateQuickOfferCtaText(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "quick_offer_cta_required";
  }

  if (trimmed.length > QUICK_OFFER_CTA_MAX_LENGTH) {
    return "quick_offer_cta_too_long";
  }

  return null;
}

export function normalizeFormatLabel(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]/g, "").trim();
}

export function validateFormatLabel(value: string): string | null {
  const normalized = normalizeFormatLabel(value);

  if (!normalized) {
    return "quick_offer_format_required";
  }

  if (normalized.includes("\n") || /[\r\n\u2028\u2029]/.test(value)) {
    return "quick_offer_format_newline";
  }

  if (normalized.length > QUICK_OFFER_FORMAT_LABEL_MAX_LENGTH) {
    return "quick_offer_format_too_long";
  }

  return null;
}

export function isFormatPreset(value: string): boolean {
  return (QUICK_OFFER_FORMAT_PRESETS as readonly string[]).includes(value);
}

export function validatePromoPrice(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return "quick_offer_promo_price_invalid";
  }

  if (value <= 0) {
    return "quick_offer_promo_price_invalid";
  }

  if (value > QUICK_OFFER_PROMO_PRICE_MAX) {
    return "quick_offer_promo_price_too_high";
  }

  return null;
}

export function validateTimerDurationSeconds(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return "quick_offer_timer_invalid";
  }

  if (
    value < QUICK_OFFER_TIMER_MIN_SECONDS ||
    value > QUICK_OFFER_TIMER_MAX_SECONDS
  ) {
    return "quick_offer_timer_invalid";
  }

  return null;
}

export function isTimerPreset(value: number): boolean {
  return (QUICK_OFFER_TIMER_PRESETS_SECONDS as readonly number[]).includes(
    value,
  );
}

export function validateTemplateKey(value: string): string | null {
  if (value !== QUICK_OFFER_TEMPLATE_KEY) {
    return "quick_offer_template_unsupported";
  }

  return null;
}

export function validateMaterialCount(count: number): string | null {
  if (count < 1) {
    return "quick_offer_materials_required";
  }

  if (count > QUICK_OFFER_MAX_MATERIALS) {
    return "quick_offer_materials_too_many";
  }

  return null;
}

export function defaultCtaText(): string {
  return QUICK_OFFER_DEFAULT_CTA_TEXT;
}

export function defaultTimerSeconds(): number {
  return QUICK_OFFER_DEFAULT_TIMER_SECONDS;
}

export type QuickOfferEligiblePracticeInput = {
  author_id: string;
  status: string;
  is_free: boolean | null;
  price: number | null;
};

export function isPracticeQuickOfferEligible(
  practice: QuickOfferEligiblePracticeInput,
  offerAuthorId: string,
): boolean {
  if (practice.author_id !== offerAuthorId) {
    return false;
  }

  if (practice.status !== "published") {
    return false;
  }

  if (practice.is_free === true) {
    return false;
  }

  return typeof practice.price === "number" && practice.price > 0;
}
