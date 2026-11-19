import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isCoffeeHostRequest } from "@/lib/business-app/host";
import { COLLECTION_COOKIE, COLLECTION_TOKEN } from "@/lib/business-collections/model";
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
 * and goes to the calm entry screen /collection. A revoked or unknown link clears the cookie and
 * goes to /collection?state=unavailable – «Подборка сейчас недоступна». Opening never binds the
 * collection, starts a period or writes anything.
 */
export async function GET(request: Request) {
  if (!isCoffeeHostRequest(request.headers)) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  }
  const token = new URL(request.url).searchParams.get("token") ?? "";
  // A dead link never shows another collection kept in this browser: drop the old cookie too.
  const unavailable = () => {
    const response = entry(UNAVAILABLE_URL);
    response.cookies.set(COLLECTION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  };
  if (!COLLECTION_TOKEN.test(token)) return unavailable();
  try {
    const { data, error } = await createServiceRoleClient().from("business_personal_collections").select("id")
      .eq("token_hash", collectionTokenHash(token)).is("revoked_at", null).maybeSingle();
    if (error) return entry(UNAVAILABLE_URL);
    if (!data) return unavailable();
    const response = entry();
    response.cookies.set(COLLECTION_COOKIE, token, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60,
    });
    return response;
  } catch { return entry(UNAVAILABLE_URL); }
}
