import type { AuthorPayoutProfileStatus } from "./types";

const AUTHOR_TRANSITIONS: Record<
  AuthorPayoutProfileStatus,
  readonly AuthorPayoutProfileStatus[]
> = {
  draft: ["submitted"],
  submitted: [],
  in_review: [],
  needs_changes: ["draft"],
  verified: ["draft"],
  rejected: [],
};

const STAFF_TRANSITIONS: Record<
  AuthorPayoutProfileStatus,
  readonly AuthorPayoutProfileStatus[]
> = {
  draft: [],
  submitted: ["in_review", "needs_changes", "verified", "rejected"],
  in_review: ["needs_changes", "verified", "rejected"],
  needs_changes: [],
  verified: [],
  rejected: [],
};

export function canAuthorTransitionPayoutProfileStatus(
  from: AuthorPayoutProfileStatus,
  to: AuthorPayoutProfileStatus,
): boolean {
  return AUTHOR_TRANSITIONS[from].includes(to);
}

export function canStaffTransitionPayoutProfileStatus(
  from: AuthorPayoutProfileStatus,
  to: AuthorPayoutProfileStatus,
): boolean {
  return STAFF_TRANSITIONS[from].includes(to);
}

export function isAuthorEditablePayoutProfileStatus(
  status: AuthorPayoutProfileStatus,
): boolean {
  return status === "draft" || status === "needs_changes";
}

export function authorCanSubmitPayoutProfileStatus(
  status: AuthorPayoutProfileStatus,
): boolean {
  return status === "draft" || status === "needs_changes";
}

export function mapPayoutProfileStatusToOnboardingVisual(input: {
  status: AuthorPayoutProfileStatus | null | undefined;
  available: boolean;
  applicationApproved: boolean;
  /** Legacy commercial_active authors: do not force the new payout form. */
  legacyCommercialActive?: boolean;
}): {
  state: "locked" | "active" | "completed" | "coming_soon";
  statusLabel?: string;
  actionLabel?: string;
  hint?: string | null;
} {
  if (!input.applicationApproved) {
    return {
      state: "locked",
      hint: "Шаг откроется после одобрения коммерческой заявки.",
    };
  }

  if (!input.available) {
    return { state: "coming_soon" };
  }

  if (input.legacyCommercialActive) {
    return { state: "completed" };
  }

  const status = input.status ?? null;

  if (!status) {
    return {
      state: "active",
      actionLabel: "Заполнить данные",
    };
  }

  switch (status) {
    case "draft":
      return {
        state: "active",
        statusLabel: "Не заполнено",
        actionLabel: "Продолжить",
      };
    case "submitted":
    case "in_review":
      return {
        state: "completed",
        statusLabel: "Данные отправлены",
      };
    case "needs_changes":
      return {
        state: "active",
        statusLabel: "Требуется уточнение",
        actionLabel: "Уточнить данные",
      };
    case "verified":
      return {
        state: "completed",
        statusLabel: "Данные заполнены",
      };
    case "rejected":
      return {
        state: "active",
        statusLabel: "Требуется уточнение",
        actionLabel: "Открыть решение",
      };
    default:
      return { state: "active", actionLabel: "Заполнить данные" };
  }
}
