/** @typedef {"unknown" | "granted" | "denied"} AdvertisingConsentState */
export const ADVERTISING_COOKIES_STORAGE_KEY = "audiolad_advertising_cookies";
export const ADVERTISING_CONSENT_CHANGED_EVENT = "audiolad:advertising-consent-changed";

/** @returns {AdvertisingConsentState} */
export function readAdvertisingConsent() {
  if (typeof window === "undefined") return "unknown";
  try {
    const value = window.localStorage.getItem(ADVERTISING_COOKIES_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : "unknown";
  } catch {
    return "unknown";
  }
}

/** @param {"granted" | "denied"} state */
export function writeAdvertisingConsent(state) {
  window.localStorage.setItem(ADVERTISING_COOKIES_STORAGE_KEY, state);
  window.dispatchEvent(new CustomEvent(ADVERTISING_CONSENT_CHANGED_EVENT, { detail: { state } }));
}

/** @param {() => void} onChange */
export function subscribeAdvertisingConsent(onChange) {
  window.addEventListener(ADVERTISING_CONSENT_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ADVERTISING_CONSENT_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
