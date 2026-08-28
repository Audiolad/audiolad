import type { SupabaseClient } from "@supabase/supabase-js";

import { mapModerationRpcError } from "@/lib/author-products/moderation";
import type { PracticeRow } from "@/lib/author-products/types";
import { coercePracticeRow } from "@/lib/author-products/types";

function mapLifecycleRpcError(message: string): {
  status: number;
  code: string;
  message: string;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("lifecycle_state_changed")) {
    return {
      status: 409,
      code: "lifecycle_state_changed",
      message:
        "Состояние продукта изменилось. Обновите страницу и повторите действие.",
    };
  }

  if (normalized.includes("paid_purchase_exists")) {
    return {
      status: 409,
      code: "paid_purchase_exists",
      message:
        "Удалить этот продукт нельзя, потому что его уже приобрели пользователи. Вы можете снять продукт с публикации – новые покупки прекратятся, а прежние покупатели сохранят доступ.",
    };
  }

  if (normalized.includes("published_content_immutable")) {
    return {
      status: 409,
      code: "published_content_immutable",
      message:
        "Чтобы изменить опубликованный продукт, сначала выберите «Снять и редактировать».",
    };
  }

  return mapModerationRpcError(message);
}

function coerceRpcPractice(data: unknown, fallbackMessage: string): PracticeRow {
  if (!data || typeof data !== "object") {
    throw {
      status: 500,
      code: "lifecycle_action_failed",
      message: fallbackMessage,
    };
  }

  return coercePracticeRow(data as Parameters<typeof coercePracticeRow>[0]);
}

export async function unpublishApprovedPractice(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PracticeRow> {
  const { getAuthorRpcClient } = await import("@/lib/author-support/context");
  const rpc = await getAuthorRpcClient(supabase);
  const { data, error } = await rpc.rpc("unpublish_approved_practice", {
    p_practice_id: practiceId,
  });

  if (error) {
    throw mapLifecycleRpcError(error.message);
  }

  return coerceRpcPractice(data, "Не удалось снять продукт с публикации.");
}

export async function startPracticeEditing(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PracticeRow> {
  const { getAuthorRpcClient } = await import("@/lib/author-support/context");
  const rpc = await getAuthorRpcClient(supabase);
  const { data, error } = await rpc.rpc("start_practice_editing", {
    p_practice_id: practiceId,
  });

  if (error) {
    throw mapLifecycleRpcError(error.message);
  }

  return coerceRpcPractice(data, "Не удалось перейти к редактированию.");
}

export async function softDeletePractice(
  supabase: SupabaseClient,
  practiceId: string,
  deletionReason?: string | null,
): Promise<PracticeRow> {
  const { getAuthorRpcClient } = await import("@/lib/author-support/context");
  const rpc = await getAuthorRpcClient(supabase);
  const { data, error } = await rpc.rpc("soft_delete_practice", {
    p_practice_id: practiceId,
    p_deletion_reason: deletionReason ?? null,
  });

  if (error) {
    throw mapLifecycleRpcError(error.message);
  }

  return coerceRpcPractice(data, "Не удалось удалить продукт.");
}
