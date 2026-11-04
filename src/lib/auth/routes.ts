const PRIVATE_ROUTE_PREFIXES = [
  "/profile",
  "/my-practices",
  "/my-materials",
  "/favorites",
  "/history",
  "/downloads",
  "/purchases",
  "/playlists",
  "/editorial",
  "/settings",
  "/author-dashboard",
  "/admin",
  "/classica/production",
] as const;

const AUTH_ROUTES = [
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/forgot-password",
  "/auth/recovery",
  "/auth/reset-password",
] as const;

/** Routes that redirect authenticated users to the app home/profile. */
const AUTH_ENTRY_ROUTES = ["/auth/sign-in", "/auth/sign-up"] as const;

const DEFAULT_AUTHENTICATED_REDIRECT = "/profile";

export const SIGN_UP_DEFAULT_REDIRECT = "/my-practices";

const DISALLOWED_NEXT_SCHEMES = [
  "http:",
  "https:",
  "javascript:",
  "data:",
] as const;

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPlaylistCatalogPath(pathname: string): boolean {
  return (
    pathname === "/playlists/catalog" ||
    pathname.startsWith("/playlists/catalog/")
  );
}

export function isPrivateRoute(pathname: string): boolean {
  if (isPublicPlaylistCatalogPath(pathname)) {
    return false;
  }

  if (pathname.startsWith("/playlist/")) {
    return true;
  }

  return PRIVATE_ROUTE_PREFIXES.some((prefix) =>
    matchesRoutePrefix(pathname, prefix),
  );
}

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => matchesRoutePrefix(pathname, route));
}

export function isAuthEntryRoute(pathname: string): boolean {
  return AUTH_ENTRY_ROUTES.some((route) => matchesRoutePrefix(pathname, route));
}

function getPathnameFromNext(next: string): string {
  const withoutHash = next.split("#")[0] ?? next;
  const pathname = withoutHash.split("?")[0] ?? withoutHash;

  return pathname;
}

const NEXT_PATH_BASE_ORIGIN = "https://audiolad.invalid";

function isUnsafeNextPath(value: string): boolean {
  if (/[\p{Cc}\p{White_Space}\uFEFF]/u.test(value)) {
    return true;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return true;
  }

  if (value.includes("\\")) {
    return true;
  }

  const lower = value.toLowerCase();

  if (DISALLOWED_NEXT_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    return true;
  }

  if (lower.includes("://")) {
    return true;
  }

  return isAuthEntryRoute(getPathnameFromNext(value));
}

export function resolveValidatedNextPath(
  next: string | null | undefined,
): string | null {
  if (!next || typeof next !== "string") {
    return null;
  }

  let value = next;
  let normalized: string | null = null;

  try {
    // Validate every decoding layer, while preserving the original URL encoding.
    while (true) {
      if (isUnsafeNextPath(value)) {
        return null;
      }

      const parsed = new URL(value, NEXT_PATH_BASE_ORIGIN);
      const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      if (parsed.origin !== NEXT_PATH_BASE_ORIGIN || isUnsafeNextPath(path)) {
        return null;
      }
      normalized ??= path;

      const decoded = decodeURIComponent(value);
      if (decoded === value) {
        return normalized;
      }
      value = decoded;
    }
  } catch {
    return null;
  }
}

export function getSafeNextPath(
  next: string | null | undefined,
  fallback: string = DEFAULT_AUTHENTICATED_REDIRECT,
): string {
  return (
    resolveValidatedNextPath(next) ??
    resolveValidatedNextPath(fallback) ??
    DEFAULT_AUTHENTICATED_REDIRECT
  );
}

export function buildAuthRouteHref(
  route: "/auth/sign-in" | "/auth/sign-up" | "/auth/forgot-password",
  next: string | null | undefined,
  extraParams?: Record<string, string>,
): string {
  const params = new URLSearchParams();

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) {
        params.set(key, value);
      }
    }
  }

  const validatedNext = resolveValidatedNextPath(next);

  if (validatedNext) {
    params.set("next", validatedNext);
  }

  const query = params.toString();

  return query ? `${route}?${query}` : route;
}
