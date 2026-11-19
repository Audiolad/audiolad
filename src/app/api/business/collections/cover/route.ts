import { authorizedCollectionTrack } from "@/lib/business-collections/load.server";
import { serveCollectionCover } from "@/lib/business-collections/audio.mjs";
import { isCoffeeHostRequest } from "@/lib/business-app/host";
import { readBusinessPrivateCover } from "@/lib/business-covers/private-cover.server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return serveCollectionCover(request, {
    hostAllowed: isCoffeeHostRequest(request.headers),
    authorize: authorizedCollectionTrack,
    read: (ref, album) => readBusinessPrivateCover(createServiceRoleClient(), ref, { practiceId: album }),
  });
}
