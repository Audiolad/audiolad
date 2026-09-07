import { sanitizeStoredFormatLabel } from "@/lib/author-products/format";
import { validateAudioTitleLength } from "@/lib/author-products/limits";

export type ParseAuthorAudioTitleResult =
  | { ok: true; value: string }
  | { ok: false; reason: "invalid_request" | "audio_title_too_long" };

/**
 * Canonical write-path for audio_items.title. Rejects empty, oversized,
 * and markup titles instead of silently persisting a sanitized fallback.
 */
export function parseAuthorAudioTitle(
  value: unknown,
): ParseAuthorAudioTitleResult {
  if (typeof value !== "string") {
    return { ok: false, reason: "invalid_request" };
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, reason: "invalid_request" };
  }

  if (validateAudioTitleLength(trimmed)) {
    return { ok: false, reason: "audio_title_too_long" };
  }

  const collapsed = trimmed.replace(/\s+/g, " ");
  if (sanitizeStoredFormatLabel(trimmed) !== collapsed) {
    return { ok: false, reason: "invalid_request" };
  }

  return { ok: true, value: collapsed };
}
