import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import { PRODUCT_KIND } from "@/lib/author-products/product-kind";

export const BULK_TRACK_TITLES_OVERFLOW_MESSAGE =
  "Названий больше, чем треков в альбоме. Уберите лишние строки.";

export function parseBulkTrackTitleLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function bulkTrackTitleApplyState(
  nameCount: number,
  trackCount: number,
): {
  canApply: boolean;
  overflow: boolean;
  empty: boolean;
} {
  const empty = nameCount === 0;
  const overflow = trackCount > 0 && nameCount > trackCount;
  const canApply = !empty && !overflow && trackCount > 0;
  return { canApply, overflow, empty };
}

export function formatBulkTrackTitlesSuccessMessage(appliedCount: number): string {
  return `Обновлено названий: ${appliedCount}`;
}

export type BulkTrackTitleItem = {
  id: string;
  title: string;
};

export function snapshotBulkTrackTitles<T extends BulkTrackTitleItem>(
  items: readonly T[],
): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const item of items) {
    snapshot[item.id] = item.title;
  }
  return snapshot;
}

export function applyBulkTrackTitlesToItems<T extends { title: string }>(
  items: readonly T[],
  names: readonly string[],
  maxTitleLength: number = PRODUCT_CONTENT_LIMITS.audioTitle,
): { items: T[]; appliedCount: number } {
  const appliedCount = Math.min(items.length, names.length);
  const itemsNext = items.map((item, index) => {
    if (index >= appliedCount) {
      return item;
    }
    return {
      ...item,
      title: names[index]!.slice(0, maxTitleLength),
    };
  });
  return { items: itemsNext, appliedCount };
}

export function restoreBulkTrackTitlesFromSnapshot<T extends BulkTrackTitleItem>(
  items: readonly T[],
  snapshot: Record<string, string>,
): T[] {
  return items.map((item) => ({
    ...item,
    title: snapshot[item.id] ?? item.title,
  }));
}

export type MusicAlbumBulkTrackTitlesScope = "closed" | "all";

/** Music album editor gate: `scope: "all"` is the default product surface. */
export function isMusicAlbumBulkTrackTitlesEnabled(params: {
  productKind: string | null | undefined;
  scope?: MusicAlbumBulkTrackTitlesScope;
  closedCatalogOnly?: boolean;
}): boolean {
  if (params.productKind !== PRODUCT_KIND.MUSIC) {
    return false;
  }
  const scope = params.scope ?? "all";
  if (scope === "closed") {
    return params.closedCatalogOnly === true;
  }
  return true;
}