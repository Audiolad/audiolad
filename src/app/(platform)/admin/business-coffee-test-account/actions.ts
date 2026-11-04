"use server";

import { cookies, headers } from "next/headers";

import {
  COFFEE_TEST_ACCOUNT_HREF,
  COFFEE_TEST_RESET_ARM_COOKIE,
  COFFEE_TEST_RESET_ARM_MAX_AGE,
  COFFEE_TEST_RESET_PUBLIC_PATH,
  COFFEE_TEST_SERVER_COOKIES,
  UUID_RE,
  coffeeTestResetErrorCode,
  parseCoffeeTestResetCounts,
  type CoffeeTestResetCounts,
  type CoffeeTestResetErrorCode,
} from "@/lib/admin/coffee-test-reset/model";
import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { clearAuthorSupportModeOnLogout } from "@/lib/author-support/actions";
import { BUSINESS_ORIGIN, COFFEE_ORIGIN, coffeeHostEnabled } from "@/lib/business-app/host";
import {
  currentGuestCoffeeDeviceHashes,
  currentGuestCoffeeNetworkHash,
} from "@/lib/business-app/guest-coffee/usage.server";
import { guestNetworkKey } from "@/lib/business-guest/network-key";
import { businessGuestStartConfig } from "@/lib/business-guest/start-config";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { getSupabaseCookieOptions, hostnameFromHeaders } from "@/lib/supabase/cookie-domain";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type CoffeeTestResetActionResult =
  | { ok: true; counts: CoffeeTestResetCounts; next: string }
  | { ok: false; error: CoffeeTestResetErrorCode };

/**
 * Owner only (server check here and again inside the SQL function), allowlisted test
 * accounts only (DB allowlist). Never logs an address: errors are logged as a code.
 */
export async function resetCoffeeTestAccountAction(input: { targetUserId: string }): Promise<CoffeeTestResetActionResult> {
  const session = await requirePlatformOwnerAccess(COFFEE_TEST_ACCOUNT_HREF);
  const target = typeof input?.targetUserId === "string" ? input.targetUserId.trim() : "";
  if (!UUID_RE.test(target)) return { ok: false, error: "invalid" };

  const h = await headers();
  const ip = getTrustedClientIp(new Request("http://local", { headers: h }));
  const startNetworkHash = guestNetworkKey(ip, businessGuestStartConfig(process.env).networkSecret);

  let counts: CoffeeTestResetCounts;
  try {
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc("reset_business_test_account", {
      p_actor: session.userId,
      p_target: target,
      p_device_hashes: await currentGuestCoffeeDeviceHashes(),
      p_meter_network_hash: await currentGuestCoffeeNetworkHash(),
      p_start_network_hash: startNetworkHash,
    });
    if (error) {
      const code = coffeeTestResetErrorCode(error.message);
      console.error("coffee_test_account_reset_failed", code);
      return { ok: false, error: code };
    }
    counts = parseCoffeeTestResetCounts(data);
  } catch {
    console.error("coffee_test_account_reset_failed", "unavailable");
    return { ok: false, error: "unavailable" };
  }

  // The reset is committed. Now make this device anonymous again.
  const store = await cookies();
  const domain = getSupabaseCookieOptions(hostnameFromHeaders(h)).domain;
  const names = new Set<string>([
    ...COFFEE_TEST_SERVER_COOKIES,
    ...store.getAll().map((c) => c.name).filter((name) => name.startsWith("al-coffee-pref-")),
  ]);
  for (const name of names) {
    store.set(name, "", { path: "/", maxAge: 0 });
    if (domain) store.set(name, "", { path: "/", maxAge: 0, domain, secure: true, sameSite: "lax" });
  }
  // Arms /test-reset on the coffee host to wipe that origin's storage once.
  store.set(COFFEE_TEST_RESET_ARM_COOKIE, "1", {
    path: "/", maxAge: COFFEE_TEST_RESET_ARM_MAX_AGE, httpOnly: true, sameSite: "lax",
    ...(domain ? { domain, secure: true } : {}),
  });
  try {
    await clearAuthorSupportModeOnLogout(session.userId);
    const supabase = await createClient();
    await supabase.rpc("unlink_analytics_identity");
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    console.error("coffee_test_account_reset_sign_out_failed");
  }

  const origin = coffeeHostEnabled() ? COFFEE_ORIGIN : BUSINESS_ORIGIN;
  return { ok: true, counts, next: `${origin}${COFFEE_TEST_RESET_PUBLIC_PATH}` };
}
