import BusinessHomePage from "@/components/business-app/BusinessHomePage";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { loadLocationSoundSettings } from "@/lib/business-app/location-sound-settings.server";

/**
 * Owner Home. Domain + player-health signals load in layout (P0-01 / P1-05).
 * No URL-driven status override in production (c02fe282 P0-1): statuses come
 * only from real signals; design scenarios live in /spa/design-preview.
 */
export default async function BusinessAppHomePage() {
  const domain = await loadBusinessOwnerHomeContext();
  const locationId = domain.status === "authenticated" ? domain.location?.id ?? null : null;
  const saved = locationId ? await loadLocationSoundSettings(locationId) : null;
  return <BusinessHomePage pointCanEdit={saved ? saved.pointCanEditSettings : true} />;
}
