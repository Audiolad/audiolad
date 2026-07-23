const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "session_token",
  "code",
  "order_id",
  "session_id",
  "session",
  "email",
  "password",
  "phone",
  "name",
  "first_name",
  "last_name",
  "user_id",
  "userid",
  "uuid",
  "profile_id",
  "anonymous_id",
  "signed",
  "signature",
  "auth",
  "key",
  "secret",
  "next",
]);

export function sanitizeMetrikaPageUrl(
  pathname: string,
  searchParams?: URLSearchParams | string | null,
): string {
  const normalizedPath = pathname.trim() || "/";
  const params =
    typeof searchParams === "string"
      ? new URLSearchParams(searchParams)
      : searchParams;

  if (!params || [...params.keys()].length === 0) {
    return normalizedPath;
  }

  const safeParams = new URLSearchParams();

  for (const [key, value] of params.entries()) {
    const normalizedKey = key.trim().toLowerCase();

    if (!normalizedKey || SENSITIVE_QUERY_KEYS.has(normalizedKey)) {
      continue;
    }

    if (value.includes("@") || value.length > 128) {
      continue;
    }

    safeParams.set(key, value);
  }

  const query = safeParams.toString();

  return query ? `${normalizedPath}?${query}` : normalizedPath;
}
