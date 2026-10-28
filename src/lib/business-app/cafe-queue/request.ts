import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DIRECTIONS,
  isGuestCoffeeProfileValue,
} from "@/lib/business-app/guest-coffee/catalog";

import {
  CAFE_QUEUE_FEEDBACK_LIMIT,
  isCafeDaypart,
  isCafeEnergyOffset,
  type CafeQueueFeedback,
  type CafeQueueRequest,
} from "./prefs";

const AUDIO_ITEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCafeQueueRequest(body: unknown): CafeQueueRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const row = body as {
    character?: unknown;
    direction?: unknown;
    daypart?: unknown;
    energyOffset?: unknown;
    feedback?: unknown;
    boundaryAudioItemId?: unknown;
    seed?: unknown;
  };
  if (!isGuestCoffeeProfileValue(GUEST_COFFEE_CHARACTERS, row.character)) return null;
  if (!isGuestCoffeeProfileValue(GUEST_COFFEE_DIRECTIONS, row.direction)) return null;
  if (!isCafeDaypart(row.daypart) || !isCafeEnergyOffset(row.energyOffset)) return null;
  if (row.feedback !== undefined && !Array.isArray(row.feedback)) return null;
  const feedback: CafeQueueFeedback[] = [];
  const seen = new Set<string>();
  for (const item of row.feedback ?? []) {
    if (!item || typeof item !== "object") return null;
    const vote = item as { audioItemId?: unknown; kind?: unknown };
    if (typeof vote.audioItemId !== "string" || !AUDIO_ITEM_ID.test(vote.audioItemId)) return null;
    if (vote.kind !== "more" && vote.kind !== "less") return null;
    if (seen.has(vote.audioItemId)) continue;
    seen.add(vote.audioItemId);
    feedback.push({ audioItemId: vote.audioItemId, kind: vote.kind });
    if (feedback.length > CAFE_QUEUE_FEEDBACK_LIMIT) return null;
  }
  const boundary = typeof row.boundaryAudioItemId === "string" && AUDIO_ITEM_ID.test(row.boundaryAudioItemId)
    ? row.boundaryAudioItemId
    : undefined;
  const seed = typeof row.seed === "number" && Number.isInteger(row.seed) && row.seed >= 0 && row.seed <= 0x7fffffff
    ? row.seed
    : undefined;
  return {
    character: row.character,
    direction: row.direction,
    daypart: row.daypart,
    energyOffset: row.energyOffset,
    feedback,
    boundaryAudioItemId: boundary,
    seed,
  };
}
