"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { BUSINESS_PARTNER_CODES_HREF } from "@/lib/admin/business-partner-codes";
import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import {
  PARTNER_CODE_DEFAULT_PERIODS,
  PARTNER_CODE_DEFAULT_UNIT_PRICE_RUB,
  generatePartnerCode,
  isPartnerCodePurpose,
  parsePartnerPeriods,
  parsePartnerUnitPriceRub,
} from "@/lib/business/partner-codes";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type CreatePartnerCodeResult =
  | { ok: true; code: string }
  | { ok: false; error: "invalid" | "unavailable" };

/**
 * Platform owner only. Issues one unpredictable personal code. Nothing is charged and
 * no account is touched: the code binds to an account only on its first successful payment.
 */
export async function createPartnerCodeAction(input: {
  purpose: string;
  note: string;
  unitPriceRub?: string | number;
  periods?: string | number;
}): Promise<CreatePartnerCodeResult> {
  const session = await requirePlatformOwnerAccess(BUSINESS_PARTNER_CODES_HREF);
  const purpose = input?.purpose;
  const note = typeof input?.note === "string" ? input.note.trim().slice(0, 200) : "";
  const unitPriceRub = parsePartnerUnitPriceRub(input?.unitPriceRub ?? PARTNER_CODE_DEFAULT_UNIT_PRICE_RUB);
  const periods = parsePartnerPeriods(input?.periods ?? PARTNER_CODE_DEFAULT_PERIODS);
  if (!isPartnerCodePurpose(purpose) || unitPriceRub === null || periods === null) return { ok: false, error: "invalid" };

  try {
    const db = createServiceRoleClient();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = generatePartnerCode((size) => randomBytes(size));
      const { error } = await db.from("business_partner_codes").insert({
        code,
        purpose,
        recipient_note: note || null,
        unit_price_minor: unitPriceRub * 100,
        discount_periods: periods,
        created_by: session.userId,
      });
      if (!error) {
        revalidatePath(BUSINESS_PARTNER_CODES_HREF);
        return { ok: true, code };
      }
      if (error.code !== "23505") break;
    }
  } catch {
    /* fall through */
  }
  console.error("admin_partner_code_create_failed");
  return { ok: false, error: "unavailable" };
}

/**
 * Only a code that is not bound to an account yet. A bound code keeps its account forever.
 * One transaction: the code is revoked and its open personal-price payment links stop being
 * offered; a payment that still arrives on such a link buys only the 30 days it paid for.
 */
export async function revokePartnerCodeAction(input: { id: string }): Promise<{ ok: boolean }> {
  await requirePlatformOwnerAccess(BUSINESS_PARTNER_CODES_HREF);
  const id = typeof input?.id === "string" ? input.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false };
  try {
    const { data, error } = await createServiceRoleClient().rpc("revoke_business_partner_code", { p_code_id: id });
    if (error) return { ok: false };
    revalidatePath(BUSINESS_PARTNER_CODES_HREF);
    return { ok: (data as { ok?: unknown } | null)?.ok === true };
  } catch {
    return { ok: false };
  }
}
