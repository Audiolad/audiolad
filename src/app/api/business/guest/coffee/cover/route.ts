import { NextResponse } from "next/server";

import {
  BUSINESS_PRIVATE_COVER_PLAYER_MAX_AGE_SECONDS,
  isBusinessPrivateCoverRef,
} from "@/lib/business-covers/private-cover";
import { readBusinessPrivateCover } from "@/lib/business-covers/private-cover.server";
import { loadGuestCoffeeShelf } from "@/lib/business-app/guest-coffee/load.server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function notFound() {
  return new NextResponse(null, { status: 404, headers: NO_STORE });
}

/**
 * t1670u: cover of a closed album of the guest «Собрать атмосферу» preview. Only albums of the
 * current preview (the same list the guest stream-URL route signs from) – any other id is 404,
 * so the route never lists or serves an arbitrary closed album. Image bytes, no signed URL.
 */
export async function GET(request: Request) {
  const albumId = new URL(request.url).searchParams.get("album")?.trim() ?? "";
  if (!albumId || albumId.length > 80) return notFound();
  const shelf = await loadGuestCoffeeShelf();
  if (!shelf.some((p) => p.id === albumId && p.closed === true)) return notFound();
  let db: ReturnType<typeof createServiceRoleClient>;
  try {
    db = createServiceRoleClient();
  } catch {
    return notFound();
  }
  const { data, error } = await db
    .from("practices")
    .select("id, business_only, cover_url")
    .eq("id", albumId)
    .eq("business_only", true)
    .maybeSingle();
  const practice = data as { id: string; business_only: boolean | null; cover_url: string | null } | null;
  if (error || !practice || practice.business_only !== true || !isBusinessPrivateCoverRef(practice.cover_url)) return notFound();
  const file = await readBusinessPrivateCover(db, practice.cover_url, { practiceId: practice.id }, { variant: "sm" });
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
