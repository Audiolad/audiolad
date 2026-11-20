import { NextResponse } from "next/server";

import {
  BUSINESS_PRIVATE_COVER_PLAYER_MAX_AGE_SECONDS,
  isBusinessPrivateCoverRef,
} from "@/lib/business-covers/private-cover";
import { readBusinessPrivateCover } from "@/lib/business-covers/private-cover.server";
import {
  workspaceAllowedIdsCache,
  workspaceAllowedIdsCacheKey,
} from "@/lib/business-workspace/allowed-ids-cache";
import { loadWorkspaceActor, loadWorkspaceAllowedIds } from "@/lib/business-workspace/load.server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function notFound() {
  return new NextResponse(null, { status: 404, headers: NO_STORE });
}

/**
 * Cover of a business-only album for the hall/owner player.
 * Same session and catalog checks as the signed stream URL (track-url): the
 * actor must have an open player and the track must be in its allowed list.
 * The allowed-id list is reused briefly per session/space so a burst of cover
 * requests does not rebuild the whole catalog each time (t1654u).
 * Returns the image bytes (not a short-lived signed URL), so MediaSession and
 * hours-long playback keep the cover after a signature would have expired.
 * Ordinary albums, missing covers and sessions without access get 404.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const audioItemId = url.searchParams.get("track")?.trim() ?? "";
  if (!audioItemId) return notFound();
  const actor = await loadWorkspaceActor(url.searchParams.get("space"));
  if (!actor.ok || !actor.playerOpen) return notFound();
  const allowed = await workspaceAllowedIdsCache.get(workspaceAllowedIdsCacheKey(actor), () =>
    loadWorkspaceAllowedIds({
      spaceId: actor.space.id,
      locationId: actor.locationId,
      spaceEnabled: actor.space.enabled,
      ownerBrowser: !actor.device,
    }),
  );
  if (!allowed || !allowed.includes(audioItemId)) return notFound();

  let db: ReturnType<typeof createServiceRoleClient>;
  try {
    db = createServiceRoleClient();
  } catch {
    return notFound();
  }
  const { data, error } = await db
    .from("audio_items")
    .select("practice_id, practices(business_only, cover_url)")
    .eq("id", audioItemId)
    .maybeSingle();
  const row = data as {
    practice_id?: string | null;
    practices?: { business_only?: boolean | null; cover_url?: string | null } | { business_only?: boolean | null; cover_url?: string | null }[] | null;
  } | null;
  const practice = Array.isArray(row?.practices) ? row?.practices[0] : row?.practices;
  if (error || !row?.practice_id || practice?.business_only !== true || !isBusinessPrivateCoverRef(practice.cover_url)) {
    return notFound();
  }
  const file = await readBusinessPrivateCover(db, practice.cover_url, { practiceId: row.practice_id });
  if (!file) return notFound();
  return new NextResponse(Buffer.from(file.body), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": `private, max-age=${BUSINESS_PRIVATE_COVER_PLAYER_MAX_AGE_SECONDS}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
