import type { SupabaseClient } from "@supabase/supabase-js";

import { mapModerationRpcError } from "@/lib/author-products/moderation";
import type { PracticeRow } from "@/lib/author-products/types";
import { coercePracticeRow } from "@/lib/author-products/types";

function coerceRpcPractice(data: unknown, fallbackMessage: string): PracticeRow {
  if (!data || typeof data !== "object") {
    throw {
      status: 500,
      code: "moderation_action_failed",
      message: fallbackMessage,
    };
  }

  return coercePracticeRow(data as Parameters<typeof coercePracticeRow>[0]);
}

function mapAdminDecisionError(message: string): {
  status: number;
  code: string;
  message: string;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("moderation_state_changed")) {
    return {
      status: 409,
      code: "moderation_state_changed",
      message:
        "Состояние продукта изменилось. Обновите страницу и проверьте актуальный статус.",
    };
  }

  if (normalized.includes("moderation_comment_required")) {
    return {
      status: 400,
      code: "moderation_comment_required",
      message: "Укажите комментарий для автора не короче 10 символов.",
    };
  }

  if (normalized.includes("moderation_comment_too_long")) {
    return {
      status: 400,
      code: "moderation_comment_too_long",
      message: "Комментарий слишком длинный.",
    };
  }

  if (normalized.includes("permission_denied")) {
    return {
      status: 403,
      code: "permission_denied",
      message: "Недостаточно прав для модерации продуктов.",
    };
  }

  if (normalized.includes("product_not_ready")) {
    return {
      status: 400,
      code: "product_not_ready",
      message:
        "Продукт не готов к публикации. Проверьте обложку, аудио, темы, описание и цену.",
    };
  }

  return mapModerationRpcError(message);
}

/**
 * approve_and_publish_practice / request_practice_changes return `practices`
 * rows directly in this MVP (no email outbox jsonb wrapper).
 */
export async function approveAndPublishPractice(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PracticeRow> {
  const { data, error } = await supabase.rpc("approve_and_publish_practice", {
    p_practice_id: practiceId,
  });

  if (error) {
    throw mapAdminDecisionError(error.message);
  }

  return coerceRpcPractice(data, "Не удалось одобрить продукт.");
}

export async function requestPracticeChanges(
  supabase: SupabaseClient,
  practiceId: string,
  comment: string,
): Promise<PracticeRow> {
  const { data, error } = await supabase.rpc("request_practice_changes", {
    p_practice_id: practiceId,
    p_comment: comment,
  });

  if (error) {
    throw mapAdminDecisionError(error.message);
  }

  return coerceRpcPractice(data, "Не удалось отправить замечания автору.");
}
