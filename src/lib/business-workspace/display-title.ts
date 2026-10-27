const PLACEHOLDER_TITLE = /^(?:Аудио|Трек)\s+(\d+)$/iu;

/**
 * Catalog rows sometimes store a placeholder («Аудио 8») instead of a track name.
 * Prefer the product/album title. A placeholder with no real product name is omitted
 * from the cabinet. This does not write to the catalog.
 */
export function displayWorkspaceTrackTitle(input: {
  title: string;
  albumTitle?: string | null;
  practiceTitle?: string | null;
}): string | null {
  const raw = input.title.trim();
  const album = input.albumTitle?.trim() ?? "";
  const practice = input.practiceTitle?.trim() ?? "";
  const albumOk = album.length > 0 && !PLACEHOLDER_TITLE.test(album);
  const practiceOk = practice.length > 0 && !PLACEHOLDER_TITLE.test(practice);
  const match = PLACEHOLDER_TITLE.exec(raw);
  if (match) {
    if (albumOk) return `${album} – ${match[1]}`;
    if (practiceOk) return practice;
    return null;
  }
  if (raw && raw !== "Трек") return raw;
  if (albumOk) return album;
  if (practiceOk) return practice;
  return null;
}

export function workspaceTrackWithDisplayTitle<T extends { title: string; albumTitle: string | null }>(
  track: T,
): T | null {
  const title = displayWorkspaceTrackTitle({
    title: track.title,
    albumTitle: track.albumTitle,
    practiceTitle: track.albumTitle,
  });
  if (!title) return null;
  return title === track.title ? track : { ...track, title };
}
