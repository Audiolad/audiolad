/**
 * Which publication / effective dates the public Author Terms page shows (Sergey 18.10.2026 15:02).
 * Edition 2.0 gets its dates from its DB row, set by sql/02-switch-current.sql to the moment it becomes
 * current. Until then (inserted, not current) the row holds only an insert-time placeholder, which is
 * never shown: an edition newer than the current one is «not in force yet». Pure, browser-safe.
 */

export type EditionDateRow = {
  content_hash: string;
  published_at: string;
  effective_at: string;
  is_current: boolean;
};

export type EditionDisplayDates =
  | { kind: "dated"; publishedAt: string; effectiveAt: string }
  | { kind: "pending" };

export function resolveEditionDisplayDates(input: {
  contentHash: string;
  codePublishedAt: string | null;
  codeEffectiveAt: string | null;
  rows: readonly EditionDateRow[];
}): EditionDisplayDates {
  const row = input.rows.find((item) => item.content_hash === input.contentHash) ?? null;
  if (!row) {
    return input.codePublishedAt && input.codeEffectiveAt
      ? { kind: "dated", publishedAt: input.codePublishedAt, effectiveAt: input.codeEffectiveAt }
      : { kind: "pending" };
  }
  if (!row.is_current) {
    const current = input.rows.find((item) => item.is_current) ?? null;
    const rowTime = Date.parse(row.published_at);
    const currentTime = current ? Date.parse(current.published_at) : Number.NaN;
    // Not current and newer than the current edition (or no comparable current): not in force yet.
    if (!current || Number.isNaN(rowTime) || Number.isNaN(currentTime) || rowTime > currentTime) {
      return { kind: "pending" };
    }
  }
  return { kind: "dated", publishedAt: row.published_at, effectiveAt: row.effective_at };
}
