export const AUTHOR_APPLICATION_ATTENTION_STATUSES = [
  "submitted",
  "needs_changes",
] as const;

export type AuthorApplicationAttentionSummary = {
  newCount: number;
  attentionCount: number;
  submitted: number;
  needsChanges: number;
};

export function summarizeAuthorApplicationAttention(
  statuses: readonly string[],
): AuthorApplicationAttentionSummary {
  let submitted = 0;
  let needsChanges = 0;

  for (const status of statuses) {
    if (status === "submitted") {
      submitted += 1;
    } else if (status === "needs_changes") {
      needsChanges += 1;
    }
  }

  return {
    newCount: submitted,
    attentionCount: submitted + needsChanges,
    submitted,
    needsChanges,
  };
}
