export type AdminCommercialApplicationActionState = {
  ok: boolean;
  error?: string;
  message?: string;
};

export const ADMIN_COMMERCIAL_APPLICATION_ACTION_INITIAL_STATE: AdminCommercialApplicationActionState =
  { ok: false };
