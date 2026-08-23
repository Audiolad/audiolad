import { getSafeNextPath } from "@/lib/auth/routes";
import { bindPracticePricePromotionStarts } from "@/lib/pricing/rpc";
import { readPriceVisitorId } from "@/lib/pricing/visitor";
import { buildPublicRedirectUrl } from "@/lib/seo/app-origin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeNextPath(url.searchParams.get("next"), "/profile");

  if (!code) {
    return NextResponse.redirect(
      buildPublicRedirectUrl("/auth/sign-in?error=auth_callback", request),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("auth_callback_exchange_error", error.message);
    return NextResponse.redirect(
      buildPublicRedirectUrl("/auth/reset-password?error=expired", request),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const visitorId = await readPriceVisitorId();

  if (user && visitorId) {
    await bindPracticePricePromotionStarts({
      supabase,
      visitorId,
      userId: user.id,
    });
  }

  return NextResponse.redirect(buildPublicRedirectUrl(next, request));
}
