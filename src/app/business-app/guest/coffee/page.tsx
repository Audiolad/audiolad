import type { Metadata } from "next";

import BusinessEligibilityProbePanel from "@/components/business-app/BusinessEligibilityProbePanel";
import BusinessMusicSection from "@/components/business-app/sound/BusinessMusicSection";
import { BUSINESS_GUEST_COFFEE_URL } from "@/lib/business-app/host";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildBusinessAppMetadata(),
  title: "Звучание кофейни – АудиоЛад Бизнес",
  description: "Настройте звучание кофейни и послушайте подборки в кабинете АудиоЛад Бизнес без регистрации.",
  alternates: { canonical: BUSINESS_GUEST_COFFEE_URL },
};

/**
 * a8240527 – permanent guest entry https://business.audiolad.ru/guest/coffee (printed in the
 * PDF atlas, linked from every atlas CTA). No account required. The demo stays here.
 * Signed-in venues use /music (the cabinet shelves and the one player).
 */
export default function BusinessGuestCoffeePage() {
  return (
    <BusinessMusicSection
      memberTools={
        <section className="business-app-card space-y-4" aria-labelledby="business-airplay-probe-title">
          <header>
            <p className="business-app-eyebrow">Музыка точки · проверка прав</p>
            <h2 id="business-airplay-probe-title" className="mt-1 text-[1.25rem] font-bold text-[var(--biz-text)]">
              Какие треки можно включать
            </h2>
            <p className="mt-2 text-[1rem] text-[var(--biz-text-muted)]">
              Здесь можно проверить, какие треки подходят для музыки в заведении. Играть будут только
              треки с подтверждёнными правами.
            </p>
          </header>
          <BusinessEligibilityProbePanel />
        </section>
      }
    />
  );
}
