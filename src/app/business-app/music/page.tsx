import BusinessEligibilityProbePanel from "@/components/business-app/BusinessEligibilityProbePanel";
import { BUSINESS_RIGHTS_MUSIC_PAGE_HEADER } from "@/lib/business-app/rights-status-copy";

export default function BusinessAppMusicPage() {
  return (
    <div className="business-app-span-full space-y-4">
      <header className="rounded-2xl border border-white/10 bg-black/20 p-6">
        <p className="text-sm font-semibold uppercase tracking-wide opacity-70">
          {BUSINESS_RIGHTS_MUSIC_PAGE_HEADER.eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          {BUSINESS_RIGHTS_MUSIC_PAGE_HEADER.title}
        </h1>
        <p className="mt-2 text-[1.05rem] opacity-90">
          {BUSINESS_RIGHTS_MUSIC_PAGE_HEADER.description}
        </p>
      </header>
      <BusinessEligibilityProbePanel />
    </div>
  );
}
