import { createHash } from "node:crypto";

export const AUTHOR_SUPPORT_PROOF_GUC = "audiolad.author_support_token_hash";
export const AUTHOR_SUPPORT_PROOF_HEADER = "x-audiolad-support-proof";

export const AUTHOR_SUPPORT_RPC_WRAPPERS = {
  submit_practice_for_moderation: "submit_practice_for_moderation_with_support_proof",
  withdraw_practice_from_moderation:
    "withdraw_practice_from_moderation_with_support_proof",
  unpublish_approved_practice: "unpublish_approved_practice_with_support_proof",
  start_practice_editing: "start_practice_editing_with_support_proof",
  soft_delete_practice: "soft_delete_practice_with_support_proof",
  publish_audio_product: "publish_audio_product_with_support_proof",
  add_practice_visibility_user: "add_practice_visibility_user_with_support_proof",
  remove_practice_visibility_user:
    "remove_practice_visibility_user_with_support_proof",
  list_practice_visibility_users:
    "list_practice_visibility_users_with_support_proof",
  lookup_practice_visibility_user:
    "lookup_practice_visibility_user_with_support_proof",
} as const;

export type AuthorSupportRpcName = keyof typeof AUTHOR_SUPPORT_RPC_WRAPPERS;

export function hashAuthorSupportProof(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isAuthorSupportProofHash(value: string | null | undefined): boolean {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
