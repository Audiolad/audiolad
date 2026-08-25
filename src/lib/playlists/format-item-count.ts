import { formatProductDuration } from "@/lib/products/duration";

/**
 * User-facing playlist item-count label.
 * Invariable «аудио» — no Russian declension.
 */
export function formatPlaylistItemCount(count: number): string {
  return `${count} аудио`;
}

/** Catalog card meta: «N аудио · X мин». Duration is formatted on the client. */
export function formatPlaylistCatalogMeta(
  trackCount: number,
  durationSeconds: number,
): string {
  const countLabel = formatPlaylistItemCount(trackCount);
  const durationLabel = formatProductDuration(durationSeconds);

  if (!durationLabel) {
    return countLabel;
  }

  return `${countLabel} · ${durationLabel}`;
}
