export const PLAYLIST_AUTO_COVER_ITEM_COUNT = 4;

export type PlaylistCoverPresentation =
  | { kind: "custom"; url: string }
  | { kind: "collage"; urls: Array<string | null> }
  | { kind: "placeholder" };

export function takeFirstPlaylistItemCoverUrls(
  itemCoverUrls: Array<string | null | undefined>,
): Array<string | null> {
  return itemCoverUrls.slice(0, PLAYLIST_AUTO_COVER_ITEM_COUNT).map((url) => {
    if (typeof url !== "string") {
      return null;
    }

    const trimmed = url.trim();
    return trimmed.length > 0 ? trimmed : null;
  });
}

/**
 * Presentation-only cover model. Custom storage wins; otherwise the first
 * four item covers by position become a 2×2 collage. Nothing here writes
 * an image to storage.
 */
export function resolvePlaylistCoverPresentation(
  customCoverUrl: string | null | undefined,
  itemCoverUrls: Array<string | null | undefined>,
): PlaylistCoverPresentation {
  const custom =
    typeof customCoverUrl === "string" ? customCoverUrl.trim() : "";

  if (custom) {
    return { kind: "custom", url: custom };
  }

  if (itemCoverUrls.length === 0) {
    return { kind: "placeholder" };
  }

  const urls = takeFirstPlaylistItemCoverUrls(itemCoverUrls);

  while (urls.length < PLAYLIST_AUTO_COVER_ITEM_COUNT) {
    urls.push(null);
  }

  return { kind: "collage", urls };
}
