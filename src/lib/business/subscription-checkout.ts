import { BUSINESS_OFFER_HREF, BUSINESS_ONBOARDING_HREF } from "@/lib/business/offer";

export const BUSINESS_SUBSCRIPTION_ORDER_KIND = "business_subscription";

export type BusinessPayErrorCode =
  | "unauthorized"
  | "offer_acceptance_required"
  | "not_organization_owner"
  | "support_mode_consent_forbidden"
  | "payments_not_configured"
  | "invalid_request"
  | "internal_error";

export function mapBusinessSubscriptionRpcError(message: string): {
  status: number;
  error: BusinessPayErrorCode;
  href: string | null;
} {
  const normalized = message.toLowerCase();
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
