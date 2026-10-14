import type { ProductAccessReason } from "@/lib/products/access";

export type PracticeEmbedMode = "play" | "link";

/**
 * Embed playback gate. The embed always resolves access as an anonymous guest
 * (userId = null), so viewer cookies / entitlements / author ownership never
 * widen it. In-frame playback only for free, non-course products with audio;
 * everything else (paid, promo, course, no audio) is a card that links to
 * audiolad.ru. The audio API itself stays the server source of truth.
 */
export function resolvePracticeEmbedMode(input: {
  accessReason: ProductAccessReason;
  canListen: boolean;
  isCourse: boolean;
  hasPlayableAudio: boolean;
}): PracticeEmbedMode {
  if (
    input.accessReason === "free" &&
    input.canListen &&
    !input.isCourse &&
    input.hasPlayableAudio
  ) {
    return "play";
  }
  return "link";
}

export function buildPracticeEmbedPath(authorSlug: string, productSlug: string): string {
  return `/embed/practice/${encodeURIComponent(authorSlug)}/${encodeURIComponent(productSlug)}`;
}

export function withEmbedUtm(url: string, source: string | null | undefined): string {
  const safe = (source ?? "").trim().toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 64);
  const parsed = new URL(url);
  parsed.searchParams.set("utm_source", safe || "embed");
  parsed.searchParams.set("utm_medium", "embed");
  return parsed.toString();
}
