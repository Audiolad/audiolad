import { NextResponse } from "next/server";

import {
  BUSINESS_PRIVATE_COVER_REDIRECT_MAX_AGE_SECONDS,
  isBusinessPrivateCoverRef,
} from "@/lib/business-covers/private-cover";
import { signBusinessPrivateCover } from "@/lib/business-covers/private-cover.server";
import { loadWorkspaceActor, loadWorkspaceAllowedIds } from "@/lib/business-workspace/load.server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function notFound() {
  return new NextResponse(null, { status: 404, headers: NO_STORE });
}

/**
 * 39a7ef48 PR-D: cover of a business-only album for the hall/owner player.
 * Same session and catalog checks as the signed stream URL (track-url): the
 * actor must have an open player and the track must be in its allowed list.
 * Redirects to a short-lived signed URL of the private bucket. Everything else
 * (ordinary albums, public covers, no session) gets 404.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const audioItemId = url.searchParams.get("track")?.trim() ?? "";
  if (!audioItemId) return notFound();
  const actor = await loadWorkspaceActor(url.searchParams.get("space"));
  if (!actor.ok || !actor.playerOpen) return notFound();
  const allowed = await loadWorkspaceAllowedIds({
    spaceId: actor.space.id,
    locationId: actor.locationId,
    spaceEnabled: actor.space.enabled,
  });
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
  const signed = await signBusinessPrivateCover(db, practice.cover_url, { practiceId: row.practice_id });
  if (!signed) return notFound();
  return NextResponse.redirect(signed, {
    status: 302,
    headers: { "Cache-Control": `private, max-age=${BUSINESS_PRIVATE_COVER_REDIRECT_MAX_AGE_SECONDS}` },
  });
}
