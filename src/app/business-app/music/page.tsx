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
            <p className="business-app-eyebrow">Эфир точки · проверка прав</p>
            <h2 id="business-airplay-probe-title" className="mt-1 text-[1.25rem] font-bold text-[var(--biz-text)]">
              Кандидаты эфира
            </h2>
            <p className="mt-2 text-[1rem] text-[var(--biz-text-muted)]">
              Read-only список кандидатов и статус{" "}
              <code className="text-sm">resolve_business_track_eligibility</code>.
              В эфир попадают только ELIGIBLE. Сиды прав / freeze-list – Human Gate
              HG-3/HG-4 (P0-06).
            </p>
          </header>
          <BusinessEligibilityProbePanel />
        </section>
      }
    />
  );
}
