import { isBusinessCabinetReturnNext, isBusinessTrialNext } from "@/lib/access-grants/paths";
import { isBusinessHostname, normalizeHostname } from "@/lib/business-app/host";

export type AuthVariant = "ordinary" | "business";

/** Presentation only. Never use this selector to grant access or choose a redirect. */
export function selectAuthVariant({
  next,
  from,
  hostname,
}: {
  next?: string | null;
  from?: string | null;
  hostname?: string | null;
}): AuthVariant {
  let decodedNext = next ?? "";
  try {
    decodedNext = decodeURIComponent(decodedNext);
  } catch {
    decodedNext = "";
  }

  return from === "business" ||
    isBusinessHostname(normalizeHostname(hostname)) ||
    isBusinessTrialNext(decodedNext) ||
    isBusinessCabinetReturnNext(decodedNext)
    ? "business"
    : "ordinary";
}

/** buildAuthRouteHref still validates and preserves the original next value. */
export function authVariantLinkParams(variant: AuthVariant): Record<string, string> {
  return variant === "business" ? { from: "business" } : {};
}
