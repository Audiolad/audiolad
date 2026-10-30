import type { Metadata } from "next";

import BusinessPlayerSettings from "@/components/business-app/BusinessPlayerSettings";
import VenueControlPanel from "@/components/business-app/VenueControlPanel";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { loadLocationSoundSettings } from "@/lib/business-app/location-sound-settings.server";
import { businessPointSessionAlive, loadPointDevicePermission } from "@/lib/business-app/point-session.server";
import { buildBusinessAppPageMetadata } from "@/lib/business-app/seo";
import { loadOwnVenueSticker } from "@/lib/business-app/venue-licence/sticker-access.server";

export const metadata: Metadata = {
  ...buildBusinessAppPageMetadata(),
  title: "Настройка – АудиоЛад Бизнес",
  robots: { index: false, follow: false },
};

/** Sound choices. A saved venue row replaces the copy on this device. */
export default async function BusinessAppSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = (await searchParams) ?? {};
  const domain = await loadBusinessOwnerHomeContext();
  const pointDevice = await businessPointSessionAlive();
  const pointPermission = pointDevice ? await loadPointDevicePermission() : null;
  const locationId =
    (domain.status === "authenticated" ? domain.location?.id ?? null : null) ?? pointPermission?.locationId ?? null;
  const saved = locationId ? await loadLocationSoundSettings(locationId) : null;
  const sticker = locationId && !pointDevice ? await loadOwnVenueSticker(locationId) : null;
  const pointCanEdit = pointPermission ? pointPermission.pointCanEdit : saved?.pointCanEditSettings !== false;

  return (
    <div className="business-app-span-full mx-auto max-w-3xl space-y-4" data-testid="biz-player-settings">
      <header>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)]">{locationId && !pointDevice ? "Управление кофейней" : "Настройка"}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--biz-text-muted)]">Звучание плеера в этом кабинете.</p>
      </header>
      {locationId && !pointDevice ? (
        // Owner phone: the picker opens right under «Изменить звучание», not further down the page.
        <VenueControlPanel
          locationId={locationId}
          locationName={domain.status === "authenticated" ? domain.location?.name ?? "Кофейня" : "Кофейня"}
          pointCanEdit={pointCanEdit}
          soundInitiallyOpen={query.sound === "open"}
          licenceSticker={sticker ? { publicId: sticker.publicId } : null}
          soundSlot={<BusinessPlayerSettings locationId={locationId} saved={saved} pointDevice={false} pointCanEdit={pointCanEdit} />}
        />
      ) : (
        <BusinessPlayerSettings locationId={locationId} saved={saved} pointDevice={pointDevice} pointCanEdit={pointCanEdit} />
      )}
    </div>
  );
}
