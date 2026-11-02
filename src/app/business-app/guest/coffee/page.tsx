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
export default function BusinessGuestCoffeePage() {
  return <BusinessMusicSection />;
}
