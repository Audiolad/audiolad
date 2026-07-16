import { isPracticePublished } from "@/lib/products/access";

export type EditorialPracticeFields = {
  id?: string;
  status: string | null;
  is_catalog_listed?: boolean | null;
  slug?: string | null;
  author_id?: string | null;
  audio_url?: string | null;
};

export function isPracticeEligibleForEditorialPlaylist(
  practice: EditorialPracticeFields,
  audioCount = 0,
): boolean {
  if (!isPracticePublished(practice.status)) {
    return false;
  }

  if (practice.is_catalog_listed !== true) {
    return false;
  }

  const slug =
    typeof practice.slug === "string" ? practice.slug.trim() : "";

  if (!slug) {
    return false;
  }

  if (!practice.author_id) {
    return false;
  }

  const hasLegacyAudio =
    typeof practice.audio_url === "string" &&
    practice.audio_url.trim().length > 0;

  return hasLegacyAudio || audioCount > 0;
}

export const EDITORIAL_PLAYLIST_LABEL = "Плейлист АудиоЛада";
