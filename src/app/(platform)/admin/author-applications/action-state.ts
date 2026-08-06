export type AdminAuthorApplicationActionState = {
  ok: boolean;
  error?: string;
  warning?: string;
  message?: string;
};

export const ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE: AdminAuthorApplicationActionState =
  { ok: false };
