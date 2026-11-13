import BusinessWorkspace from "@/components/business-app/workspace/BusinessWorkspace";
import { businessAccessPrincipal } from "@/lib/access-grants/principal";
import { loadWorkspacePage } from "@/lib/business-workspace/load.server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import BusinessMusicSection from "@/components/business-app/sound/BusinessMusicSection";
import { BUSINESS_GUEST_COFFEE_URL, getHostnameFromHeaders } from "@/lib/business-app/host";
import { businessGuestCoffeeHallRedirect } from "@/lib/business-app/point-device";
import { businessHallDeviceCookie } from "@/lib/business-app/point-session.server";
import { buildBusinessAppMetadata, buildCoffeePublicPageMetadata } from "@/lib/business-app/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const hostname = getHostnameFromHeaders(await headers());
  return {
    ...buildBusinessAppMetadata(hostname),
    title: "Звучание кофейни – АудиоЛад Кофейня",
    description: "Настройте звучание кофейни и послушайте подборки в кабинете АудиоЛад Кофейня без регистрации.",
    alternates: { canonical: BUSINESS_GUEST_COFFEE_URL },
    ...buildCoffeePublicPageMetadata(hostname, "/", "Звучание кофейни – АудиоЛад Кофейня", "Настройте звучание кофейни и послушайте подборки в кабинете АудиоЛад Кофейня без регистрации."),
  };
}

/**
 * a8240527 – permanent guest entry https://business.audiolad.ru/guest/coffee (printed in the
 * PDF atlas). No account required. The demo stays here.
 * Signed-in venues use /music (the cabinet shelves and the one player). A hall device is sent there too.
 */
export default async function BusinessGuestCoffeePage() {
  // t1299u: the hall device (any `al-point` cookie, also on coffee host `/`) never sees the guest
  // «Собрать атмосферу» demo or its offer; it opens the venue player.
  const hallRedirect = businessGuestCoffeeHallRedirect(await businessHallDeviceCookie());
  if (hallRedirect) redirect(hallRedirect);
  if (process.env.AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED === "1") {
    const { data: { user } } = await (await createClient()).auth.getUser();
    const principal = businessAccessPrincipal(user, true);
    if (principal?.kind === "guest") {
      const { data, error } = await createServiceRoleClient().from("business_guest_starts")
        .select("id").eq("user_id", principal.userId).eq("status", "ready").maybeSingle();
      if (!error && data) return <BusinessWorkspace model={await loadWorkspacePage("cafe")} />;
    }
  }
  return <BusinessMusicSection />;
}
