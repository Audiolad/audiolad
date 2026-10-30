import type { StickerFormat } from "./sticker";

/** Cabinet download links. Kept apart from the renderer so the client bundle stays small. */

export const VENUE_STICKER_API_PATH = "/api/business/venue-licence/sticker";

export const VENUE_STICKER_FORMATS: readonly StickerFormat[] = ["square80", "a6"];

export function isVenueStickerFormat(value: unknown): value is StickerFormat {
  return typeof value === "string" && (VENUE_STICKER_FORMATS as readonly string[]).includes(value);
}

export function venueStickerHref(locationId: string, format: StickerFormat): string {
  const query = new URLSearchParams({ locationId, format });
  return `${VENUE_STICKER_API_PATH}?${query.toString()}`;
}

export function venueStickerFilename(format: StickerFormat): string {
  return format === "a6" ? "audiolad-tent-a6.svg" : "audiolad-sticker-80x80.svg";
}
