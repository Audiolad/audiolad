/**
 * 39a7ef48 PR-D: private covers of business-only («только Бизнес») albums.
 *
 * Objects live in the private `business-private-covers` bucket (no anon/authenticated
 * storage policies). The database stores a reference, never a URL:
 *   business-private-cover:practices/<practiceId>/variants/<version>/<file>
 *   business-private-cover:practices/<practiceId>/track-covers/<audioItemId>/variants/<version>/<file>
 * Public renderers treat a reference as "no cover". The authorised hall/owner
 * player loads the image through a same-origin route (session re-checked, then
 * the file is streamed). Album editors still get a short-lived signed URL.
 * Pure module: safe for client components.
 */
export const BUSINESS_PRIVATE_COVERS_BUCKET = "business-private-covers";
export const BUSINESS_PRIVATE_COVER_REF_PREFIX = "business-private-cover:";
/** Signed URL lifetime for editor previews of private covers. */
export const BUSINESS_PRIVATE_COVER_SIGNED_URL_TTL_SECONDS = 120;
/** Browser may reuse a preview redirect for less than the signed URL lifetime. */
export const BUSINESS_PRIVATE_COVER_REDIRECT_MAX_AGE_SECONDS = 60;
/** Private browser/MediaSession cache for the hall/owner cover proxy. Covers a long playback session. */
export const BUSINESS_PRIVATE_COVER_PLAYER_MAX_AGE_SECONDS = 6 * 60 * 60;
export const BUSINESS_WORKSPACE_COVER_ROUTE = "/api/business/workspace/cover";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SAFE_TAIL = "(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\\.(?:webp|jpg|jpeg|png)";
const REF_PATTERN = new RegExp(
  `^business-private-cover:practices/(${UUID})/(?:track-covers/(${UUID})/)?variants/${SAFE_TAIL}$`,
  "i",
);

export function isBusinessPrivateCoverRef(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().startsWith(BUSINESS_PRIVATE_COVER_REF_PREFIX);
}

/** Parsed reference, or null when malformed (never signed). */
export function parseBusinessPrivateCoverRef(
  value: string | null | undefined,
): { path: string; practiceId: string; audioItemId: string | null } | null {
  if (typeof value !== "string") return null;
  const match = REF_PATTERN.exec(value.trim());
  if (!match) return null;
  return {
    path: value.trim().slice(BUSINESS_PRIVATE_COVER_REF_PREFIX.length),
    practiceId: match[1].toLowerCase(),
    audioItemId: match[2]?.toLowerCase() ?? null,
  };
}

export function businessPrivateCoverRef(storagePath: string): string {
  return `${BUSINESS_PRIVATE_COVER_REF_PREFIX}${storagePath}`;
}

export function businessPrivateAlbumCoverPrefix(practiceId: string): string {
  return `practices/${practiceId}/variants`;
}

export function businessPrivateTrackCoverPrefix(practiceId: string, audioItemId: string): string {
  return `practices/${practiceId}/track-covers/${audioItemId}/variants`;
}

/** Stable, token-free app URL. Every load re-checks the hall/owner session server-side. */
export function businessWorkspaceCoverUrl(audioItemId: string, spaceId: string): string {
  const params = new URLSearchParams({ space: spaceId, track: audioItemId });
  return `${BUSINESS_WORKSPACE_COVER_ROUTE}?${params.toString()}`;
}

export function isBusinessWorkspaceCoverUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return v.startsWith(`${BUSINESS_WORKSPACE_COVER_ROUTE}?`) || v.startsWith(`${BUSINESS_GUEST_COFFEE_COVER_ROUTE}?`);
}

/**
 * t1670u: cover of a closed album in the guest «Собрать атмосферу» preview. Token-free; the
 * route serves only albums of the current guest preview (never an arbitrary closed album).
 */
export const BUSINESS_GUEST_COFFEE_COVER_ROUTE = "/api/business/guest/coffee/cover";

export function businessGuestCoffeeCoverUrl(practiceId: string): string {
  return `${BUSINESS_GUEST_COFFEE_COVER_ROUTE}?${new URLSearchParams({ album: practiceId }).toString()}`;
}

/** Editor preview of a private cover (album or one track). Requires album edit access. */
export function businessPrivateCoverPreviewUrl(practiceId: string, coverRef: string, audioItemId?: string | null): string {
  const params = new URLSearchParams();
  if (audioItemId) params.set("audio", audioItemId);
  // Changes with every upload, so the browser does not show a stale preview.
  params.set("v", coverRef.slice(-48));
  return `/api/author/products/${practiceId}/cover/private-preview?${params.toString()}`;
}

/**
 * t1504u: cover of a closed album in the author cabinet product list. The list only carries the
 * private reference; the browser gets the editor preview route (album edit access is re-checked
 * server-side, then a short-lived signed URL). A reference of another album is never used.
 */
export function authorProductListPrivateCoverSrc(product: { id: string; cover_url: string | null }): string | null {
  const parsed = parseBusinessPrivateCoverRef(product.cover_url);
  if (!parsed || parsed.audioItemId || parsed.practiceId !== product.id.toLowerCase()) return null;
  return businessPrivateCoverPreviewUrl(product.id, String(product.cover_url).trim());
}
