import { isVenueLicencePublicId, venueLicencePublicUrl } from "@/lib/business-app/host";

import { renderVenueStickerSvg } from "./sticker";
import { isVenueStickerFormat, venueStickerFilename } from "./sticker-links";

/**
 * Cabinet download of a venue sticker (task 90d24628, cabinet entry point).
 * Pure: the route passes the signed-in user id and a reader bound to that user.
 * Anyone who is not an owner or manager of the venue's organization gets the
 * same 404 as for a missing venue, so the answer never reveals another venue.
 */

/** Same roles as public.is_business_organization_member (RLS on business_locations). */
const STICKER_ROLES = new Set(["owner", "manager"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type VenueStickerReader = {
  /** The location row, or null when it does not exist or RLS hides it. */
  location(locationId: string): Promise<{ organizationId: string; publicId: string } | null>;
  /** The user's role in the organization, or null. */
  memberRole(organizationId: string, userId: string): Promise<string | null>;
};

/** Public id of the venue when the user may manage it. Otherwise null. */
export async function authorizeVenueSticker(
  reader: VenueStickerReader,
  userId: string | null,
  locationId: string,
): Promise<string | null> {
  if (!userId || !UUID_RE.test(locationId.toLowerCase())) return null;
  const location = await reader.location(locationId);
  if (!location || !isVenueLicencePublicId(location.publicId)) return null;
  const role = await reader.memberRole(location.organizationId, userId);
  if (!role || !STICKER_ROLES.has(role)) return null;
  return location.publicId;
}

export type VenueStickerResponse =
  | { status: 200; svg: string; filename: string }
  | { status: 400 | 401 | 404 };

export async function handleVenueStickerDownload(input: {
  enabled: boolean;
  userId: string | null;
  searchParams: URLSearchParams;
  reader: VenueStickerReader;
  /** Brand mark as a data URI, so the file prints without network access. */
  logoHref?: string | null;
}): Promise<VenueStickerResponse> {
  if (!input.enabled) return { status: 404 };
  if (!input.userId) return { status: 401 };
  const locationId = input.searchParams.get("locationId") ?? "";
  const format = input.searchParams.get("format");
  if (!isVenueStickerFormat(format) || !locationId) return { status: 400 };
  const publicId = await authorizeVenueSticker(input.reader, input.userId, locationId);
  if (!publicId) return { status: 404 };
  return {
    status: 200,
    svg: renderVenueStickerSvg({ publicUrl: venueLicencePublicUrl(publicId), format, logoHref: input.logoHref ?? null }),
    filename: venueStickerFilename(format),
  };
}
