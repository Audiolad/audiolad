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
  /**
   * @deprecated Ignored for display. commercial_active must not mark payout
   * as filled — only a real payout profile status does.
   */
  legacyCommercialActive?: boolean;
  /**
   * True when open columns show stored requisites (e.g. account_last4).
   * Distinguishes empty draft rows from drafts with saved payment data.
   */
  hasStoredRequisites?: boolean;
}): {
  state: "locked" | "active" | "completed" | "coming_soon";
  statusLabel?: string;
  actionLabel?: string;
  hint?: string | null;
} {
  // legacyCommercialActive intentionally unused: optional payout status must
  // reflect the author's own payout profile, not commercial activation.
  void input.legacyCommercialActive;

  if (!input.applicationApproved) {
    return {
      state: "locked",
      hint: "Шаг откроется после одобрения коммерческой заявки.",
    };
  }

  if (!input.available) {
    return { state: "coming_soon" };
  }

  const status = input.status ?? null;

  if (!status) {
    return {
      state: "active",
      statusLabel: "Не заполнено",
      actionLabel: "Заполнить данные",
      hint: "Можно заполнить позже",
    };
  }

  switch (status) {
    case "draft":
      if (input.hasStoredRequisites) {
        return {
          state: "active",
          statusLabel: "Черновик",
          actionLabel: "Продолжить",
        };
      }
      return {
        state: "active",
        statusLabel: "Не заполнено",
        actionLabel: "Заполнить данные",
        hint: "Можно заполнить позже",
      };
    case "submitted":
    case "in_review":
      return {
        state: "completed",
        statusLabel: "Отправлено",
      };
    case "needs_changes":
      return {
        state: "active",
        statusLabel: "Нужно исправить",
        actionLabel: "Уточнить данные",
      };
    case "verified":
      return {
        state: "completed",
        statusLabel: "Заполнено",
      };
    case "rejected":
      return {
        state: "active",
        statusLabel: "Нужно исправить",
        actionLabel: "Открыть решение",
      };
    default:
      return {
        state: "active",
        statusLabel: "Не заполнено",
        actionLabel: "Заполнить данные",
      };
  }
}
