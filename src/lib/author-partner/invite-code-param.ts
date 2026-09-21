/**
 * Next.js App Router already decodes dynamic route params.
 * A second decodeURIComponent is only needed for double-encoded edge cases,
 * and must never throw URIError on malformed sequences like a bare "%".
 */
export function decodeInviteCodeParam(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(value).trim();
  } catch {
    // Malformed percent-encoding → treat as absent (caller maps to 404).
    return "";
  }
}
