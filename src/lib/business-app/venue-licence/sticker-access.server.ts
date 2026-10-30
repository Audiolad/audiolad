import "server-only";

import { createClient } from "@/lib/supabase/server";

import { isVenueLicencePublicEnabled } from "./flag";
import { authorizeVenueSticker, type VenueStickerReader } from "./sticker-access";

type UserClient = Awaited<ReturnType<typeof createClient>>;

/** Reads with the caller's own session, so RLS also limits them to their organization. */
export function createVenueStickerReader(supabase: UserClient): VenueStickerReader {
  return {
    async location(locationId) {
      const { data, error } = await supabase
        .from("business_locations")
        .select("organization_id, licence_public_id")
        .eq("id", locationId)
        .maybeSingle();
      if (error || !data) return null;
      const organizationId = typeof data.organization_id === "string" ? data.organization_id : null;
      const publicId = typeof data.licence_public_id === "string" ? data.licence_public_id : null;
      return organizationId && publicId ? { organizationId, publicId } : null;
    },
    async memberRole(organizationId, userId) {
      const { data, error } = await supabase
        .from("business_organization_members")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) return null;
      return typeof data.role === "string" ? data.role : null;
    },
  };
}

export type OwnVenueSticker = { locationId: string; publicId: string };

/** The cabinet block's data. Null while the flag is off or the caller does not manage the venue. */
export async function loadOwnVenueSticker(locationId: string | null): Promise<OwnVenueSticker | null> {
  if (!locationId || !isVenueLicencePublicEnabled()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const publicId = await authorizeVenueSticker(createVenueStickerReader(supabase), user?.id ?? null, locationId);
  return publicId ? { locationId, publicId } : null;
}
