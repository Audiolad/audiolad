import BusinessEligibilityProbePanel from "@/components/business-app/BusinessEligibilityProbePanel";

export default function BusinessAppMusicPage() {
  return (
    <div className="business-app-span-full space-y-4">
      <header className="business-app-card">
        <p className="business-app-eyebrow">
          Музыка · eligibility probe
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--biz-text)] sm:text-3xl">Кандидаты эфира</h1>
        <p className="mt-2 text-[1.05rem] text-[var(--biz-text-muted)]">
          Read-only список кандидатов и статус{" "}
          <code className="text-sm">resolve_business_track_eligibility</code>.
          В эфир попадают только ELIGIBLE. Сиды прав / freeze-list — Human Gate
          HG-3/HG-4 (P0-06).
        </p>
      </header>
      <BusinessEligibilityProbePanel />
    </div>
  );
}
