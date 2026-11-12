/**
 * «АудиоЛад Бизнес» in the author cabinet is available only to authors with a commercial status
 * (Sergey 17.10.2026, task 8dcba9d1). Authors without it still SEE the tab (muted); clicking it, or
 * opening /author-dashboard/business directly, shows a notice with a button to the EXISTING
 * commercial-status application flow. Pure and client-safe (used by the nav and the server page).
 *
 * Temporary pause (Sergey 12.11.2026, task t1386u): flip AUTHOR_CABINET_BUSINESS_ADMISSION_ENABLED
 * back to true to restore the tab, the page and author-side submission. When it is false the tab is
 * hidden for every author, /author-dashboard/business redirects to the cabinet, and the verification
 * form refuses to call the submit RPCs. The hall player, owner cabinet, admin tools and tracks
 * already in Business are unchanged.
 */
import { isAuthorCommercialApprovedAccess, type AuthorAccessStatus } from "@/lib/authors/access";

/**
 * Master switch for the author-cabinet Business tab, deep link and admission form.
 * Set to true to restore the previous behaviour (commercial authors get the link,
 * others see the muted tab and notice). No migration required.
 */
export const AUTHOR_CABINET_BUSINESS_ADMISSION_ENABLED = false;

export function isAuthorCabinetBusinessAdmissionEnabled(): boolean {
  return AUTHOR_CABINET_BUSINESS_ADMISSION_ENABLED;
}

export const BUSINESS_COMMERCIAL_REQUIRED_NOTICE =
  "Чтобы получить доступ к АудиоЛад Бизнесу, оформите коммерческий статус автора.";

export const BUSINESS_COMMERCIAL_REQUIRED_CTA = "Оформить коммерческий статус";

/** DOM id of the notice: the locked nav tab points aria-controls at it (nav notice or the page notice). */
export const BUSINESS_LOCKED_NOTICE_ID = "author-nav-business-locked-notice";

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
