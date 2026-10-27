import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";

/** Rendered size of a cabinet track thumbnail. Picks the public xs catalog variant. */
export const CABINET_TRACK_COVER_PX = 46;

/**
 * A cover may be shown only when it is already a public catalog image.
 * Signed audio, authenticated storage and data URLs never pass.
 */
export function isCabinetPublicCoverUrl(url: string): boolean {
  const value = url.trim();
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return false;
  const lower = value.toLowerCase();
  if (
    lower.includes("token=") ||
    lower.includes("/object/sign") ||
    lower.includes("/object/authenticated") ||
    lower.includes("practice-audio/")
  ) {
    return false;
  }
  if (/\.(?:mp3|wav|flac|m4a|ogg|aac|mp4)(?:$|[?#])/i.test(value)) return false;
  if (lower.includes("/storage/v1/object/public/practice-covers/")) return true;
  if (lower.includes("/storage/v1/object")) return false;
  return lower.startsWith("https://") || lower.startsWith("http://");
}

/** Public album cover already used by the catalog and album pages. Null shows the placeholder. */
export function cabinetAlbumCoverUrl(input: {
  coverUrl?: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
}): string | null {
  const resolved = getProductCoverDisplayUrl(
    input.coverUrl,
    input.updatedAt,
    input.coverImage,
    CABINET_TRACK_COVER_PX,
  );
  if (resolved && isCabinetPublicCoverUrl(resolved)) return resolved;
  // The catalog already stores an absolute public cover URL. Use it when the
  // manifest cannot be turned into a public image (and never fall back to audio).
  const legacy = input.coverUrl?.trim() ?? "";
  if (legacy && legacy !== resolved && isCabinetPublicCoverUrl(legacy)) return legacy;
  return null;
}
