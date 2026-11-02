import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { BusinessTrialAttribution } from "./attribution";
import { businessTrialAttributionConfig } from "./config";
import { businessDeviceFamily } from "./device";
import { lookupBusinessGeo } from "./geo.server";

/**
 * Best-effort, write-once attribution of a guest gift start. No-op while
 * AUDIOLAD_BUSINESS_TRIAL_ATTRIBUTION_ENABLED is not "1"; never throws and never logs
 * the IP, the User-Agent or the referrer. The IP is used in memory for the city lookup only.
 */
export async function recordBusinessGuestStartAttribution(
  userId: string,
  input: { attribution: BusinessTrialAttribution | null; ip: string | null; userAgent: string | null },
): Promise<void> {
  const config = businessTrialAttributionConfig(process.env);
  if (!config.enabled) return;
  try {
    const geo = await lookupBusinessGeo(input.ip, config.geoDbPath);
    const device = businessDeviceFamily(input.userAgent);
    const a = input.attribution;
    const { error } = await createServiceRoleClient()
      .from("business_guest_starts")
      .update({
        attributed_at: new Date().toISOString(),
        entry_channel: a?.channel ?? null,
        referrer_domain: a?.referrerDomain ?? null,
        utm_source: a?.utmSource ?? null,
        utm_medium: a?.utmMedium ?? null,
        utm_campaign: a?.utmCampaign ?? null,
        geo_country: geo?.country ?? null,
        geo_region: geo?.region ?? null,
        geo_city: geo?.city ?? null,
        device_class: device.deviceClass,
        os_family: device.osFamily,
        browser_family: device.browserFamily,
      })
      .eq("user_id", userId)
      .is("attributed_at", null);
    if (error) console.warn("business_trial_attribution_failed");
  } catch {
    console.warn("business_trial_attribution_failed");
  }
}
