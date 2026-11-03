import { redirect } from "next/navigation";
import { after } from "next/server";

import BusinessHomePage from "@/components/business-app/BusinessHomePage";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { pointDeviceHomeRedirect } from "@/lib/business-app/point-device";
import { loadPointDeviceVenue } from "@/lib/business-app/point-device.server";
import { loadBusinessPointLinked } from "@/lib/business-app/point-link.server";
import { businessTrialActivityConfig } from "@/lib/business-trial-activity/config";
import { recordBusinessTrialVisit } from "@/lib/business-trial-activity/record.server";

/**
 * Owner Home. Domain + player-health signals load in layout (P0-01 / P1-05).
 * No URL-driven status override in production (c02fe282 P0-1): statuses come
 * only from real signals; design scenarios live in /spa/design-preview.
 * A paired venue device opens its venue player unless the signed-in account manages that
 * same venue (then Home already shows the device controls).
 * «С чего начать» marks the hall-device step from the same read-only link check as «Настройка».
 */
export default async function BusinessAppHomePage() {
  const domain = await loadBusinessOwnerHomeContext();
  const locationId = domain.status === "authenticated" ? domain.location?.id ?? null : null;
  const devicePlayer = pointDeviceHomeRedirect(await loadPointDeviceVenue(), locationId);
  if (devicePlayer) redirect(devicePlayer);
  // Gift-week cabinet visits (flag OFF by default); 30-minute sessions are counted in SQL.
  if (locationId && businessTrialActivityConfig(process.env).enabled) {
    after(() => recordBusinessTrialVisit(locationId));
  }
  const pointLinked = await loadBusinessPointLinked(locationId);
  return <BusinessHomePage pointLinked={pointLinked} />;
}
