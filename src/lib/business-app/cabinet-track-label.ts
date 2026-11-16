/**
 * Owner cabinet and hall surfaces (t1492u): show the track title and the album, never the
 * artist. The Media Session «artist» field is the album because lock screens treat it as the
 * second line.
 */

export function cabinetAlbumLabel(track: { albumTitle?: string | null } | null | undefined): string {
  return track?.albumTitle?.trim() ?? "";
}

/** Mini-player line: «title – album», or just the title when the album is missing. */
export function cabinetMiniBarTitle(track: { title: string; albumTitle?: string | null; authorName?: string | null } | null | undefined): string | null {
  if (!track) return null;
  const album = cabinetAlbumLabel(track);
  return album ? `${track.title} – ${album}` : track.title;
}
