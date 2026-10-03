/**
 * Closed pilot identity for Jazz Relax music passports.
 *
 * Gate decisions use UUID only — never display name or slug.
 * Do not reuse this helper for Aurafon or any other author.
 */

/** authors.id for authors.slug = jazz-relax. Allowlist only. */
export const JAZZ_RELAX_AUTHOR_ID = "0a847461-a429-4868-986a-59d7bf2fdb2b";

/** Documentation slug only — gate decisions use UUID. */
export const JAZZ_RELAX_AUTHOR_SLUG = "jazz-relax";

/**
 * True only for the Jazz Relax author workspace UUID.
 * Rejects null, undefined, empty, and whitespace-only values.
 */
export function isJazzRelaxAuthor(
  authorId: string | null | undefined,
): boolean {
  if (typeof authorId !== "string") {
    return false;
  }

  const trimmed = authorId.trim();
  if (!trimmed) {
    return false;
  }

  return trimmed === JAZZ_RELAX_AUTHOR_ID;
}
