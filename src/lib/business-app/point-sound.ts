import { cafeDaypartAtMinute, isCafeDaypart, isCafeEnergyOffset, validateCafeDaypartHours, type CafeDaypart, type CafeDaypartHours, type CafeDaypartMode, type CafeEnergyOffset } from "@/lib/business-app/cafe-queue/prefs";
import type { GuestCoffeeCharacter, GuestCoffeeDirection } from "@/lib/business-app/guest-coffee/catalog";

import type { LocationSoundDraft } from "@/lib/business-app/location-sound-settings";

const fallbackZone = "Europe/Moscow";

const CHARACTERS = new Set(["cozy", "city", "classic", "evening"]);
const DIRECTIONS = new Set(["jazz", "calm", "rhythm", "melodic"]);

export type PointSoundUpdate = {
  version: number;
  pointCanEdit: boolean;
  character: GuestCoffeeCharacter;
  direction: GuestCoffeeDirection;
  daypartMode: CafeDaypartMode;
  energyOffset: CafeEnergyOffset;
  hours: CafeDaypartHours;
  timezone: string;
};

/** Minute of the day in the venue's timezone. The device clock is not used. */
export function venueMinuteOfDay(timezone: string, now = new Date()): number {
  const zone = timezone.trim() || fallbackZone;
  const read = (name: string): number | null => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: name,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return (((hour % 24) + 24) % 24) * 60 + minute;
  };
  try {
    const minute = read(zone);
    if (minute != null) return minute;
  } catch {
    /* unknown zone falls back */
  }
  return read(fallbackZone) ?? 12 * 60;
}

/** Auto mode follows the owner's windows in the venue timezone. */
export function pointDaypart(sound: Pick<PointSoundUpdate, "daypartMode" | "hours" | "timezone">, now = new Date()): CafeDaypart {
  if (sound.daypartMode !== "auto") return sound.daypartMode;
  return cafeDaypartAtMinute(venueMinuteOfDay(sound.timezone, now), sound.hours);
}

function clock(value: unknown): string | null {
  return typeof value === "string" && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : null;
}

/** Atmosphere the paired device may apply. A missing row is not a change. */
export function pointSoundUpdate(value: unknown): PointSoundUpdate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.ok !== true || row.found !== true) return null;
  if (!CHARACTERS.has(String(row.character)) || !DIRECTIONS.has(String(row.direction))) return null;
  const daypartMode = row.daypart_mode;
  if (daypartMode !== "auto" && !isCafeDaypart(daypartMode)) return null;
  const energy = typeof row.energy_offset === "number" ? row.energy_offset : Number(row.energy_offset);
  if (!isCafeEnergyOffset(energy)) return null;
  const version = typeof row.settings_version === "number" ? row.settings_version : Number(row.settings_version);
  if (!Number.isInteger(version) || version < 1) return null;
  const hours: CafeDaypartHours = {
    morning: { start: clock(row.morning_start) ?? "", end: clock(row.morning_end) ?? "" },
    day: { start: clock(row.day_start) ?? "", end: clock(row.day_end) ?? "" },
    evening: { start: clock(row.evening_start) ?? "", end: clock(row.evening_end) ?? "" },
  };
  if (validateCafeDaypartHours(hours)) return null;
  return {
    version,
    pointCanEdit: row.point_can_edit_settings !== false,
    character: row.character as GuestCoffeeCharacter,
    direction: row.direction as GuestCoffeeDirection,
    daypartMode,
    energyOffset: energy,
    hours,
    timezone: typeof row.timezone === "string" && row.timezone.trim() ? row.timezone.trim() : fallbackZone,
  };
}

export const POINT_MUSIC_FORBIDDEN = "Менять музыку с устройства в заведении запрещено.";

/** Missing settings default to ON, but an invalid/revoked session grants nothing. */
export function pointMusicAllowed(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.ok === true && row.point_can_edit_settings !== false;
}

/** Validate JSON shapes before calling the typed window validator. */
export function soundDraftFromBody(value: unknown): LocationSoundDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const { character, direction, daypartMode, energyOffset: energy } = body;
  if (character !== "cozy" && character !== "city" && character !== "classic" && character !== "evening") return null;
  if (direction !== "jazz" && direction !== "calm" && direction !== "rhythm" && direction !== "melodic") return null;
  if (daypartMode !== "auto" && !isCafeDaypart(daypartMode)) return null;
  if (!isCafeEnergyOffset(energy)) return null;
  if (!body.hours || typeof body.hours !== "object" || Array.isArray(body.hours)) return null;
  const raw = body.hours as Record<string, unknown>;
  for (const part of ["morning", "day", "evening"]) {
    const window = raw[part];
    if (!window || typeof window !== "object" || Array.isArray(window)) return null;
    const row = window as Record<string, unknown>;
    if (typeof row.start !== "string" || typeof row.end !== "string") return null;
  }
  const hours = body.hours as CafeDaypartHours;
  if (validateCafeDaypartHours(hours)) return null;
  return { character, direction, daypartMode, energyOffset: energy, hours };
}

/** Keep the current track at the boundary, so next starts the new order's first track. */
export function pointKeepCurrentOrder(indices: readonly number[], currentIndex: number): number[] {
  return [currentIndex, ...indices.filter((index) => index !== currentIndex)];
}

export type PointSoundApplyResult = "applied" | "deferred" | "failed";

/** Retry the same version/daypart after failure or deferral; serialize installs. */
export function createPointSoundApplier() {
  let appliedKey: string | null = null;
  let inFlight = false;
  return async (
    sound: PointSoundUpdate,
    install: (daypart: CafeDaypart) => Promise<PointSoundApplyResult>,
    now = new Date(),
  ): Promise<PointSoundApplyResult> => {
    const daypart = pointDaypart(sound, now);
    const key = `${sound.version}:${daypart}`;
    if (key === appliedKey) return "applied";
    if (inFlight) return "deferred";
    inFlight = true;
    try {
      const result = await install(daypart);
      if (result === "applied") appliedKey = key;
      return result;
    } catch {
      return "failed";
    } finally {
      inFlight = false;
    }
  };
}
