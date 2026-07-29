const MAX_SOURCE_URL_LENGTH = 500;

const SENSITIVE_PATH_PATTERNS: Array<{
  match: RegExp;
  replacement: string;
}> = [
  { match: /^\/d\/[^/]+(?:\/.*)?$/i, replacement: "/d/[token]" },
  {
    match: /^\/api\/d\/[^/]+(?:\/.*)?$/i,
    replacement: "/api/d/[token]",
  },
  {
    match: /^\/auth\/confirm(?:\/.*)?$/i,
    replacement: "/auth/confirm",
  },
  {
    match: /^\/auth\/callback(?:\/.*)?$/i,
    replacement: "/auth/callback",
  },
  {
    match: /^\/auth\/update-password(?:\/.*)?$/i,
    replacement: "/auth/update-password",
  },
];

const SENSITIVE_QUERY_KEYS = new Set([
  "access_token",
  "refresh_token",
  "token",
  "code",
  "token_hash",
  "type",
  "confirmation_url",
  "recovery_token",
  "magic_link",
  "otp",
  "secret",
  "password",
  "payment_id",
  "paymentId",
  "checkout_id",
  "checkoutId",
  "session_id",
  "sessionId",
  "client_secret",
  "clientSecret",
]);

/**
 * Sanitize a page URL before storing it with a support request.
 * Default: origin + pathname only; strip query/hash; mask tokenized routes.
 */
export function sanitizeSupportSourceUrl(
  raw: string | null | undefined,
  options?: { allowedOrigin?: string },
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Relative path fallback
    if (!trimmed.startsWith("/")) return null;
    try {
      url = new URL(trimmed, "https://audiolad.local");
    } catch {
      return null;
    }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  const allowedOrigin = options?.allowedOrigin;
  if (allowedOrigin) {
    try {
      const allowed = new URL(allowedOrigin);
      if (url.origin !== allowed.origin) {
        // Keep pathname template only for foreign origins — drop host.
        url = new URL(url.pathname, "https://audiolad.local");
      }
    } catch {
      // ignore invalid allowed origin
    }
  }

  let pathname = url.pathname || "/";
  // Collapse accidental double slashes
  pathname = pathname.replace(/\/{2,}/g, "/");

  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.match.test(pathname)) {
      pathname = pattern.replacement;
      break;
    }
  }

  // Never persist query or hash by default.
  void SENSITIVE_QUERY_KEYS;
  const sanitized = pathname;

  if (sanitized.length > MAX_SOURCE_URL_LENGTH) {
    return sanitized.slice(0, MAX_SOURCE_URL_LENGTH);
  }

  return sanitized;
}
