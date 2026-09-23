/** Music-wizard helpers for the credited audio-product author field. */

export const AUDIO_PRODUCT_AUTHOR_REQUIRED_MESSAGE = "Укажите автора музыки.";

/** True when a trimmed author name is present. */
export function hasAudioProductAuthor(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
