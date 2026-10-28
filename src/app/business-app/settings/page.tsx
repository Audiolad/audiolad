import type { Metadata } from "next";

import BusinessPlayerSettings from "@/components/business-app/BusinessPlayerSettings";
import BusinessVenuePlaceForm from "@/components/business-app/BusinessVenuePlaceForm";
import PointPairingCard from "@/components/business-app/PointPairingCard";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { loadLocationSoundSettings } from "@/lib/business-app/location-sound-settings.server";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";

export const metadata: Metadata = {
  ...buildBusinessAppMetadata(),
  title: "Настройка – АудиоЛад Бизнес",
  robots: { index: false, follow: false },
};

/** Sound choices. A saved venue row replaces the copy on this device. */
export default async function BusinessAppSettingsPage() {
  const domain = await loadBusinessOwnerHomeContext();
  const location = domain.status === "authenticated" ? domain.location : null;
  const locationId = location?.id ?? null;
  const saved = locationId ? await loadLocationSoundSettings(locationId) : null;

  return (
    <div className="business-app-span-full mx-auto max-w-3xl space-y-4" data-testid="biz-player-settings">
      <header>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)]">Настройка</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--biz-text-muted)]">Звучание плеера в этом кабинете.</p>
      </header>
      {location ? (
        <BusinessVenuePlaceForm
          locationId={location.id}
          name={location.name}
          addressLine1={location.addressLine1}
          canEdit={domain.status === "authenticated" && domain.canPay}
        />
      ) : null}
      {locationId ? <PointPairingCard locationId={locationId} /> : null}
      <BusinessPlayerSettings locationId={locationId} saved={saved} />
    </div>
  );
}
