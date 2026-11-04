import type { Metadata } from "next";
import { cookies } from "next/headers";

import CoffeeTestResetCleaner from "@/components/business-app/CoffeeTestResetCleaner";
import { COFFEE_TEST_RESET_ARM_COOKIE } from "@/lib/admin/coffee-test-reset/model";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Last step of the owner's coffee test-account reset. Wipes this origin's storage only when
 * the reset action armed it (one-time marker cookie); the proxy expires the marker and the
 * guest meter cookies on this response.
 */
export default async function CoffeeTestResetPage() {
  const armed = (await cookies()).get(COFFEE_TEST_RESET_ARM_COOKIE)?.value === "1";
  return <CoffeeTestResetCleaner armed={armed} />;
}
