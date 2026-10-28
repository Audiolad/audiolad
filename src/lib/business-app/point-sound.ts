import { cafeDaypartAtMinute, isCafeDaypart, isCafeEnergyOffset, validateCafeDaypartHours, type CafeDaypart, type CafeDaypartHours, type CafeDaypartMode, type CafeEnergyOffset } from "@/lib/business-app/cafe-queue/prefs";
import type { GuestCoffeeCharacter, GuestCoffeeDirection } from "@/lib/business-app/guest-coffee/catalog";

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
