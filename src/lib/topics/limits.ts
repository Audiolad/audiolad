import type { SupabaseClient } from "@supabase/supabase-js";

/** MVP default for all author workspaces until author plans exist. */
export const DEFAULT_AUTHOR_TOPIC_LIMIT = 3;

/** Future plan limits (not wired until author billing tiers ship). */
export const PLAN_TOPIC_LIMITS = {
  free: 3,
  commercial_standard: 3,
  premium: 5,
  premium_plus: 10,
} as const;

export type AuthorPlanSlug = keyof typeof PLAN_TOPIC_LIMITS;

export type AuthorTopicLimitContext = {
  authorId: string;
};

export function assertTopicCountWithinLimit(
  selectedCount: number,
  limit: number,
):
  | { ok: true }
  | { ok: false; code: "topic_limit_exceeded"; message: string } {
  if (selectedCount > limit) {
    return {
      ok: false,
      code: "topic_limit_exceeded",
      message: `Для вашего тарифа можно выбрать не более ${limit} тем.`,
    };
  }

  return { ok: true };
}

export function assertPublishedTopicMinimum(
  activeTopicCount: number,
):
  | { ok: true }
  | { ok: false; code: "topic_min_required"; message: string } {
  if (activeTopicCount < 1) {
    return {
      ok: false,
      code: "topic_min_required",
      message: "Выберите хотя бы одну тему перед публикацией.",
    };
  }

  return { ok: true };
}

/**
 * Returns the maximum number of topics an author may assign to one product.
 * MVP: always DEFAULT_AUTHOR_TOPIC_LIMIT via DB RPC resolve_author_topic_limit.
 */
export async function resolveAuthorTopicLimit(
  supabase: SupabaseClient,
  context: AuthorTopicLimitContext,
): Promise<number> {
  const authorId = context.authorId?.trim();

  if (!authorId) {
    return DEFAULT_AUTHOR_TOPIC_LIMIT;
  }

  const { data, error } = await supabase.rpc("resolve_author_topic_limit", {
    p_author_id: authorId,
  });

  if (error || typeof data !== "number" || !Number.isFinite(data) || data < 1) {
    return DEFAULT_AUTHOR_TOPIC_LIMIT;
  }

  return Math.floor(data);
}
