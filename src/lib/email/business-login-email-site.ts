import { getHostBrandName } from "@/lib/business-app/brand-icons";
import { BUSINESS_HOSTNAME, COFFEE_ORIGIN, isCoffeeHostname } from "@/lib/business-app/host";
import { BUSINESS_CABINET_RETURN_PATH } from "@/lib/access-grants/paths";
import { publicHostnameFromHeaders } from "@/lib/supabase/cookie-domain";

export type BusinessLoginEmailSite = {
  coffee: boolean;
  brand: string;
  /** Where the login link lands (auth callback origin). */
  authOrigin: string;
  next: string;
};

/**
 * Brand and link target of the «Вход в кабинет» email, from the request the visitor made (t1442u).
 * Server actions on coffee cabinet pages run on the internal rewrite request (`Host: localhost`),
 * so the public host must come from `publicHostnameFromHeaders`, never from `Host` alone.
 * Resolve it synchronously in the request, before `after()`.
 */
export function businessLoginEmailSite(requestHeaders: { get(name: string): string | null }): BusinessLoginEmailSite {
  const hostname = publicHostnameFromHeaders(requestHeaders);
  const coffee = isCoffeeHostname(hostname);
  return {
    coffee,
    brand: getHostBrandName(coffee ? hostname : BUSINESS_HOSTNAME),
    // Business auth lives on the apex, coffee auth on coffee itself.
    authOrigin: coffee ? COFFEE_ORIGIN : "https://audiolad.ru",
    next: coffee ? "/cabinet" : BUSINESS_CABINET_RETURN_PATH,
  };
}

