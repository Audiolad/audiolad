import "server-only";

import { businessCabinetCan } from "@/lib/business-app/cabinet-mode";
import { loadBusinessCabinetMode } from "@/lib/business-app/cabinet-mode.server";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { loadPointDeviceVenue } from "@/lib/business-app/point-device.server";

import { ensureVenueCertificate, type VenueCertificateState } from "./certificate.server";

export type CabinetCertificateContext =
  | { kind: "anonymous" }
  | { kind: "no_location" }
  | {
      kind: "ready";
      mode: "owner" | "preview" | "point";
      /** Owner of the organization on this browser (not a hall device): may enter the ИНН. */
      canEditIdentity: boolean;
      /** Current offer edition not accepted yet and this browser may accept it. */
      offerPrompt: null | { newEdition: boolean };
      locationId: string;
      state: VenueCertificateState;
    };

/**
 * Which point the cabinet shows the certificate for: the owner's selected point from the session,
 * or the point the hall device is paired with (server-side device cookie). Never a point from the URL.
 */
export async function loadCabinetCertificateContext(): Promise<CabinetCertificateContext> {
  const cabinet = await loadBusinessCabinetMode();
  if (cabinet.mode === "point") {
    const venue = await loadPointDeviceVenue();
    if (!venue?.locationId) return { kind: "no_location" };
    return {
      kind: "ready",
      mode: "point",
      canEditIdentity: false,
      offerPrompt: null,
      locationId: venue.locationId,
      state: await ensureVenueCertificate(venue.locationId),
    };
  }
  const domain = await loadBusinessOwnerHomeContext();
  if (domain.status !== "authenticated") return { kind: "anonymous" };
  if (!domain.location?.id) return { kind: "no_location" };
  const ownerHere = domain.canPay && businessCabinetCan({ mode: cabinet.mode }, "stickerDownload");
  return {
    kind: "ready",
    mode: cabinet.mode === "preview" ? "preview" : "owner",
    canEditIdentity: ownerHere,
    offerPrompt: domain.canPay && !domain.offerAccepted ? { newEdition: Boolean(domain.offerNewEditionPending) } : null,
    locationId: domain.location.id,
    state: await ensureVenueCertificate(domain.location.id),
  };
}
