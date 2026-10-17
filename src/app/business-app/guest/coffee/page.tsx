import type { Metadata } from "next";

import GuestCoffeeCabinet from "@/components/business-app/guest-coffee/GuestCoffeeCabinet";
import { loadGuestCoffeeShelf } from "@/lib/business-app/guest-coffee/load.server";
import { guestCoffeeLimitState } from "@/lib/business-app/guest-coffee/limit";
import { peekGuestCoffeeUsage } from "@/lib/business-app/guest-coffee/usage.server";
import { BUSINESS_GUEST_COFFEE_URL } from "@/lib/business-app/host";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildBusinessAppMetadata(),
  title: "Гостевой кабинет кофейни — АудиоЛад Бизнес",
  description: "Настройте звучание кофейни и послушайте настоящие подборки без регистрации.",
  alternates: { canonical: BUSINESS_GUEST_COFFEE_URL },
};

/**
 * a8240527 — permanent guest coffee cabinet: https://business.audiolad.ru/guest/coffee
 * (printed in the PDF atlas, linked from every atlas CTA). No account required.
 */
export default async function BusinessGuestCoffeePage() {
  const [playlists, used] = await Promise.all([loadGuestCoffeeShelf(), peekGuestCoffeeUsage()]);
  return <GuestCoffeeCabinet playlists={playlists} initialLimit={guestCoffeeLimitState(used)} />;
}
