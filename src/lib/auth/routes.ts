const PRIVATE_ROUTE_PREFIXES = [
  "/profile",
  "/my-practices",
  "/listen",
  "/favorites",
  "/history",
  "/downloads",
  "/purchases",
  "/playlists",
  "/settings",
  "/author-dashboard",
] as const;

const AUTH_ROUTES = ["/auth/sign-in", "/auth/sign-up"] as const;

const DEFAULT_AUTHENTICATED_REDIRECT = "/profile";

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

  return isAuthRoute(pathname);
}

export function getSafeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== "string") {
    return DEFAULT_AUTHENTICATED_REDIRECT;
  }

  const trimmed = next.trim();

  if (isUnsafeNextPath(trimmed)) {
    return DEFAULT_AUTHENTICATED_REDIRECT;
  }

  return trimmed;
}
