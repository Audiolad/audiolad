/** Only sound choices cross hosts. Auth, point credentials and playback leases never do. */
import { getSupabaseCookieOptions, parseCookieHeader, serialize } from "@/lib/supabase/cookie-domain";
import { coffeeHostEnabled } from "./host";

const PREFIX = "al-coffee-pref-";
export function sharedCoffeeStorageKey(key: string): boolean {
  return key === "audiolad-business-sound-profile" ||
    key === "audiolad-business-cafe-queue-prefs" ||
    key === "audiolad-business-cafe-daypart-hours" ||
    /^audiolad-business-cafe-daypart-hours:[a-f0-9-]{36}$/i.test(key);
}

function shared(key: string): boolean {
  return coffeeHostEnabled() && sharedCoffeeStorageKey(key) &&
    Boolean(getSupabaseCookieOptions(window.location.hostname).domain);
}
function cookieName(key: string): string {
  return PREFIX + key.replace("audiolad-business-", "").replaceAll(":", "-");
}

/** Shared value wins over a stale origin copy. Missing shared values migrate once. */
export const coffeeStorage = {
  getItem(key: string): string | null {
    if (shared(key)) {
      const value = parseCookieHeader(document.cookie).find((c) => c.name === cookieName(key))?.value;
      if (value !== undefined) {
        try { window.localStorage.setItem(key, value); } catch { /* shared cookie still works */ }
        return value;
      }
    }
    const legacy = window.localStorage.getItem(key);
    if (legacy !== null && shared(key)) coffeeStorage.setItem(key, legacy);
    return legacy;
  },
  setItem(key: string, value: string): void {
    if (shared(key) && encodeURIComponent(value).length < 3000) {
      document.cookie = serialize(cookieName(key), value, {
        ...getSupabaseCookieOptions(window.location.hostname),
        sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60,
      });
    }
    window.localStorage.setItem(key, value);
  },
};

/** Called on the legacy origin before the first coffee visit. Never export unrelated storage. */
export function migrateCoffeeSettings(): void {
  for (const key of ["audiolad-business-sound-profile", "audiolad-business-cafe-queue-prefs", "audiolad-business-cafe-daypart-hours"]) {
    coffeeStorage.getItem(key);
  }
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && sharedCoffeeStorageKey(key)) coffeeStorage.getItem(key);
  }
}
