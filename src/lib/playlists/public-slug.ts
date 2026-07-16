import { slugifyTitle } from "@/lib/author-products/utils";

/** Max length for stored public playlist slugs (base + suffix). */
export const PLAYLIST_PUBLIC_SLUG_MAX_LENGTH = 64;

/**
 * Validate a public playlist slug from a URL segment.
 * Matches server-generated format: lowercase [a-z0-9-], no leading/trailing dash.
 */
export function isValidPlaylistPublicSlug(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const slug = value.trim();

  if (slug.length < 3 || slug.length > PLAYLIST_PUBLIC_SLUG_MAX_LENGTH) {
    return false;
  }

  if (slug !== slug.toLowerCase()) {
    return false;
  }

  if (slug.includes("..") || slug.includes("//") || slug.includes("/")) {
    return false;
  }

  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function normalizePlaylistPublicSlug(value: string): string {
  return value.trim().toLowerCase();
}

/** Soft check that a candidate resembles our generated slug shape (for tests). */
export function looksLikeGeneratedPlaylistSlug(title: string, slug: string): boolean {
  const base = (slugifyTitle(title) || "playlist").slice(0, 48);
  return slug.startsWith(base.slice(0, Math.min(8, base.length))) || slug.includes("-");
}
