import { isMaxHostname } from "@/lib/max/host";
import { isAccessTokenAnalyticsRoute } from "@/lib/products/access-links";

const NON_PRODUCTION_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

const ADMIN_ROUTE_PREFIX = "/admin";

export function isAdminAnalyticsRoute(pathname: string | null | undefined): boolean {
  const normalized = pathname?.trim() || "/";

  return (
    normalized === ADMIN_ROUTE_PREFIX ||
    normalized.startsWith(`${ADMIN_ROUTE_PREFIX}/`)
  );
}

export function isNonProductionAnalyticsHost(hostname: string | null | undefined): boolean {
  const normalized = hostname?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return true;
  }

  if (NON_PRODUCTION_HOSTS.has(normalized)) {
    return true;
  }

  if (normalized.endsWith(".local")) {
    return true;
  }

  return false;
}

function resolveAnalyticsHostname(hostname?: string | null): string {
  return (
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : null) ??
    ""
  )
    .trim()
    .toLowerCase();
}

export function isMaxYandexAnalyticsHost(hostname?: string | null): boolean {
  const normalized = resolveAnalyticsHostname(hostname);
  return normalized.length > 0 && isMaxHostname(normalized);
}

/**
 * Yandex Metrika cookie-consent banner is MAX-host-only suppression.
 * Ordinary audiolad.ru eligibility (localhost/admin/recovery) stays unchanged.
 */
export function shouldShowYandexAnalyticsConsentBanner(input?: {
  hostname?: string | null;
}): boolean {
  return !isMaxYandexAnalyticsHost(input?.hostname);
}

export function shouldEnableYandexMetrika(input?: {
  pathname?: string | null;
  hostname?: string | null;
}): boolean {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const hostname = resolveAnalyticsHostname(input?.hostname);

  if (isNonProductionAnalyticsHost(hostname)) {
    return false;
  }

  // MAX Mini App WebView: do not load Yandex Metrika. Host-based, not pathname.
  if (isMaxYandexAnalyticsHost(hostname)) {
    return false;
  }

  if (isAdminAnalyticsRoute(input?.pathname)) {
    return false;
  }

  if (isAccessTokenAnalyticsRoute(input?.pathname)) {
    return false;
  }

  return true;
}
