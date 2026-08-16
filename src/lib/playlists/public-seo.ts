/**
 * Public playlist SEO helpers shared by /p metadata, sitemap, and /listens.
 */

export function isPlatformOwnedPlaylist(input: {
  ownerType?: string | null;
  isEditorial?: boolean | null;
}): boolean {
  if (input.ownerType === "user") {
    return false;
  }

  return input.ownerType === "platform" || input.isEditorial === true;
}

/**
 * Platform-owned editorial public playlists are the /listens composition
 * source and are noindex on /p. User-public playlists stay unchanged.
 */
export function isPlatformEditorialPublicPlaylist(input: {
  isEditorial?: boolean | null;
  ownerType?: string | null;
}): boolean {
  return input.isEditorial === true && isPlatformOwnedPlaylist(input);
}

export function isPlayablePublicPlaylistItem(item: {
  available?: boolean;
  href?: string | null;
}): boolean {
  return Boolean(
    item.available &&
      typeof item.href === "string" &&
      item.href.startsWith("/listen/"),
  );
}
