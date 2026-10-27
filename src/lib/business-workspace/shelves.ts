import { sourcesForSpace } from "./catalog-sources";
import type { WorkspaceTrack } from "./model";

export type WorkspaceAlbumGroup = {
  key: string;
  title: string | null;
  tracks: { track: WorkspaceTrack; index: number }[];
};

export type WorkspaceShelfGroup = {
  key: string;
  title: string | null;
  firstIndex: number;
  albums: WorkspaceAlbumGroup[];
};

/** Visitor heading. A separate shelf says so. No author name means no heading. */
export function workspaceShelfTitle(track: Pick<WorkspaceTrack, "authorName" | "shelf">): string | null {
  const name = track.authorName?.trim() ?? "";
  if (!name) return null;
  return track.shelf === "other" ? `${name} – другая музыка` : name;
}

/** Groups keep catalog order: project, then album, then track. */
export function groupWorkspaceTracks(tracks: readonly WorkspaceTrack[]): WorkspaceShelfGroup[] {
  const shelves: WorkspaceShelfGroup[] = [];
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index]!;
    const shelfKey = `${track.shelf}:${track.authorId ?? ""}:${track.authorName ?? ""}`;
    let shelf = shelves.find((row) => row.key === shelfKey);
    if (!shelf) {
      shelf = {
        key: shelfKey,
        title: workspaceShelfTitle(track),
        firstIndex: index,
        albums: [],
      };
      shelves.push(shelf);
    }
    const albumTitle = track.albumTitle?.trim() || null;
    const albumKey = albumTitle ?? "";
    let album = shelf.albums.find((row) => row.key === albumKey);
    if (!album) {
      album = { key: albumKey, title: albumTitle, tracks: [] };
      shelf.albums.push(album);
    }
    album.tracks.push({ track, index });
  }
  return shelves;
}

/**
 * Starting index from the demo sound type saved on this device.
 * The first curated author tagged with that sound wins. Unknown sounds start at 0.
 * Does not drop tracks and does not autoplay.
 */
export function workspaceAtmosphereStartIndex(
  tracks: readonly Pick<WorkspaceTrack, "authorId">[],
  direction: string,
): number {
  const source = sourcesForSpace("cafe").find((row) => (row.sounds as readonly string[]).includes(direction));
  if (!source) return 0;
  const index = tracks.findIndex((track) => track.authorId === source.authorId);
  return index < 0 ? 0 : index;
}
