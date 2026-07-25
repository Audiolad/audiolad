const MAX_PATH_LENGTH = 512;

const SENSITIVE_QUERY_MARKERS = [
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "code",
  "email",
  "phone",
  "password",
  "signature",
  "sig",
  "checkout",
];

/**
 * Pathname-only sanitizer for checkout_origin_path snapshots.
 * Strips query, fragment, host, tokens and traversal segments.
 */
export function sanitizeCheckoutOriginPath(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  let raw = value.trim();
  if (!raw) {
    return null;
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      raw = url.pathname || "/";
    }
  } catch {
    return null;
  }

  const withoutHash = raw.split("#", 1)[0] ?? "";
  const withoutQuery = withoutHash.split("?", 1)[0] ?? "";
  let path = withoutQuery.replace(/[\u0000-\u001F\u007F]/g, "");
  path = path.replace(/\s+/g, "");

  if (!path) {
    return null;
  }

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  path = path.replace(/\/{2,}/g, "/");

  if (/(^|\/)\.\.(\/|$)/.test(path)) {
    return null;
  }

  // Defense: reject if residual sensitive markers somehow remain in path.
  const lower = path.toLowerCase();
  for (const marker of SENSITIVE_QUERY_MARKERS) {
    if (lower.includes(`${marker}=`)) {
      return null;
    }
  }

  if (path.length > MAX_PATH_LENGTH) {
    path = path.slice(0, MAX_PATH_LENGTH);
  }

  return path;
}

export function readCheckoutOriginPathFromWindow(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return sanitizeCheckoutOriginPath(window.location.pathname);
}
