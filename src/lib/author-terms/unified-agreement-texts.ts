/**
 * Client-safe texts of the unified agreement 2.0 (no legal body here: that lives in
 * approved-content-v2.ts and must not be pulled into client bundles).
 */
export const UNIFIED_AGREEMENT_ACCEPTANCE_TEXT =
  "Я ознакомился(ась) с Единым коммерческим соглашением с правообладателем (Авторские условия сотрудничества «АудиоЛад», редакция 2.0) и принимаю его в полном объёме, включая использование моей музыки в «АудиоЛад Бизнес» и сублицензирование заведениям.";

export const UNIFIED_AGREEMENT_ACCEPTANCE_TEXT_UPDATED =
  "Я ознакомился(ась) с новой редакцией 2.0 — Единым коммерческим соглашением с правообладателем — и принимаю её в полном объёме, включая использование моей музыки в «АудиоЛад Бизнес» и сублицензирование заведениям.";

export const UNIFIED_AGREEMENT_TITLE = "Единое коммерческое соглашение с правообладателем";

/** Product statuses shown to authors: only two. Internal access_status values are unchanged. */
export type AuthorProductStatus = "free" | "commercial";

export const AUTHOR_PRODUCT_STATUS_LABEL: Record<AuthorProductStatus, string> = {
  free: "Бесплатный",
  commercial: "Коммерческий",
};

/** commercial_pending = application not yet approved: still «Бесплатный». */
const COMMERCIAL_ACCESS_STATUSES = new Set([
  "commercial_onboarding",
  "commercial_active",
  "commercial",
  "commercial_suspended",
]);

/**
 * Map internal author access_status to the two public statuses.
 * Anything on the commercial track (onboarding, active, suspended…) is «Коммерческий»;
 * onboarding steps are shown as steps inside it.
 */
export function mapAuthorAccessStatusToProductStatus(accessStatus: string | null | undefined): AuthorProductStatus {
  return accessStatus && COMMERCIAL_ACCESS_STATUSES.has(accessStatus) ? "commercial" : "free";
}
