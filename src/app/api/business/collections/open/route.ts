import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isCoffeeHostRequest } from "@/lib/business-app/host";
import { COLLECTION_COOKIE, COLLECTION_TOKEN } from "@/lib/business-collections/model";
import { collectionTokenHash } from "@/lib/business-collections/load.server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  if (!isCoffeeHostRequest(request.headers)) return denied();
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!COLLECTION_TOKEN.test(token)) return denied();
  try {
    const { data, error } = await createServiceRoleClient().from("business_personal_collections").select("id")
      .eq("token_hash", collectionTokenHash(token)).is("revoked_at", null).maybeSingle();
    if (error || !data) return denied();
    // Fixed destination: never trust a return URL or the request's forwarded host.
    const response = NextResponse.redirect("https://coffee.audiolad.ru/collection", 303);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.cookies.set(COLLECTION_COOKIE, token, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60,
    });
    return response;
  } catch { return denied(); }
}
