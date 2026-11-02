import BusinessWorkspace from "@/components/business-app/workspace/BusinessWorkspace";
import { businessAccessPrincipal } from "@/lib/access-grants/principal";
import { loadWorkspacePage } from "@/lib/business-workspace/load.server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Metadata } from "next";
import { headers } from "next/headers";

import BusinessMusicSection from "@/components/business-app/sound/BusinessMusicSection";
import { BUSINESS_GUEST_COFFEE_URL, getHostnameFromHeaders } from "@/lib/business-app/host";
import { buildBusinessAppMetadata, buildCoffeePublicPageMetadata } from "@/lib/business-app/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const hostname = getHostnameFromHeaders(await headers());
  return {
    ...buildBusinessAppMetadata(hostname),
    title: "Звучание кофейни – АудиоЛад Бизнес",
    description: "Настройте звучание кофейни и послушайте подборки в кабинете АудиоЛад Бизнес без регистрации.",
    alternates: { canonical: BUSINESS_GUEST_COFFEE_URL },
    ...buildCoffeePublicPageMetadata(hostname, "/", "Звучание кофейни – АудиоЛад Бизнес", "Настройте звучание кофейни и послушайте подборки в кабинете АудиоЛад Бизнес без регистрации."),
  };
}

/**
 * a8240527 – permanent guest entry https://business.audiolad.ru/guest/coffee (printed in the
 * PDF atlas). No account required. The demo stays here.
 * Signed-in venues use /music (the cabinet shelves and the one player).
 */
export default async function BusinessGuestCoffeePage() {
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
