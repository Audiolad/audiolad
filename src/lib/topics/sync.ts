import type { SupabaseClient } from "@supabase/supabase-js";

import { mapTopicRpcError } from "./errors";
import type { SetPracticeTopicsResult } from "./types";

export function isSetPracticeTopicsResult(
  value: unknown,
): value is SetPracticeTopicsResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as SetPracticeTopicsResult;

  return (
    typeof row.practice_id === "string" &&
    Array.isArray(row.topic_keys) &&
    row.topic_keys.every((key) => typeof key === "string") &&
    typeof row.topic_count === "number" &&
    typeof row.topic_limit === "number"
  );
}

export type SetPracticeTopicsResponse =
  | { ok: true; result: SetPracticeTopicsResult }
  | { ok: false; status: number; code: string; message: string };

export async function setPracticeTopics(
  supabase: SupabaseClient,
  practiceId: string,
  topicKeys: string[],
): Promise<SetPracticeTopicsResponse> {
  const normalizedKeys = [
    ...new Set(
      topicKeys
        .map((key) => key.trim().toLowerCase())
        .filter((key) => key.length > 0),
    ),
  ].sort();

  const { data, error } = await supabase.rpc("set_practice_topics", {
    p_practice_id: practiceId,
    p_topic_keys: normalizedKeys,
  });

  if (error) {
    const mapped = mapTopicRpcError(error.message);
    return {
      ok: false,
      status: mapped.status,
      code: mapped.code,
      message: mapped.message,
    };
  }

  if (!isSetPracticeTopicsResult(data)) {
    return {
      ok: false,
      status: 500,
      code: "topic_sync_failed",
      message: "Не удалось сохранить темы продукта.",
    };
  }

  return {
    ok: true,
    result: {
      practice_id: data.practice_id,
      topic_keys: data.topic_keys,
      topic_count: data.topic_count,
      topic_limit: data.topic_limit,
    },
  };
}
