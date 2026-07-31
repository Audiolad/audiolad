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

/**
 * submit_practice_for_moderation / withdraw_practice_from_moderation return
 * `practices` rows directly in this MVP (no email outbox jsonb wrapper).
 */
export async function submitPracticeForModeration(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PracticeRow> {
  const { data, error } = await supabase.rpc("submit_practice_for_moderation", {
    p_practice_id: practiceId,
  });

  if (error) {
    throw mapModerationRpcError(error.message);
  }

  return coerceRpcPractice(data, "Не удалось отправить продукт на модерацию.");
}

export async function withdrawPracticeFromModeration(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PracticeRow> {
  const { data, error } = await supabase.rpc(
    "withdraw_practice_from_moderation",
    {
      p_practice_id: practiceId,
    },
  );

  if (error) {
    throw mapModerationRpcError(error.message);
  }

  return coerceRpcPractice(data, "Не удалось отозвать продукт с модерации.");
}
