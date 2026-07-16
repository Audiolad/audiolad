import {
  isPracticePublished,
  type ProductAccessReason,
  type ProductAccessResult,
} from "@/lib/products/access";

export function isPracticeGuestAccessEnabled(practice: {
  guest_access_enabled?: boolean | null;
  status: string | null | undefined;
}): boolean {
  return (
    practice.guest_access_enabled === true &&
    isPracticePublished(practice.status)
  );
}

export function isGuestPromoListenReason(
  reason: ProductAccessReason,
): boolean {
  return reason === "guest_promo" || reason === "free";
}

export function shouldShowPromoConversionFlow(input: {
  isAuthenticated: boolean;
  hasEntitlement: boolean;
  canListen: boolean;
  accessReason: ProductAccessReason;
}): boolean {
  return (
    input.canListen &&
    !input.isAuthenticated &&
    isGuestPromoListenReason(input.accessReason)
  );
}

export function shouldUseGuestProgressPersistence(input: {
  isAuthenticated: boolean;
  canListen: boolean;
  accessReason: ProductAccessReason;
}): boolean {
  return (
    !input.isAuthenticated &&
    input.canListen &&
    isGuestPromoListenReason(input.accessReason)
  );
}

export function isPromoGuestAccess(access: ProductAccessResult): boolean {
  return access.reason === "guest_promo";
}
