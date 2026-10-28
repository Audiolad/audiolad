import "server-only";

import { locationSoundFromRow, type LocationSoundSettings } from "@/lib/business-app/location-sound-settings";
import { createClient } from "@/lib/supabase/server";

/** Member read. A missing table or a missing row keeps the device copy. */
export async function loadLocationSoundSettings(locationId: string): Promise<LocationSoundSettings | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("business_location_sound_settings")
      .select(
        "location_id, character, direction, daypart_mode, energy_offset, morning_start, morning_end, day_start, day_end, evening_start, evening_end, point_can_edit_settings, settings_version",
      )
      .eq("location_id", locationId)
      .maybeSingle();
    if (error || !data) return null;
    return locationSoundFromRow(data as Record<string, unknown>);
  } catch {
    return null;
  }
}
