import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isCoffeeHostRequest } from "@/lib/business-app/host";
import { COLLECTION_COOKIE, COLLECTION_DEAD_MARKER, COLLECTION_TOKEN } from "@/lib/business-collections/model";
import { collectionTokenHash } from "@/lib/business-collections/load.server";

export const dynamic = "force-dynamic";

/** Fixed destination: never trust a return URL or the request's forwarded host. */
const ENTRY_URL = "https://coffee.audiolad.ru/collection";
/** Revoked or unknown link: the entry screen says «Подборка сейчас недоступна». */
const UNAVAILABLE_URL = "https://coffee.audiolad.ru/collection?state=unavailable";

function entry(url = ENTRY_URL): NextResponse {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

/**
 * The personal link opens the ordinary coffee app (t1616u). A live link sets the browser cookie
 * and goes to the calm entry screen /collection. A revoked or unknown link sets a dead marker and
 * goes to /collection?state=unavailable – «Подборка сейчас недоступна». Opening never binds the
 * collection, starts a period or writes anything.
 */
export async function GET(request: Request) {
  if (!isCoffeeHostRequest(request.headers)) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  }
  const token = new URL(request.url).searchParams.get("token") ?? "";
  // A dead link never shows another collection kept in this browser: the old cookie is replaced by
  // a dead marker (matches no link), so the browser stays a quiet link visitor – "/" and the menu
  // lead to «Подборка сейчас недоступна», and an ordinary start with the whole catalog is refused.
  const unavailable = () => {
    const response = entry(UNAVAILABLE_URL);
    response.cookies.set(COLLECTION_COOKIE, COLLECTION_DEAD_MARKER, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60,
    });
    return response;
  };
  if (!COLLECTION_TOKEN.test(token)) return unavailable();
  // A live link, or a lookup error: this browser now holds THIS link (the cookie authorizes only what
  // its own hash matches), so a previous collection never stays behind it. The entry screen
  // re-checks it and says «Подборка сейчас недоступна» if the link is dead or still unreadable.
  const remember = () => {
    const response = entry();
    response.cookies.set(COLLECTION_COOKIE, token, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60,
    });
    return response;
  };
  try {
    const { data, error } = await createServiceRoleClient().from("business_personal_collections").select("id")
      .eq("token_hash", collectionTokenHash(token)).is("revoked_at", null).maybeSingle();
    if (error) return remember();
    if (!data) return unavailable();
    return remember();
  } catch { return remember(); }
}
