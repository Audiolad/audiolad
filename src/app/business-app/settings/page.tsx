import type { Metadata } from "next";
import { redirect } from "next/navigation";

import BusinessPlayerSettings from "@/components/business-app/BusinessPlayerSettings";
import BusinessVenuePlaceForm from "@/components/business-app/BusinessVenuePlaceForm";
import VenueControlPanel from "@/components/business-app/VenueControlPanel";
import { atmosphereChoiceLabel } from "@/lib/business-app/atmosphere-rebuild";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { loadLocationSoundSettings } from "@/lib/business-app/location-sound-settings.server";
import { BUSINESS_VENUE_FALLBACK_PATH, businessCabinetCan } from "@/lib/business-app/cabinet-mode";
import { loadBusinessCabinetMode } from "@/lib/business-app/cabinet-mode.server";
import { loadPointDevicePermission } from "@/lib/business-app/point-session.server";
import { buildBusinessAppPageMetadata } from "@/lib/business-app/seo";

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
  // owner | preview | point (cabinet-mode.ts). The owner unlock on the hall device opens the owner panel.
  const cabinet = await loadBusinessCabinetMode();
  const pointDevice = cabinet.mode === "point";
  const domain = await loadBusinessOwnerHomeContext();
  const pointPermission = pointDevice ? await loadPointDevicePermission() : null;
  const locationId = pointDevice
    ? pointPermission?.locationId ?? null
    : domain.status === "authenticated"
      ? domain.location?.id ?? null
      : null;
  const saved = locationId ? await loadLocationSoundSettings(locationId) : null;
  const pointCanEdit = pointPermission ? pointPermission.pointCanEdit : saved?.pointCanEditSettings !== false;
  // «Настройка» on the venue side only when the owner allowed it; otherwise the hall opens «Музыка».
  if (!businessCabinetCan({ mode: cabinet.mode, pointCanEdit }, "sectionSettings")) redirect(BUSINESS_VENUE_FALLBACK_PATH);
  const venueSide = cabinet.mode !== "owner";
  const ownerPanel = Boolean(locationId) && !venueSide;
  // «Пересобрать атмосферу» is an owner action (row «atmosphereRebuild»): never on the hall device or in the preview.
  const canRebuild = ownerPanel && businessCabinetCan({ mode: cabinet.mode }, "atmosphereRebuild");

  return (
    <div className="business-app-span-full mx-auto max-w-3xl space-y-4" data-testid="biz-player-settings">
      <header>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)]">{ownerPanel ? domain.status === "authenticated" ? `Управление: ${domain.location?.name ?? "точка"}` : "Управление точкой" : "Настройка"}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--biz-text-muted)]">
          {ownerPanel ? "Музыка в зале и устройство у колонки." : venueSide ? "Звучание музыки в зале." : "Звучание плеера в этом кабинете."}
        </p>
      </header>
      {ownerPanel && domain.status === "authenticated" && domain.location ? (
        <BusinessVenuePlaceForm
          locationId={domain.location.id}
          name={domain.location.name}
          addressLine1={domain.location.addressLine1}
          canEdit
        />
      ) : null}

      {canRebuild && locationId ? (
        // Owner phone: the 4 × 4 builder opens right under «Пересобрать атмосферу», not further down the page.
        <VenueControlPanel
          key={locationId}
          locationId={locationId}
          pointCanEdit={pointCanEdit}
          soundInitiallyOpen={query.sound === "open"}
          atmosphereSummary={saved ? atmosphereChoiceLabel(saved) : null}
          soundSlot={<BusinessPlayerSettings locationId={locationId} saved={saved} pointDevice={false} pointCanEdit={pointCanEdit} />}
        />
      ) : (
        <BusinessPlayerSettings locationId={locationId} saved={saved} pointDevice={pointDevice} pointCanEdit={pointCanEdit} venueSide={venueSide} />
      )}
    </div>
  );
}
