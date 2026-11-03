/** @typedef {"unknown" | "granted" | "denied"} ConsentState */
/** @param {ConsentState} analytics @param {ConsentState} advertising */
export function consentBannerVariant(analytics, advertising) {
  if (analytics === "unknown") return advertising === "unknown" ? "all" : "analytics";
  return advertising === "unknown" ? "advertising" : null;
}

/**
 * The single-category prompts preserve the other category, including a prior denial.
 * @param {"all" | "analytics" | "advertising"} variant
 * @param {"allow" | "analytics-only" | "deny"} action
 * @param {{analytics: (value: "granted" | "denied") => void, advertising: (value: "granted" | "denied") => void}} write
 */
export function applyConsentBannerChoice(variant, action, write) {
  if (variant !== "advertising") write.analytics(action === "deny" ? "denied" : "granted");
  if (variant !== "analytics") write.advertising(action === "allow" ? "granted" : "denied");
}
