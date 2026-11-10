import { BUSINESS_OFFER_HREF, BUSINESS_ONBOARDING_HREF } from "@/lib/business/offer";
import { BUSINESS_PLAN_MONTHLY_PRICE_RUB } from "@/lib/business/plan";

export const BUSINESS_SUBSCRIPTION_ORDER_KIND = "business_subscription";

export type BusinessPayErrorCode =
  | "unauthorized"
  | "offer_acceptance_required"
  | "not_organization_owner"
  | "venue_device"
  | "support_mode_consent_forbidden"
  | "payments_not_configured"
  | "invalid_request"
  | "receipt_email_required"
  | "venue_topup_not_available"
  | "pending_order_mismatch"
  | "partner_terms_changed"
  | "partner_period_in_payment"
  | "internal_error";

export const BUSINESS_STANDARD_UNIT_PRICE_MINOR = BUSINESS_PLAN_MONTHLY_PRICE_RUB * 100;

/**
 * Per-venue price the owner saw next to «Оплатить» (8142d69a). Absent = the standard price
 * (older clients). Whole rubles in kopecks, never fractions; null = malformed request.
 */
export function parseConfirmedUnitPriceMinor(raw: unknown): number | null {
  if (raw === undefined || raw === null) return BUSINESS_STANDARD_UNIT_PRICE_MINOR;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 100 || raw > BUSINESS_STANDARD_UNIT_PRICE_MINOR || raw % 100 !== 0) {
    return null;
  }
  return raw;
}

const RECEIPT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A guest-start account has no email. The receipt (чек) still needs one, typed at payment time. */
export function normalizeBusinessReceiptEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || /[\u0000-\u001f\u007f]/.test(email)) return null;
  return RECEIPT_EMAIL_PATTERN.test(email) ? email : null;
}

/** user_metadata key for the receipt email of an account without its own email (t1343u). */
export const BUSINESS_RECEIPT_EMAIL_META_KEY = "receipt_email";

/** The remembered receipt email from auth user_metadata, or null. */
export function savedBusinessReceiptEmail(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  return normalizeBusinessReceiptEmail((meta as Record<string, unknown>)[BUSINESS_RECEIPT_EMAIL_META_KEY]);
}

/**
 * The account email wins. Without it the email typed for the receipt is used, then the
 * remembered one (auth user_metadata.receipt_email, t1343u).
 */
export function resolveBusinessReceiptEmail(
  accountEmail: string | null | undefined,
  typed: unknown,
  saved: string | null = null,
): string | null {
  const account = accountEmail?.trim() ?? "";
  if (account) return account;
  return normalizeBusinessReceiptEmail(typed) ?? normalizeBusinessReceiptEmail(saved);
}

/**
 * Which receipt email to remember after a checkout start: only for an account without its
 * own email, only a valid one, only when it differs from what is already saved.
 */
export function businessReceiptEmailToRemember(
  accountEmail: string | null | undefined,
  used: string,
  saved: string | null,
): string | null {
  if (accountEmail?.trim()) return null;
  const email = normalizeBusinessReceiptEmail(used);
  if (!email || email === normalizeBusinessReceiptEmail(saved)) return null;
  return email;
}

/** The payer is the owner account, and only from a browser that is not the hall device. */
export function ownerCanPayFromThisBrowser(ownerRole: boolean, venueDevice: boolean): boolean {
  return ownerRole && !venueDevice;
}

export function mapBusinessSubscriptionRpcError(message: string): {
  status: number;
  error: BusinessPayErrorCode;
  href: string | null;
} {
  const normalized = message.toLowerCase();
  if (normalized.includes("venue_topup_not_available")) return { status: 409, error: "venue_topup_not_available", href: null };
  if (normalized.includes("pending_order_mismatch")) return { status: 409, error: "pending_order_mismatch", href: null };
  // 8142d69a: the per-venue price changed since the owner saw it (code applied or used up).
  if (normalized.includes("partner_period_in_payment")) return { status: 409, error: "partner_period_in_payment", href: null };
  if (normalized.includes("partner_terms_changed")) return { status: 409, error: "partner_terms_changed", href: null };
  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized", href: null };
  }
  if (normalized.includes("support_mode_consent_forbidden")) {
    return { status: 403, error: "support_mode_consent_forbidden", href: null };
  }
  if (normalized.includes("offer_acceptance_required") || normalized.includes("offer_document_unknown")) {
    return { status: 409, error: "offer_acceptance_required", href: BUSINESS_OFFER_HREF };
  }
  if (normalized.includes("not_organization_owner")) {
    return { status: 403, error: "not_organization_owner", href: BUSINESS_ONBOARDING_HREF };
  }
  return { status: 500, error: "internal_error", href: null };
}
