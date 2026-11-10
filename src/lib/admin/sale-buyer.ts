import { buildAdminSaleBuyerName } from "@/lib/admin/sales";
import { savedBusinessReceiptEmail } from "@/lib/business/subscription-checkout";

export type SaleBuyerAuthUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string {
  const value = meta?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Buyer name and email for the sale email and the admin sales pages (t1344u, t1345u).
 * `profiles` is filled for regular accounts; a guest-start АудиоЛад Бизнес owner has no
 * account email and keeps the name in auth user_metadata (first_name / last_name) and the
 * receipt email in user_metadata.receipt_email (t1343u). Profile values win; auth fills the gaps.
 */
export function resolveOwnerSaleBuyer(input: {
  profileFullName: string | null | undefined;
  profileEmail: string | null | undefined;
  authUser: SaleBuyerAuthUser | null;
}): { buyerName: string; buyerEmail: string | null } {
  const meta = input.authUser?.user_metadata ?? null;
  const metaName = [metaString(meta, "first_name"), metaString(meta, "last_name")].filter(Boolean).join(" ")
    || metaString(meta, "full_name");
  const buyerEmail = input.profileEmail?.trim()
    || input.authUser?.email?.trim()
    || savedBusinessReceiptEmail(meta)
    || null;
  const fullName = input.profileFullName?.trim() || metaName || null;
  return { buyerName: buildAdminSaleBuyerName(fullName, buyerEmail), buyerEmail };
}
