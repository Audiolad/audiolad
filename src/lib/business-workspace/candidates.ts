import { hasPublicTrackPlayableAudio } from "@/lib/listen/music-delivery";

import type { WorkspaceTrackShelf } from "./model";

/**
 * Pure gate for the admission fallback. A row enters the rights check only when
 * the practice is published listed music, the track is published, and audio is
 * playable (non-empty audio path or a verified stream). Unpublished rows never
 * become admissions. The rights engine still has to say ELIGIBLE afterwards.
 */

export type WorkspaceCatalogSourceRow = {
  audioItemId: string;
  authorId: string;
  authorName: string;
  albumTitle: string;
  title: string;
  durationSeconds: number | null;
  position: number;
  practiceStatus: string | null;
  productKind: string | null;
  catalogVisibility: string | null;
  deletedAt: string | null;
  audioStatus: string | null;
  audioPath: string | null;
  hasActiveDelivery: boolean;
  /** Public album cover. Audio paths stay on this gate row and are not sent to the browser. */
  coverUrl?: string | null;
};

export type WorkspaceCatalogCandidate = {
  audioItemId: string;
  authorId: string;
  authorName: string;
  albumTitle: string;
  title: string;
  durationSeconds: number | null;
  position: number;
  shelf: WorkspaceTrackShelf;
  coverUrl?: string | null;
};

export function isWorkspaceMusicPractice(row: {
  practiceStatus: string | null;
  productKind: string | null;
  catalogVisibility: string | null;
  deletedAt: string | null;
}): boolean {
  return row.deletedAt == null
    && row.practiceStatus === "published"
    && row.productKind === "music"
    && row.catalogVisibility === "listed";
}

export function isPublishedWorkspaceAudio(row: { audioStatus: string | null }): boolean {
  return row.audioStatus === "published";
}

export function acceptWorkspaceCatalogSourceRow(
  row: WorkspaceCatalogSourceRow,
  allowedAuthorIds: ReadonlySet<string>,
): boolean {
  if (!allowedAuthorIds.has(row.authorId)) return false;
  if (!isWorkspaceMusicPractice(row) || !isPublishedWorkspaceAudio(row)) return false;
  return hasPublicTrackPlayableAudio({
    audioPath: row.audioPath,
    hasActiveDelivery: row.hasActiveDelivery,
  });
}

export function orderWorkspaceCatalogRows<T extends {
  authorId: string;
  albumTitle: string;
  position: number;
  audioItemId: string;
}>(rows: readonly T[], authorOrder: readonly string[]): T[] {
  const rank = new Map(authorOrder.map((id, index) => [id, index]));
  const sorted = [...rows].sort((left, right) => {
    const leftRank = rank.get(left.authorId) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.authorId) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const album = left.albumTitle.localeCompare(right.albumTitle, "ru");
    if (album !== 0) return album;
    if (left.position !== right.position) return left.position - right.position;
    return left.audioItemId.localeCompare(right.audioItemId);
  });
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const row of sorted) {
    if (seen.has(row.audioItemId)) continue;
    seen.add(row.audioItemId);
    unique.push(row);
  }
  return unique;
}
