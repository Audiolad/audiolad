export type AdminPayoutProfileActionState = {
  ok: boolean;
  error?: string;
  message?: string;
  warning?: string;
};

export const ADMIN_PAYOUT_PROFILE_ACTION_INITIAL_STATE: AdminPayoutProfileActionState =
  { ok: false };
