import type { SupabaseClient } from "@supabase/supabase-js";

import { MUSIC_USAGE_PERMISSION } from "@/lib/author-products/product-kind";
import { STUDIO_MUSIC_PRICING_MODE } from "@/lib/studio-music/pricing";

/** HTTP/API error when a second FREE Studio product would occupy the same author_id slot. */
export const STUDIO_FREE_SLOT_TAKEN = "studio_free_slot_taken" as const;

export const STUDIO_FREE_SLOT_TAKEN_MESSAGE =
  "У этого автора уже есть бесплатный продукт для Студии. Бесплатным может быть только один продукт. Выберите платную лицензию или измените другой продукт.";

/** Partial unique index created by migration 20261008120300_studio_one_free_music_per_author.sql */
export const PRACTICES_ONE_FREE_STUDIO_MUSIC_PER_AUTHOR_INDEX =
  "practices_one_free_studio_music_per_author_uidx" as const;

export type StudioFreeSlotPracticeFields = {
  deleted_at?: string | null;
  music_usage_permission?: string | null;
  studio_music_pricing_mode?: string | null;
  is_free?: boolean | null;
  price?: number | null;
};

/**
 * Matches the DB partial unique index predicate:
 * non-deleted + platform_reuse_allowed + (mode=free OR legacy NULL+listener-free).
 * Soft-deleted products release the slot. Archive status is retired.
 * Track/audio_item count is intentionally ignored.
 */
export function practiceOccupiesStudioFreeSlot(
  practice: StudioFreeSlotPracticeFields,
): boolean {
  if (practice.deleted_at) {
    return false;
  }

  if (
    practice.music_usage_permission !==
    MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED
  ) {
    return false;
  }

  const mode = practice.studio_music_pricing_mode;
  if (mode === STUDIO_MUSIC_PRICING_MODE.FREE) {
    return true;
  }

  if (mode == null) {
    return (
      practice.is_free === true ||
      practice.price == null ||
      practice.price <= 0
    );
  }

  return false;
}

/**
 * After normalizeStudioMusicPricingForSave, FREE occupancy is always explicit
 * mode=free (NULL mode clears Studio pricing and does not occupy the slot).
 */
export function wouldOccupyStudioFreeSlotAfterNormalizedSave(input: {
  musicUsagePermission: string | null | undefined;
  studioMusicPricingMode: string | null | undefined;
}): boolean {
  return (
    input.musicUsagePermission ===
      MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED &&
    input.studioMusicPricingMode === STUDIO_MUSIC_PRICING_MODE.FREE
  );
}

export function isStudioFreeSlotUniqueViolation(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined): boolean {
  if (!error || error.code !== "23505") {
    return false;
  }

  const haystack = [
    error.message ?? "",
    error.details ?? "",
    error.hint ?? "",
  ].join(" ");

  return haystack.includes(PRACTICES_ONE_FREE_STUDIO_MUSIC_PER_AUTHOR_INDEX);
}

export type StudioFreeSlotConflict = {
  id: string;
  title: string | null;
};

/**
 * Looks up another non-deleted practice for the same author_id that already
 * occupies the FREE Studio slot. Same-author only — safe to expose title/id
 * to the mutating author workspace.
 */
export async function findConflictingStudioFreeSlotProduct(
  supabase: SupabaseClient,
  input: { authorId: string; excludePracticeId: string },
): Promise<StudioFreeSlotConflict | null> {
  const { data, error } = await supabase
    .from("practices")
    .select(
      "id, title, deleted_at, music_usage_permission, studio_music_pricing_mode, is_free, price",
    )
    .eq("author_id", input.authorId)
    .neq("id", input.excludePracticeId)
    .is("deleted_at", null)
    .eq(
      "music_usage_permission",
      MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED,
    );

  if (error) {
    throw new Error("studio_free_slot_lookup_failed");
  }

  for (const row of data ?? []) {
    if (
      practiceOccupiesStudioFreeSlot(
        row as StudioFreeSlotPracticeFields,
      )
    ) {
      return {
        id: String((row as { id: string }).id),
        title:
          typeof (row as { title?: unknown }).title === "string"
            ? (row as { title: string }).title
            : null,
      };
    }
  }

  return null;
}

export function studioFreeSlotTakenResponseBody(conflict?: {
  id: string;
  title: string | null;
} | null) {
  return {
    error: STUDIO_FREE_SLOT_TAKEN,
    message: STUDIO_FREE_SLOT_TAKEN_MESSAGE,
    ...(conflict
      ? {
          conflictingPracticeId: conflict.id,
          conflictingPracticeTitle: conflict.title,
        }
      : {}),
  };
}
