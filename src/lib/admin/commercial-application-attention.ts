import type { AuthorCommercialApplicationStatus } from "@/lib/author-commercial-applications/types";

/** Statuses that still need staff action. */
export const COMMERCIAL_APPLICATION_OPEN_STATUSES = [
  "submitted",
  "needs_changes",
  "in_review",
] as const;

export type CommercialApplicationOpenStatus =
  (typeof COMMERCIAL_APPLICATION_OPEN_STATUSES)[number];

export type CommercialApplicationAttentionSummary = {
  /** Badge count: freshly submitted applications. */
  newCount: number;
  /** Dashboard attention total: submitted + needs_changes + in_review. */
  attentionCount: number;
  submitted: number;
  needsChanges: number;
  inReview: number;
};

export function getCommercialApplicationAttentionRank(
  status: AuthorCommercialApplicationStatus | string,
): number {
  switch (status) {
    case "submitted":
      return 0;
    case "needs_changes":
      return 1;
    case "in_review":
      return 2;
    default:
      return 3;
  }
}

export function isCommercialApplicationOpenStatus(
  status: string,
): status is CommercialApplicationOpenStatus {
  return (COMMERCIAL_APPLICATION_OPEN_STATUSES as readonly string[]).includes(
    status,
  );
}

export function summarizeCommercialApplicationAttention(
  statuses: readonly string[],
): CommercialApplicationAttentionSummary {
  let submitted = 0;
  let needsChanges = 0;
  let inReview = 0;

  for (const status of statuses) {
    if (status === "submitted") {
      submitted += 1;
    } else if (status === "needs_changes") {
      needsChanges += 1;
    } else if (status === "in_review") {
      inReview += 1;
    }
  }

  return {
    newCount: submitted,
    attentionCount: submitted + needsChanges + inReview,
    submitted,
    needsChanges,
    inReview,
  };
}

export function sortAdminCommercialApplicationsByAttention<
  T extends {
    status: AuthorCommercialApplicationStatus | string;
    submittedAt: string | null;
    createdAt: string;
  },
>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const rank =
      getCommercialApplicationAttentionRank(left.status) -
      getCommercialApplicationAttentionRank(right.status);

    if (rank !== 0) {
      return rank;
    }

    const leftTime = left.submittedAt ?? left.createdAt;
    const rightTime = right.submittedAt ?? right.createdAt;

    return rightTime.localeCompare(leftTime);
  });
}
