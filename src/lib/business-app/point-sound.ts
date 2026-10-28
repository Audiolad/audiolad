import { isCafeDaypart, isCafeEnergyOffset, validateCafeDaypartHours, type CafeDaypartHours, type CafeDaypartMode, type CafeEnergyOffset } from "@/lib/business-app/cafe-queue/prefs";
import type { GuestCoffeeCharacter, GuestCoffeeDirection } from "@/lib/business-app/guest-coffee/catalog";

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
};

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
  };
}
