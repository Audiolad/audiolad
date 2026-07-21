const PRIVATE_ROUTE_PREFIXES = [
  "/profile",
  "/my-practices",
  "/my-materials",
  "/favorites",
  "/history",
  "/downloads",
  "/purchases",
  "/playlists",
  "/settings",
  "/author-dashboard",
  "/admin",
] as const;

const AUTH_ROUTES = [
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/forgot-password",
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

export function isPrivateRoute(pathname: string): boolean {
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

function isUnsafeNextPath(trimmed: string): boolean {
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return true;
  }

  if (trimmed.includes("\\")) {
    return true;
  }

  const lower = trimmed.toLowerCase();

  if (DISALLOWED_NEXT_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    return true;
  }

  if (lower.includes("://")) {
    return true;
  }

  let decoded = trimmed;

  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return true;
  }

  if (decoded.startsWith("//")) {
    return true;
  }

  const pathname = getPathnameFromNext(decoded);

  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return true;
  }

  return isAuthEntryRoute(pathname);
}

export function resolveValidatedNextPath(
  next: string | null | undefined,
): string | null {
  if (!next || typeof next !== "string") {
    return null;
  }

  const trimmed = next.trim();

  if (isUnsafeNextPath(trimmed)) {
    return null;
  }

  return trimmed;
}

export function getSafeNextPath(
  next: string | null | undefined,
  fallback: string = DEFAULT_AUTHENTICATED_REDIRECT,
): string {
  return resolveValidatedNextPath(next) ?? fallback;
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
