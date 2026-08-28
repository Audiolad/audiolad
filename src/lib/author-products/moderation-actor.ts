import type { SupabaseClient } from "@supabase/supabase-js";

import type { PracticeRow } from "@/lib/author-products/types";
import { hasPermission } from "@/lib/auth/platform-access";
import { resolveSupportBypassCapability } from "@/lib/author-support/policy";

import {
  assertPracticePublicContentEditable,
  getAuthorCanBypassProductModeration,
  MODERATION_STATUS,
  type PublishModerationGateResult,
} from "./moderation";

/**
 * Author-workspace flag OR acting user can moderate author products
 * (owner / admin / editor via author_products.moderate).
 * Server-only: reads the HttpOnly support session.
 */
export async function actorCanBypassProductModeration(
  supabase: SupabaseClient,
  authorId: string,
  userId: string,
): Promise<boolean> {
  const authorCanBypass = await getAuthorCanBypassProductModeration(
    supabase,
    authorId,
  );
  const { peekAuthorExecutionContext } = await import(
    "@/lib/author-support/context"
  );
  const execution = await peekAuthorExecutionContext();
  const actorHasModeratePermission = await hasPermission(
    supabase,
    userId,
    "author_products.moderate",
  );

  return resolveSupportBypassCapability({
    authorCanBypass,
    actorHasModeratePermission,
    isSupportMode: execution?.isSupportMode === true,
  });
}

/**
 * Server-side gate before calling publish_audio_product.
 * DB trigger + RPC remain the source of truth; this blocks the old API early.
 */
export async function assertPublishModerationAllowed(
  supabase: SupabaseClient,
  practice: Pick<
    PracticeRow,
    "id" | "author_id" | "status" | "moderation_status" | "deleted_at"
  >,
  userId?: string,
): Promise<PublishModerationGateResult> {
  if (practice.deleted_at) {
    return {
      ok: false,
      code: "practice_deleted",
      message: "Удалённый продукт нельзя опубликовать.",
      status: 409,
    };
  }

  const canBypass = userId
    ? await actorCanBypassProductModeration(
        supabase,
        practice.author_id,
        userId,
      )
    : await getAuthorCanBypassProductModeration(supabase, practice.author_id);

  if (canBypass) {
    return { ok: true, canBypass: true };
  }

  if (practice.moderation_status === MODERATION_STATUS.APPROVED) {
    return { ok: true, canBypass: false };
  }

  if (practice.status === "unpublished") {
    return {
      ok: false,
      code: "moderation_not_approved_for_republish",
      message:
        "После изменений отправьте продукт на модерацию. Повторная публикация без проверки доступна только для одобренной версии.",
      status: 403,
    };
  }

  return {
    ok: false,
    code: "moderation_required",
    message:
      "Сначала отправьте продукт на модерацию. Публикация станет доступна после одобрения.",
    status: 403,
  };
}

export async function assertPracticePublicContentEditableForActor(
  supabase: SupabaseClient,
  practice: {
    author_id: string;
    status: string;
    moderation_status?: string | null;
    deleted_at?: string | null;
  },
  userId: string,
): Promise<void> {
  const canBypass = await actorCanBypassProductModeration(
    supabase,
    practice.author_id,
    userId,
  );
  assertPracticePublicContentEditable(practice, { canBypass });
}
