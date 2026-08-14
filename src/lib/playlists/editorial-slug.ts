import { slugifyTitle } from "@/lib/author-products/utils";
import { isValidPlaylistPublicSlug } from "@/lib/playlists/public-slug";

const DRAFT_SLUG_MAX_LENGTH = 48;

function isDraftSlugShape(value: string): boolean {
  return isValidPlaylistPublicSlug(value) === true;
}

export function buildEditorialDraftSlug(title: string): string {
  const base = (slugifyTitle(title) || "playlist")
    .slice(0, DRAFT_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");

  if (isDraftSlugShape(base)) {
    return base;
  }

  if (base.length > 0 && base.length < 3) {
    const padded = `${base}-pl`.slice(0, DRAFT_SLUG_MAX_LENGTH);

    if (isDraftSlugShape(padded)) {
      return padded;
    }
  }

  return "playlist";
}

export function normalizeEditorialDraftSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}
