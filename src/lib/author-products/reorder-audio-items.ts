import type { SupabaseClient } from "@supabase/supabase-js";

const TEMP_POSITION_OFFSET = 10_000;

type ReorderAudioItemsResult =
  | { ok: true }
  | { ok: false; code: string };

export async function reorderAudioItems(
  supabase: SupabaseClient,
  practiceId: string,
  order: string[],
): Promise<ReorderAudioItemsResult> {
  if (order.length === 0) {
    return { ok: false, code: "invalid_request" };
  }

  if (new Set(order).size !== order.length) {
    return { ok: false, code: "invalid_request" };
  }

  const { data: audioItems, error: lookupError } = await supabase
    .from("audio_items")
    .select("id")
    .eq("practice_id", practiceId);

  if (lookupError) {
    return { ok: false, code: "internal_error" };
  }

  const existingIds = new Set((audioItems ?? []).map((item) => item.id));

  if (order.length !== existingIds.size) {
    return { ok: false, code: "invalid_request" };
  }

  for (const audioId of order) {
    if (!existingIds.has(audioId)) {
      return { ok: false, code: "invalid_request" };
    }
  }

  const now = new Date().toISOString();

  for (const [index, audioId] of order.entries()) {
    const { error } = await supabase
      .from("audio_items")
      .update({
        position: TEMP_POSITION_OFFSET + index + 1,
        updated_at: now,
      })
      .eq("id", audioId)
      .eq("practice_id", practiceId);

    if (error) {
      return { ok: false, code: "internal_error" };
    }
  }

  for (const [index, audioId] of order.entries()) {
    const { error } = await supabase
      .from("audio_items")
      .update({
        position: index + 1,
        updated_at: now,
      })
      .eq("id", audioId)
      .eq("practice_id", practiceId);

    if (error) {
      return { ok: false, code: "internal_error" };
    }
  }

  return { ok: true };
}
