import BusinessEligibilityProbePanel from "@/components/business-app/BusinessEligibilityProbePanel";
import BusinessMusicSection from "@/components/business-app/sound/BusinessMusicSection";

export const dynamic = "force-dynamic";

/**
 * Music section (a8240527): sound settings + collections + Business player for everyone
 * (guest limits enforced on the server); the airplay rights probe for organization members.
 */
export default function BusinessAppMusicPage() {
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
