import { normalizeClearableTextField } from "@/lib/author-products/text-fields";

/** Max length for practices.audio_product_author (DB CHECK + API). */
export const AUDIO_PRODUCT_AUTHOR_MAX_LENGTH = 120;

export const AUDIO_PRODUCT_AUTHOR_REQUIRED_MESSAGE = "Укажите автора музыки.";

/**
 * Normalize optional audio_product_author for persistence.
 * Empty / whitespace → null. Throws on non-string non-null values.
 */
export function normalizeAudioProductAuthor(
  value: unknown,
): string | null {
  return normalizeClearableTextField(value);
}

export function validateAudioProductAuthorLength(
  value: string,
): string | null {
  if (value.trim().length > AUDIO_PRODUCT_AUTHOR_MAX_LENGTH) {
    return "audio_product_author_too_long";
  }
  return null;
}

/** True when a trimmed author name is present. */
export function hasAudioProductAuthor(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
