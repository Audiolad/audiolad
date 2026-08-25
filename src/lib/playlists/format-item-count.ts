import { formatProductDuration } from "@/lib/products/duration";

const PLAYLIST_CARD_CREATOR_PREFIXES = [
  "Плейлист ",
  "Автор: ",
  "Создано: ",
] as const;

/** Nominative platform name after stripping the editorial listing prefix. */
const PLAYLIST_CARD_EDITORIAL_CREATOR_NAME = "АудиоЛад";
const PLAYLIST_CARD_EDITORIAL_CREATOR_GENITIVE = "АудиоЛада";

/**
 * Catalog card title: 3 lines reserved even when the title is short.
 * 3 × leading-5 (1.25rem) = 3.75rem. Class does not depend on title length.
 */
export const PLAYLIST_CARD_TITLE_CLASS =
  "line-clamp-3 min-h-[3.75rem] text-[14px] font-semibold leading-5 text-[#25135c] sm:text-[15px] sm:leading-5";

/**
 * Card-only creator label. Listing API may still send «Плейлист АудиоЛада».
 * Does not live in the listing mapper.
 */
export function formatPlaylistCardCreatorName(creator: string): string {
  let name = creator.trim();

  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const prefix of PLAYLIST_CARD_CREATOR_PREFIXES) {
      if (name.startsWith(prefix)) {
        name = name.slice(prefix.length).trimStart();
        stripped = true;
      }
    }
  }

  if (name === PLAYLIST_CARD_EDITORIAL_CREATOR_GENITIVE) {
    return PLAYLIST_CARD_EDITORIAL_CREATOR_NAME;
  }

  return name;
}

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
