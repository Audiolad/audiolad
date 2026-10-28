"use server";

import { revalidatePath } from "next/cache";

import { BUSINESS_SITE_PATH } from "@/lib/business-app/host";
import {
  locationSoundRpcArgs,
  type LocationSoundDraft,
} from "@/lib/business-app/location-sound-settings";
import { validateCafeDaypartHours } from "@/lib/business-app/cafe-queue/prefs";
import { createClient } from "@/lib/supabase/server";

const SAVE_ERROR = "Не удалось сохранить звучание. Попробуйте ещё раз.";

export type SaveLocationSoundResult =
  | { ok: true; settingsVersion: number }
  | { ok: false; error: string };

export async function saveLocationSoundSettings(
  locationId: string,
  draft: LocationSoundDraft,
): Promise<SaveLocationSoundResult> {
  const hoursError = validateCafeDaypartHours(draft.hours);
  if (hoursError) return { ok: false, error: hoursError };
  if (!locationId.trim()) return { ok: false, error: SAVE_ERROR };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "save_business_location_sound_settings",
      locationSoundRpcArgs(locationId, draft),
    );
    if (error) return { ok: false, error: SAVE_ERROR };
    const payload = data as { ok?: boolean; settings_version?: number } | null;
    if (!payload?.ok || typeof payload.settings_version !== "number") {
      return { ok: false, error: SAVE_ERROR };
    }
    revalidatePath(`${BUSINESS_SITE_PATH}/settings`);
    return { ok: true, settingsVersion: payload.settings_version };
  } catch {
    return { ok: false, error: SAVE_ERROR };
  }
}
