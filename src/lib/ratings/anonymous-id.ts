const MAX_ANONYMOUS_ID_LENGTH = 128;
const ANONYMOUS_ID_COOKIE = "audiolad_anonymous_id";

export function parseOptionalAnonymousId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ANONYMOUS_ID_LENGTH) {
    return null;
  }

  return trimmed;
}

export function readAnonymousIdFromRequest(
  request: Request,
  bodyValue?: unknown,
): string | null {
  const fromBody = parseOptionalAnonymousId(bodyValue);
  if (fromBody) {
    return fromBody;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const name = trimmed.slice(0, eq).trim();
    if (name !== ANONYMOUS_ID_COOKIE) {
      continue;
    }

    try {
      return parseOptionalAnonymousId(
        decodeURIComponent(trimmed.slice(eq + 1).trim()),
      );
    } catch {
      return parseOptionalAnonymousId(trimmed.slice(eq + 1).trim());
    }
  }

  return null;
}
