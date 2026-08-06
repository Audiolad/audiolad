export type AdminProductModerationActionState = {
  ok: boolean;
  error?: string;
  message?: string;
  publicPath?: string;
};

export const ADMIN_PRODUCT_MODERATION_ACTION_INITIAL_STATE: AdminProductModerationActionState =
  { ok: false };
