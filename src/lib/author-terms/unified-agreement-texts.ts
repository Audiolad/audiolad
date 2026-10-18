/**
 * Client-safe texts of the unified agreement 2.0 (no legal body here: that lives in
 * approved-content-v2.ts and must not be pulled into client bundles).
 */
export const UNIFIED_AGREEMENT_ACCEPTANCE_TEXT =
  "Я ознакомился(ась) с Единым коммерческим соглашением с правообладателем (Авторские условия сотрудничества «АудиоЛад», редакция 2.0) и принимаю его в полном объёме, включая использование моей музыки в «АудиоЛад Бизнес» и сублицензирование заведениям.";

export const UNIFIED_AGREEMENT_ACCEPTANCE_TEXT_UPDATED =
  "Я ознакомился(ась) с новой редакцией 2.0 — Единым коммерческим соглашением с правообладателем — и принимаю её в полном объёме, включая использование моей музыки в «АудиоЛад Бизнес» и сублицензирование заведениям.";

/**
 * Checkbox texts per unified edition, recorded verbatim in author_terms_acceptances.acceptance_text.
 * 2.0 strings are frozen (already recorded for 2.0 acceptances). 2.1 names the new use explicitly
 * (offline cache of the venue player, 8.2) – it needs an explicit acceptance.
 */
export const UNIFIED_AGREEMENT_ACCEPTANCE_TEXTS: Readonly<Record<string, { first: string; updated: string }>> = {
  "2.0": { first: UNIFIED_AGREEMENT_ACCEPTANCE_TEXT, updated: UNIFIED_AGREEMENT_ACCEPTANCE_TEXT_UPDATED },
  "2.1": {
    first:
      "Я ознакомился(ась) с Единым коммерческим соглашением с правообладателем (Авторские условия сотрудничества «АудиоЛад», редакция 2.1) и принимаю его в полном объёме, включая использование моей музыки в «АудиоЛад Бизнес», сублицензирование заведениям и работу плеера заведения без подключения к сети.",
    updated:
      "Я ознакомился(ась) с новой редакцией 2.1 Единого коммерческого соглашения с правообладателем и принимаю её в полном объёме, включая использование моей музыки в «АудиоЛад Бизнес», сублицензирование заведениям и работу плеера заведения без подключения к сети.",
  },
};

/** Checkbox text for the unified edition shown (unknown version: the 2.0 text, the previous behaviour). */
export function unifiedAgreementAcceptanceText(version: string | null | undefined, mode: "first" | "updated"): string {
  const texts = (version && UNIFIED_AGREEMENT_ACCEPTANCE_TEXTS[version]) || UNIFIED_AGREEMENT_ACCEPTANCE_TEXTS["2.0"];
  return mode === "updated" ? texts.updated : texts.first;
}

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
