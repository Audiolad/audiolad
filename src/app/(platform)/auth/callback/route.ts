import { isCoffeeHostRequest } from "@/lib/business-app/host";
import { businessReturnPath, BUSINESS_TRIAL_RETURN_PATH } from "@/lib/access-grants/paths";
import { getSafeNextPath } from "@/lib/auth/routes";
import { bindPracticePricePromotionStarts } from "@/lib/pricing/rpc";
import { readPriceVisitorId } from "@/lib/pricing/visitor";
import { buildPublicRedirectUrl } from "@/lib/seo/app-origin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  const tokenHash = url.searchParams.get("token_hash");
  const emailLink = Boolean(tokenHash) && url.searchParams.get("type") === "email";

  if (!code && !emailLink) {
    return NextResponse.redirect(
      buildPublicRedirectUrl("/auth/sign-in?error=auth_callback", request),
    );
  }

  const supabase = await createClient();
  const { error } = emailLink
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: "email" })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    console.error("auth_callback_exchange_error");
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

  const metadataTrial =
    user?.user_metadata &&
    (user.user_metadata as { business_trial?: unknown }).business_trial === "1";
  const coffee = isCoffeeHostRequest(request.headers);
  const fallback = metadataTrial
    ? businessReturnPath(BUSINESS_TRIAL_RETURN_PATH, coffee ? "coffee" : undefined)
    : coffee ? "/cabinet" : "/profile";
  const next = getSafeNextPath(url.searchParams.get("next"), fallback);

  return NextResponse.redirect(buildPublicRedirectUrl(next, request));
}
