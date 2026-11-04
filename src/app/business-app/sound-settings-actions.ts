"use server";

import { revalidatePath } from "next/cache";

import { businessCabinetCan } from "@/lib/business-app/cabinet-mode";
import { businessHallDeviceLocked, loadBusinessCabinetMode } from "@/lib/business-app/cabinet-mode.server";
import { BUSINESS_SITE_PATH } from "@/lib/business-app/host";
import {
  locationSoundRpcArgs,
  type LocationSoundDraft,
} from "@/lib/business-app/location-sound-settings";
import { validateCafeDaypartHours } from "@/lib/business-app/cafe-queue/prefs";
import { createClient } from "@/lib/supabase/server";

const SAVE_ERROR = "Не удалось сохранить звучание. Попробуйте ещё раз.";
const REBUILD_ERROR = "Не удалось пересобрать атмосферу. Попробуйте ещё раз.";
/** Venue side (hall device or «как видит точка»): the rebuild is an owner action. */
const REBUILD_OWNER_ONLY = "Пересобрать атмосферу может только владелец – на своём телефоне или после ввода пароля.";

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
  // The hall device saves through its own device session (/api/business/point «sound-save»).
  if (await businessHallDeviceLocked()) return { ok: false, error: "На устройстве в зале это делает владелец после ввода пароля." };

  return writeLocationSound(locationId, draft, SAVE_ERROR);
}

/** The one write of a venue atmosphere (same RPC for «Изменить» and «Пересобрать»). */
async function writeLocationSound(
  locationId: string,
  draft: LocationSoundDraft,
  errorText: string,
): Promise<SaveLocationSoundResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "save_business_location_sound_settings",
      locationSoundRpcArgs(locationId, draft),
    );
    if (error) return { ok: false, error: errorText };
    const payload = data as { ok?: boolean; settings_version?: number } | null;
    if (!payload?.ok || typeof payload.settings_version !== "number") {
      return { ok: false, error: errorText };
    }
    revalidatePath(`${BUSINESS_SITE_PATH}/settings`);
    return { ok: true, settingsVersion: payload.settings_version };
  } catch {
    return { ok: false, error: errorText };
  }
}

/**
 * «Пересобрать атмосферу» in «Управление кофейней»: saves the new venue choices through the same
 * RPC. The hall player picks the new version up at the next track (point-sound.ts), the owner's own
 * player rebuilds its queue from the same profile (BusinessPlayerSettings). Owner side only:
 * the shared table row «atmosphereRebuild» refuses the hall device and the preview.
 */
export async function rebuildLocationAtmosphere(
  locationId: string,
  draft: LocationSoundDraft,
): Promise<SaveLocationSoundResult> {
  const hoursError = validateCafeDaypartHours(draft.hours);
  if (hoursError) return { ok: false, error: hoursError };
  if (!locationId.trim()) return { ok: false, error: REBUILD_ERROR };
  const { mode } = await loadBusinessCabinetMode();
  if (!businessCabinetCan({ mode }, "atmosphereRebuild")) return { ok: false, error: REBUILD_OWNER_ONLY };
  return writeLocationSound(locationId, draft, REBUILD_ERROR);
}
