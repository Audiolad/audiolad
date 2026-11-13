"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { normalizeBusinessReceiptEmail } from "@/lib/business/subscription-checkout";
import { checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { COFFEE_ORIGIN, isCoffeeHostRequest } from "@/lib/business-app/host";
import { getSafeNextPath } from "@/lib/auth/routes";

const SENT = "Если эта почта привязана к аккаунту, на неё придёт письмо с кодом. Проверьте также папку «Спам».";

export async function requestBusinessLoginOtp(input: { email: string; next: string | null }) {
  const email = normalizeBusinessReceiptEmail(input?.email);
  const requestHeaders = await headers();
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const ip = getTrustedClientIp(new Request("https://audiolad.invalid", { headers: requestHeaders }));
  // Same in-memory limiter as the other public endpoints. GoTrue also enforces its own limits.
  const ipAllowed = checkAnalyticsRateLimit(`login-otp-ip:${hash(ip)}`, 10, 600_000);
  const emailAllowed = email ? checkAnalyticsRateLimit(`login-otp-email:${hash(email)}`, 1, 60_000) : false;
  if (email && ipAllowed && emailAllowed) {
    try {
      const coffee = isCoffeeHostRequest(requestHeaders);
      const next = getSafeNextPath(input.next, coffee ? "/cabinet" : undefined);
      const callback = new URL("/auth/callback", coffee ? COFFEE_ORIGIN : "https://audiolad.ru");
      callback.searchParams.set("next", next);
      const supabase = await createClient();
      await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: callback.toString() } });
    } catch {
      // Identical result for unknown users, throttling, transport and provider errors.
    }
  }
  return { message: SENT };
}
