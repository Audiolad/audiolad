"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminPermission } from "@/lib/admin/guard";
import {
  BUSINESS_VERIFICATION_ADMIN_PATH,
  UUID_RE,
  businessModerationErrorText,
  isBusinessModerationAction,
  resolveBusinessModerationReason,
} from "@/lib/admin/business-verification";
import { createClient } from "@/lib/supabase/server";

function back(params: Record<string, string>, anchor?: string): never {
  const query = new URLSearchParams(params).toString();
  redirect(`${BUSINESS_VERIFICATION_ADMIN_PATH}${query ? `?${query}` : ""}${anchor ? `#${anchor}` : ""}`);
}

function text(formData: FormData, key: string, max: number): string {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

/**
 * Case decision. Runs the RPC with the moderator's OWN session (auth.uid()), never service role:
 * moderator check, transitions, required reason, self-moderation rule and audit live in the DB.
 */
export async function moderateBusinessVerificationAction(formData: FormData): Promise<void> {
  const session = await requireAdminPermission("author_products.moderate");
  const verificationId = text(formData, "verificationId", 64);
  const action = text(formData, "action", 32);
  const filter = text(formData, "filter", 32) || "open";
  const anchor = UUID_RE.test(verificationId) ? `case-${verificationId}` : undefined;

  if (!UUID_RE.test(verificationId) || !isBusinessModerationAction(action)) {
    back({ status: filter, error: "Некорректный запрос." }, anchor);
  }
  // Optional only for «Подтвердить» (stored as a neutral default); required for every other decision.
  const reason = resolveBusinessModerationReason(action, text(formData, "reason", 2000));
  if (!reason) {
    back({ status: filter, error: businessModerationErrorText("business_moderation_reason_required") }, anchor);
  }

  let rightsholderId: string | null = null;
  let newDisplayName: string | null = null;
  let newEntityType: string | null = null;
  if (action === "approve") {
    const binding = text(formData, "rightsholder", 64);
    if (binding && binding !== "new") {
      if (!UUID_RE.test(binding)) back({ status: filter, error: "Некорректный правообладатель." }, anchor);
      rightsholderId = binding;
    } else {
      newDisplayName = text(formData, "newDisplayName", 200) || null;
      const entityType = text(formData, "newEntityType", 32);
      newEntityType = entityType === "person" || entityType === "organization" ? entityType : null;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderator_business_verification_action", {
    p_verification_id: verificationId,
    p_action: action,
    p_reason: reason,
    p_rightsholder_id: rightsholderId,
    p_new_display_name: newDisplayName,
    p_new_entity_type: newEntityType,
  });

  if (error) {
    console.info("admin_business_verification_action_failed", {
      verificationId,
      action,
      adminUserId: session.userId,
      code: error.code ?? null,
    });
    back({ status: filter, error: businessModerationErrorText(error.message) }, anchor);
  }

  revalidatePath(BUSINESS_VERIFICATION_ADMIN_PATH);
  revalidatePath("/author-dashboard/business");
  back({ status: filter, notice: "Решение сохранено и записано в журнал." }, anchor);
}

/** Product / track suspension in Business. Same rule: moderator's own session, DB decides. */
export async function suspendBusinessProductAction(formData: FormData): Promise<void> {
  const session = await requireAdminPermission("author_products.moderate");
  const verificationId = text(formData, "verificationId", 64);
  const productId = text(formData, "productId", 64);
  const audioItemId = text(formData, "audioItemId", 64);
  const reason = text(formData, "reason", 2000);
  const filter = text(formData, "filter", 32) || "open";
  const anchor = UUID_RE.test(verificationId) ? `case-${verificationId}` : undefined;

  if (!UUID_RE.test(productId) || (audioItemId && !UUID_RE.test(audioItemId))) {
    back({ status: filter, error: "Некорректный запрос." }, anchor);
  }
  if (!reason) {
    back({ status: filter, error: businessModerationErrorText("business_moderation_reason_required") }, anchor);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderator_business_suspend_product", {
    p_product_id: productId,
    p_audio_item_id: audioItemId || null,
    p_reason: reason,
  });

  if (error) {
    console.info("admin_business_suspend_product_failed", {
      productId,
      adminUserId: session.userId,
      code: error.code ?? null,
    });
    back({ status: filter, error: businessModerationErrorText(error.message) }, anchor);
  }

  revalidatePath(BUSINESS_VERIFICATION_ADMIN_PATH);
  back({ status: filter, notice: "Продукт приостановлен в АудиоЛад Бизнес; запись сохранена." }, anchor);
}
