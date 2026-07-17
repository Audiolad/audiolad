import { getSafeNextPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeNextPath(url.searchParams.get("next"), "/profile");

  if (!code) {
    return NextResponse.redirect(new URL("/auth/sign-in?error=auth_callback", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("auth_callback_exchange_error", error.message);
    return NextResponse.redirect(
      new URL("/auth/reset-password?error=expired", url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
