import type { SupabaseClient } from "@supabase/supabase-js";

import { MUSIC_USAGE_PERMISSION } from "@/lib/author-products/product-kind";
import { STUDIO_MUSIC_PRICING_MODE } from "@/lib/studio-music/pricing";

/** Controlled marker for forbidden NEW Studio FREE configuration. */
export const STUDIO_NEW_FREE_DISABLED = "studio_new_free_disabled" as const;

export const STUDIO_NEW_FREE_DISABLED_MESSAGE =
  "Новые бесплатные лицензии для Студии больше недоступны. Выберите платную лицензию от 499 ₽.";

export const STUDIO_NEW_FREE_POLICY_COPY = {
  newProductsPaidOnly:
    "Новые продукты для Студии публикуются только с платной лицензией — от 499 ₽.",
  grandfatheredKept: "Бесплатная лицензия сохранена ранее.",
  grandfatheredExplain:
    "Ранее опубликованные бесплатные лицензии сохраняются. Для новых продуктов лицензия для Студии доступна только платно — от 499 ₽.",
} as const;

export type StudioFreePolicyPracticeFields = {
  deleted_at?: string | null;
  author_id?: string | null;
  music_usage_permission?: string | null;
  studio_music_pricing_mode?: string | null;
  is_free?: boolean | null;
  price?: number | null;
};

/**
 * Effective FREE Studio product configuration (matches DB trigger helper).
 * Soft-deleted rows are not FREE. Track/audio count is ignored.
 */
export function isEffectiveStudioFreeProduct(
  practice: StudioFreePolicyPracticeFields | null | undefined,
): boolean {
  if (!practice || practice.deleted_at) {
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
 * Continuous grandfathered FREE: already active FREE stays FREE on same author.
 */
export function isGrandfatheredStudioFreeContinuation(input: {
  oldRow: StudioFreePolicyPracticeFields | null | undefined;
  newRow: StudioFreePolicyPracticeFields;
}): boolean {
  const { oldRow, newRow } = input;
  if (!oldRow) {
    return false;
  }
  if (!isEffectiveStudioFreeProduct(oldRow)) {
    return false;
  }
  if (!isEffectiveStudioFreeProduct(newRow)) {
    return false;
  }
  if (!oldRow.author_id || !newRow.author_id) {
    return false;
  }
  return oldRow.author_id === newRow.author_id;
}

/** True when the transition would introduce a NEW FREE Studio state. */
export function wouldCreateNewStudioFreeState(input: {
  oldRow?: StudioFreePolicyPracticeFields | null;
  newRow: StudioFreePolicyPracticeFields;
}): boolean {
  if (!isEffectiveStudioFreeProduct(input.newRow)) {
    return false;
  }
  return !isGrandfatheredStudioFreeContinuation({
    oldRow: input.oldRow,
    newRow: input.newRow,
  });
}

export function isStudioNewFreeDisabledViolation(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined): boolean {
  if (!error) {
    return false;
  }
  const haystack = [
    error.code ?? "",
    error.message ?? "",
    error.details ?? "",
    error.hint ?? "",
  ].join(" ");
  return haystack.includes(STUDIO_NEW_FREE_DISABLED);
}

export function studioNewFreeDisabledResponseBody() {
  return {
    error: STUDIO_NEW_FREE_DISABLED,
    message: STUDIO_NEW_FREE_DISABLED_MESSAGE,
  };
}

/** Unused client kept for future service lookups; policy is row-local. */
export async function assertNoNewStudioFreeRequired(
  _supabase: SupabaseClient,
): Promise<void> {
  return;
}
