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

export function shouldEnableYandexMetrika(input?: {
  pathname?: string | null;
  hostname?: string | null;
}): boolean {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const hostname =
    input?.hostname ??
    (typeof window !== "undefined" ? window.location.hostname : null);

  if (isNonProductionAnalyticsHost(hostname)) {
    return false;
  }

  if (isAdminAnalyticsRoute(input?.pathname)) {
    return false;
  }

  return true;
}
