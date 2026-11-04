import { getSupabaseCookieOptions, parseCookieHeader } from "@/lib/supabase/cookie-domain";
import { clearAudioladLocalTestData } from "@/lib/admin/test-user-reset/clear-local-test-data";
import { isCoffeeTestCookieName, isCoffeeTestStorageKey } from "./model";

function wipe(storage: Storage | undefined): number {
  if (!storage) return 0;
  let removed = 0;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && isCoffeeTestStorageKey(key)) {
      storage.removeItem(key);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Wipes this origin's Audiolad localStorage/sessionStorage and our readable cookies
 * (host-only and .audiolad.ru copies). Httponly cookies are expired by the server.
 * Returns the number of removed entries (no names, nothing is sent anywhere).
 */
export function clearCoffeeTestBrowserState(): number {
  if (typeof window === "undefined") return 0;
  let removed = clearAudioladLocalTestData().length;
  try { removed += wipe(window.localStorage); } catch { /* storage unavailable */ }
  try { removed += wipe(window.sessionStorage); } catch { /* storage unavailable */ }
  const domain = getSupabaseCookieOptions(window.location.hostname).domain;
  for (const { name } of parseCookieHeader(document.cookie)) {
    if (!isCoffeeTestCookieName(name)) continue;
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    if (domain) document.cookie = `${name}=; Path=/; Max-Age=0; Domain=${domain}; SameSite=Lax; Secure`;
    removed += 1;
  }
  return removed;
}
