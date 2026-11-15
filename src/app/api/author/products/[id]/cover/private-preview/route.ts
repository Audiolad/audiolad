import { NextResponse } from "next/server";

import { handleAuthorRouteError, requirePracticeMutationAccess } from "@/lib/author-products/auth";
import { createPracticeImageWriteClient } from "@/lib/author-products/cover-storage";
import { signBusinessPrivateCover } from "@/lib/business-covers/private-cover.server";
import { isBusinessOnlyPractice } from "@/lib/products/business-only";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 39a7ef48 PR-D: editor preview of a business-only album's private cover
 * (album or one track). Same access as editing the album; others get the
 * usual author-route error. Redirects to a short-lived signed URL.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { practice } = await requirePracticeMutationAccess(id);
    if (!isBusinessOnlyPractice(practice)) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    const audioItemId = new URL(request.url).searchParams.get("audio");
    const db = createPracticeImageWriteClient();
    const lookup = audioItemId
      ? await db.from("audio_items").select("cover_url").eq("id", audioItemId).eq("practice_id", id).maybeSingle()
      : await db.from("practices").select("cover_url").eq("id", id).maybeSingle();
    const coverRef = (lookup.data as { cover_url?: string | null } | null)?.cover_url ?? null;
    if (lookup.error || !coverRef) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    const signed = await signBusinessPrivateCover(db, coverRef, { practiceId: id, audioItemId });
    if (!signed) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.redirect(signed, { status: 302, headers: NO_STORE });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
