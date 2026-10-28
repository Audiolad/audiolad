import {
  GUEST_COFFEE_DEFAULT_PROFILE,
  type GuestCoffeeCharacter,
  type GuestCoffeeDirection,
  type GuestCoffeeProfile,
} from "@/lib/business-app/guest-coffee/catalog";
import {
  CAFE_DAYPART_HOURS_DEFAULT,
  CAFE_QUEUE_DEFAULT_PREFS,
  isCafeDaypart,
  isCafeEnergyOffset,
  validateCafeDaypartHours,
  type CafeDaypartHours,
  type CafeDaypartMode,
  type CafeEnergyOffset,
  type CafeQueuePrefs,
} from "@/lib/business-app/cafe-queue/prefs";

/** Saved atmosphere of one venue. The permission flag is not an atmosphere field. */
export type LocationSoundSettings = {
  locationId: string;
  character: GuestCoffeeCharacter;
  direction: GuestCoffeeDirection;
  daypartMode: CafeDaypartMode;
  energyOffset: CafeEnergyOffset;
  hours: CafeDaypartHours;
  pointCanEditSettings: boolean;
  settingsVersion: number;
};

export type LocationSoundDraft = {
  character: GuestCoffeeCharacter;
  direction: GuestCoffeeDirection;
  daypartMode: CafeDaypartMode;
  energyOffset: CafeEnergyOffset;
  hours: CafeDaypartHours;
};

const CHARACTERS = new Set(["cozy", "city", "classic", "evening"]);
const DIRECTIONS = new Set(["jazz", "calm", "rhythm", "melodic"]);

function clock(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{2}:\d{2})/.exec(text);
  return match ? match[1] : fallback;
}

export function locationSoundFromRow(row: Record<string, unknown> | null | undefined): LocationSoundSettings | null {
  if (!row || typeof row.location_id !== "string") return null;
  const character = row.character;
  const direction = row.direction;
  const daypartMode = row.daypart_mode;
  if (!CHARACTERS.has(String(character)) || !DIRECTIONS.has(String(direction))) return null;
  if (daypartMode !== "auto" && !isCafeDaypart(daypartMode)) return null;
  const energy = typeof row.energy_offset === "number" ? row.energy_offset : Number(row.energy_offset);
  if (!isCafeEnergyOffset(energy)) return null;
  const hours: CafeDaypartHours = {
    morning: {
      start: clock(row.morning_start, CAFE_DAYPART_HOURS_DEFAULT.morning.start),
      end: clock(row.morning_end, CAFE_DAYPART_HOURS_DEFAULT.morning.end),
    },
    day: {
      start: clock(row.day_start, CAFE_DAYPART_HOURS_DEFAULT.day.start),
      end: clock(row.day_end, CAFE_DAYPART_HOURS_DEFAULT.day.end),
    },
    evening: {
      start: clock(row.evening_start, CAFE_DAYPART_HOURS_DEFAULT.evening.start),
      end: clock(row.evening_end, CAFE_DAYPART_HOURS_DEFAULT.evening.end),
    },
  };
  if (validateCafeDaypartHours(hours)) return null;
  const version = typeof row.settings_version === "number" ? row.settings_version : Number(row.settings_version);
  if (!Number.isInteger(version) || version < 1) return null;
  return {
    locationId: row.location_id,
    character: character as GuestCoffeeCharacter,
    direction: direction as GuestCoffeeDirection,
    daypartMode: daypartMode as CafeDaypartMode,
    energyOffset: energy,
    hours,
    pointCanEditSettings: row.point_can_edit_settings !== false,
    settingsVersion: version,
  };
}

export function locationSoundProfile(settings: LocationSoundDraft): GuestCoffeeProfile {
  return {
    character: settings.character,
    direction: settings.direction,
    daypart: GUEST_COFFEE_DEFAULT_PROFILE.daypart,
  };
}

export function locationSoundPrefs(settings: LocationSoundDraft): CafeQueuePrefs {
  return { daypartMode: settings.daypartMode, energyOffset: settings.energyOffset };
}

/** Atmosphere save. Omits the permission flag so a sound edit cannot flip it. */
export function locationSoundRpcArgs(locationId: string, draft: LocationSoundDraft): Record<string, unknown> {
  return {
    p_location_id: locationId,
    p_character: draft.character,
    p_direction: draft.direction,
    p_daypart_mode: draft.daypartMode,
    p_energy_offset: draft.energyOffset,
    p_morning_start: draft.hours.morning.start,
    p_morning_end: draft.hours.morning.end,
    p_day_start: draft.hours.day.start,
    p_day_end: draft.hours.day.end,
    p_evening_start: draft.hours.evening.start,
    p_evening_end: draft.hours.evening.end,
    p_point_can_edit_settings: null,
  };
}

export function locationSoundDraftFromParts(
  profile: GuestCoffeeProfile,
  prefs: CafeQueuePrefs,
  hours: CafeDaypartHours,
): LocationSoundDraft {
  return {
    character: profile.character,
    direction: profile.direction,
    daypartMode: prefs.daypartMode,
    energyOffset: isCafeEnergyOffset(prefs.energyOffset) ? prefs.energyOffset : CAFE_QUEUE_DEFAULT_PREFS.energyOffset,
    hours,
  };
}
