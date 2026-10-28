/**
 * Device and session choices for the cafe queue. No database row.
 * Daypart "auto" follows the clock on this device. Calm / lively is one step of ±15.
 * "More / less like this" lasts for the browser session only.
 */
import type { GuestCoffeeCharacter, GuestCoffeeDirection } from "@/lib/business-app/guest-coffee/catalog";

export const CAFE_DAYPARTS = ["morning", "day", "evening"] as const;

export type CafeDaypart = (typeof CAFE_DAYPARTS)[number];

export type CafeDaypartMode = "auto" | CafeDaypart;

export const CAFE_ENERGY_OFFSET_STEP = 15;

export type CafeEnergyOffset = -15 | 0 | 15;

export type CafeQueueFeedbackKind = "more" | "less";

export type CafeQueueFeedback = {
  audioItemId: string;
  kind: CafeQueueFeedbackKind;
};

export type CafeQueuePrefs = {
  daypartMode: CafeDaypartMode;
  energyOffset: CafeEnergyOffset;
};

export const CAFE_QUEUE_PREFS_KEY = "audiolad-business-cafe-queue-prefs";

export const CAFE_QUEUE_FEEDBACK_KEY = "audiolad-business-cafe-queue-feedback";

export const CAFE_QUEUE_DEFAULT_PREFS: CafeQueuePrefs = {
  daypartMode: "auto",
  energyOffset: 0,
};

/** Device storage, one row per venue. No database column exists for these boundaries. */
export const CAFE_DAYPART_HOURS_KEY = "audiolad-business-cafe-daypart-hours";

export type CafeClock = string;

export type CafeDaypartWindow = { start: CafeClock; end: CafeClock };

export type CafeDaypartHours = Record<CafeDaypart, CafeDaypartWindow>;

/** Morning, day and evening touch. Hours outside this block stay evening (the old night). */
export const CAFE_DAYPART_HOURS_DEFAULT: CafeDaypartHours = {
  morning: { start: "07:00", end: "11:00" },
  day: { start: "11:00", end: "16:00" },
  evening: { start: "16:00", end: "20:00" },
};

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function cafeDaypartHoursKey(locationId: string | null | undefined): string {
  return locationId ? `${CAFE_DAYPART_HOURS_KEY}:${locationId}` : CAFE_DAYPART_HOURS_KEY;
}

export function parseClockMinutes(value: string): number | null {
  const match = CLOCK.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function validateCafeDaypartHours(hours: CafeDaypartHours): string | null {
  const rows = [
    ["Утро", hours.morning],
    ["День", hours.day],
    ["Вечер", hours.evening],
  ] as const;
  const parsed: { label: string; start: number; end: number }[] = [];
  for (const [label, window] of rows) {
    const start = parseClockMinutes(window.start);
    const end = parseClockMinutes(window.end);
    if (start === null || end === null) return `${label}: укажите время в виде ЧЧ:ММ.`;
    if (start >= end) return `${label}: начало должно быть раньше конца.`;
    parsed.push({ label, start, end });
  }
  if (parsed[0]!.end > parsed[1]!.start || parsed[1]!.end > parsed[2]!.start) {
    return "Интервалы не должны пересекаться.";
  }
  if (parsed[0]!.end !== parsed[1]!.start || parsed[1]!.end !== parsed[2]!.start) {
    return "Интервалы должны идти подряд: конец утра совпадает с началом дня, конец дня – с началом вечера.";
  }
  return null;
}

export function parseCafeDaypartHours(raw: string | null | undefined): CafeDaypartHours {
  if (!raw) return CAFE_DAYPART_HOURS_DEFAULT;
  try {
    const value = JSON.parse(raw) as Partial<Record<CafeDaypart, CafeDaypartWindow>>;
    const hours: CafeDaypartHours = {
      morning: { start: String(value.morning?.start ?? ""), end: String(value.morning?.end ?? "") },
      day: { start: String(value.day?.start ?? ""), end: String(value.day?.end ?? "") },
      evening: { start: String(value.evening?.start ?? ""), end: String(value.evening?.end ?? "") },
    };
    return validateCafeDaypartHours(hours) === null ? hours : CAFE_DAYPART_HOURS_DEFAULT;
  } catch {
    return CAFE_DAYPART_HOURS_DEFAULT;
  }
}

export function serializeCafeDaypartHours(hours: CafeDaypartHours): string {
  return JSON.stringify(hours);
}

/** Inside a window the part is that window. Outside the block, evening (historical night). */
export function cafeDaypartAtMinute(minuteOfDay: number, hours: CafeDaypartHours = CAFE_DAYPART_HOURS_DEFAULT): CafeDaypart {
  if (!Number.isFinite(minuteOfDay)) return "day";
  const minute = ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
  const windows = [hours.morning, hours.day, hours.evening].map((window) => ({
    start: parseClockMinutes(window.start),
    end: parseClockMinutes(window.end),
  }));
  const parts: CafeDaypart[] = ["morning", "day", "evening"];
  for (let index = 0; index < parts.length; index += 1) {
    const window = windows[index];
    if (window?.start === null || window?.end === null || window.start >= window.end) continue;
    if (minute >= window.start && minute < window.end) return parts[index]!;
  }
  return "evening";
}

const AUDIO_ITEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CAFE_QUEUE_FEEDBACK_LIMIT = 24;

/** Whole hour on the device clock, using the venue windows. 11:00 is already day. */
export function cafeDaypartFromHour(hour: number, hours: CafeDaypartHours = CAFE_DAYPART_HOURS_DEFAULT): CafeDaypart {
  if (!Number.isFinite(hour)) return "day";
  const wrapped = ((Math.floor(hour) % 24) + 24) % 24;
  return cafeDaypartAtMinute(wrapped * 60, hours);
}

export function effectiveCafeDaypart(
  mode: CafeDaypartMode,
  hour: number | null,
  hours: CafeDaypartHours = CAFE_DAYPART_HOURS_DEFAULT,
): CafeDaypart | null {
  if (mode !== "auto") return mode;
  if (hour === null || !Number.isFinite(hour)) return null;
  return cafeDaypartFromHour(hour, hours);
}

export function effectiveCafeDaypartAt(
  mode: CafeDaypartMode,
  minuteOfDay: number | null,
  hours: CafeDaypartHours = CAFE_DAYPART_HOURS_DEFAULT,
): CafeDaypart | null {
  if (mode !== "auto") return mode;
  if (minuteOfDay === null || !Number.isFinite(minuteOfDay)) return null;
  return cafeDaypartAtMinute(minuteOfDay, hours);
}

export function isCafeDaypart(value: unknown): value is CafeDaypart {
  return value === "morning" || value === "day" || value === "evening";
}

export function isCafeEnergyOffset(value: unknown): value is CafeEnergyOffset {
  return value === -CAFE_ENERGY_OFFSET_STEP || value === 0 || value === CAFE_ENERGY_OFFSET_STEP;
}

export function parseCafeQueuePrefs(raw: string | null | undefined): CafeQueuePrefs {
  if (!raw) return CAFE_QUEUE_DEFAULT_PREFS;
  try {
    const value = JSON.parse(raw) as { daypartMode?: unknown; energyOffset?: unknown };
    return {
      daypartMode: value.daypartMode === "auto" || isCafeDaypart(value.daypartMode) ? value.daypartMode : "auto",
      energyOffset: isCafeEnergyOffset(value.energyOffset) ? value.energyOffset : 0,
    };
  } catch {
    return CAFE_QUEUE_DEFAULT_PREFS;
  }
}

export function serializeCafeQueuePrefs(prefs: CafeQueuePrefs): string {
  return JSON.stringify({ daypartMode: prefs.daypartMode, energyOffset: prefs.energyOffset });
}

export function parseCafeQueueFeedback(raw: string | null | undefined): CafeQueueFeedback[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    const out: CafeQueueFeedback[] = [];
    const seen = new Set<string>();
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const row = item as { audioItemId?: unknown; kind?: unknown };
      if (typeof row.audioItemId !== "string" || !AUDIO_ITEM_ID.test(row.audioItemId)) continue;
      if (row.kind !== "more" && row.kind !== "less") continue;
      if (seen.has(row.audioItemId)) continue;
      seen.add(row.audioItemId);
      out.push({ audioItemId: row.audioItemId, kind: row.kind });
      if (out.length >= CAFE_QUEUE_FEEDBACK_LIMIT) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** One vote per track. The same vote again clears it. */
export function voteCafeFeedback(
  list: readonly CafeQueueFeedback[],
  audioItemId: string,
  kind: CafeQueueFeedbackKind,
): CafeQueueFeedback[] {
  if (!AUDIO_ITEM_ID.test(audioItemId)) return [...list];
  const without = list.filter((item) => item.audioItemId !== audioItemId);
  const current = list.find((item) => item.audioItemId === audioItemId);
  if (current?.kind === kind) return without;
  return [...without, { audioItemId, kind }].slice(-CAFE_QUEUE_FEEDBACK_LIMIT);
}

export type CafeQueueRequest = {
  character: GuestCoffeeCharacter;
  direction: GuestCoffeeDirection;
  daypart: CafeDaypart;
  energyOffset: CafeEnergyOffset;
  feedback: CafeQueueFeedback[];
  /** Track playing when the playlist is rebuilt. Its album stays off the new first slot. */
  boundaryAudioItemId?: string;
  seed?: number;
};
