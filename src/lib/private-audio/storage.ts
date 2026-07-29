import { randomUUID } from "node:crypto";

export const PRIVATE_AUDIO_BUCKET = "private-audio-items" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, fieldName: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`invalid_${fieldName}`);
  }
}

export function buildPrivateAudioPath(
  ownerUserId: string,
  itemId: string,
): string {
  assertUuid(ownerUserId, "owner_user_id");
  assertUuid(itemId, "item_id");

  return `${ownerUserId}/${itemId}/audio/${randomUUID()}.mp3`;
}

export function buildPrivateCoverPath(
  ownerUserId: string,
  itemId: string,
): string {
  assertUuid(ownerUserId, "owner_user_id");
  assertUuid(itemId, "item_id");

  return `${ownerUserId}/${itemId}/cover/${randomUUID()}.webp`;
}

export function isPathInsidePrivateAudioRoot(
  storagePath: string,
  ownerUserId: string,
  itemId: string,
): boolean {
  const normalized = storagePath.replace(/\\/g, "/").trim();

  if (!normalized || normalized.includes("..")) {
    return false;
  }

  const segments = normalized.split("/").filter(Boolean);

  if (segments.length !== 4) {
    return false;
  }

  const [owner, item, kind, fileName] = segments;

  if (owner !== ownerUserId || item !== itemId) {
    return false;
  }

  if (kind !== "audio" && kind !== "cover") {
    return false;
  }

  if (!fileName || fileName.includes("/")) {
    return false;
  }

  return true;
}

export function isOwnedPrivateAudioPrefix(
  storagePath: string,
  ownerUserId: string,
): boolean {
  const normalized = storagePath.replace(/\\/g, "/").trim();

  if (!normalized || normalized.includes("..")) {
    return false;
  }

  return normalized.startsWith(`${ownerUserId}/`);
}
