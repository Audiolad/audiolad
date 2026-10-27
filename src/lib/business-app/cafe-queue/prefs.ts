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

const AUDIO_ITEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CAFE_QUEUE_FEEDBACK_LIMIT = 24;

/** 05:00–11:59 morning, 12:00–17:59 day, 18:00–04:59 evening. */
export function cafeDaypartFromHour(hour: number): CafeDaypart {
  if (!Number.isFinite(hour)) return "day";
  const wrapped = ((Math.floor(hour) % 24) + 24) % 24;
  if (wrapped >= 5 && wrapped < 12) return "morning";
  if (wrapped >= 12 && wrapped < 18) return "day";
  return "evening";
}

export function effectiveCafeDaypart(mode: CafeDaypartMode, hour: number | null): CafeDaypart | null {
  if (mode !== "auto") return mode;
  if (hour === null || !Number.isFinite(hour)) return null;
  return cafeDaypartFromHour(hour);
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
};
