import { cabinetAlbumCoverUrl } from "@/lib/business-app/album-cover";
import { businessWorkspaceCoverUrl, isBusinessPrivateCoverRef } from "@/lib/business-covers/private-cover";

/**
 * 39a7ef48 PR-D: cover source of a workspace (hall/owner) track.
 * Business-only albums keep a private cover reference: the player gets a token-free
 * app URL that re-checks the hall/owner session and streams the private cover.
 * Ordinary albums keep their public catalog cover exactly as before.
 */
export function workspaceTrackCoverUrl(
  practice: {
    business_only?: boolean | null;
    cover_url?: string | null;
    cover_image?: unknown;
    updated_at?: string | null;
  } | null | undefined,
  audioItemId: string,
  spaceId: string,
): string | null {
  if (practice?.business_only === true) {
    return isBusinessPrivateCoverRef(practice.cover_url) ? businessWorkspaceCoverUrl(audioItemId, spaceId) : null;
  }
  return cabinetAlbumCoverUrl({
    coverUrl: practice?.cover_url,
    coverImage: practice?.cover_image,
    updatedAt: practice?.updated_at,
  });
}
