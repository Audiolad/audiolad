export type AdminPayoutProfileActionState = {
  ok: boolean;
  error?: string;
  message?: string;
  warning?: string;
};

export const ADMIN_PAYOUT_PROFILE_ACTION_INITIAL_STATE: AdminPayoutProfileActionState =
  { ok: false };

export type AdminPayoutProfileActionKind =
  | "take"
  | "changes"
  | "reject"
  | "verify";

/**
 * Feedback for the admin review form: only the action the staff member
 * submitted last is shown (its state may still be the initial one while the
 * request is pending).
 */
export function pickAdminPayoutProfileFeedback(
  lastAction: AdminPayoutProfileActionKind | null,
  states: Record<AdminPayoutProfileActionKind, AdminPayoutProfileActionState>,
): AdminPayoutProfileActionState {
  if (!lastAction) {
    return ADMIN_PAYOUT_PROFILE_ACTION_INITIAL_STATE;
  }
  return states[lastAction];
}
