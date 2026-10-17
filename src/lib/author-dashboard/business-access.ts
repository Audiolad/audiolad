/**
 * «АудиоЛад Бизнес» in the author cabinet is available only to authors with a commercial status
 * (Sergey 17.10.2026, task 8dcba9d1). Authors without it still SEE the tab (muted); clicking it, or
 * opening /author-dashboard/business directly, shows a notice with a button to the EXISTING
 * commercial-status application flow. Pure and client-safe (used by the nav and the server page).
 */
import { isAuthorCommercialApprovedAccess, type AuthorAccessStatus } from "@/lib/authors/access";

export const BUSINESS_COMMERCIAL_REQUIRED_NOTICE =
  "Чтобы получить доступ к АудиоЛад Бизнесу, оформите коммерческий статус автора.";

export const BUSINESS_COMMERCIAL_REQUIRED_CTA = "Оформить коммерческий статус";

/** Same set as the rest of the cabinet's "approved commercial path": onboarding, active, suspended, legacy. */
export function authorCanOpenBusiness(
  accessStatus: AuthorAccessStatus | string | null | undefined,
): boolean {
  return isAuthorCommercialApprovedAccess(accessStatus);
}

/** Existing commercial-status application flow (same href as the «Статус» page CTA). */
export function buildCommercialApplicationHref(authorSlug?: string | null): string {
  const slug = authorSlug?.trim();
  return slug
    ? `/author-dashboard/commercial-application?author=${encodeURIComponent(slug)}`
    : "/author-dashboard/commercial-application";
}
