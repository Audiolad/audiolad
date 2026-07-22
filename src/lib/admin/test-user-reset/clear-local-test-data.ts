import { SESSION_STORAGE_KEY } from "@/lib/analytics/constants";
import { PERSONAL_HOME_STORAGE_KEYS } from "@/lib/home/personal-greeting";
import { PWA_LOCAL_STORAGE_KEYS } from "@/lib/pwa/constants";

const DESKTOP_PLAYER_KEY = "audiolad:desktop-player-last-session";
const PROMO_ATTRIBUTION_KEY = "audiolad_promo_attribution";
const ANALYTICS_ATTRIBUTION_KEY = "audiolad_attribution";
const ANONYMOUS_ID_KEY = "audiolad_anonymous_id";
const ANALYTICS_COOKIES_KEY = "audiolad_analytics_cookies";
const PERSONAL_MATERIAL_ACCESS_KEY = "audiolad_pm_access_url";
const PLAYER_DEBUG_KEY = "audiolad-player-debug";

export const TEST_USER_LOCAL_STORAGE_KEYS = [
  ANONYMOUS_ID_KEY,
  ANALYTICS_ATTRIBUTION_KEY,
  PROMO_ATTRIBUTION_KEY,
  DESKTOP_PLAYER_KEY,
  ANALYTICS_COOKIES_KEY,
  PERSONAL_MATERIAL_ACCESS_KEY,
  PWA_LOCAL_STORAGE_KEYS.deviceState,
  PWA_LOCAL_STORAGE_KEYS.valueMomentAt,
  PWA_LOCAL_STORAGE_KEYS.visitCount,
  PWA_LOCAL_STORAGE_KEYS.sessionId,
  PERSONAL_HOME_STORAGE_KEYS.lastGreeting,
  PERSONAL_HOME_STORAGE_KEYS.lastWisdom,
] as const;

export const TEST_USER_SESSION_STORAGE_KEYS = [
  SESSION_STORAGE_KEY,
  PWA_LOCAL_STORAGE_KEYS.sessionBannerShown,
  PERSONAL_MATERIAL_ACCESS_KEY,
  PLAYER_DEBUG_KEY,
] as const;

export function clearAudioladLocalTestData(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const cleared: string[] = [];

  for (const key of TEST_USER_LOCAL_STORAGE_KEYS) {
    try {
      if (window.localStorage.getItem(key) !== null) {
        window.localStorage.removeItem(key);
        cleared.push(`localStorage:${key}`);
      }
    } catch {
      // ignore unavailable storage
    }
  }

  for (const key of TEST_USER_SESSION_STORAGE_KEYS) {
    try {
      if (window.sessionStorage.getItem(key) !== null) {
        window.sessionStorage.removeItem(key);
        cleared.push(`sessionStorage:${key}`);
      }
    } catch {
      // ignore unavailable storage
    }
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);

    if (!key) {
      continue;
    }

    if (
      key.startsWith("audiolad_guest_progress:") ||
      key.startsWith("audiolad_pm_progress:")
    ) {
      window.localStorage.removeItem(key);
      cleared.push(`localStorage:${key}`);
    }
  }

  return cleared;
}
