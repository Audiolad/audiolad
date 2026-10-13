import { isBusinessHostname } from "./host";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

/** On the business host `/catalog` does not exist — link to the apex catalog. */
export function resolveNotFoundCatalogHref(hostname: string): string {
  return isBusinessHostname(hostname)
    ? `${PRODUCTION_APP_ORIGIN}/catalog`
    : "/catalog";
}
